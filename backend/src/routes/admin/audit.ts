import { Hono } from "hono";
import { and, count, desc, eq, gte, like, lt, or } from "drizzle-orm";
import { getDb } from "../../db/client";
import { adminAuditLog } from "../../db/schema";
import type { AdminVariables } from "./index";
import type { Env } from "../../env";

const audit = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

const parseInt1 = (raw: string | undefined, fallback: number, max: number) => {
  const n = parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
};

const parseISODate = (raw: string | undefined): Date | null => {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ── GET / — paginated list with filters ───────────────────────────────────
//
// Query params:
//   action       exact (e.g. "license.revoke")
//   target_type  exact (e.g. "license")
//   target_id    substring LIKE
//   actor_email  exact
//   since        ISO 8601 (inclusive)
//   until        ISO 8601 (exclusive)
//   q            free-text — searches target_id, action, and details
//                (the details column is JSON-as-text, so a LIKE works
//                even though it's noisy; the noise is fine for an
//                admin-only tool)
//   page         1-indexed
//   limit        capped at 200, default 50
audit.get("/", async (c) => {
  const action = c.req.query("action") || "";
  const targetType = c.req.query("target_type") || "";
  const targetId = c.req.query("target_id") || "";
  const actorEmail = c.req.query("actor_email") || "";
  const since = parseISODate(c.req.query("since"));
  const until = parseISODate(c.req.query("until"));
  const q = (c.req.query("q") || "").trim();
  const page = parseInt1(c.req.query("page"), 1, 1_000_000);
  const limit = parseInt1(c.req.query("limit"), 50, 200);
  const offset = (page - 1) * limit;

  const db = getDb(c.env);

  // Compose Drizzle conditions. `undefined` entries are filtered out so
  // `and(...)` only sees real predicates — passing `undefined` directly
  // would short-circuit to `where(undefined)` which is fine, but the
  // explicit filter keeps the SQL readable in dev logs.
  const filters = [
    action ? eq(adminAuditLog.action, action) : undefined,
    targetType ? eq(adminAuditLog.targetType, targetType) : undefined,
    targetId ? like(adminAuditLog.targetId, `%${targetId}%`) : undefined,
    actorEmail ? eq(adminAuditLog.actorEmail, actorEmail) : undefined,
    since ? gte(adminAuditLog.createdAt, since) : undefined,
    until ? lt(adminAuditLog.createdAt, until) : undefined,
    q
      ? or(
          like(adminAuditLog.targetId, `%${q}%`),
          like(adminAuditLog.action, `%${q}%`),
          // details is nullable — Drizzle's `like` builds `column LIKE ?`
          // which evaluates NULL as not-matching, exactly what we want.
          like(adminAuditLog.details, `%${q}%`),
        )
      : undefined,
  ].filter(Boolean);

  const where = filters.length > 0 ? and(...(filters as Exclude<typeof filters[number], undefined>[])) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: adminAuditLog.id,
        actorEmail: adminAuditLog.actorEmail,
        action: adminAuditLog.action,
        targetType: adminAuditLog.targetType,
        targetId: adminAuditLog.targetId,
        details: adminAuditLog.details,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .where(where)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ n: count() })
      .from(adminAuditLog)
      .where(where)
      .then((r) => r[0]?.n ?? 0),
  ]);

  return c.json({
    rows: rows.map((e) => ({
      id: e.id,
      actor_email: e.actorEmail,
      action: e.action,
      target_type: e.targetType,
      target_id: e.targetId,
      details: e.details,
      created_at:
        e.createdAt instanceof Date
          ? e.createdAt.toISOString()
          : new Date(e.createdAt as Date | number | string).toISOString(),
    })),
    page,
    limit,
    total: totalRow,
  });
});

// ── GET /facets — distinct values for filter dropdowns ────────────────────
//
// The frontend's filter UI populates from this so it always shows the set
// of action/target_type values that actually exist in the log — no risk of
// out-of-sync dropdowns when new actions are added to `lib/audit.ts`.
// Cheap because the table is append-only and indexed by target.
audit.get("/facets", async (c) => {
  const db = getDb(c.env);
  const [actions, targetTypes, actors] = await Promise.all([
    db
      .selectDistinct({ v: adminAuditLog.action })
      .from(adminAuditLog)
      .orderBy(adminAuditLog.action)
      .then((rs) => rs.map((r) => r.v)),
    db
      .selectDistinct({ v: adminAuditLog.targetType })
      .from(adminAuditLog)
      .orderBy(adminAuditLog.targetType)
      .then((rs) => rs.map((r) => r.v)),
    db
      .selectDistinct({ v: adminAuditLog.actorEmail })
      .from(adminAuditLog)
      .orderBy(adminAuditLog.actorEmail)
      .then((rs) => rs.map((r) => r.v)),
  ]);
  return c.json({ actions, target_types: targetTypes, actors });
});

export default audit;
