import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { gumroadLicense } from "../db/schema";
import { verifyLicense } from "../gumroad";
import { requireSession } from "../lib/auth-helpers";
import type { Env } from "../env";

const gumroad = new Hono<{ Bindings: Env }>();

// POST /verify — manual license-key linkage. Two scenarios:
//   1) The buyer's row already exists (either from a previous /verify
//      or from the webhook) → claim/backfill, no Gumroad round-trip
//      unless the email is missing.
//   2) The row doesn't exist → call Gumroad to validate the key and
//      capture purchaser email, then insert.
//
// In normal operation /verify is now mostly redundant: the webhook
// pre-creates the row at sale time, the email-match leg of
// resolveVerifiedBuyers awards the badge automatically once the buyer
// signs in. Kept as a fallback for buyers who can't be matched by
// email (e.g. signed in with a different email than the one they
// bought with) and for legacy rows from before the webhook existed.
gumroad.post("/verify", async (c) => {
  const session = await requireSession(c);
  const body = await c.req
    .json<{ licenseKey?: unknown }>()
    .catch(() => ({} as { licenseKey?: unknown }));
  const licenseKey = typeof body.licenseKey === "string" ? body.licenseKey.trim() : "";
  if (!licenseKey) {
    throw new HTTPException(400, { message: "license_key_required" });
  }

  const db = getDb(c.env);
  const [existing] = await db
    .select({ userId: gumroadLicense.userId, email: gumroadLicense.email })
    .from(gumroadLicense)
    .where(eq(gumroadLicense.licenseKey, licenseKey))
    .limit(1);

  if (existing) {
    // Webhook landed first, no user attached yet → claim it.
    if (existing.userId === null) {
      await db
        .update(gumroadLicense)
        .set({ userId: session.user.id, verifiedAt: new Date() })
        .where(eq(gumroadLicense.licenseKey, licenseKey));
      return c.json({ verified: true, claimed: true });
    }
    if (existing.userId !== session.user.id) {
      throw new HTTPException(409, { message: "license_linked_to_another_account" });
    }
    // Backfill email for rows created before migration 0003 (which added
    // the column). Without this, every pre-existing linked license stays
    // invisible to the email-match path in resolveVerifiedBuyers, even
    // though we can recover the email by re-verifying. A failed re-verify
    // (network blip, Gumroad outage) is a soft skip — re-link still
    // succeeds.
    if (!existing.email) {
      const result = await verifyLicense(c.env, licenseKey).catch((err) => {
        console.error("gumroad_email_backfill_verify_failed", (err as Error).message);
        return null;
      });
      if (result?.email) {
        await db
          .update(gumroadLicense)
          .set({ email: result.email.trim().toLowerCase() })
          .where(eq(gumroadLicense.licenseKey, licenseKey));
      }
    }
    return c.json({ verified: true, alreadyLinked: true });
  }

  const result = await verifyLicense(c.env, licenseKey);
  if (!result) {
    throw new HTTPException(400, { message: "license_invalid" });
  }

  await db.insert(gumroadLicense).values({
    id: crypto.randomUUID(),
    userId: session.user.id,
    licenseKey,
    productId: result.productId,
    saleId: result.saleId,
    email: result.email ? result.email.trim().toLowerCase() : null,
    verifiedAt: new Date(),
  });

  return c.json({ verified: true });
});

// POST /webhook/:secret — Gumroad Ping receiver.
//
// Gumroad fires a Ping (form-encoded POST) on every sale to a single
// URL configured in their dashboard. Payload includes `email`,
// `license_key`, `sale_id`, `product_id`, plus `refunded` ("true"/"false")
// for refund updates. There is no HMAC signature on Gumroad pings — the
// canonical auth pattern is a long random secret in the URL path. The
// secret is configured as a Worker secret (`wrangler secret put
// GUMROAD_WEBHOOK_SECRET`) and embedded in the URL the seller pastes
// into Gumroad's "Settings → Advanced → Ping" field, e.g.
// `https://api.doubletap-app.com/gumroad/webhook/<secret>`.
//
// Always returns 200 on parse failures so Gumroad doesn't pile up
// retries on garbage input. Wrong-secret returns 404 so probing
// attackers can't tell a wrong-secret from a missing route.
gumroad.post("/webhook/:secret", async (c) => {
  const secret = c.req.param("secret");
  if (!c.env.GUMROAD_WEBHOOK_SECRET || secret !== c.env.GUMROAD_WEBHOOK_SECRET) {
    throw new HTTPException(404, { message: "not_found" });
  }

  const form = await c.req
    .parseBody()
    .catch(() => ({} as Record<string, unknown>));
  const licenseKey =
    typeof form.license_key === "string" ? form.license_key.trim() : "";
  const email =
    typeof form.email === "string" ? form.email.trim().toLowerCase() : "";
  const saleId = typeof form.sale_id === "string" ? form.sale_id : null;
  const productId =
    typeof form.product_id === "string" ? form.product_id : "";
  // Gumroad pings carry both the unique product id and the permalink
  // slug. Sellers configure GUMROAD_PRODUCT_ID as one or the other —
  // the /v2/licenses/verify endpoint accepts both interchangeably, so
  // mirror that flexibility here.
  const productPermalink =
    typeof form.product_permalink === "string" ? form.product_permalink : "";
  // Gumroad sends `refunded`/`disputed`/`chargebacked` as the string
  // "true" on update events. Treat any of them as a removal.
  const removed =
    form.refunded === "true" ||
    form.disputed === "true" ||
    form.chargebacked === "true";

  // Drop pings that don't match our product. A Gumroad seller can run
  // many products through a single Ping URL — without this filter,
  // someone who guessed the secret could insert arbitrary rows.
  const expected = c.env.GUMROAD_PRODUCT_ID;
  const productMatches =
    !expected || productId === expected || productPermalink === expected;

  if (!licenseKey || !productMatches) {
    // Logged so silent-drops are visible in `wrangler tail`. The
    // license_key flag is just a presence indicator (not the value)
    // to keep keys out of logs.
    console.log("gumroad_ping_dropped", {
      reason: !licenseKey ? "no_license_key" : "product_mismatch",
      hasLicenseKey: Boolean(licenseKey),
      productId,
      productPermalink,
      expected,
    });
    return c.json({ ok: true });
  }

  const db = getDb(c.env);

  if (removed) {
    await db
      .delete(gumroadLicense)
      .where(eq(gumroadLicense.licenseKey, licenseKey));
    return c.json({ ok: true });
  }

  if (!email) return c.json({ ok: true });

  const [existing] = await db
    .select({ id: gumroadLicense.id })
    .from(gumroadLicense)
    .where(eq(gumroadLicense.licenseKey, licenseKey))
    .limit(1);

  if (existing) {
    // Idempotent re-ping: refresh email/saleId/productId, leave userId
    // alone so a re-fired ping doesn't unlink a manual claim.
    await db
      .update(gumroadLicense)
      .set({ email, saleId, productId })
      .where(eq(gumroadLicense.licenseKey, licenseKey));
  } else {
    await db.insert(gumroadLicense).values({
      id: crypto.randomUUID(),
      userId: null,
      licenseKey,
      productId,
      saleId,
      email,
      verifiedAt: new Date(),
    });
  }

  return c.json({ ok: true });
});

export default gumroad;
