// Query-string parsing + small Drizzle composition helpers shared across
// admin routes. Lives here (rather than in a route file) so the same
// pagination contract, ISO-date range, and AND-composition logic is used
// everywhere — drift between routes was the bug magnet this module
// replaces.

import { and, type SQL } from "drizzle-orm";
import { parseISODate } from "./dates";

// Coerce a string to a positive integer, clamping to [1, max] and falling
// back to `fallback` when the input is missing or invalid. Used for page
// + limit + similar 1-indexed counters.
export const parsePositiveInt = (raw: string | undefined, fallback: number, max: number): number => {
  const n = parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
};

// Structural minimal type so any Hono context can pass through here without
// dragging in Hono's invariant generics — same trick lib/auth-helpers and
// lib/audit use.
type QueryContext = { req: { query: (key: string) => string | undefined } };

// `page` / `limit` / `offset` triple every admin list route needs. Default
// limit is 50 with a 200 cap; routes that fan in per-row queries (and can
// blow D1's prepared-statement bind ceiling at 200) drop the cap to 100.
export const parsePagination = (
  c: QueryContext,
  opts: { limitDefault?: number; limitMax?: number } = {},
) => {
  const limitDefault = opts.limitDefault ?? 50;
  const limitMax = opts.limitMax ?? 200;
  const page = parsePositiveInt(c.req.query("page"), 1, 1_000_000);
  const limit = parsePositiveInt(c.req.query("limit"), limitDefault, limitMax);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

// Parses ?since= / ?until= and exposes both forms — Date for Drizzle
// `gte` / `lt` against typed timestamp columns, ISO string for the
// raw-SQL helpers in `lib/license-db.ts` whose `datetime(?)` wrappers
// take a pre-stringified value. Routes destructure whichever pair they
// actually use.
export const parseISORange = (c: QueryContext) => {
  const since = parseISODate(c.req.query("since"));
  const until = parseISODate(c.req.query("until"));
  return {
    since,
    until,
    sinceISO: since?.toISOString() ?? null,
    untilISO: until?.toISOString() ?? null,
  };
};

// AND-compose a sparse list of Drizzle predicates: skip the `undefined`
// holes (so callers can write `q ? eq(...) : undefined` inline) and
// collapse to `undefined` when nothing applies — Drizzle then emits no
// WHERE clause at all, which is the correct behaviour for an unfiltered
// list endpoint.
export const composeAnd = (filters: (SQL | undefined)[]): SQL | undefined => {
  const active = filters.filter((f): f is SQL => f !== undefined);
  return active.length > 0 ? and(...active) : undefined;
};
