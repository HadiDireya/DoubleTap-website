import { Hono } from "hono";
import { parseISODate } from "../../lib/dates";
import {
  activationStats,
  countActivationsAdmin,
  listActivationsAdmin,
} from "../../lib/license-db";
import { parsePositiveInt } from "../../lib/query";
import type { AdminVariables } from "./index";
import type { Env } from "../../env";

const activations = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

// ── GET / — paginated cross-cut activations list with filters ─────────────
//
// Filters:
//   q              — substring match on license_key OR machine_id
//   since/until    — ISO 8601 bounds on activated_at
//   shared=1       — only rows whose machine_id appears on ≥2 distinct keys
//   license_key    — pivot to one license (drilldown from a license drawer)
//   machine_id     — pivot to one machine (drilldown from a trial drawer)
//
// `stats` rides on the same response so the banner ("3 shared machines
// on file") doesn't need a second round-trip. The stats query is global —
// not filter-respecting — so the user always sees the fraud surface area
// regardless of what they're currently searching for.
//
// Source classification is left to the frontend: `LZ-COMP-` → comp, `LZ-`
// → lahza, anything else → gumroad. This mirrors `licenses.ts`'s
// `sourceFor` so we don't drift on the convention.
activations.get("/", async (c) => {
  const q = c.req.query("q") ?? "";
  // Same pre-stringified-ISO contract as trials/licenses — the SQL wraps
  // both sides in `datetime(...)` so the separator doesn't matter.
  const since = parseISODate(c.req.query("since"))?.toISOString() ?? null;
  const until = parseISODate(c.req.query("until"))?.toISOString() ?? null;
  const sharedOnly = c.req.query("shared") === "1";
  const licenseKey = c.req.query("license_key") || undefined;
  const machineId = c.req.query("machine_id") || undefined;
  const limit = parsePositiveInt(c.req.query("limit"), 50, 200);
  const page = parsePositiveInt(c.req.query("page"), 1, 1_000_000);
  const offset = (page - 1) * limit;

  const ldb = c.env.LICENSE_DB;
  const [rows, total, stats] = await Promise.all([
    listActivationsAdmin(ldb, {
      q,
      sinceISO: since,
      untilISO: until,
      sharedOnly,
      licenseKey,
      machineId,
      limit,
      offset,
    }),
    countActivationsAdmin(ldb, {
      q,
      sinceISO: since,
      untilISO: until,
      sharedOnly,
      licenseKey,
      machineId,
    }),
    activationStats(ldb),
  ]);

  return c.json({
    rows: rows.map((r) => ({
      id: r.id,
      license_key: r.license_key,
      machine_id: r.machine_id,
      activated_at: r.activated_at,
      email: r.email,
      // sourceFor: keep parity with licenses.ts. Doing it server-side means
      // the frontend doesn't have to repeat the prefix logic for the badge.
      source: r.license_key.startsWith("LZ-COMP-")
        ? ("comp" as const)
        : r.license_key.startsWith("LZ-")
          ? ("lahza" as const)
          : ("gumroad" as const),
      license_revoked: r.license_revoked_at != null,
      shared_count: r.shared_count,
    })),
    page,
    limit,
    total,
    stats,
  });
});

export default activations;
