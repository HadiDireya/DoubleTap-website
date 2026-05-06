import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import { Resend } from "resend";
import { getDb } from "../../db/client";
import { adminAuditLog, gumroadLicense, user } from "../../db/schema";
import { writeAudit } from "../../lib/audit";
import { parsePositiveInt } from "../../lib/query";
import {
  countLahzaLicenses,
  deleteActivationById,
  deleteAllActivationsForKey,
  getLahzaLicense,
  insertCompLicense,
  listActivationsForKey,
  listLahzaLicenses,
  revokeLahzaLicense,
  unrevokeLahzaLicense,
  updateLahzaLicenseFields,
} from "../../lib/license-db";
import type { AdminVariables } from "./index";
import type { Env } from "../../env";

const licenses = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

// Source taxonomy:
//   "comp"    — admin-issued comp keys (LZ-COMP- prefix; row in LICENSE_DB.licenses)
//   "lahza"   — paid Lahza keys (LZ- prefix without COMP; row in LICENSE_DB.licenses)
//   "gumroad" — Gumroad-issued keys (no prefix convention; row in DB.gumroad_license)
type Source = "comp" | "lahza" | "gumroad";

const sourceFor = (key: string): Source =>
  key.startsWith("LZ-COMP-") ? "comp" : key.startsWith("LZ-") ? "lahza" : "gumroad";

// Crockford base32 (no I/L/O/U) — same alphabet license-server uses for
// paid Lahza keys, so admin-issued comps look visually consistent.
const COMP_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const generateCompKey = () => {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  let out = "LZ-COMP-";
  for (let i = 0; i < 15; i++) {
    const byte = bytes[i] ?? 0;
    out += COMP_ALPHABET[byte & 0x1f];
    if (i % 5 === 4 && i < 14) out += "-";
  }
  return out;
};

const isValidEmail = (s: string) =>
  typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

const parseSource = (raw: string | undefined): "lahza" | "comp" | "gumroad" | "all" => {
  if (raw === "lahza" || raw === "comp" || raw === "gumroad" || raw === "all") return raw;
  return "all";
};

const parseStatus = (raw: string | undefined): "active" | "revoked" | "all" => {
  if (raw === "active" || raw === "revoked") return raw;
  return "all";
};


// ── Common merged list row shape ──────────────────────────────────────────
// Both sources flatten into the same JSON for the frontend table. Gumroad
// rows don't expose tx_reference (sale_id is used instead) and never carry
// `revoked_at` locally — Gumroad-side revocation is managed in Gumroad's
// dashboard, not here.
type ListRow = {
  source: Source;
  license_key: string;
  email: string | null;
  max_uses: number | null;
  tx_reference: string | null;
  issued_at: string; // ISO with Z
  revoked_at: string | null;
  active_activations: number;
  status: "active" | "revoked";
};

// ── GET / — merged list with filters, search, pagination ──────────────────
licenses.get("/", async (c) => {
  const q = c.req.query("q") ?? "";
  const source = parseSource(c.req.query("source"));
  const status = parseStatus(c.req.query("status"));
  const limit = parsePositiveInt(c.req.query("limit"), 50, 200);
  const page = parsePositiveInt(c.req.query("page"), 1, 1_000_000);
  const offset = (page - 1) * limit;

  const db = getDb(c.env);
  const ldb = c.env.LICENSE_DB;

  const wantsLahza = source === "all" || source === "lahza" || source === "comp";
  const wantsGumroad = source === "all" || source === "gumroad";

  // Strategy: pull up to (offset+limit) rows from each source, merge,
  // sort, then slice. Practical because the dataset is small (low
  // hundreds). Per-source pagination would require a coordinated cursor
  // across two databases — not worth the complexity here.
  //
  // SLAB_CAP is the absolute ceiling on rows fetched from one source per
  // request; rows beyond it on either side are unreachable via paging.
  // At 5_000 we're ~50× the current dataset and ~10× the foreseeable one.
  // TODO: when either source approaches the cap (≥3k), switch to
  // cursor-paginated per-source queries with a merge step. The list view
  // can still render `total` accurately via the COUNT(*) queries below,
  // which are unaffected by the slab cap.
  const SLAB_CAP = 5_000;
  const slabSize = Math.min(offset + limit, SLAB_CAP);

  const lahzaSource = source === "comp" ? "comp" : source === "lahza" ? "lahza" : "all";

  const [lahzaRows, lahzaCount, gumroadRowsRaw, gumroadCount] = await Promise.all([
    wantsLahza
      ? listLahzaLicenses(ldb, { q, source: lahzaSource, status, limit: slabSize, offset: 0 })
      : Promise.resolve([]),
    wantsLahza
      ? countLahzaLicenses(ldb, { q, source: lahzaSource, status })
      : Promise.resolve(0),
    wantsGumroad
      ? (async () => {
          // Gumroad never has a local revoked_at — filtering for
          // status=revoked excludes it entirely.
          if (status === "revoked") return [];
          const trimmed = q.trim();
          const conds = trimmed
            ? or(
                like(gumroadLicense.licenseKey, `%${trimmed}%`),
                like(gumroadLicense.saleId, `%${trimmed}%`),
                like(user.email, `%${trimmed}%`),
              )
            : undefined;
          return db
            .select({
              licenseKey: gumroadLicense.licenseKey,
              productId: gumroadLicense.productId,
              saleId: gumroadLicense.saleId,
              verifiedAt: gumroadLicense.verifiedAt,
              email: user.email,
            })
            .from(gumroadLicense)
            .leftJoin(user, eq(user.id, gumroadLicense.userId))
            .where(conds)
            .orderBy(desc(gumroadLicense.verifiedAt))
            .limit(slabSize);
        })()
      : Promise.resolve([]),
    wantsGumroad
      ? (async () => {
          if (status === "revoked") return 0;
          const trimmed = q.trim();
          const conds = trimmed
            ? or(
                like(gumroadLicense.licenseKey, `%${trimmed}%`),
                like(gumroadLicense.saleId, `%${trimmed}%`),
                like(user.email, `%${trimmed}%`),
              )
            : undefined;
          const rows = await db
            .select({ n: count() })
            .from(gumroadLicense)
            .leftJoin(user, eq(user.id, gumroadLicense.userId))
            .where(conds);
          return rows[0]?.n ?? 0;
        })()
      : Promise.resolve(0),
  ]);

  // Active activations per Gumroad license — single batched query against
  // LICENSE_DB.activations so the table render gets the same "n / max" hint
  // it shows for Lahza rows.
  const gumroadKeys = gumroadRowsRaw.map((r) => r.licenseKey);
  const gumroadActivationCounts = new Map<string, number>();
  if (gumroadKeys.length > 0) {
    const placeholders = gumroadKeys.map(() => "?").join(", ");
    const { results } = await ldb
      .prepare(
        `SELECT license_key, COUNT(*) AS n FROM activations
         WHERE license_key IN (${placeholders})
         GROUP BY license_key`,
      )
      .bind(...gumroadKeys)
      .all<{ license_key: string; n: number }>();
    for (const r of results ?? []) gumroadActivationCounts.set(r.license_key, r.n);
  }

  const merged: ListRow[] = [
    ...lahzaRows.map<ListRow>((r) => ({
      source: sourceFor(r.license_key),
      license_key: r.license_key,
      email: r.email,
      max_uses: r.max_uses,
      tx_reference: r.tx_reference,
      issued_at: r.issued_at,
      revoked_at: r.revoked_at,
      active_activations: r.active_activations,
      status: r.revoked_at ? "revoked" : "active",
    })),
    ...gumroadRowsRaw.map<ListRow>((r) => ({
      source: "gumroad",
      license_key: r.licenseKey,
      email: r.email ?? null,
      // Gumroad's max_uses is encoded in the variant string and only
      // discoverable via a Gumroad API round-trip — not worth fetching for
      // the list view. The detail endpoint hydrates it on demand.
      max_uses: null,
      tx_reference: r.saleId ?? null,
      issued_at:
        r.verifiedAt instanceof Date
          ? r.verifiedAt.toISOString()
          : new Date(r.verifiedAt as Date | number | string).toISOString(),
      revoked_at: null,
      active_activations: gumroadActivationCounts.get(r.licenseKey) ?? 0,
      status: "active",
    })),
  ];

  merged.sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1));
  const sliced = merged.slice(offset, offset + limit);

  const total = lahzaCount + gumroadCount;

  return c.json({
    rows: sliced,
    page,
    limit,
    total,
    counts: {
      lahza: source === "all" || source === "lahza" ? lahzaCount : undefined,
      gumroad: source === "all" || source === "gumroad" ? gumroadCount : undefined,
    },
  });
});

// ── GET /:key — license detail with activations + audit timeline ──────────
licenses.get("/:key", async (c) => {
  const licenseKey = c.req.param("key");
  const src = sourceFor(licenseKey);
  const db = getDb(c.env);
  const ldb = c.env.LICENSE_DB;

  // Audit timeline is the same lookup for every source — entries are
  // tagged target_type='license' with target_id=license_key.
  const auditP = db
    .select({
      id: adminAuditLog.id,
      actorEmail: adminAuditLog.actorEmail,
      action: adminAuditLog.action,
      details: adminAuditLog.details,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .where(and(eq(adminAuditLog.targetType, "license"), eq(adminAuditLog.targetId, licenseKey)))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(50);

  const activationsP = listActivationsForKey(ldb, licenseKey);

  if (src === "gumroad") {
    const [rows, audit, activations] = await Promise.all([
      db
        .select({
          licenseKey: gumroadLicense.licenseKey,
          productId: gumroadLicense.productId,
          saleId: gumroadLicense.saleId,
          verifiedAt: gumroadLicense.verifiedAt,
          email: user.email,
          userId: gumroadLicense.userId,
        })
        .from(gumroadLicense)
        .leftJoin(user, eq(user.id, gumroadLicense.userId))
        .where(eq(gumroadLicense.licenseKey, licenseKey))
        .limit(1),
      auditP,
      activationsP,
    ]);
    const row = rows[0];
    if (!row) throw new HTTPException(404, { message: "license_not_found" });
    return c.json({
      source: "gumroad" as const,
      license_key: row.licenseKey,
      email: row.email ?? null,
      product_id: row.productId,
      sale_id: row.saleId,
      issued_at:
        row.verifiedAt instanceof Date
          ? row.verifiedAt.toISOString()
          : new Date(row.verifiedAt as Date | number | string).toISOString(),
      revoked_at: null,
      max_uses: null,
      user_id: row.userId,
      activations,
      audit: audit.map(serializeAudit),
    });
  }

  const [row, audit, activations] = await Promise.all([
    getLahzaLicense(ldb, licenseKey),
    auditP,
    activationsP,
  ]);
  if (!row) throw new HTTPException(404, { message: "license_not_found" });
  return c.json({
    source: src, // "lahza" | "comp"
    license_key: row.license_key,
    email: row.email,
    max_uses: row.max_uses,
    tx_reference: row.tx_reference,
    issued_at: row.issued_at,
    revoked_at: row.revoked_at,
    activations,
    audit: audit.map(serializeAudit),
  });
});

const serializeAudit = (e: {
  id: string;
  actorEmail: string;
  action: string;
  details: string | null;
  createdAt: Date | number;
}) => ({
  id: e.id,
  actor_email: e.actorEmail,
  action: e.action,
  details: e.details,
  created_at:
    e.createdAt instanceof Date
      ? e.createdAt.toISOString()
      : new Date(e.createdAt as unknown as number).toISOString(),
});

// Gumroad rows are read-only for now — managing them needs a
// GUMROAD_ACCESS_TOKEN that isn't wired yet (PR2 forks deferred per
// roadmap). All write endpoints below reject the gumroad source so the
// caller knows to fall back to Gumroad's own dashboard.
const requireLahzaSource = (licenseKey: string) => {
  const src = sourceFor(licenseKey);
  if (src === "gumroad") {
    throw new HTTPException(400, { message: "read_only_source" });
  }
  return src;
};

// ── POST /:key/revoke ─────────────────────────────────────────────────────
licenses.post("/:key/revoke", async (c) => {
  const licenseKey = c.req.param("key");
  requireLahzaSource(licenseKey);
  const ok = await revokeLahzaLicense(c.env.LICENSE_DB, licenseKey);
  if (!ok) throw new HTTPException(404, { message: "license_not_found_or_already_revoked" });

  let reason: string | undefined;
  try {
    const body = await c.req.json<{ reason?: unknown }>();
    if (typeof body.reason === "string" && body.reason.trim()) reason = body.reason.trim().slice(0, 500);
  } catch (_) { /* empty body OK */ }

  await writeAudit(c, {
    actorEmail: c.var.session.user.email,
    action: "license.revoke",
    targetType: "license",
    targetId: licenseKey,
    details: { reason: reason ?? null },
  });
  return c.json({ ok: true });
});

// ── POST /:key/unrevoke ───────────────────────────────────────────────────
licenses.post("/:key/unrevoke", async (c) => {
  const licenseKey = c.req.param("key");
  requireLahzaSource(licenseKey);
  const ok = await unrevokeLahzaLicense(c.env.LICENSE_DB, licenseKey);
  if (!ok) throw new HTTPException(404, { message: "license_not_found_or_not_revoked" });
  await writeAudit(c, {
    actorEmail: c.var.session.user.email,
    action: "license.unrevoke",
    targetType: "license",
    targetId: licenseKey,
  });
  return c.json({ ok: true });
});

// ── POST /:key/activations/:id/free ───────────────────────────────────────
licenses.post("/:key/activations/:id/free", async (c) => {
  const licenseKey = c.req.param("key");
  const id = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id < 1) throw new HTTPException(400, { message: "invalid_activation_id" });
  // Activations live in LICENSE_DB regardless of license source; freeing a
  // slot is allowed for Gumroad too because that's how the user reclaims a
  // seat from a dead Mac.
  const removed = await deleteActivationById(c.env.LICENSE_DB, licenseKey, id);
  if (!removed) throw new HTTPException(404, { message: "activation_not_found" });
  await writeAudit(c, {
    actorEmail: c.var.session.user.email,
    action: "activation.free",
    targetType: "license",
    targetId: licenseKey,
    details: { activation_id: id, machine_id: removed.machine_id, activated_at: removed.activated_at },
  });
  return c.json({ ok: true });
});

// ── POST /:key/activations/free-all ───────────────────────────────────────
licenses.post("/:key/activations/free-all", async (c) => {
  const licenseKey = c.req.param("key");
  const freed = await deleteAllActivationsForKey(c.env.LICENSE_DB, licenseKey);
  await writeAudit(c, {
    actorEmail: c.var.session.user.email,
    action: "activation.free",
    targetType: "license",
    targetId: licenseKey,
    details: { freed_count: freed.length, machine_ids: freed.map((a) => a.machine_id) },
  });
  return c.json({ ok: true, freed: freed.length });
});

// ── PATCH /:key — change-email and/or set-max-uses ────────────────────────
licenses.patch("/:key", async (c) => {
  const licenseKey = c.req.param("key");
  requireLahzaSource(licenseKey);
  const body = await c.req
    .json<{ email?: unknown; max_uses?: unknown }>()
    .catch(() => ({} as { email?: unknown; max_uses?: unknown }));

  const before = await getLahzaLicense(c.env.LICENSE_DB, licenseKey);
  if (!before) throw new HTTPException(404, { message: "license_not_found" });

  const patch: { email?: string; max_uses?: number } = {};
  if (body.email !== undefined) {
    if (typeof body.email !== "string" || !isValidEmail(body.email.trim())) {
      throw new HTTPException(400, { message: "invalid_email" });
    }
    patch.email = body.email.trim().toLowerCase();
  }
  if (body.max_uses !== undefined) {
    const n = typeof body.max_uses === "number" ? body.max_uses : parseInt(String(body.max_uses), 10);
    if (!Number.isFinite(n) || n < 1 || n > 100) {
      throw new HTTPException(400, { message: "invalid_max_uses" });
    }
    patch.max_uses = Math.floor(n);
  }
  if (patch.email === undefined && patch.max_uses === undefined) {
    throw new HTTPException(400, { message: "no_fields_to_update" });
  }

  await updateLahzaLicenseFields(c.env.LICENSE_DB, licenseKey, patch);

  // Two distinct audit actions so the timeline reads as one event per
  // changed field, matching the granularity the audit page will expose.
  if (patch.email !== undefined && patch.email !== before.email) {
    await writeAudit(c, {
      actorEmail: c.var.session.user.email,
      action: "license.change_email",
      targetType: "license",
      targetId: licenseKey,
      details: { from: before.email, to: patch.email },
    });
  }
  if (patch.max_uses !== undefined && patch.max_uses !== before.max_uses) {
    await writeAudit(c, {
      actorEmail: c.var.session.user.email,
      action: "license.update_max_uses",
      targetType: "license",
      targetId: licenseKey,
      details: { from: before.max_uses, to: patch.max_uses },
    });
  }
  return c.json({ ok: true });
});

// ── POST /:key/resend-email ───────────────────────────────────────────────
licenses.post("/:key/resend-email", async (c) => {
  const licenseKey = c.req.param("key");
  requireLahzaSource(licenseKey);
  const row = await getLahzaLicense(c.env.LICENSE_DB, licenseKey);
  if (!row) throw new HTTPException(404, { message: "license_not_found" });
  if (!c.env.RESEND_API_KEY) throw new HTTPException(500, { message: "email_unavailable" });

  await sendLicenseEmail(c.env, row.email, row.license_key);
  await writeAudit(c, {
    actorEmail: c.var.session.user.email,
    action: "license.resend_email",
    targetType: "license",
    targetId: licenseKey,
    details: { to: row.email },
  });
  return c.json({ ok: true });
});

// ── POST /comp — issue a comp key ─────────────────────────────────────────
licenses.post("/comp", async (c) => {
  const body = await c.req
    .json<{ email?: unknown; max_uses?: unknown; note?: unknown }>()
    .catch(() => ({} as { email?: unknown; max_uses?: unknown; note?: unknown }));

  if (typeof body.email !== "string" || !isValidEmail(body.email.trim())) {
    throw new HTTPException(400, { message: "invalid_email" });
  }
  const email = body.email.trim().toLowerCase();
  const maxRaw = typeof body.max_uses === "number" ? body.max_uses : parseInt(String(body.max_uses ?? 1), 10);
  if (!Number.isFinite(maxRaw) || maxRaw < 1 || maxRaw > 100) {
    throw new HTTPException(400, { message: "invalid_max_uses" });
  }
  const maxUses = Math.floor(maxRaw);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  // INSERT OR IGNORE swallows BOTH primary-key (license_key) and unique
  // (tx_reference) constraint violations the same way, so generate fresh
  // values for both inside the loop. UUIDs colliding is astronomically
  // unlikely, but pinning tx_reference outside the loop would otherwise
  // spend every retry on the same dead reference.
  let key = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCompKey();
    const txReference = `comp_${crypto.randomUUID()}`;
    const ok = await insertCompLicense(c.env.LICENSE_DB, {
      license_key: candidate,
      email,
      max_uses: maxUses,
      tx_reference: txReference,
    });
    if (ok) {
      key = candidate;
      break;
    }
  }
  if (!key) throw new HTTPException(500, { message: "key_generation_failed" });

  // Best-effort send. Failure is logged but doesn't roll back the row —
  // the admin can resend from the detail page.
  let emailed = false;
  try {
    if (c.env.RESEND_API_KEY) {
      await sendLicenseEmail(c.env, email, key);
      emailed = true;
    }
  } catch (e) {
    console.error("comp_email_failed", (e as Error).message);
  }

  await writeAudit(c, {
    actorEmail: c.var.session.user.email,
    action: "license.issue_comp",
    targetType: "license",
    targetId: key,
    details: { email, max_uses: maxUses, note: note || null, emailed },
  });

  return c.json({ ok: true, license_key: key, email, max_uses: maxUses, emailed });
});

// ── Email helper ──────────────────────────────────────────────────────────
// Mirrors license-server's text — keep the copy in sync. Subject too: that's
// what users search their inbox for.
const sendLicenseEmail = async (env: Env, to: string, key: string) => {
  const resend = new Resend(env.RESEND_API_KEY);
  const text = `Thanks for buying DoubleTap.

Your license key:

  ${key}

To activate:
  1. Open DoubleTap
  2. Click the menu bar icon → License (or open the License pane in Settings)
  3. Paste the key above and click Activate

Need help? Reply to this email or write to support@doubletap-app.com.

— DoubleTap`;
  await resend.emails.send({
    from: "DoubleTap <noreply@doubletap-app.com>",
    to,
    subject: "Your DoubleTap license key",
    text,
  });
};

export default licenses;
