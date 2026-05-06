// Trial write actions: extend deadline, terminate (set deadline=now). Both
// refresh the drawer on success so the new deadline / status renders.
//
// `openTrialDrawer` is imported from ./drawer.js for the post-action
// refresh (call-time circular import — ES modules handle it cleanly).

import { el } from "../../lib/dom.js";
import { apiFetch } from "../../lib/api.js";
import { showToast } from "../../lib/toast.js";
import { openTrialDrawer } from "./drawer.js";

export const doTrialAction = async (machineId, action, successMessage, opts = {}) => {
  try {
    await apiFetch(`/admin/trials/${encodeURIComponent(machineId)}/${action}`, {
      method: "PATCH",
      ...opts,
    });
    showToast(successMessage);
    openTrialDrawer(machineId);
  } catch (err) {
    showToast(err.message || "Action failed", "error");
  }
};

export const extendTrialDialog = (data) => {
  const isExpired = data.status === "expired";
  const input = el("input", { type: "number", value: "14", min: "1", max: "365", required: true });
  const submit = el("button", { class: "lic-modal-submit", type: "submit" }, "Extend");
  const cancel = el("button", { class: "lic-modal-cancel", type: "button" }, "Cancel");
  let backdrop;
  const close = () => backdrop?.remove();
  cancel.addEventListener("click", close);
  const form = el("form", { onsubmit: async (e) => {
    e.preventDefault();
    const days = parseInt(input.value, 10);
    // Mirror the server bounds (1-365) on the client so a fat-fingered
    // value gets a clear toast instead of a generic "invalid_days" 400.
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      showToast("Days must be between 1 and 365", "error");
      return;
    }
    submit.disabled = true;
    try {
      await apiFetch(`/admin/trials/${encodeURIComponent(data.machine_id)}/extend`, {
        method: "PATCH",
        body: JSON.stringify({ days }),
      });
      showToast(`Extended by ${days}d`);
      close();
      openTrialDrawer(data.machine_id);
    } catch (err) {
      submit.disabled = false;
      showToast(err.message || "Couldn't extend", "error");
    }
  } });
  // For active trials we anchor at the existing deadline ("+N days from
  // current deadline"); for expired trials the server anchors at now,
  // effectively reactivating the trial for N days. Surface that distinction
  // up-front so the admin doesn't expect a different behaviour.
  const helpText = isExpired
    ? "This trial is already expired. Extending will reactivate it for N days starting now."
    : "Pushes the existing deadline forward — not from now. So extending an already-extended trial adds N more days, rather than silently shortening it.";
  form.append(
    el("label", {}, "Add days", input),
    el("p", { class: "lic-modal-message" }, helpText),
    el("div", { class: "lic-modal-actions" }, cancel, submit),
  );
  backdrop = el("div", { class: "lic-modal-backdrop is-open" },
    el("div", { class: "lic-modal" },
      el("div", { class: "lic-modal-title" }, isExpired ? "Reactivate trial" : "Extend trial"),
      form,
    ),
  );
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  setTimeout(() => input.focus(), 0);
};
