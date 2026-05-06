// Drizzle's `timestamp` columns surface as `Date` after a typical query
// path, but a number or string can sneak through depending on the driver
// state — direct SQL, BetterSQLite vs. D1, etc. Callers want a stable ISO
// string in either case. Used wherever an admin route serialises a row
// containing a created_at / updated_at into JSON.
//
// Today's call sites all pass `notNull()` Drizzle columns, so the type
// signature excludes null/undefined. The runtime guard below catches a
// future caller that lets a nullable column slip through and falls back
// to throwing rather than silently emitting `1970-01-01T00:00:00.000Z`
// (the result of `new Date(null)`) or `RangeError` (from
// `Date#toISOString` on `Invalid Date`). The throw is the right loud
// failure mode in admin code — wrap with `.catch(...)` at the call site
// only when graceful degradation is genuinely wanted there.
export const toISO = (v: Date | number | string): string => {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) throw new Error("toISO: invalid Date");
    return v.toISOString();
  }
  if (v === null || v === undefined) throw new Error("toISO: null/undefined");
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`toISO: invalid input ${String(v)}`);
  return d.toISOString();
};

// Parse an ISO 8601 query-string param into a Date, or null when the
// param is absent / unparseable. Centralised here so the three admin
// routes that accept `since` / `until` filters don't drift on what
// counts as a valid input.
export const parseISODate = (raw: string | undefined): Date | null => {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};
