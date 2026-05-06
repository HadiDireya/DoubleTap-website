// Settings route. Read-only v1.
//
// Surfaces:
//   1. Admins  — emails currently granted admin access (code-sourced).
//   2. Secrets — names of every wrangler secret the API cares about plus
//                a configured-bool. Values are never sent over the wire.
//   3. Maintenance mode — placeholder card with the toggle disabled until
//                the admin_settings migration lands.
//   4. Feature flags — placeholder card; no flags today.
//   5. API tokens — placeholder card pointing to wrangler secrets.
//
// No drawer, no toolbar — single page with sectioned admin-cards. Status
// banners are aria-live + aria-atomic so a screen reader catches the
// "managed via code" hints alongside the visible copy.

import { el, clear, icon } from "../../lib/dom.js";
import { fmtRelative } from "../../lib/format.js";
import { apiFetch } from "../../lib/api.js";

export const renderSettings = async (canvas) => {
  clear(canvas);
  canvas.append(
    el("div", { class: "admin-page-header" },
      el("div", {},
        el("h1", { class: "admin-page-title" }, "Settings"),
        el("p", { class: "admin-page-subtitle" },
          "Read-only snapshot of who's an admin, which Worker secrets are set, and " +
          "the runtime toggles available to the panel."),
      ),
    ),
  );

  const mount = el("div", { class: "admin-bento" });
  canvas.append(mount);
  mount.append(el("div", { class: "admin-loading admin-card span-12" }, "Loading settings…"));

  let data;
  try {
    data = await apiFetch("/admin/settings");
  } catch (err) {
    clear(mount);
    mount.append(el("div", { class: "admin-error admin-card span-12" },
      `Couldn't load settings: ${err.message || err}`));
    return;
  }

  clear(mount);
  mount.append(
    renderSettingsAdminsCard(data.admins || []),
    renderSettingsSecretsCard(data.secrets || []),
    renderSettingsMaintenanceCard(data.maintenance || null),
    renderSettingsFlagsCard(data.feature_flags || []),
    renderSettingsTokensCard(),
  );
};

const renderSettingsAdminsCard = (admins) => {
  const card = el("div", { class: "admin-card span-6 settings-card" });
  card.append(
    el("div", { class: "settings-card-head" },
      el("div", { class: "lic-section-title" },
        icon("shield", 14), el("span", {}, "Admin emails"),
      ),
      el("span", { class: "settings-pill" }, "Read-only"),
    ),
    el("p", { class: "settings-card-help",
      role: "note", "aria-live": "polite", "aria-atomic": "true" },
      "Editing the admin list from the UI is intentionally not supported in v1 — " +
        "a misconfigured row could lock you out of the panel. Update ",
      el("code", { class: "settings-inline-code" }, "ADMIN_EMAILS"),
      " in ",
      el("code", { class: "settings-inline-code" }, "backend/src/lib/auth-helpers.ts"),
      " and redeploy to grant additional access."),
  );

  if (admins.length === 0) {
    card.append(el("div", { class: "lic-empty" }, "No admin emails configured."));
    return card;
  }

  const list = el("ul", { class: "settings-list" });
  for (const a of admins) {
    // a.source is hardcoded "code" server-side today, but if it ever
    // becomes DB-driven an unsanitized value would flow into a class
    // name. Validate against the small enum on render so a stray value
    // can't smuggle CSS via the className.
    const safeSource = a.source === "code" || a.source === "db" ? a.source : "unknown";
    list.append(
      el("li", { class: "settings-list-row" },
        el("span", { class: "settings-list-primary" }, a.email),
        el("span", { class: `lic-badge settings-source-${safeSource}` },
          safeSource.toUpperCase()),
      ),
    );
  }
  card.append(list);
  return card;
};

const renderSettingsSecretsCard = (secrets) => {
  const card = el("div", { class: "admin-card span-6 settings-card" });
  const total = secrets.length;
  const ok = secrets.filter((s) => s.configured).length;
  card.append(
    el("div", { class: "settings-card-head" },
      el("div", { class: "lic-section-title" },
        icon("key", 14), el("span", {}, "Worker secrets"),
      ),
      el("span", { class: "settings-pill" }, `${ok}/${total} set`),
    ),
    el("p", { class: "settings-card-help",
      role: "note", "aria-live": "polite", "aria-atomic": "true" },
      "Names only — values never leave the Worker. Manage with ",
      el("code", { class: "settings-inline-code" }, "wrangler secret put <NAME>"),
      "."),
  );

  if (secrets.length === 0) {
    card.append(el("div", { class: "lic-empty" }, "No tracked secrets."));
    return card;
  }

  const list = el("ul", { class: "settings-list" });
  for (const s of secrets) {
    const cls = s.configured ? "is-ok" : "is-missing";
    const label = s.configured ? "SET" : "MISSING";
    list.append(
      el("li", { class: "settings-list-row" },
        el("code", { class: "settings-secret-name" }, s.name),
        el("span", { class: `settings-status-pill ${cls}` },
          icon(s.configured ? "check" : "x-circle", 12),
          el("span", {}, label),
        ),
      ),
    );
  }
  card.append(list);
  return card;
};

const renderSettingsMaintenanceCard = (maintenance) => {
  const card = el("div", { class: "admin-card span-6 settings-card" });
  const unimplemented = !maintenance || maintenance.unimplemented === true;
  card.append(
    el("div", { class: "settings-card-head" },
      el("div", { class: "lic-section-title" },
        icon("zap", 14), el("span", {}, "Maintenance mode"),
      ),
      unimplemented
        ? el("span", { class: "settings-pill" }, "Deferred")
        : el("span", { class: `settings-pill ${maintenance.enabled ? "is-on" : ""}` },
            maintenance.enabled ? "ENABLED" : "DISABLED"),
    ),
    el("p", { class: "settings-card-help",
      role: "note", "aria-live": "polite", "aria-atomic": "true" },
      unimplemented
        ? "Toggle deferred — the admin_settings table doesn't exist yet. " +
          "Migration shape and audit action (settings.update_maintenance) are reserved; " +
          "wiring is purely additive once the migration lands. The 503 short-circuit on " +
          "public routes is a separate follow-up."
        : "Toggle maintenance mode for the public site. While enabled, www routes return " +
          "a 503 with the configured message."),
  );

  // Toggle row — visible affordance whose handler is gated on `unimplemented`.
  // Once the admin_settings migration lands and the server clears the flag,
  // attach a click handler that PATCHes /admin/settings/maintenance and
  // refetches.
  //
  // While unimplemented: tabindex=-1 keeps it out of tab order even on
  // Safari (which has historically stripped `disabled` from tab order
  // inconsistently for role="switch" buttons), and aria-disabled mirrors
  // the disabled attribute so AT announces the state instead of the
  // toggle reading as a live control.
  const toggleRow = el("div", { class: "settings-toggle-row" });
  const toggle = el("button", {
    type: "button",
    class: unimplemented ? "settings-toggle is-disabled" : "settings-toggle",
    role: "switch",
    "aria-checked": maintenance && maintenance.enabled ? "true" : "false",
    "aria-disabled": unimplemented ? "true" : "false",
    disabled: unimplemented,
    tabindex: unimplemented ? "-1" : "0",
    "aria-label": unimplemented
      ? "Maintenance mode toggle (deferred)"
      : "Maintenance mode toggle",
  }, el("span", { class: "settings-toggle-knob" }));
  toggleRow.append(
    el("span", { class: "settings-toggle-label" }, "Enable maintenance mode"),
    toggle,
  );
  card.append(toggleRow);

  if (unimplemented) {
    card.append(
      el("p", { class: "settings-card-foot" },
        "Wiring deferred — edit ",
        el("code", { class: "settings-inline-code" }, "backend/src/routes/admin/settings.ts"),
        " and add the ",
        el("code", { class: "settings-inline-code" }, "admin_settings"),
        " migration to enable."),
    );
  }

  if (maintenance && maintenance.message) {
    card.append(
      el("div", { class: "settings-message-preview" },
        el("div", { class: "lic-section-title" }, "Current message"),
        el("p", { class: "settings-message-body" }, maintenance.message),
      ),
    );
  }
  if (maintenance && maintenance.updated_at) {
    card.append(
      el("p", { class: "settings-card-foot" },
        "Last changed ", fmtRelative(maintenance.updated_at), "."),
    );
  }
  return card;
};

const renderSettingsFlagsCard = (flags) => {
  const card = el("div", { class: "admin-card span-6 settings-card" });
  card.append(
    el("div", { class: "settings-card-head" },
      el("div", { class: "lic-section-title" },
        icon("activity", 14), el("span", {}, "Feature flags"),
      ),
      el("span", { class: "settings-pill" }, `${flags.length} flag${flags.length === 1 ? "" : "s"}`),
    ),
    el("p", { class: "settings-card-help",
      role: "note", "aria-live": "polite", "aria-atomic": "true" },
      flags.length === 0
        ? "No feature flags wired today. When you add the first one, it'll list here with a toggle."
        : "Toggle on/off below. Changes are audited."),
  );

  if (flags.length === 0) {
    card.append(el("div", { class: "lic-empty" }, "No flags defined."));
    return card;
  }

  const list = el("ul", { class: "settings-list" });
  for (const f of flags) {
    list.append(
      el("li", { class: "settings-list-row" },
        el("code", { class: "settings-secret-name" }, f.key),
        el("span", { class: `settings-status-pill ${f.enabled ? "is-ok" : "is-missing"}` },
          icon(f.enabled ? "check" : "x-circle", 12),
          el("span", {}, f.enabled ? "ON" : "OFF"),
        ),
      ),
    );
  }
  card.append(list);
  return card;
};

const renderSettingsTokensCard = () => {
  const card = el("div", { class: "admin-card span-12 settings-card" });
  card.append(
    el("div", { class: "settings-card-head" },
      el("div", { class: "lic-section-title" },
        icon("mail", 14), el("span", {}, "API tokens"),
      ),
      el("span", { class: "settings-pill" }, "External"),
    ),
    el("p", { class: "settings-card-help",
      role: "note", "aria-live": "polite", "aria-atomic": "true" },
      "API tokens are managed as Cloudflare Worker secrets — see the ",
      el("strong", {}, "Worker secrets"),
      " card above for what's currently set. Issuing admin-panel-managed tokens " +
      "would add an attack surface this app doesn't need today; " +
      "if a future workflow forces it, mint a separate token table with " +
      "scoped permissions and rotate via this panel."),
  );
  return card;
};
