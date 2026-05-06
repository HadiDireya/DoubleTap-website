// Trial detail drawer. Surfaces deadline + conversion + per-machine
// activations + audit timeline. Extend and terminate write actions live
// in ./actions.js.
//
// Trial rows are not deletable from the UI on purpose: the trials table
// exists to bind a machine_id to "trial already used", and removing the
// row re-opens the "wipe Keychain → fresh 14 days" exploit. Terminate sets
// deadline=now instead — the machine remains bound.

import { el, clear, icon } from "../../lib/dom.js";
import { fmtDateTime } from "../../lib/format.js";
import { apiFetch } from "../../lib/api.js";
import { showToast } from "../../lib/toast.js";
import { confirmModal } from "../../lib/modal.js";
import { renderAuditItem } from "../../lib/audit-item.js";
import { parseHash, updateHashParams } from "../../lib/url.js";
import { doTrialAction, extendTrialDialog } from "./actions.js";

let drawerEl = null;
let drawerBackdrop = null;
let drawerLoadingMachine = null;

// Days remaining (negative when expired). Used for the row hint and the
// drawer headline. Keeping the rounding consistent across both places lets
// the user reconcile what the drawer says with what they clicked.
export const trialDaysLeft = (deadlineISO, nowISO) => {
  const deadline = new Date(deadlineISO).getTime();
  const now = new Date(nowISO).getTime();
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return 0;
  return Math.round((deadline - now) / 86_400_000);
};

export const trialDeadlineLabel = (deadlineISO, nowISO) => {
  const days = trialDaysLeft(deadlineISO, nowISO);
  if (days >= 1) return `${days}d left`;
  if (days === 0) return "ends today";
  return `expired ${Math.abs(days)}d ago`;
};

export const closeTrialDrawer = () => {
  if (!drawerEl) return;
  drawerEl.classList.remove("is-open");
  drawerBackdrop?.classList.remove("is-open");
  const { path, params } = parseHash();
  if (params.has("machine")) {
    params.delete("machine");
    const qs = params.toString();
    history.replaceState(null, "", `#${path}${qs ? `?${qs}` : ""}`);
  }
  // See the matching note in licenses/drawer.js — local capture so a fresh
  // open within the 260 ms animation window doesn't get torn down here.
  const elToRemove = drawerEl;
  const backdropToRemove = drawerBackdrop;
  drawerEl = null;
  drawerBackdrop = null;
  setTimeout(() => {
    elToRemove?.remove();
    backdropToRemove?.remove();
  }, 260);
};

export const openTrialDrawer = async (machineId) => {
  if (drawerLoadingMachine === machineId) return;
  drawerLoadingMachine = machineId;

  updateHashParams((p) => p.set("machine", machineId));

  if (!drawerEl) {
    drawerBackdrop = el("div", { class: "lic-drawer-backdrop", onclick: closeTrialDrawer });
    drawerEl = el("aside", { class: "lic-drawer", role: "dialog", "aria-modal": "true" });
    document.body.append(drawerBackdrop, drawerEl);
    requestAnimationFrame(() => {
      drawerBackdrop.classList.add("is-open");
      drawerEl.classList.add("is-open");
    });
  }

  clear(drawerEl);
  drawerEl.append(
    el("div", { class: "lic-drawer-header" },
      el("div", { class: "lic-drawer-key" }, machineId),
      el("button", { class: "lic-drawer-close", type: "button", onclick: closeTrialDrawer, "aria-label": "Close" },
        icon("x-circle", 18)),
    ),
    el("div", { class: "lic-drawer-body" },
      el("div", { class: "admin-loading" }, "Loading…"),
    ),
  );

  let data;
  try {
    data = await apiFetch(`/admin/trials/${encodeURIComponent(machineId)}`);
  } catch (err) {
    clear(drawerEl);
    drawerEl.append(
      el("div", { class: "lic-drawer-header" },
        el("div", { class: "lic-drawer-key" }, machineId),
        el("button", { class: "lic-drawer-close", type: "button", onclick: closeTrialDrawer, "aria-label": "Close" },
          icon("x-circle", 18)),
      ),
      el("div", { class: "lic-drawer-body" },
        el("div", { class: "admin-error" }, `Couldn't load trial: ${err.message || err}`),
      ),
    );
    if (drawerLoadingMachine === machineId) drawerLoadingMachine = null;
    return;
  }

  paintTrialDrawer(data);
  if (drawerLoadingMachine === machineId) drawerLoadingMachine = null;
};

const paintTrialDrawer = (data) => {
  if (!drawerEl) return;
  clear(drawerEl);

  const isActive = data.status === "active";
  const nowISO = data.now || new Date().toISOString();

  drawerEl.append(
    el("div", { class: "lic-drawer-header" },
      el("div", {},
        el("div", { class: "lic-drawer-key" },
          el("span", {}, data.machine_id),
          el("button", {
            class: "lic-drawer-key-copy",
            type: "button",
            "aria-label": "Copy machine id",
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(data.machine_id);
                showToast("Machine id copied");
              } catch (_) { showToast("Couldn't copy", "error"); }
            },
          }, icon("copy", 14)),
        ),
        el("div", { class: "lic-drawer-badges" },
          el("span", { class: `lic-badge status-${isActive ? "active" : "expired"}` },
            isActive ? "ACTIVE" : "EXPIRED"),
          data.converted_license_key
            ? el("span", { class: "lic-badge converted" }, "CONVERTED")
            : null,
        ),
      ),
      el("button", { class: "lic-drawer-close", type: "button", onclick: closeTrialDrawer, "aria-label": "Close" },
        icon("x-circle", 18)),
    ),
  );

  const body = el("div", { class: "lic-drawer-body" });

  // Meta grid
  const meta = el("dl", { class: "lic-meta-grid" });
  const addMeta = (label, value) => {
    if (value == null || value === "") return;
    meta.append(el("dt", {}, label), el("dd", {}, value));
  };
  addMeta("Started", fmtDateTime(data.started_at));
  addMeta("Deadline", `${fmtDateTime(data.deadline)} · ${trialDeadlineLabel(data.deadline, nowISO)}`);
  if (data.converted_license_key) {
    addMeta("Converted to",
      el("a", {
        class: "audit-target-link",
        href: `#/licenses?key=${encodeURIComponent(data.converted_license_key)}`,
      }, data.converted_license_key));
  }
  if (data.converted_at) addMeta("Converted on", fmtDateTime(data.converted_at));

  body.append(
    el("div", {},
      el("div", { class: "lic-section-title" }, "Details"),
      meta,
    ),
  );

  // Actions
  const actions = el("div", { class: "lic-actions" });
  actions.append(
    el("button", {
      class: "lic-action-btn", type: "button",
      onclick: () => extendTrialDialog(data),
    }, icon("plus", 12), "Extend deadline"),
  );
  if (isActive) {
    actions.append(
      el("button", {
        class: "lic-action-btn is-danger", type: "button",
        onclick: async () => {
          const ok = await confirmModal({
            title: "Terminate this trial?",
            message: "Sets the deadline to now. The machine will fall back to trialExpired on its next /verify. The trial row stays so a Keychain wipe can't earn a fresh 14 days.",
            confirmLabel: "Terminate",
            danger: true,
          });
          if (ok) doTrialAction(data.machine_id, "terminate", "Trial terminated");
        },
      }, icon("x-circle", 12), "Terminate now"),
    );
  }

  body.append(
    el("div", {},
      el("div", { class: "lic-section-title" }, "Actions"),
      actions,
    ),
  );

  // Activations on this machine_id (across any license).
  const activationsSection = el("div", {},
    el("div", { class: "lic-section-title" },
      `Activations on this machine (${data.activations.length})`,
      " · ",
      el("a", {
        class: "audit-target-link",
        href: `#/activations?machine_id=${encodeURIComponent(data.machine_id)}`,
      }, "view all activations"),
    ),
  );
  if (data.activations.length === 0) {
    activationsSection.append(el("div", { class: "lic-empty" }, "No activations on this machine."));
  } else {
    const list = el("div", { class: "lic-activations-list" });
    for (const a of data.activations) {
      list.append(
        el("div", { class: "lic-activation" },
          el("div", {},
            el("a", {
              class: "lic-pivot-link",
              href: `#/licenses?key=${encodeURIComponent(a.license_key)}`,
            }, a.license_key),
            el("div", { class: "lic-activation-meta" }, "Activated ", fmtDateTime(a.activated_at)),
          ),
        ),
      );
    }
    activationsSection.append(list);
  }
  body.append(activationsSection);

  // Audit timeline
  const auditSection = el("div", {},
    el("div", { class: "lic-section-title" },
      "Audit timeline",
      " · ",
      el("a", {
        class: "audit-target-link",
        href: `#/audit?target_type=trial&target_id=${encodeURIComponent(data.machine_id)}`,
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
