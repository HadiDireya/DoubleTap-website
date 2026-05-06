// Stacked SVG bar chart for the dashboard's "License issuance" panel.
// SVG instead of HTML divs because CSP `style-src 'self'` blocks inline
// `style="height:N%"` on DOM nodes. Geometry attributes on <rect> are not
// styles — they're SVG attributes and aren't gated by the CSP.

import { el } from "../../lib/dom.js";
import { fmtDay } from "../../lib/format.js";

const VIEW_W = 100;
const VIEW_H = 100;

export const renderChart = (series) => {
  const card = el("div", { class: "admin-card span-8" });
  card.append(
    el("div", { class: "chart-card-header" },
      el("div", { class: "chart-title" }, "License issuance"),
      el("div", { class: "chart-legend" },
        el("span", {}, el("span", { class: "chart-legend-swatch lahza" }), "Lahza"),
        el("span", {}, el("span", { class: "chart-legend-swatch comp" }), "Comp"),
      ),
    ),
  );

  const canvas = el("div", { class: "chart-canvas" });

  if (series.length === 0) {
    canvas.append(el("div", { class: "chart-empty" }, "No issuance in this period"));
    card.append(canvas);
    return card;
  }

  const max = Math.max(1, ...series.map((p) => (p.lahza ?? 0) + (p.comp ?? 0)));
  const n = series.length;
  const gap = 0.4;
  const cellW = VIEW_W / n;
  const barW = Math.max(0.5, cellW - gap);
  const radius = Math.min(0.8, barW / 4);

  const svg = el("svg", {
    class: "chart-svg",
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    preserveAspectRatio: "none",
    "aria-label": "License issuance over time",
  });

  series.forEach((point, i) => {
    const x = i * cellW + gap / 2;
    const lahza = point.lahza ?? 0;
    const comp = point.comp ?? 0;
    const total = lahza + comp;
    const totalH = (total / max) * VIEW_H;
    const compH = total > 0 ? ((comp / total) * totalH) : 0;
    const lahzaH = total > 0 ? ((lahza / total) * totalH) : 0;

    if (compH > 0) {
      svg.append(el("rect", {
        class: "comp",
        x, y: VIEW_H - totalH, width: barW, height: compH, rx: radius,
      }));
    }
    if (lahzaH > 0) {
      svg.append(el("rect", {
        class: "lahza",
        x, y: VIEW_H - lahzaH, width: barW, height: lahzaH,
        rx: compH > 0 ? 0 : radius,
      }));
    }
  });

  canvas.append(svg);
  card.append(canvas);

  const first = series[0];
  const last = series[series.length - 1];
  const middle = series[Math.floor(series.length / 2)];
  card.append(
    el("div", { class: "chart-axis" },
      el("span", {}, fmtDay(first.date)),
      el("span", {}, fmtDay(middle.date)),
      el("span", {}, fmtDay(last.date)),
    ),
  );
  return card;
};
