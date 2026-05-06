// Trials route — list + filters. Drawer state lives in ./drawer.js, write
// actions in ./actions.js.
//
// Routing:
//   #/trials                       → list (default: all)
//   #/trials?status=active|expired → filter by deadline vs now
//   #/trials?since=…&until=…       → filter on started_at, ISO 8601
//   #/trials?q=<machine-id>        → substring match on machine_id (also
//                                    used as the deep-link target from the
//                                    licenses drawer "Active machines" list)
//   #/trials?machine=<id>          → list + open detail drawer

import { el, clear, icon } from "../../lib/dom.js";
import { fmtRelative } from "../../lib/format.js";
import { apiFetch } from "../../lib/api.js";
import { updateHashParams, dateInputValueFromISO, localMidnightISO } from "../../lib/url.js";
import { wrapWithPagination } from "../../lib/pagination.js";
import { openTrialDrawer, closeTrialDrawer, trialDeadlineLabel } from "./drawer.js";

const TRIAL_STATUS_LABELS = { all: "Any status", active: "Active", expired: "Expired" };

export const trialsFilterSig = (params) =>
  [params.get("q") ?? "", params.get("status") ?? "", params.get("since") ?? "",
   params.get("until") ?? "", params.get("page") ?? ""].join("|");

const buildTrialsQuery = (params) => {
  const out = new URLSearchParams();
  for (const k of ["q", "status", "since", "until", "page"]) {
    const v = params.get(k);
    if (v && (k !== "status" || v !== "all")) out.set(k, v);
  }
  return out.toString();
};

export const renderTrials = async (canvas, { params }) => {
  // Preserve focus across re-renders so typing in q / date pickers doesn't
  // bounce the caret.
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
        el("h1", { class: "admin-page-title" }, "Trials"),
        el("p", { class: "admin-page-subtitle" },
          "Active and expired 14-day trials, keyed by machine_id. Extend or terminate from the drawer."),
      ),
    ),
  );

  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const since = params.get("since") ?? "";
  const until = params.get("until") ?? "";
  const page = parseInt(params.get("page") ?? "1", 10) || 1;
  const limit = 50;

  const setParam = (key, value) => updateHashParams((p) => {
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete("page");
  });

  const searchInput = el("input", {
    type: "search",
    placeholder: "Search by machine_id…",
    value: q,
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Search trials by machine id",
  });
  let debounce = null;
  searchInput.addEventListener("input", () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => setParam("q", searchInput.value.trim()), 250);
  });

  const statusFilters = el("div", { class: "lic-filters" });
  for (const [k, label] of Object.entries(TRIAL_STATUS_LABELS)) {
    const cls = ["lic-chip"];
    if (k === status) cls.push("is-active");
    statusFilters.append(
      el("button", {
        type: "button",
        class: cls.join(" "),
        onclick: () => updateHashParams((p) => {
          if (k === "all") p.delete("status");
          else p.set("status", k);
          p.delete("page");
        }),
      }, label),
    );
  }

  const sinceInput = el("input", {
    type: "date", class: "audit-input", value: dateInputValueFromISO(since),
    "aria-label": "Started on or after",
    onchange: (e) => setParam("since", localMidnightISO(e.target.value)),
  });
  const untilInput = el("input", {
    type: "date", class: "audit-input", value: dateInputValueFromISO(until),
    "aria-label": "Started before (exclusive)",
    onchange: (e) => setParam("until", localMidnightISO(e.target.value)),
  });

  canvas.append(
    el("div", { class: "lic-toolbar" },
      el("div", { class: "lic-search" }, icon("search", 16), searchInput),
      statusFilters,
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

  const tableMount = el("div");
  canvas.append(tableMount);
  tableMount.append(el("div", { class: "admin-loading" }, "Loading trials…"));

  let data;
  try {
    const qs = buildTrialsQuery(params);
    data = await apiFetch(`/admin/trials${qs ? `?${qs}` : ""}`);
  } catch (err) {
    clear(tableMount);
    tableMount.append(el("div", { class: "admin-error" }, `Couldn't load trials: ${err.message || err}`));
    return;
  }

  clear(tableMount);
  tableMount.append(renderTrialsTable(data, { page, limit }));

  const openMachine = params.get("machine");
  if (openMachine) openTrialDrawer(openMachine);
  else closeTrialDrawer();
};

const renderTrialsTable = (data, { page, limit }) => {
  const card = el("div", { class: "lic-table-card" });
  if (!data.rows || data.rows.length === 0) {
    card.append(el("div", { class: "lic-empty" }, "No trials match these filters."));
    return wrapWithPagination(card, data, { page, limit });
  }

  const nowISO = data.now || new Date().toISOString();
  const table = el("table", { class: "lic-table" });
  table.append(
    el("thead", {},
      el("tr", {},
        el("th", {}, "Machine"),
        el("th", {}, "Started"),
        el("th", {}, "Deadline"),
        el("th", {}, "Status"),
        el("th", {}, "Converted"),
      ),
    ),
  );

  const tbody = el("tbody");
  for (const row of data.rows) {
    const tr = el("tr", {
      tabindex: "0",
      onclick: () => openTrialDrawer(row.machine_id),
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTrialDrawer(row.machine_id); }
      },
    });
    const statusCell = el("span", { class: `lic-badge status-${row.status}` },
      row.status.toUpperCase());
    const convertedCell = row.converted_license_key
      ? el("a", {
          class: "audit-target-link",
          href: `#/licenses?key=${encodeURIComponent(row.converted_license_key)}`,
          onclick: (e) => e.stopPropagation(),
        }, row.converted_license_key)
      : el("span", { class: "lic-meta" }, "—");
    tr.append(
      el("td", {}, el("span", { class: "lic-key" }, row.machine_id)),
      el("td", {}, el("span", { class: "lic-meta" }, fmtRelative(row.started_at))),
      el("td", {}, el("span", { class: "lic-meta" }, trialDeadlineLabel(row.deadline, nowISO))),
      el("td", {}, statusCell),
      el("td", {}, convertedCell),
    );
    tbody.append(tr);
  }
  table.append(tbody);
  card.append(table);
  return wrapWithPagination(card, data, { page, limit });
};
