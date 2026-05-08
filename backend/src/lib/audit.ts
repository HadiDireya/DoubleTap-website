import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import type { DB } from "../db/client";
import { adminAuditLog } from "../db/schema";
import { toISO } from "./dates";
import type { Env } from "../env";

// Structural type so any sub-app can pass its typed Hono context here
// regardless of how it parameterised Variables (Hono's Variables generic
// is invariant — a nominal Context<{Bindings: Env}> alias would reject a
// caller whose sub-app declared its own Variables shape, e.g. /admin/*).
// writeAudit only needs c.env.
type AppContext = { env: Env };

export type AuditTargetType =
  | "license"
  | "trial"
  | "activation"
  | "user"
  | "feedback_post"
  | "feedback_comment"
  | "backup"
  | "settings";

export type AuditAction =
  | "license.revoke"
  | "license.unrevoke"
  | "license.issue_comp"
  | "license.update_max_uses"
  | "license.change_email"
  | "license.regenerate_key"
  | "license.resend_email"
  | "license.gumroad_backfill_seats"
  | "activation.free"
  | "trial.extend"
  | "trial.terminate"
  | "trial.blacklist"
  | "user.ban"
  | "user.unban"
  | "user.delete"
  | "user.change_email"
  | "feedback.update_status"
  | "feedback.delete_post"
  | "feedback.delete_comment"
  | "backup.trigger"
  // settings.update_maintenance is reserved for the maintenance-mode
  // toggle once the admin_settings migration lands. PR12 ships the
  // settings page read-only (no admin_settings table yet) — wiring this
  // up is purely additive: add the migration + Drizzle table + a PATCH
  // handler that calls writeAudit({action: "settings.update_maintenance"}).
  | "settings.update_maintenance";

export const writeAudit = async (
  c: AppContext,
  args: {
    actorEmail: string;
    action: AuditAction;
    targetType: AuditTargetType;
    targetId: string;
    details?: Record<string, unknown> | null;
  },
) => {
  const db = getDb(c.env);
  await db.insert(adminAuditLog).values({
    id: crypto.randomUUID(),
    actorEmail: args.actorEmail,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId,
    details: args.details ? JSON.stringify(args.details) : null,
    createdAt: new Date(),
  });
};

// The detail-page audit timeline is the same shape across licenses, trials,
// users, and feedback posts — newest-first, capped at 50, scoped to one
// (target_type, target_id) pair. Centralised so adding a new target type
// (or changing the timeline's column projection) is a one-line touch.
export const selectAuditByTarget = (
  db: DB,
  targetType: AuditTargetType,
  targetId: string,
  limit = 50,
) =>
  db
    .select({
      id: adminAuditLog.id,
      actorEmail: adminAuditLog.actorEmail,
      action: adminAuditLog.action,
      details: adminAuditLog.details,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .where(and(eq(adminAuditLog.targetType, targetType), eq(adminAuditLog.targetId, targetId)))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit);

// Serializes an audit row for the JSON response. `toISO` handles the
// Date|number|string surface area that Drizzle exposes for timestamp
// columns across driver paths.
export const serializeAuditEntry = (e: {
  id: string;
  actorEmail: string;
  action: string;
  details: string | null;
  createdAt: Date | number | string;
}) => ({
  id: e.id,
  actor_email: e.actorEmail,
  action: e.action,
  details: e.details,
  created_at: toISO(e.createdAt),
});
