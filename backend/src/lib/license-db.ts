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
