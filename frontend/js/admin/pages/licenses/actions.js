// Write actions for the license detail drawer + the toolbar's "Issue comp"
// button. Each action POSTs/PATCHes the licence, toasts the result, and
// refreshes the drawer so the next render reflects the new state.
//
// `openLicenseDrawer` is imported from ./drawer.js for the post-action
// refresh — that's a circular import on paper but only used at call time,
// which ES modules handle cleanly.

import { el } from "../../lib/dom.js";
import { apiFetch } from "../../lib/api.js";
import { showToast } from "../../lib/toast.js";
import { parseHash } from "../../lib/url.js";
import { openLicenseDrawer } from "./drawer.js";

export const doAction = async (licenseKey, action, opts, successMessage) => {
  try {
    await apiFetch(`/admin/licenses/${encodeURIComponent(licenseKey)}/${action}`, opts);
    showToast(successMessage);
    // Re-fetch the detail so the drawer shows the new state.
    openLicenseDrawer(licenseKey);
  } catch (err) {
    showToast(err.message || "Action failed", "error");
  }
};

// Inline-edit helpers — open a modal with a single field, then PATCH.

export const editLicenseEmail = (data) => {
  const input = el("input", { type: "email", value: data.email ?? "", required: true, autocomplete: "off" });
  const submit = el("button", { class: "lic-modal-submit", type: "submit" }, "Save");
  const cancel = el("button", { class: "lic-modal-cancel", type: "button" }, "Cancel");
  const form = el("form", { onsubmit: async (e) => {
    e.preventDefault();
    const next = input.value.trim().toLowerCase();
    if (!next || next === (data.email ?? "")) { close(); return; }
    try {
      await apiFetch(`/admin/licenses/${encodeURIComponent(data.license_key)}`, {
        method: "PATCH",
        body: JSON.stringify({ email: next }),
      });
      showToast("Email updated");
      close();
      openLicenseDrawer(data.license_key);
    } catch (err) {
      showToast(err.message || "Update failed", "error");
    }
  } });
  let backdrop;
  const close = () => backdrop?.remove();
  cancel.addEventListener("click", close);
  form.append(
    el("label", {}, "New email", input),
    el("div", { class: "lic-modal-actions" }, cancel, submit),
  );
  backdrop = el("div", { class: "lic-modal-backdrop is-open" },
    el("div", { class: "lic-modal" },
      el("div", { class: "lic-modal-title" }, "Change customer email"),
      form,
    ),
  );
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  setTimeout(() => input.focus(), 0);
};

export const editLicenseSeats = (data) => {
  const input = el("input", { type: "number", value: String(data.max_uses ?? 1), min: "1", max: "100", required: true });
  const submit = el("button", { class: "lic-modal-submit", type: "submit" }, "Save");
  const cancel = el("button", { class: "lic-modal-cancel", type: "button" }, "Cancel");
  const form = el("form", { onsubmit: async (e) => {
    e.preventDefault();
    const next = parseInt(input.value, 10);
    if (!Number.isFinite(next) || next < 1 || next === data.max_uses) { close(); return; }
    try {
      await apiFetch(`/admin/licenses/${encodeURIComponent(data.license_key)}`, {
        method: "PATCH",
        body: JSON.stringify({ max_uses: next }),
      });
      showToast("Seats updated");
      close();
      openLicenseDrawer(data.license_key);
    } catch (err) {
      showToast(err.message || "Update failed", "error");
    }
  } });
  let backdrop;
  const close = () => backdrop?.remove();
  cancel.addEventListener("click", close);
  form.append(
    el("label", {}, "Max seats", input),
    el("p", { class: "lic-modal-message" },
      "Lowering this below current activations doesn't auto-free seats — use ", "Free all seats", " for that."),
    el("div", { class: "lic-modal-actions" }, cancel, submit),
  );
  backdrop = el("div", { class: "lic-modal-backdrop is-open" },
    el("div", { class: "lic-modal" },
      el("div", { class: "lic-modal-title" }, "Set max seats"),
      form,
    ),
  );
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  setTimeout(() => input.focus(), 0);
};

export const openIssueCompDialog = () => {
  const emailInput = el("input", { type: "email", required: true, autocomplete: "off", placeholder: "customer@example.com" });
  const seatsInput = el("input", { type: "number", value: "1", min: "1", max: "100", required: true });
  const noteInput = el("textarea", { placeholder: "Optional internal note (visible in audit log only)" });
  const submit = el("button", { class: "lic-modal-submit", type: "submit" }, "Issue + email");
  const cancel = el("button", { class: "lic-modal-cancel", type: "button" }, "Cancel");
  let backdrop;
  const close = () => backdrop?.remove();
  cancel.addEventListener("click", close);
  const form = el("form", { onsubmit: async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    const seats = parseInt(seatsInput.value, 10);
    const note = noteInput.value.trim();
    if (!email || !Number.isFinite(seats) || seats < 1) return;
    submit.disabled = true;
    try {
      const res = await apiFetch("/admin/licenses/comp", {
        method: "POST",
        body: JSON.stringify({ email, max_uses: seats, note }),
      });
      showToast(`Issued ${res.license_key}`);
      close();
      // Reload the list so the new key appears, and open the drawer. If
      // the user had filtered to a non-comp source, swap to comp so the
      // new row is visible. Same for status=revoked (the comp is active).
      const { path, params } = parseHash();
      if (path === "/licenses") {
        const currentSource = params.get("source");
        if (currentSource && currentSource !== "all" && currentSource !== "comp") {
          params.set("source", "comp");
        }
        if (params.get("status") === "revoked") params.delete("status");
        params.delete("page");
        params.set("key", res.license_key);
        window.location.hash = `#${path}?${params.toString()}`;
      } else {
        window.location.hash = `#/licenses?source=comp&key=${encodeURIComponent(res.license_key)}`;
      }
    } catch (err) {
      submit.disabled = false;
      showToast(err.message || "Couldn't issue comp", "error");
    }
  } });
  form.append(
    el("label", {}, "Customer email", emailInput),
    el("label", {}, "Seats (max activations)", seatsInput),
    el("label", {}, "Internal note", noteInput),
    el("div", { class: "lic-modal-actions" }, cancel, submit),
  );
  backdrop = el("div", { class: "lic-modal-backdrop is-open" },
    el("div", { class: "lic-modal" },
      el("div", { class: "lic-modal-title" }, "Issue comp license"),
      el("p", { class: "lic-modal-message" },
        "Mints an LZ-COMP- key, stores it in the licenses DB, and emails it via Resend. The action is recorded in the audit log."),
      form,
    ),
  );
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  setTimeout(() => emailInput.focus(), 0);
};
