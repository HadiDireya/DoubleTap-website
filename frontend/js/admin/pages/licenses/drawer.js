// License detail drawer — module-scoped state plus open/close/paint. State
// is private to this module; the router only ever calls openLicenseDrawer
// or closeLicenseDrawer, both of which are safe regardless of current
// drawer state.
//
// Re-entrancy: opening a drawer mutates the hash (?key=…), which triggers
// hashchange → route() → openLicenseDrawer with the same key. The
// drawerLoadingKey guard short-circuits the duplicate fetch.

import { el, clear, icon } from "../../lib/dom.js";
import { fmtDateTime, fmtRelative } from "../../lib/format.js";
import { apiFetch } from "../../lib/api.js";
import { showToast } from "../../lib/toast.js";
import { confirmModal } from "../../lib/modal.js";
import { renderAuditItem } from "../../lib/audit-item.js";
import { parseHash, updateHashParams } from "../../lib/url.js";
import { doAction, editLicenseEmail, editLicenseSeats } from "./actions.js";

let drawerEl = null;
let drawerBackdrop = null;
let drawerLoadingKey = null;

export const closeLicenseDrawer = () => {
  if (!drawerEl) return;
  drawerEl.classList.remove("is-open");
  drawerBackdrop?.classList.remove("is-open");
  // Clear ?key=… from the hash without reloading the list (preserve filters).
  const { path, params } = parseHash();
  if (params.has("key")) {
    params.delete("key");
    const qs = params.toString();
    history.replaceState(null, "", `#${path}${qs ? `?${qs}` : ""}`);
  }
  // Capture the nodes locally before the post-animation cleanup. Module-level
  // refs may be reassigned by a fresh openLicenseDrawer() call within the
  // 260 ms close window — without the local capture, the timeout would
  // remove the *new* drawer mid-animation and null the live refs.
  const elToRemove = drawerEl;
  const backdropToRemove = drawerBackdrop;
  drawerEl = null;
  drawerBackdrop = null;
  setTimeout(() => {
    elToRemove?.remove();
    backdropToRemove?.remove();
  }, 260);
};

export const openLicenseDrawer = async (licenseKey) => {
  if (drawerLoadingKey === licenseKey) return;
  drawerLoadingKey = licenseKey;

  // Reflect open state in the URL so back-button closes it.
  updateHashParams((p) => p.set("key", licenseKey));

  if (!drawerEl) {
    drawerBackdrop = el("div", { class: "lic-drawer-backdrop", onclick: closeLicenseDrawer });
    drawerEl = el("aside", { class: "lic-drawer", role: "dialog", "aria-modal": "true" });
    document.body.append(drawerBackdrop, drawerEl);
    // Trigger transition next frame so the slide-in animation actually plays.
    requestAnimationFrame(() => {
      drawerBackdrop.classList.add("is-open");
      drawerEl.classList.add("is-open");
    });
  }

  // Skeleton while we fetch
  clear(drawerEl);
  drawerEl.append(
    el("div", { class: "lic-drawer-header" },
      el("div", { class: "lic-drawer-key" }, licenseKey),
      el("button", { class: "lic-drawer-close", type: "button", onclick: closeLicenseDrawer, "aria-label": "Close" },
        icon("x-circle", 18)),
    ),
    el("div", { class: "lic-drawer-body" },
      el("div", { class: "admin-loading" }, "Loading…"),
    ),
  );

  let data;
  try {
    data = await apiFetch(`/admin/licenses/${encodeURIComponent(licenseKey)}`);
  } catch (err) {
    clear(drawerEl);
    drawerEl.append(
      el("div", { class: "lic-drawer-header" },
        el("div", { class: "lic-drawer-key" }, licenseKey),
        el("button", { class: "lic-drawer-close", type: "button", onclick: closeLicenseDrawer, "aria-label": "Close" },
          icon("x-circle", 18)),
      ),
      el("div", { class: "lic-drawer-body" },
        el("div", { class: "admin-error" }, `Couldn't load license: ${err.message || err}`),
      ),
    );
    if (drawerLoadingKey === licenseKey) drawerLoadingKey = null;
    return;
  }

  paintDrawer(data);
  if (drawerLoadingKey === licenseKey) drawerLoadingKey = null;
};

const paintDrawer = (data) => {
  if (!drawerEl) return;
  clear(drawerEl);

  const isGumroad = data.source === "gumroad";
  const isRevoked = !!data.revoked_at;

  drawerEl.append(
    el("div", { class: "lic-drawer-header" },
      el("div", {},
        el("div", { class: "lic-drawer-key" },
          el("span", {}, data.license_key),
          el("button", {
            class: "lic-drawer-key-copy",
            type: "button",
            "aria-label": "Copy license key",
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(data.license_key);
                showToast("Key copied");
              } catch (_) { showToast("Couldn't copy", "error"); }
            },
          }, icon("copy", 14)),
        ),
        el("div", { class: "lic-drawer-badges" },
          el("span", { class: `lic-badge src-${data.source}` }, data.source.toUpperCase()),
          el("span", { class: `lic-badge status-${isRevoked ? "revoked" : "active"}` },
            isRevoked ? "REVOKED" : "ACTIVE"),
        ),
      ),
      el("button", { class: "lic-drawer-close", type: "button", onclick: closeLicenseDrawer, "aria-label": "Close" },
        icon("x-circle", 18)),
    ),
  );

  const body = el("div", { class: "lic-drawer-body" });

  // Meta grid
  const meta = el("dl", { class: "lic-meta-grid" });
  const addMeta = (label, value) => {
    if (value == null || value === "") return;
    meta.append(el("dt", {}, label), el("dd", {}, String(value)));
  };
  addMeta("Email", data.email ?? "—");
  if (data.max_uses != null) addMeta("Seats", `${data.activations.length} active / ${data.max_uses} max`);
  else addMeta("Activations", String(data.activations.length));
  addMeta("Issued", fmtDateTime(data.issued_at));
  if (isRevoked) addMeta("Revoked", fmtDateTime(data.revoked_at));
  if (data.tx_reference) addMeta("Tx reference", data.tx_reference);
  if (data.sale_id) addMeta("Gumroad sale", data.sale_id);
  if (data.product_id) addMeta("Gumroad product", data.product_id);

  body.append(
    el("div", {},
      el("div", { class: "lic-section-title" }, "Details"),
      meta,
    ),
  );

  // Actions
  const actions = el("div", { class: "lic-actions" });
  if (isGumroad) {
    actions.append(
      el("a", {
        class: "lic-action-btn",
        href: `https://app.gumroad.com/products`,
        target: "_blank",
        rel: "noopener noreferrer",
      }, icon("arrow-up-right", 12), "Manage in Gumroad"),
    );
  } else {
    if (isRevoked) {
      actions.append(
        el("button", {
          class: "lic-action-btn", type: "button",
          onclick: () => doAction(data.license_key, "unrevoke", { method: "POST" }, "License un-revoked"),
        }, icon("rotate-ccw", 12), "Un-revoke"),
      );
    } else {
      actions.append(
        el("button", {
          class: "lic-action-btn is-danger", type: "button",
          onclick: async () => {
            const ok = await confirmModal({
              title: "Revoke this license?",
              message: "The next /verify call from any of this license's machines will fail and DoubleTap will revert to trial state. This is reversible.",
              confirmLabel: "Revoke",
              danger: true,
            });
            if (ok) doAction(data.license_key, "revoke", { method: "POST" }, "License revoked");
          },
        }, icon("x-circle", 12), "Revoke"),
      );
    }
    actions.append(
      el("button", {
        class: "lic-action-btn", type: "button",
        onclick: () => editLicenseEmail(data),
      }, icon("edit", 12), "Change email"),
      el("button", {
        class: "lic-action-btn", type: "button",
        onclick: () => editLicenseSeats(data),
      }, icon("users", 12), "Set seats"),
      el("button", {
        class: "lic-action-btn", type: "button",
        onclick: () => doAction(data.license_key, "resend-email", { method: "POST" }, "Email resent"),
      }, icon("mail", 12), "Resend email"),
    );
  }
  if (data.activations.length > 0) {
    actions.append(
      el("button", {
        class: "lic-action-btn is-danger", type: "button",
        onclick: async () => {
          const ok = await confirmModal({
            title: "Free all seats?",
            message: `This drops all ${data.activations.length} machine(s) from this license. Each Mac will fall back to trial state on its next /verify.`,
            confirmLabel: "Free all",
            danger: true,
          });
          if (ok) doAction(data.license_key, "activations/free-all", { method: "POST" }, "All seats freed");
        },
      }, icon("trash", 12), "Free all seats"),
    );
  }

  body.append(
    el("div", {},
      el("div", { class: "lic-section-title" }, "Actions"),
      actions,
    ),
  );

  // Activations
  const activationsSection = el("div", {},
    el("div", { class: "lic-section-title" },
      `Active machines (${data.activations.length})`,
      " · ",
      el("a", {
        class: "audit-target-link",
        href: `#/activations?license_key=${encodeURIComponent(data.license_key)}`,
      }, "view all activations"),
    ),
  );
  if (data.activations.length === 0) {
    activationsSection.append(el("div", { class: "lic-empty" }, "No active machines."));
  } else {
    const list = el("div", { class: "lic-activations-list" });
    for (const a of data.activations) {
      list.append(
        el("div", { class: "lic-activation" },
          el("div", {},
            // Machine id pivots to the trial detail drawer for this
            // machine — `?machine=` opens the drawer directly so the admin
            // doesn't have to click through the list. The trials page
            // gracefully empty-states if no trial row exists.
            el("a", {
              class: "lic-pivot-link",
              href: `#/trials?machine=${encodeURIComponent(a.machine_id)}`,
            }, a.machine_id),
            el("div", { class: "lic-activation-meta" }, "Activated ", fmtDateTime(a.activated_at)),
          ),
          el("button", {
            class: "lic-activation-free", type: "button", "aria-label": "Free this seat",
            onclick: async () => {
              const ok = await confirmModal({
                title: "Free this seat?",
                message: `Drops machine ${a.machine_id.slice(0, 14)}… from this license. The Mac will fall back to trial state on its next /verify.`,
                confirmLabel: "Free seat",
                danger: true,
              });
              if (ok) doAction(data.license_key, `activations/${a.id}/free`, { method: "POST" }, "Seat freed");
            },
          }, icon("trash", 12)),
        ),
      );
    }
    activationsSection.append(list);
  }
  body.append(activationsSection);

  // Audit timeline. Link out to the global audit log page filtered to
  // this license so the user can see context from neighbouring rows
  // (e.g. "what else happened the day this was revoked").
  const auditSection = el("div", {},
    el("div", { class: "lic-section-title" },
      "Audit timeline",
      " · ",
      el("a", {
        class: "audit-target-link",
        href: `#/audit?target_type=license&target_id=${encodeURIComponent(data.license_key)}`,
      }, "view in log"),
    ),
  );
  if (!data.audit || data.audit.length === 0) {
    auditSection.append(el("div", { class: "lic-empty" }, "No admin actions recorded yet."));
  } else {
    const list = el("div", { class: "lic-audit-list" });
    for (const e of data.audit) list.append(renderAuditItem(e));
    auditSection.append(list);
  }
  body.append(auditSection);

  drawerEl.append(body);
};
