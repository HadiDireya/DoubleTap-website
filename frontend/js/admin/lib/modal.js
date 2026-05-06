// Promise-based confirm modal. Resolves true on confirm, false on cancel /
// backdrop click. Used for destructive or significant actions (revoke,
// free-all-slots, delete post).

import { el } from "./dom.js";

export const confirmModal = ({ title, message, confirmLabel = "Confirm", danger = false }) =>
  new Promise((resolve) => {
    const backdrop = el("div", { class: "lic-modal-backdrop is-open" });
    let settled = false;
    const close = (v) => {
      if (settled) return;
      settled = true;
      backdrop.remove();
      resolve(v);
    };
    const modal = el("div", { class: "lic-modal", role: "dialog", "aria-modal": "true" });
    modal.append(
      el("div", { class: "lic-modal-title" }, title),
      el("p", { class: "lic-modal-message" }, message),
      el("div", { class: "lic-modal-actions" },
        el("button", { class: "lic-modal-cancel", type: "button", onclick: () => close(false) }, "Cancel"),
        el("button", {
          class: "lic-modal-submit" + (danger ? " is-danger" : ""),
          type: "button",
          onclick: () => close(true),
        }, confirmLabel),
      ),
    );
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(false); });
    backdrop.append(modal);
    document.body.append(backdrop);
    setTimeout(() => modal.querySelector("button.lic-modal-submit")?.focus(), 0);
  });
