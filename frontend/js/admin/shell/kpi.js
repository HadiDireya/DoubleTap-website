// Bento-grid card primitives shared across pages.
//   renderKpiCard      — large headline number + delta + ghost icon (dashboard)
//   renderStat         — compact label/value/foot card (bottom row stats)
//   renderRangeSelector — segmented "7d/30d/90d" toggle (dashboard, future analytics)
//
// `invertedDelta` flips colour semantics: for "good" metrics (issued, users)
// up = green; for "bad" metrics (revoked, refunds) up = red. Arrow direction
// always reflects the sign of the change — green/red is purely valence.

import { el, icon } from "../lib/dom.js";
import { fmtDelta } from "../lib/format.js";

export const renderKpiCard = ({ eyebrow, value, breakdown, delta, deltaSuffix, ghostIcon, span = 3, invertedDelta = false }) => {
  const card = el("div", { class: `admin-card span-${span}` },
    ghostIcon ? el("div", { class: "kpi-ghost" }, icon(ghostIcon, 64)) : null,
    el("div", { class: "kpi-eyebrow" }, eyebrow),
    el("div", { class: "kpi-value" }, value),
    breakdown ? el("div", { class: "kpi-breakdown" }, ...breakdown) : null,
  );
  if (delta != null && Number.isFinite(delta)) {
    const isPositiveValence = invertedDelta ? delta < 0 : delta > 0;
    const isNegativeValence = invertedDelta ? delta > 0 : delta < 0;
    const cls = isPositiveValence ? "is-up" : isNegativeValence ? "is-down" : "is-neutral";
    const arrow = delta > 0 ? "trending-up" : delta < 0 ? "trending-down" : "minus";
    const row = el("div", { class: "kpi-delta-row" },
      el("span", { class: `kpi-delta ${cls}` }, icon(arrow, 12), fmtDelta(delta)),
      deltaSuffix ? el("span", { class: "kpi-delta-suffix" }, deltaSuffix) : null,
    );
    card.append(row);
  }
  return card;
};

export const renderStat = ({ label, value, foot, span = 4 }) =>
  el("div", { class: `admin-card span-${span}` },
    el("div", { class: "stat-card-label" }, label),
    el("div", { class: "stat-card-value" }, value),
    foot ? el("div", { class: "stat-card-foot" }, foot) : null,
  );

export const RANGES = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
];

export const renderRangeSelector = (current, onChange) => {
  const wrap = el("div", { class: "admin-range", role: "tablist", "aria-label": "Time range" });
  for (const r of RANGES) {
    const btn = el("button", {
      type: "button",
      class: r.id === current ? "is-active" : "",
      "aria-pressed": r.id === current ? "true" : "false",
      onclick: () => onChange(r.id),
    }, r.label);
    wrap.append(btn);
  }
  return wrap;
};
