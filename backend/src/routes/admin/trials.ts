import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { adminAuditLog } from "../../db/schema";
import { serializeAuditEntry, writeAudit } from "../../lib/audit";
import {
  countTrialsAdmin,
  getTrial,
  listActivationsForMachine,
  listTrialsAdmin,
  setTrialDeadline,
} from "../../lib/license-db";
import { parsePositiveInt } from "../../lib/query";
import type { AdminVariables } from "./index";
import type { Env } from "../../env";

const trials = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

const parseStatus = (raw: string | undefined): "active" | "expired" | "all" => {
  if (raw === "active" || raw === "expired") return raw;
  return "all";
};

const parseISODate = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// ── GET / — paginated list with filters ───────────────────────────────────
trials.get("/", async (c) => {
  const q = c.req.query("q") ?? "";
  const status = parseStatus(c.req.query("status"));
  const since = parseISODate(c.req.query("since"));
  const until = parseISODate(c.req.query("until"));
  const limit = parsePositiveInt(c.req.query("limit"), 50, 200);
  const page = parsePositiveInt(c.req.query("page"), 1, 1_000_000);
  const offset = (page - 1) * limit;
  const nowISO = new Date().toISOString();

  const ldb = c.env.LICENSE_DB;
  const [rows, total] = await Promise.all([
    listTrialsAdmin(ldb, { q, status, sinceISO: since, untilISO: until, nowISO, limit, offset }),
    countTrialsAdmin(ldb, { q, status, sinceISO: since, untilISO: until, nowISO }),
  ]);

  return c.json({
    rows: rows.map((r) => ({
      machine_id: r.machine_id,
      started_at: r.started_at,
      deadline: r.deadline,
      converted_license_key: r.converted_license_key,
      converted_at: r.converted_at,
      status: r.deadline > nowISO ? "active" : "expired",
    })),
    page,
    limit,
    total,
    now: nowISO,
  });
});

// ── GET /:machineId — detail with activations + audit timeline ────────────
trials.get("/:machineId", async (c) => {
  const machineId = c.req.param("machineId");
  const ldb = c.env.LICENSE_DB;
  const db = getDb(c.env);

  const auditP = db
    .select({
      id: adminAuditLog.id,
      actorEmail: adminAuditLog.actorEmail,
      action: adminAuditLog.action,
      details: adminAuditLog.details,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .where(and(eq(adminAuditLog.targetType, "trial"), eq(adminAuditLog.targetId, machineId)))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(50);

  const [row, activations, audit] = await Promise.all([
    getTrial(ldb, machineId),
    listActivationsForMachine(ldb, machineId),
    auditP,
  ]);
  if (!row) throw new HTTPException(404, { message: "trial_not_found" });

  const nowISO = new Date().toISOString();
  return c.json({
    machine_id: row.machine_id,
    started_at: row.started_at,
    deadline: row.deadline,
    status: row.deadline > nowISO ? "active" : "expired",
    converted_license_key: row.converted_license_key,
    converted_at: row.converted_at,
    activations,
    audit: audit.map(serializeAuditEntry),
    now: nowISO,
  });
});

// ── PATCH /:machineId/extend ──────────────────────────────────────────────
// Body: { days: number } — push deadline forward by N days. Anchored at
// max(now, current deadline) so extending an already-expired trial
// reactivates it for N days starting now (rather than silently leaving it
// expired because "current deadline + N days" landed in the past). For an
// active trial the anchor is the existing deadline, so the audit reads as
// a clean "+N days" extension.
trials.patch("/:machineId/extend", async (c) => {
  const machineId = c.req.param("machineId");
  const body = await c.req
    .json<{ days?: unknown }>()
    .catch(() => ({} as { days?: unknown }));
  const days =
    typeof body.days === "number" ? body.days : parseInt(String(body.days ?? ""), 10);
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    throw new HTTPException(400, { message: "invalid_days" });
  }
  const before = await getTrial(c.env.LICENSE_DB, machineId);
  if (!before) throw new HTTPException(404, { message: "trial_not_found" });

  const now = Date.now();
  const anchor = Math.max(now, new Date(before.deadline).getTime());
  const nextDeadline = new Date(anchor + days * 86_400_000).toISOString();
  const ok = await setTrialDeadline(c.env.LICENSE_DB, machineId, nextDeadline);
  if (!ok) throw new HTTPException(500, { message: "update_failed" });

  await writeAudit(c, {
    actorEmail: c.var.session.user.email,
    action: "trial.extend",
    targetType: "trial",
    targetId: machineId,
    details: {
      days,
      from: before.deadline,
      to: nextDeadline,
      // Flag when the anchor was clamped to "now" — useful in the audit
      // timeline to distinguish a routine extension from a reactivation.
      reactivated: anchor === now && new Date(before.deadline).getTime() < now,
    },
  });
  return c.json({ ok: true, deadline: nextDeadline });
});

// ── PATCH /:machineId/terminate ───────────────────────────────────────────
// Sets deadline = min(now, current deadline). The min() is so re-terminating
// an already-expired trial is a true no-op (no spurious deadline rewrite
// that would read like an extension in the audit timeline). The trial row
// stays so the machine_id remains bound to "trial already used" — a clean
// Keychain wipe can't earn a fresh 14 days, which is the whole point of
// the trials table.
trials.patch("/:machineId/terminate", async (c) => {
  const machineId = c.req.param("machineId");
  const before = await getTrial(c.env.LICENSE_DB, machineId);
  if (!before) throw new HTTPException(404, { message: "trial_not_found" });

  const nowISO = new Date().toISOString();
  const beforeDeadlineMs = new Date(before.deadline).getTime();
  const wasAlreadyExpired = beforeDeadlineMs <= Date.now();
  // Math.min on the ISO strings works because both sides are normalised to
  // the same Z-suffixed format — see license-db.ts header for why that's
  // load-bearing.
  const nextDeadline = wasAlreadyExpired ? before.deadline : nowISO;
  if (!wasAlreadyExpired) {
    const ok = await setTrialDeadline(c.env.LICENSE_DB, machineId, nextDeadline);
    if (!ok) throw new HTTPException(500, { message: "update_failed" });
  }

  await writeAudit(c, {
    actorEmail: c.var.session.user.email,
    action: "trial.terminate",
    targetType: "trial",
    targetId: machineId,
    details: { from: before.deadline, to: nextDeadline, noop: wasAlreadyExpired },
  });
  return c.json({ ok: true, deadline: nextDeadline });
});

export default trials;
