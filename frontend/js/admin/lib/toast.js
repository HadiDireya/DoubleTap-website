// Single global toast instance. Subsequent show() calls reset content + timer
// so a rapid-fire action sequence doesn't stack toasts.

import { el, clear, icon } from "./dom.js";

const toastEl = el("div", { class: "lic-toast", role: "status", "aria-live": "polite" });
let toastTimer = null;

export const showToast = (message, kind = "info") => {
  if (!toastEl.isConnected) document.body.append(toastEl);
  clear(toastEl);
  toastEl.classList.toggle("is-error", kind === "error");
  toastEl.append(
    icon(kind === "error" ? "x-circle" : "check", 14),
    el("span", {}, message),
  );
  toastEl.classList.add("is-open");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-open"), 2400);
};
