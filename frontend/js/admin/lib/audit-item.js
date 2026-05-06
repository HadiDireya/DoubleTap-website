// One row in an audit timeline. Used by every detail drawer that shows
// history — licenses, trials, customers, feedback, etc. Action label is
// humanised (e.g. "license.revoke" → "revoke"); details JSON is flattened
// into a one-line `key=value, …` summary, truncated per-value to keep the
// row scannable.

import { el } from "./dom.js";
import { fmtDateTime, fmtRelative } from "./format.js";

export const renderAuditItem = (e) => {
  const item = el("div", { class: "lic-audit-item" });
  let detailsLine = "";
  if (e.details) {
    try {
      const d = JSON.parse(e.details);
      detailsLine = Object.entries(d)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v).slice(0, 40)}`)
        .join(", ");
    } catch (_) { /* leave blank */ }
  }
  item.append(
    el("div", {}, el("strong", {}, e.action.replace(/^license\./, "").replace(/\./g, " ").replace(/_/g, " "))),
    detailsLine ? el("div", { class: "lic-audit-meta" }, detailsLine) : null,
    el("div", { class: "lic-audit-meta" },
      e.actor_email, " · ", fmtDateTime(e.created_at), " (", fmtRelative(e.created_at), ")",
    ),
  );
  return item;
};
