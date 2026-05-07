import { Hono } from "hono";
import { count, desc, eq, gte, like, lt, or } from "drizzle-orm";
import { getDb } from "../../db/client";
import { adminAuditLog } from "../../db/schema";
import { toISO } from "../../lib/dates";
import { composeAnd, parseISORange, parsePagination } from "../../lib/query";
import type { AdminVariables } from "./index";
import type { Env } from "../../env";

const audit = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

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
  const { since, until } = parseISORange(c);
  const q = (c.req.query("q") || "").trim();
  const { page, limit, offset } = parsePagination(c);

  const db = getDb(c.env);

  // Compose Drizzle conditions. composeAnd skips `undefined` holes and
  // collapses to `undefined` when no filters are active — Drizzle then
  // emits no WHERE clause at all.
  const where = composeAnd([
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
  ]);

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
      created_at: toISO(e.createdAt),
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
