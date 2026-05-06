// Read/write helpers for the doubletap-licenses D1 (bound as LICENSE_DB).
// The schema is owned by /Users/hadi/Developer/DoubleTap/license-server —
// this module only mirrors the columns we need. Keep these types in sync
// with that project's migrations/.
//
// Why not Drizzle: Drizzle expects a single schema module per database
// binding, and the canonical schema for these tables lives in another
// repo. Mirroring it here as Drizzle tables would invite drift the day
// the license-server adds a column. Raw prepared statements against the
// binding are good enough for the surface area an admin panel needs.
//
// ── Date format gotcha ────────────────────────────────────────────────────
// The license-server's table defaults are `datetime('now')`, which produces
// SQLite's space-separated form `'YYYY-MM-DD HH:MM:SS'`. Some columns are
// also written from JS via `new Date().toISOString()`, which produces the
// `T`-separated `Z`-suffixed form. Lex comparison treats them differently —
// a row written as `'2026-05-06 14:23:45'` is NOT >= `'2026-05-06T00:00:00.000Z'`
// because `' '` (0x20) < `'T'` (0x54). Result: rows on a window-boundary day
// silently drop out of counts. Every date comparison in this file therefore
// wraps both sides in `datetime(...)` so SQLite parses regardless of
// separator. SELECTed timestamps are normalised to ISO via `strftime` so
// the activity feed merge-sort and the JS Date() parsing work uniformly.

import type { D1Database } from "@cloudflare/workers-types";

// strftime format that produces `YYYY-MM-DDTHH:MM:SS.sssZ` from any SQLite
// datetime expression — same shape as JS `Date#toISOString()`.
const ISO = "strftime('%Y-%m-%dT%H:%M:%fZ', ";

// ── Row types ─────────────────────────────────────────────────────────────

export type LahzaLicenseRow = {
  license_key: string;
  email: string;
  max_uses: number;
  tx_reference: string;
  issued_at: string;
  revoked_at: string | null;
};

export type TrialRow = {
  machine_id: string;
  started_at: string;
  deadline: string;
};

export type ActivationRow = {
  id: number;
  license_key: string;
  machine_id: string;
  activated_at: string;
};

// ── Counts ────────────────────────────────────────────────────────────────

export const countActiveLahzaLicenses = async (db: D1Database) => {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM licenses WHERE revoked_at IS NULL").first<{ n: number }>();
  return r?.n ?? 0;
};

export const countLahzaLicensesIssuedBetween = async (
  db: D1Database,
  sinceISO: string,
  untilISO: string,
) => {
  const r = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM licenses WHERE datetime(issued_at) >= datetime(?1) AND datetime(issued_at) < datetime(?2)",
    )
    .bind(sinceISO, untilISO)
    .first<{ n: number }>();
  return r?.n ?? 0;
};

export const countLahzaLicensesRevokedBetween = async (
  db: D1Database,
  sinceISO: string,
  untilISO: string,
) => {
  const r = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM licenses WHERE revoked_at IS NOT NULL AND datetime(revoked_at) >= datetime(?1) AND datetime(revoked_at) < datetime(?2)",
    )
    .bind(sinceISO, untilISO)
    .first<{ n: number }>();
  return r?.n ?? 0;
};

export const countActiveTrials = async (db: D1Database, nowISO: string) => {
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM trials WHERE datetime(deadline) > datetime(?1)")
    .bind(nowISO)
    .first<{ n: number }>();
  return r?.n ?? 0;
};

export const countTrialsStartedBetween = async (
  db: D1Database,
  sinceISO: string,
  untilISO: string,
) => {
  const r = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM trials WHERE datetime(started_at) >= datetime(?1) AND datetime(started_at) < datetime(?2)",
    )
    .bind(sinceISO, untilISO)
    .first<{ n: number }>();
  return r?.n ?? 0;
};

export const countActivations = async (db: D1Database) => {
  // Filter to activations whose license still exists and is not revoked,
  // so the utilisation KPI reflects "activations on active licenses" — this
  // matches `avgActivationsPerLicense`'s denominator (active licenses only).
  const r = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM activations a
       WHERE EXISTS (
         SELECT 1 FROM licenses l
         WHERE l.license_key = a.license_key AND l.revoked_at IS NULL
       )`,
    )
    .first<{ n: number }>();
  return r?.n ?? 0;
};

export const avgActivationsPerLicense = async (db: D1Database) => {
  // Numerator and denominator both restricted to active (non-revoked)
  // licenses so the ratio is internally consistent. Without the EXISTS
  // filter, activations on revoked licenses inflated the numerator.
  const r = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM activations a
            WHERE EXISTS (
              SELECT 1 FROM licenses l
              WHERE l.license_key = a.license_key AND l.revoked_at IS NULL
            )
         ) * 1.0
         /
         NULLIF((SELECT COUNT(*) FROM licenses WHERE revoked_at IS NULL), 0) AS avg`,
    )
    .first<{ avg: number | null }>();
  return r?.avg ?? 0;
};

// ── Issuance series ───────────────────────────────────────────────────────
// Buckets Lahza issuance by day across the requested window. Comp keys are
// reported separately by checking the LZ-COMP- prefix that issue-comp uses.
// (Pure-Lahza paid keys use the LZ- prefix without -COMP-.)

export type DailyIssuancePoint = {
  date: string; // YYYY-MM-DD
  lahza: number;
  comp: number;
};

export const lahzaIssuanceByDay = async (
  db: D1Database,
  sinceISO: string,
): Promise<DailyIssuancePoint[]> => {
  const { results } = await db
    .prepare(
      `SELECT
         strftime('%Y-%m-%d', issued_at) AS date,
         SUM(CASE WHEN license_key LIKE 'LZ-COMP-%' THEN 1 ELSE 0 END) AS comp,
         SUM(CASE WHEN license_key LIKE 'LZ-COMP-%' THEN 0 ELSE 1 END) AS lahza
       FROM licenses
       WHERE datetime(issued_at) >= datetime(?1)
       GROUP BY strftime('%Y-%m-%d', issued_at)
       ORDER BY date ASC`,
    )
    .bind(sinceISO)
    .all<{ date: string; comp: number; lahza: number }>();
  return (results ?? []).map((r) => ({ date: r.date, lahza: r.lahza, comp: r.comp }));
};

// ── Activity feed ─────────────────────────────────────────────────────────

export type LicenseEvent = {
  type: "license.issued" | "license.revoked" | "activation.added";
  at: string; // ISO 8601 with Z suffix — normalised in SQL via strftime.
  licenseKey: string;
  email: string | null;
  source: "lahza" | "comp";
  detail?: string;
};

export const recentLicenseEvents = async (db: D1Database, limit = 20): Promise<LicenseEvent[]> => {
  // Three streams merged client-side. SELECT clauses normalise timestamps to
  // ISO so the JS sort comparison and Date() parsing both work — without
  // this, SQLite's space-separated default form mis-orders against ISO rows
  // from other sources (feedback posts, audit log).
  const issued = await db
    .prepare(
      `SELECT license_key, email, ${ISO}issued_at) AS issued_at
       FROM licenses
       ORDER BY datetime(issued_at) DESC LIMIT ?1`,
    )
    .bind(limit)
    .all<{ license_key: string; email: string; issued_at: string }>();
  const revoked = await db
    .prepare(
      `SELECT license_key, email, ${ISO}revoked_at) AS revoked_at
       FROM licenses
       WHERE revoked_at IS NOT NULL
       ORDER BY datetime(revoked_at) DESC LIMIT ?1`,
    )
    .bind(limit)
    .all<{ license_key: string; email: string; revoked_at: string }>();
  const activations = await db
    .prepare(
      `SELECT a.license_key, l.email, a.machine_id, ${ISO}a.activated_at) AS activated_at
       FROM activations a LEFT JOIN licenses l ON l.license_key = a.license_key
       ORDER BY datetime(a.activated_at) DESC LIMIT ?1`,
    )
    .bind(limit)
    .all<{ license_key: string; email: string | null; machine_id: string; activated_at: string }>();

  const events: LicenseEvent[] = [];
  for (const r of issued.results ?? []) {
    events.push({
      type: "license.issued",
      at: r.issued_at,
      licenseKey: r.license_key,
      email: r.email,
      source: r.license_key.startsWith("LZ-COMP-") ? "comp" : "lahza",
    });
  }
  for (const r of revoked.results ?? []) {
    events.push({
      type: "license.revoked",
      at: r.revoked_at,
      licenseKey: r.license_key,
      email: r.email,
      source: r.license_key.startsWith("LZ-COMP-") ? "comp" : "lahza",
    });
  }
  for (const r of activations.results ?? []) {
    events.push({
      type: "activation.added",
      at: r.activated_at,
      licenseKey: r.license_key,
      email: r.email,
      source: r.license_key.startsWith("LZ-COMP-") ? "comp" : "lahza",
      detail: r.machine_id,
    });
  }
  events.sort((a, b) => (a.at < b.at ? 1 : -1));
  return events.slice(0, limit);
};

// ── Trial→paid conversion ─────────────────────────────────────────────────
// A trial is "converted" if a later activation lands on the same machine_id.
// The `a.activated_at >= t.started_at` clause is what makes "later" hold —
// without it, an activation that happened *before* the trial would falsely
// count, which can happen when a user deactivates a license and starts a
// fresh trial on the same machine.

export const trialConversionBetween = async (
  db: D1Database,
  sinceISO: string,
  untilISO: string,
) => {
  const started = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM trials WHERE datetime(started_at) >= datetime(?1) AND datetime(started_at) < datetime(?2)",
    )
    .bind(sinceISO, untilISO)
    .first<{ n: number }>();
  const converted = await db
    .prepare(
      `SELECT COUNT(DISTINCT t.machine_id) AS n
       FROM trials t
       JOIN activations a ON a.machine_id = t.machine_id
         AND datetime(a.activated_at) >= datetime(t.started_at)
       WHERE datetime(t.started_at) >= datetime(?1)
         AND datetime(t.started_at) < datetime(?2)`,
    )
    .bind(sinceISO, untilISO)
    .first<{ n: number }>();
  const s = started?.n ?? 0;
  const c = converted?.n ?? 0;
  return { started: s, converted: c, pct: s === 0 ? 0 : c / s };
};

// ── Licenses page ─────────────────────────────────────────────────────────
// Queries for the admin /licenses list + detail. The admin can filter on
// source (lahza vs comp — distinguished by the LZ-COMP- prefix) and status
// (active vs revoked). `q` does a simple LIKE on email / license_key /
// tx_reference; we accept the implicit table scan because the admin panel
// is single-user and the table size is in the hundreds.

export type LahzaLicenseListRow = LahzaLicenseRow & {
  active_activations: number;
};

const lahzaSourceClause = (source: "lahza" | "comp" | "all") => {
  if (source === "comp") return "AND license_key LIKE 'LZ-COMP-%'";
  if (source === "lahza") return "AND license_key NOT LIKE 'LZ-COMP-%'";
  return "";
};

const lahzaStatusClause = (status: "active" | "revoked" | "all") => {
  if (status === "active") return "AND revoked_at IS NULL";
  if (status === "revoked") return "AND revoked_at IS NOT NULL";
  return "";
};

const lahzaSearchClause = (q: string | undefined) => {
  if (!q || !q.trim()) return { sql: "", binds: [] as string[] };
  const pat = `%${q.trim()}%`;
  return {
    sql: "AND (email LIKE ? OR license_key LIKE ? OR tx_reference LIKE ?)",
    binds: [pat, pat, pat],
  };
};

export const listLahzaLicenses = async (
  db: D1Database,
  opts: {
    q?: string;
    source?: "lahza" | "comp" | "all";
    status?: "active" | "revoked" | "all";
    limit?: number;
    offset?: number;
  },
): Promise<LahzaLicenseListRow[]> => {
  const source = opts.source ?? "all";
  const status = opts.status ?? "all";
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const search = lahzaSearchClause(opts.q);

  // Subquery counts only currently-bound activations (no machine-level
  // soft-delete flag exists). issued_at is normalised to ISO so the merge
  // sort with Gumroad rows uses a uniform string-ordering key.
  const sql = `
    SELECT
      l.license_key,
      l.email,
      l.max_uses,
      l.tx_reference,
      ${ISO}l.issued_at) AS issued_at,
      CASE WHEN l.revoked_at IS NULL THEN NULL ELSE ${ISO}l.revoked_at) END AS revoked_at,
      (SELECT COUNT(*) FROM activations a WHERE a.license_key = l.license_key) AS active_activations
    FROM licenses l
    WHERE 1 = 1
      ${lahzaSourceClause(source)}
      ${lahzaStatusClause(status)}
      ${search.sql}
    ORDER BY datetime(l.issued_at) DESC
    LIMIT ? OFFSET ?`;

  const { results } = await db
    .prepare(sql)
    .bind(...search.binds, limit, offset)
    .all<LahzaLicenseListRow>();
  return results ?? [];
};

export const countLahzaLicenses = async (
  db: D1Database,
  opts: {
    q?: string;
    source?: "lahza" | "comp" | "all";
    status?: "active" | "revoked" | "all";
  },
): Promise<number> => {
  const source = opts.source ?? "all";
  const status = opts.status ?? "all";
  const search = lahzaSearchClause(opts.q);
  const sql = `
    SELECT COUNT(*) AS n FROM licenses l
    WHERE 1 = 1
      ${lahzaSourceClause(source)}
      ${lahzaStatusClause(status)}
      ${search.sql}`;
  const r = await db.prepare(sql).bind(...search.binds).first<{ n: number }>();
  return r?.n ?? 0;
};

export const getLahzaLicense = async (
  db: D1Database,
  licenseKey: string,
): Promise<LahzaLicenseListRow | null> => {
  const sql = `
    SELECT
      l.license_key,
      l.email,
      l.max_uses,
      l.tx_reference,
      ${ISO}l.issued_at) AS issued_at,
      CASE WHEN l.revoked_at IS NULL THEN NULL ELSE ${ISO}l.revoked_at) END AS revoked_at,
      (SELECT COUNT(*) FROM activations a WHERE a.license_key = l.license_key) AS active_activations
    FROM licenses l WHERE l.license_key = ?`;
  const row = await db.prepare(sql).bind(licenseKey).first<LahzaLicenseListRow>();
  return row ?? null;
};

export type ActivationListRow = {
  id: number;
  machine_id: string;
  activated_at: string; // ISO 8601 with Z suffix
};

export const listActivationsForKey = async (
  db: D1Database,
  licenseKey: string,
): Promise<ActivationListRow[]> => {
  const { results } = await db
    .prepare(
      `SELECT id, machine_id, ${ISO}activated_at) AS activated_at
       FROM activations
       WHERE license_key = ?
       ORDER BY datetime(activated_at) DESC`,
    )
    .bind(licenseKey)
    .all<ActivationListRow>();
  return results ?? [];
};

export const revokeLahzaLicense = async (db: D1Database, licenseKey: string) => {
  const r = await db
    .prepare("UPDATE licenses SET revoked_at = datetime('now') WHERE license_key = ? AND revoked_at IS NULL")
    .bind(licenseKey)
    .run();
  return r.meta.changes > 0;
};

export const unrevokeLahzaLicense = async (db: D1Database, licenseKey: string) => {
  const r = await db
    .prepare("UPDATE licenses SET revoked_at = NULL WHERE license_key = ? AND revoked_at IS NOT NULL")
    .bind(licenseKey)
    .run();
  return r.meta.changes > 0;
};

export const deleteActivationById = async (
  db: D1Database,
  licenseKey: string,
  id: number,
): Promise<ActivationListRow | null> => {
  // Read-then-delete so we can return the freed row's machine_id for the
  // audit log without a follow-up select.
  const row = await db
    .prepare(
      `SELECT id, machine_id, ${ISO}activated_at) AS activated_at
       FROM activations WHERE license_key = ? AND id = ?`,
    )
    .bind(licenseKey, id)
    .first<ActivationListRow>();
  if (!row) return null;
  await db
    .prepare("DELETE FROM activations WHERE license_key = ? AND id = ?")
    .bind(licenseKey, id)
    .run();
  return row;
};

export const deleteAllActivationsForKey = async (
  db: D1Database,
  licenseKey: string,
): Promise<ActivationListRow[]> => {
  // RETURNING collapses the read-then-delete pair into one round-trip, so
  // the audit log can record the freed machine_ids without a follow-up
  // SELECT. Timestamps are normalised to ISO via strftime for the same
  // reason as the rest of this module — see the file header note.
  const { results } = await db
    .prepare(
      `DELETE FROM activations WHERE license_key = ?
       RETURNING id, machine_id, ${ISO}activated_at) AS activated_at`,
    )
    .bind(licenseKey)
    .all<ActivationListRow>();
  return results ?? [];
};

export const updateLahzaLicenseFields = async (
  db: D1Database,
  licenseKey: string,
  patch: { email?: string; max_uses?: number },
): Promise<boolean> => {
  const sets: string[] = [];
  const binds: (string | number)[] = [];
  if (typeof patch.email === "string") {
    sets.push("email = ?");
    binds.push(patch.email);
  }
  if (typeof patch.max_uses === "number") {
    sets.push("max_uses = ?");
    binds.push(patch.max_uses);
  }
  if (sets.length === 0) return false;
  binds.push(licenseKey);
  const r = await db
    .prepare(`UPDATE licenses SET ${sets.join(", ")} WHERE license_key = ?`)
    .bind(...binds)
    .run();
  return r.meta.changes > 0;
};

export const insertCompLicense = async (
  db: D1Database,
  args: { license_key: string; email: string; max_uses: number; tx_reference: string },
): Promise<boolean> => {
  const r = await db
    .prepare(
      `INSERT OR IGNORE INTO licenses (license_key, email, max_uses, tx_reference)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(args.license_key, args.email, args.max_uses, args.tx_reference)
    .run();
  return r.meta.changes > 0;
};

// ── Trials page ───────────────────────────────────────────────────────────
// Status filters compare `deadline` against the request-time `now` (passed
// in from the route so the unit tests / dashboards stay deterministic).
// Active = deadline > now; expired = deadline <= now.

export type TrialListRow = {
  machine_id: string;
  started_at: string; // ISO
  deadline: string; // ISO
  // Most-recent activation for this machine_id where activated_at >= started_at,
  // i.e. the trial converted into a paid activation. NULL when the machine never
  // converted or only had pre-trial activations (e.g. user re-trialled after
  // deactivation — see trialConversionBetween for the same `>=` rationale).
  converted_license_key: string | null;
  converted_at: string | null;
};

const trialStatusClause = (status: "active" | "expired" | "all") => {
  if (status === "active") return "AND datetime(t.deadline) > datetime(?)";
  if (status === "expired") return "AND datetime(t.deadline) <= datetime(?)";
  return "";
};

const trialSearchClause = (q: string | undefined) => {
  if (!q || !q.trim()) return { sql: "", binds: [] as string[] };
  return { sql: "AND t.machine_id LIKE ?", binds: [`%${q.trim()}%`] };
};

const trialDateRangeClause = (sinceISO: string | null, untilISO: string | null) => {
  const parts: string[] = [];
  const binds: string[] = [];
  if (sinceISO) {
    parts.push("AND datetime(t.started_at) >= datetime(?)");
    binds.push(sinceISO);
  }
  if (untilISO) {
    parts.push("AND datetime(t.started_at) < datetime(?)");
    binds.push(untilISO);
  }
  return { sql: parts.join(" "), binds };
};

// "Did this machine convert?" — most-recent activation on the same machine
// where `activated_at >= started_at`. The `>=` matters: an activation that
// happened *before* this trial started would otherwise falsely count as a
// conversion (e.g. user deactivated their license and started a fresh
// trial on the same machine). Same rationale as `trialConversionBetween`.
// Both columns are produced by the same subquery shape so the JS row
// shape stays aligned between list and detail.
const TRIAL_CONVERSION_LICENSE_KEY_SUBQUERY = `(
  SELECT a.license_key FROM activations a
  WHERE a.machine_id = t.machine_id
    AND datetime(a.activated_at) >= datetime(t.started_at)
  ORDER BY datetime(a.activated_at) DESC LIMIT 1
)`;
const TRIAL_CONVERSION_AT_SUBQUERY = `(
  SELECT ${ISO}a.activated_at) FROM activations a
  WHERE a.machine_id = t.machine_id
    AND datetime(a.activated_at) >= datetime(t.started_at)
  ORDER BY datetime(a.activated_at) DESC LIMIT 1
)`;

export const listTrialsAdmin = async (
  db: D1Database,
  opts: {
    q?: string;
    status?: "active" | "expired" | "all";
    sinceISO?: string | null;
    untilISO?: string | null;
    nowISO: string;
    limit?: number;
    offset?: number;
  },
): Promise<TrialListRow[]> => {
  const status = opts.status ?? "all";
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const search = trialSearchClause(opts.q);
  const range = trialDateRangeClause(opts.sinceISO ?? null, opts.untilISO ?? null);
  const sql = `
    SELECT
      t.machine_id,
      ${ISO}t.started_at) AS started_at,
      ${ISO}t.deadline) AS deadline,
      ${TRIAL_CONVERSION_LICENSE_KEY_SUBQUERY} AS converted_license_key,
      ${TRIAL_CONVERSION_AT_SUBQUERY} AS converted_at
    FROM trials t
    WHERE 1 = 1
      ${trialStatusClause(status)}
      ${search.sql}
      ${range.sql}
    ORDER BY datetime(t.started_at) DESC
    LIMIT ? OFFSET ?`;

  const statusBinds = status === "all" ? [] : [opts.nowISO];
  const { results } = await db
    .prepare(sql)
    .bind(...statusBinds, ...search.binds, ...range.binds, limit, offset)
    .all<TrialListRow>();
  return results ?? [];
};

export const countTrialsAdmin = async (
  db: D1Database,
  opts: {
    q?: string;
    status?: "active" | "expired" | "all";
    sinceISO?: string | null;
    untilISO?: string | null;
    nowISO: string;
  },
): Promise<number> => {
  const status = opts.status ?? "all";
  const search = trialSearchClause(opts.q);
  const range = trialDateRangeClause(opts.sinceISO ?? null, opts.untilISO ?? null);
  const sql = `
    SELECT COUNT(*) AS n FROM trials t
    WHERE 1 = 1
      ${trialStatusClause(status)}
      ${search.sql}
      ${range.sql}`;
  const statusBinds = status === "all" ? [] : [opts.nowISO];
  const r = await db
    .prepare(sql)
    .bind(...statusBinds, ...search.binds, ...range.binds)
    .first<{ n: number }>();
  return r?.n ?? 0;
};

export const getTrial = async (
  db: D1Database,
  machineId: string,
): Promise<TrialListRow | null> => {
  const sql = `
    SELECT
      t.machine_id,
      ${ISO}t.started_at) AS started_at,
      ${ISO}t.deadline) AS deadline,
      ${TRIAL_CONVERSION_LICENSE_KEY_SUBQUERY} AS converted_license_key,
      ${TRIAL_CONVERSION_AT_SUBQUERY} AS converted_at
    FROM trials t WHERE t.machine_id = ?`;
  const row = await db.prepare(sql).bind(machineId).first<TrialListRow>();
  return row ?? null;
};

export type ActivationForMachineRow = {
  id: number;
  license_key: string;
  activated_at: string;
};

export const listActivationsForMachine = async (
  db: D1Database,
  machineId: string,
): Promise<ActivationForMachineRow[]> => {
  const { results } = await db
    .prepare(
      `SELECT id, license_key, ${ISO}activated_at) AS activated_at
       FROM activations
       WHERE machine_id = ?
       ORDER BY datetime(activated_at) DESC`,
    )
    .bind(machineId)
    .all<ActivationForMachineRow>();
  return results ?? [];
};

export const setTrialDeadline = async (
  db: D1Database,
  machineId: string,
  deadlineISO: string,
): Promise<boolean> => {
  const r = await db
    .prepare("UPDATE trials SET deadline = ? WHERE machine_id = ?")
    .bind(deadlineISO, machineId)
    .run();
  return r.meta.changes > 0;
};
