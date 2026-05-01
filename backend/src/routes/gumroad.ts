import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { gumroadLicense } from "../db/schema";
import { verifyLicense } from "../gumroad";
import { requireSession } from "../lib/auth-helpers";
import type { Env } from "../env";

const gumroad = new Hono<{ Bindings: Env }>();

gumroad.post("/verify", async (c) => {
  const session = await requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  const licenseKey = typeof body.licenseKey === "string" ? body.licenseKey.trim() : "";
  if (!licenseKey) {
    throw new HTTPException(400, { message: "license_key_required" });
  }

  const db = getDb(c.env);
  const [existing] = await db
    .select({ userId: gumroadLicense.userId })
    .from(gumroadLicense)
    .where(eq(gumroadLicense.licenseKey, licenseKey))
    .limit(1);

  if (existing) {
    if (existing.userId !== session.user.id) {
      throw new HTTPException(409, { message: "license_linked_to_another_account" });
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
    verifiedAt: new Date(),
  });

  return c.json({ verified: true });
});

export default gumroad;
