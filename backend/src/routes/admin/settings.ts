import { Hono } from "hono";
import { ADMIN_EMAILS } from "../../lib/auth-helpers";
import type { AdminVariables } from "./index";
import type { Env } from "../../env";

// PR12 — admin settings (read-only v1).
//
// This route is intentionally narrow. The full roadmap entry covered four
// surfaces (admin emails, API tokens, feature flags, maintenance mode);
// v1 ships them all as **read-only** signals so the admin can answer
// "what's configured on this Worker right now" without leaving the panel.
// Write paths are deferred until they have proper migrations:
//
// - Admin emails — hardcoded in `auth-helpers.ts`. Editing live from the UI
//   could lock the operator out if a typo is saved, so v1 surfaces the
//   list with a hint that it's edited via code/migration. Adding a
//   DB-backed admin list (with bootstrap-from-code as a fallback) sits on
//   the deferred-forks list.
//
// - API tokens / secrets — `wrangler secret put` is the source of truth.
//   The UI reports which secret NAMES are set (truthy in `c.env`) but
//   never the values. This makes "is RESEND_API_KEY actually set on the
//   deployed Worker?" answerable without a console hop.
//
// - Feature flags — none today; surfaced as a placeholder section so the
//   shape is visible and the user knows where the toggle list will land.
//
// - Maintenance mode — write path needs a new `admin_settings` table.
//   Migration shape:
//     CREATE TABLE admin_settings (
//       key TEXT PRIMARY KEY NOT NULL,
//       value TEXT NOT NULL,
//       updated_at INTEGER NOT NULL
//     );
//   plus a Drizzle entry and a `PATCH /maintenance` handler that calls
//   `writeAudit({action: "settings.update_maintenance"})`. The audit
//   action is already declared in `lib/audit.ts` so the wiring is purely
//   additive once the migration lands. **The 503 short-circuit on public
//   routes is explicitly out of scope for that follow-up too — toggling
//   maintenance is a no-op until the public request handlers read this
//   row.** Surface that caveat in the audit details when the toggle ships.

const settings = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

// Names of every secret the admin panel cares about. Order is the order
// they render in the UI. `c.env[name]` truthy → "configured"; we never
// surface the value. Adding a new secret here is the only edit needed
// when /admin/settings should report on it.
const TRACKED_SECRETS = [
  "BETTER_AUTH_SECRET",
  "RESEND_API_KEY",
  "APPLE_CLIENT_ID",
  "APPLE_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GUMROAD_PRODUCT_ID",
  "BACKUP_GH_TOKEN",
] as const;

// ── GET / — current settings snapshot ─────────────────────────────────────
//
// Always-on shape:
//   admins:      list of emails currently granted admin access + where
//                they're configured (`source: "code"` for v1)
//   secrets:     names + configured-bool for every wrangler secret in
//                TRACKED_SECRETS
//   maintenance: { enabled, message, updated_at } — `null` for everything
//                until the admin_settings migration lands
//   feature_flags: empty array placeholder
//
// Returning `null` for the unimplemented surfaces (rather than omitting
// them) keeps the contract stable across the deferred → implemented
// transition: the frontend renders the same skeleton today as it will
// once the migration runs.
settings.get("/", (c) => {
  const admins = ADMIN_EMAILS.map((email) => ({ email, source: "code" as const }));

  const env = c.env as unknown as Record<string, unknown>;
  const secrets = TRACKED_SECRETS.map((name) => ({
    name,
    configured: Boolean(env[name]),
  }));

  return c.json({
    admins,
    secrets,
    maintenance: {
      enabled: false,
      message: null as string | null,
      updated_at: null as string | null,
      // Marker so the frontend can render an "unimplemented" hint instead
      // of pretending the toggle works. Once the admin_settings migration
      // lands this drops to false and the toggle wires up.
      unimplemented: true as const,
    },
    feature_flags: [] as Array<{ key: string; enabled: boolean }>,
  });
});

export default settings;
