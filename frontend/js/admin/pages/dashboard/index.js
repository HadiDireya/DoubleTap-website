// Dashboard route. Composes KPI cards + chart + feed + bottom-row stats +
// backup card into the bento grid. The backup card hydrates independently
// — GitHub's API can be slow and a sluggish status fetch shouldn't block
// the rest of the dashboard from rendering.

import { el, clear } from "../../lib/dom.js";
import { fmtNum, fmtPct } from "../../lib/format.js";
import { apiFetch } from "../../lib/api.js";
import { renderKpiCard, renderStat, renderRangeSelector } from "../../shell/kpi.js";
import { renderChart } from "./chart.js";
import { renderFeed } from "./feed.js";
import { renderBackupCard, hydrateBackupCard } from "./backup-card.js";

export const renderDashboard = async (canvas, { range = "30d" } = {}) => {
  const loadingHeader = el("div", { class: "admin-page-header" },
    el("div", {},
      el("h1", { class: "admin-page-title" }, "Dashboard"),
      el("p", { class: "admin-page-subtitle" }, "Customer activity at a glance."),
    ),
    renderRangeSelector(range, (next) => {
      window.location.hash = next === "30d" ? "#/" : `#/?range=${next}`;
    }),
  );
  clear(canvas);
  canvas.append(loadingHeader, el("div", { class: "admin-loading" }, "Loading dashboard…"));

  let data;
  try {
    data = await apiFetch(`/admin/dashboard?range=${encodeURIComponent(range)}`);
  } catch (err) {
    clear(canvas);
    canvas.append(loadingHeader, el("div", { class: "admin-error" }, `Couldn’t load dashboard: ${err.message || err}`));
    return;
  }

  clear(canvas);
  canvas.append(loadingHeader);

  const bento = el("div", { class: "admin-bento" });

  const k = data.kpis;
  bento.append(
    renderKpiCard({
      eyebrow: "Active licenses",
      value: fmtNum(k.activeLicenses.total),
      breakdown: [
        el("span", {}, "Lahza ", el("strong", {}, fmtNum(k.activeLicenses.lahza))),
        el("span", {}, "Gumroad ", el("strong", {}, fmtNum(k.activeLicenses.gumroad))),
      ],
      ghostIcon: "key",
    }),
    renderKpiCard({
      eyebrow: "Active trials",
      value: fmtNum(k.activeTrials),
      ghostIcon: "clock",
    }),
    renderKpiCard({
      eyebrow: "Issued · this period",
      value: fmtNum(k.issuedInPeriod.total),
      breakdown: [
        el("span", {}, "Lahza ", el("strong", {}, fmtNum(k.issuedInPeriod.lahza))),
        el("span", {}, "Gumroad ", el("strong", {}, fmtNum(k.issuedInPeriod.gumroad))),
      ],
      delta: k.issuedInPeriod.delta,
      deltaSuffix: "vs prior period",
      ghostIcon: "trending-up",
    }),
    renderKpiCard({
      eyebrow: "Revoked · this period",
      value: fmtNum(k.revokedInPeriod.total),
      delta: k.revokedInPeriod.delta,
      deltaSuffix: "vs prior period",
      ghostIcon: "x-circle",
      invertedDelta: true,
    }),
  );

  bento.append(renderChart(data.issuanceSeries), renderFeed(data.feed));

  const b = data.bottomRow;
  bento.append(
    renderStat({
      label: "Trial → paid · conversion",
      value: fmtPct(b.conversion.pct),
      foot: `${fmtNum(b.conversion.converted)} of ${fmtNum(b.conversion.started)} trials in window`,
    }),
    renderStat({
      label: "Users · total",
      value: fmtNum(b.users.total),
      foot: `${fmtNum(b.users.new)} new in this period`,
    }),
    renderStat({
      label: "Avg activations · per active license",
      value: fmtNum(b.utilisation.avgPerLicense),
      foot: `${fmtNum(b.utilisation.activations)} activations across all licenses`,
    }),
  );

  // Backup card hydrates independently — GitHub's API can be slow and a
  // sluggish status fetch shouldn't block the rest of the dashboard.
  const backupCard = renderBackupCard();
  bento.append(backupCard);
  hydrateBackupCard(backupCard);

  canvas.append(bento);
};
