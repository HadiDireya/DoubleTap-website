// Drizzle's `timestamp` columns surface as `Date` after a typical query
// path, but a number or string can sneak through depending on the driver
// state — direct SQL, BetterSQLite vs. D1, etc. Callers want a stable ISO
// string in either case. Used wherever an admin route serialises a row
// containing a created_at / updated_at into JSON.
export const toISO = (v: Date | number | string): string =>
  v instanceof Date ? v.toISOString() : new Date(v).toISOString();
