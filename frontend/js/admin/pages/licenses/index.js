// Licenses route — list + filter toolbar, search, pagination. Drawer state
// lives in ./drawer.js; the route here just renders the table and wires
// `?key=…` to the drawer.
//
// Routing:
//   #/licenses                 → list (default filters)
//   #/licenses?source=lahza    → preset source filter
//   #/licenses?status=revoked  → preset status filter
//   #/licenses?q=alice         → preset search
//   #/licenses?key=LZ-…        → list + open detail drawer for that key
//
// We keep the "open key" in the hash query so the back button closes the
// drawer (no separate history entries — that'd double-back through filters
// the user didn't change).

import { el, clear, icon } from "../../lib/dom.js";
import { fmtRelative, truncateEmail } from "../../lib/format.js";
import { apiFetch } from "../../lib/api.js";
import { updateHashParams } from "../../lib/url.js";
import { wrapWithPagination } from "../../lib/pagination.js";
import { openLicenseDrawer, closeLicenseDrawer } from "./drawer.js";
import { openIssueCompDialog } from "./actions.js";

const SOURCE_LABELS = { all: "All", lahza: "Lahza", comp: "Comp", gumroad: "Gumroad" };
const STATUS_LABELS = { all: "Any status", active: "Active", revoked: "Revoked" };

const buildListQuery = (params) => {
  const out = new URLSearchParams();
  const q = params.get("q");
  if (q) out.set("q", q);
  const source = params.get("source");
  if (source && source !== "all") out.set("source", source);
  const status = params.get("status");
  if (status && status !== "all") out.set("status", status);
  const page = params.get("page");
  if (page) out.set("page", page);
  return out.toString();
};

// Pure signature of the list filters (NOT including the open drawer key).
// The router compares this between hash changes to decide whether the list
// needs a full re-render or only a drawer toggle.
export const licensesFilterSig = (params) =>
  [params.get("q") ?? "", params.get("source") ?? "", params.get("status") ?? "", params.get("page") ?? ""].join("|");

const renderLicensesHeader = (canvas) => {
  const header = el("div", { class: "admin-page-header" },
    el("div", {},
      el("h1", { class: "admin-page-title" }, "Licenses"),
      el("p", { class: "admin-page-subtitle" }, "Issue, revoke, and manage license keys across Lahza, Gumroad, and comps."),
    ),
  );
  canvas.append(header);
};

export const renderLicenses = async (canvas, { params }) => {
  // Preserve focus across re-renders so the user can keep typing in the
  // search box while the hash-driven re-fetch runs underneath.
  const prevSearch = canvas.querySelector?.(".lic-search input");
  const wasFocused = prevSearch && document.activeElement === prevSearch;
  const caret = wasFocused ? prevSearch.selectionStart : null;

  clear(canvas);
  renderLicensesHeader(canvas);

  const q = params.get("q") ?? "";
  const source = params.get("source") ?? "all";
  const status = params.get("status") ?? "all";
  const page = parseInt(params.get("page") ?? "1", 10) || 1;
  const limit = 50;

  // Toolbar — always rendered first (synchronously) so the search input
  // exists while the table fetch is in flight. Reduces perceived latency.
  const searchInput = el("input", {
    type: "search",
    placeholder: "Search by email, key, tx reference…",
    value: q,
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Search licenses",
  });
  // Debounced — every keystroke would otherwise re-fetch on every char.
  let debounce = null;
  searchInput.addEventListener("input", () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      updateHashParams((p) => {
        if (searchInput.value.trim()) p.set("q", searchInput.value.trim());
        else p.delete("q");
        p.delete("page"); // reset to page 1 on new query
      });
    }, 250);
  });

  const filters = el("div", { class: "lic-filters" });
  for (const [k, label] of Object.entries(SOURCE_LABELS)) {
    const cls = ["lic-chip"];
    if (k === source) cls.push("is-active");
    filters.append(
      el("button", {
        type: "button",
        class: cls.join(" "),
        onclick: () => updateHashParams((p) => {
          if (k === "all") p.delete("source");
          else p.set("source", k);
          p.delete("page");
        }),
      }, label),
    );
  }

  const statusFilters = el("div", { class: "lic-filters" });
  for (const [k, label] of Object.entries(STATUS_LABELS)) {
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

  const issueBtn = el("button", { class: "lic-toolbar-action", type: "button", onclick: openIssueCompDialog },
    icon("plus", 14), "Issue comp",
  );

  const toolbar = el("div", { class: "lic-toolbar" },
    el("div", { class: "lic-search" }, icon("search", 16), searchInput),
    filters,
    statusFilters,
    el("div", { class: "lic-toolbar-spacer" }),
    issueBtn,
  );
  canvas.append(toolbar);

  if (wasFocused) {
    searchInput.focus();
    if (caret != null) {
      try { searchInput.setSelectionRange(caret, caret); } catch (_) { /* type=search may not support this in all engines */ }
    }
  }

  const tableMount = el("div");
  canvas.append(tableMount);
  tableMount.append(el("div", { class: "admin-loading" }, "Loading licenses…"));

  let data;
  try {
    const qs = buildListQuery(params);
    data = await apiFetch(`/admin/licenses${qs ? `?${qs}` : ""}`);
  } catch (err) {
    clear(tableMount);
    tableMount.append(el("div", { class: "admin-error" }, `Couldn't load licenses: ${err.message || err}`));
    return;
  }

  clear(tableMount);
  tableMount.append(renderLicensesTable(data, { page, limit, q, source, status }));

  // Reflect URL state. ?key=… opens the detail drawer; absence closes any
  // drawer left over from prior navigation (e.g. Back from a detail view).
  const openKey = params.get("key");
  if (openKey) openLicenseDrawer(openKey);
  else closeLicenseDrawer();
};

const renderLicensesTable = (data, { page, limit }) => {
  const card = el("div", { class: "lic-table-card" });

  if (!data.rows || data.rows.length === 0) {
    card.append(el("div", { class: "lic-empty" }, "No licenses match these filters."));
    return wrapWithPagination(card, data, { page, limit });
  }

  const table = el("table", { class: "lic-table" });
  const thead = el("thead", {},
    el("tr", {},
      el("th", {}, "Key"),
      el("th", {}, "Email"),
      el("th", {}, "Source"),
      el("th", {}, "Status"),
      el("th", {}, "Seats"),
      el("th", {}, "Issued"),
    ),
  );
  table.append(thead);

  const tbody = el("tbody");
  for (const row of data.rows) {
    const tr = el("tr", {
      tabindex: "0",
      onclick: () => openLicenseDrawer(row.license_key),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLicenseDrawer(row.license_key); } },
    });
    tr.append(
      el("td", {}, el("span", { class: "lic-key" }, row.license_key)),
      el("td", {}, el("span", { class: "lic-email" }, truncateEmail(row.email, 32))),
      el("td", {}, el("span", { class: `lic-badge src-${row.source}` }, row.source.toUpperCase())),
      el("td", {}, el("span", { class: `lic-badge status-${row.status}` }, row.status.toUpperCase())),
      el("td", {}, el("span", { class: "lic-meta" },
        row.max_uses == null
          ? `${row.active_activations}/—`
          : `${row.active_activations}/${row.max_uses}`,
      )),
      el("td", {}, el("span", { class: "lic-meta" }, fmtRelative(row.issued_at))),
    );
    tbody.append(tr);
  }
  table.append(tbody);
  card.append(table);

  return wrapWithPagination(card, data, { page, limit });
};
