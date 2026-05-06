// Activations route — cross-cut view of every (license, machine) pair.
//
// Routing:
//   #/activations                    → all activations (most recent first)
//   #/activations?q=…                → substring on license_key OR machine_id
//   #/activations?since=…&until=…    → bounds on activated_at, ISO 8601
//   #/activations?shared=1           → only machine_ids with ≥2 distinct keys
//   #/activations?license_key=LZ-…   → pivot from a license drawer
//   #/activations?machine_id=MAC-…   → pivot from a trial drawer
//
// No detail drawer here — clicking a row's license cell pivots to the
// licenses drawer; clicking the machine cell pivots to the trials drawer.
// The unique value of this page is the cross-cut: machine_ids grouped by
// `shared_count` (≥2 = customer-shared seat) and license_keys with rapid
// repeat activations (deactivate-loop abuse). Drilling INTO the per-license
// or per-machine view is what the existing drawers already do better.
//
// No `lastActivationsFilterSig` short-circuit like licenses/trials/customers
// have — those skip the table re-fetch when only `?key=` / `?machine=` /
// `?u=` flips (drawer open/close). This page has no drawer of its own;
// every hash mutation is a filter change, so a full re-render is always
// the right thing.

import { el, clear, icon } from "../../lib/dom.js";
import { fmtNum, fmtRelative, truncateEmail } from "../../lib/format.js";
import { apiFetch } from "../../lib/api.js";
import { updateHashParams, dateInputValueFromISO, localMidnightISO } from "../../lib/url.js";
import { wrapWithPagination } from "../../lib/pagination.js";
import { renderStat } from "../../shell/kpi.js";

const buildActivationsQuery = (params) => {
  const out = new URLSearchParams();
  for (const k of ["q", "since", "until", "shared", "license_key", "machine_id", "page"]) {
    const v = params.get(k);
    if (v) out.set(k, v);
  }
  return out.toString();
};

export const renderActivations = async (canvas, { params }) => {
  const focusedSelector = (() => {
    const a = document.activeElement;
    if (!a || !canvas.contains(a)) return null;
    if (a.matches?.(".lic-search input")) return ".lic-search input";
    return null;
  })();
  const caret = focusedSelector ? document.activeElement.selectionStart : null;

  clear(canvas);
  canvas.append(
    el("div", { class: "admin-page-header" },
      el("div", {},
        el("h1", { class: "admin-page-title" }, "Activations"),
        el("p", { class: "admin-page-subtitle" },
          "Every (license, machine) pair. Spot a single machine on multiple keys, or a key with rapid repeat activations. Click the license or machine cell to drill in."),
      ),
    ),
  );

  const q = params.get("q") ?? "";
  const since = params.get("since") ?? "";
  const until = params.get("until") ?? "";
  const sharedOnly = params.get("shared") === "1";
  const licenseKeyPivot = params.get("license_key") ?? "";
  const machineIdPivot = params.get("machine_id") ?? "";
  const page = parseInt(params.get("page") ?? "1", 10) || 1;
  const limit = 50;

  const setParam = (key, value) => updateHashParams((p) => {
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete("page");
  });

  // Pivot banner — when the page was opened via license_key= or machine_id=
  // (drilldown from another page's drawer), surface the active pivot with a
  // clear-button. Without this, the user can be filtered down to 3 rows
  // and not realise why the rest of the table is missing.
  if (licenseKeyPivot || machineIdPivot) {
    const pivotLabel = licenseKeyPivot
      ? el("span", {}, "Filtered to license ",
          el("span", { class: "lic-key" }, licenseKeyPivot))
      : el("span", {}, "Filtered to machine ",
          el("span", { class: "lic-key" }, machineIdPivot));
    canvas.append(
      // aria-live so screen readers announce the active pivot when it
      // mounts; aria-atomic so the whole banner reads together rather
      // than just the changed bit (the key/id span).
      el("div", { class: "lic-pivot-banner", role: "status", "aria-live": "polite", "aria-atomic": "true" },
        pivotLabel,
        el("button", {
          type: "button", class: "lic-page-btn",
          onclick: () => updateHashParams((p) => {
            p.delete("license_key");
            p.delete("machine_id");
            p.delete("page");
          }),
        }, icon("x-circle", 12), "Clear"),
      ),
    );
  }

  const searchInput = el("input", {
    type: "search",
    placeholder: "Search by license_key or machine_id…",
    value: q,
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Search activations",
  });
  let debounce = null;
  searchInput.addEventListener("input", () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => setParam("q", searchInput.value.trim()), 250);
  });

  // Single chip toggle — `shared_count ≥ 2`. Inline rather than a select
  // because there's only one binary state to expose.
  const sharedToggle = el("button", {
    type: "button",
    class: `lic-chip ${sharedOnly ? "is-active" : ""}`,
    "aria-pressed": sharedOnly ? "true" : "false",
    onclick: () => setParam("shared", sharedOnly ? "" : "1"),
  }, "Shared machines only");

  const sinceInput = el("input", {
    type: "date", class: "audit-input", value: dateInputValueFromISO(since),
    "aria-label": "Activated on or after",
    onchange: (e) => setParam("since", localMidnightISO(e.target.value)),
  });
  const untilInput = el("input", {
    type: "date", class: "audit-input", value: dateInputValueFromISO(until),
    "aria-label": "Activated before (exclusive)",
    onchange: (e) => setParam("until", localMidnightISO(e.target.value)),
  });

  canvas.append(
    el("div", { class: "lic-toolbar" },
      el("div", { class: "lic-search" }, icon("search", 16), searchInput),
      el("div", { class: "lic-filters" }, sharedToggle),
      sinceInput,
      untilInput,
    ),
  );

  if (focusedSelector) {
    const restored = canvas.querySelector(focusedSelector);
    if (restored) {
      restored.focus();
      if (caret != null) {
        try { restored.setSelectionRange(caret, caret); } catch (_) { /* type=search may not support setSelectionRange */ }
      }
    }
  }

  // Stats banner mounts above the table so the global counts (total,
  // shared machines on file, hot licenses in last 7d) sit visually
  // distinct from the filter-respecting table below.
  const statsMount = el("div", { class: "admin-bento activations-stats" });
  canvas.append(statsMount);

  const tableMount = el("div");
  canvas.append(tableMount);
  tableMount.append(el("div", { class: "admin-loading" }, "Loading activations…"));

  let data;
  try {
    const qs = buildActivationsQuery(params);
    data = await apiFetch(`/admin/activations${qs ? `?${qs}` : ""}`);
  } catch (err) {
    clear(tableMount);
    tableMount.append(el("div", { class: "admin-error" }, `Couldn't load activations: ${err.message || err}`));
    return;
  }

  // Stats: 3 cards, span-4 each across the 12-column bento.
  if (data.stats) {
    statsMount.append(
      renderStat({
        label: "Total activations",
        value: fmtNum(data.stats.total_activations),
        foot: "All-time, across every license source.",
      }),
      renderStat({
        label: "Shared machines",
        value: fmtNum(data.stats.shared_machines),
        foot: "Machines whose ID activated ≥2 distinct license keys. Possible seat-sharing.",
      }),
      renderStat({
        label: "Hot licenses (7d)",
        value: fmtNum(data.stats.hot_licenses),
        foot: "Keys with ≥3 activations in the last 7 days. Possible deactivate-loop abuse.",
      }),
    );
  }

  clear(tableMount);
  tableMount.append(renderActivationsTable(data, { page, limit }));
};

const renderActivationsTable = (data, { page, limit }) => {
  const card = el("div", { class: "lic-table-card" });
  if (!data.rows || data.rows.length === 0) {
    card.append(el("div", { class: "lic-empty" }, "No activations match these filters."));
    return wrapWithPagination(card, data, { page, limit });
  }

  const table = el("table", { class: "lic-table" });
  table.append(
    el("thead", {},
      el("tr", {},
        el("th", {}, "License"),
        el("th", {}, "Machine"),
        el("th", {}, "Source"),
        el("th", {}, "Email"),
        el("th", {}, "Activated"),
        el("th", {}, "Shared"),
      ),
    ),
  );

  const tbody = el("tbody");
  for (const row of data.rows) {
    // Row is non-clickable on purpose — each cell pivots somewhere
    // different (license drawer vs. trials drawer), so a single row-level
    // onClick would be ambiguous. Cell-level <a> elements give the user
    // explicit control over which side they want to drill into.
    const tr = el("tr");

    const licenseLink = el("a", {
      class: "lic-pivot-link",
      href: `#/licenses?key=${encodeURIComponent(row.license_key)}`,
    }, row.license_key);

    const machineLink = el("a", {
      class: "lic-pivot-link",
      href: `#/trials?machine=${encodeURIComponent(row.machine_id)}`,
    }, row.machine_id);

    // Null-guard: if a future backend or fixture drift returns no
    // shared_count, render "—" instead of silently swallowing the row.
    const sharedBadge = typeof row.shared_count === "number" && row.shared_count >= 2
      ? el("span", { class: "lic-badge status-shared", title: `Activated on ${row.shared_count} different license keys` },
          `SHARED · ${row.shared_count}`)
      : el("span", { class: "lic-meta" }, "—");

    // Inner flex wrapper, NOT the <td> itself. Putting display:flex on a
    // <td> drops its `display: table-cell` behavior and the row separator
    // (`border-bottom` on the cell) stops rendering on the row baseline,
    // producing a stair-stepped seam between rows. Keep the <td> a real
    // cell; flex only the inner content.
    const licenseInner = el("div", { class: "act-license-cell" }, licenseLink);
    // REVOKED if the license has a revoked_at timestamp. ORPHAN if the
    // license_key has no row in LICENSE_DB.licenses AND it's not a
    // Gumroad-prefixed key (which is *expected* to be missing because
    // Gumroad licenses live in the website D1). The two are mutually
    // exclusive — a missing row can't carry a revoked_at — so we render
    // at most one badge.
    if (row.license_revoked_at) {
      licenseInner.append(el("span", { class: "lic-badge status-revoked" }, "REVOKED"));
    } else if (row.license_missing) {
      licenseInner.append(
        el("span", {
          class: "lic-badge status-revoked",
          title: "License row no longer exists in LICENSE_DB. Likely a stale activation; consider freeing the seat.",
        }, "ORPHAN"),
      );
    }
    tr.append(
      el("td", {}, licenseInner),
      el("td", {}, machineLink),
      el("td", {}, el("span", { class: `lic-badge src-${row.source}` }, row.source.toUpperCase())),
      el("td", {}, el("span", { class: "lic-email" }, truncateEmail(row.email, 28))),
      el("td", {}, el("span", { class: "lic-meta" }, fmtRelative(row.activated_at))),
      el("td", {}, sharedBadge),
    );
    tbody.append(tr);
  }
  table.append(tbody);
  card.append(table);
  return wrapWithPagination(card, data, { page, limit });
};
