// Audit log route — paginated reader over the admin_audit_log table with
// filters (action, target_type, target_id substring, since/until dates,
// free-text q). Inline-expandable details row per event.
//
// Routing:
//   #/audit                         → all events
//   #/audit?action=license.revoke   → filter by action
//   #/audit?target_type=license     → filter by polymorphic target type
//   #/audit?target_id=LZ-…          → substring match on target_id
//   #/audit?since=2026-05-01        → date range, ISO 8601 (until is exclusive)
//   #/audit?q=…                     → free-text across target_id/action/details
//   #/audit?expand=<row-id>         → keeps the expanded-details panel open
//
// No drawer — the inline expand row IS the detail view, so the action/click
// surface stays inside the same table.

import { el, clear, icon } from "../../lib/dom.js";
import { fmtDateTime, fmtRelative, truncateEmail } from "../../lib/format.js";
import { apiFetch } from "../../lib/api.js";
import { updateHashParams, dateInputValueFromISO, localMidnightISO } from "../../lib/url.js";
import { wrapWithPagination } from "../../lib/pagination.js";

// Per-render facets cache. Avoids one of the two round-trips on the
// drawer-style "open expanded row" interaction (which keeps the same
// filter set), and on rapid filter changes within a single page session.
let auditFacetsCache = null;

const fmtAuditAction = (raw) => raw.replace(/^[a-z_]+\./, "").replace(/[._]/g, " ");

const auditActionClass = (action) => {
  // Map any action into one of the small valence buckets in admin.css —
  // green (issue/unrevoke/unban), red (revoke/delete/ban/terminate),
  // blue (mutation: update/change/extend/regenerate, plus pin/unpin as
  // moderation state-change). Pure side-effects (resend_email) stay
  // neutral. Keep these patterns in sync with the AuditAction union in
  // backend/src/lib/audit.ts.
  if (/(\.issue|\.unrevoke|\.unban)/.test(action)) return "is-issue";
  if (/(\.revoke|\.delete|\.ban|\.terminate)/.test(action)) return "is-revoke";
  if (/(\.update|\.change|\.extend|\.regenerate|\.pin|\.unpin)/.test(action)) return "is-update";
  return "";
};

const buildAuditQuery = (params) => {
  const out = new URLSearchParams();
  for (const k of ["action", "target_type", "target_id", "actor_email", "since", "until", "q", "page"]) {
    const v = params.get(k);
    if (v) out.set(k, v);
  }
  return out.toString();
};

export const renderAudit = async (canvas, { params }) => {
  // Preserve focus on whichever toolbar input the user was typing in
  // across re-renders. Filter changes (date pickers, dropdowns) trigger
  // a hash update → re-render, which would otherwise drop the caret out
  // of the search / target-id inputs and break the typing flow.
  const focusedSelector = (() => {
    const a = document.activeElement;
    if (!a || !canvas.contains(a)) return null;
    if (a.matches?.(".lic-search input")) return ".lic-search input";
    if (a.matches?.(".audit-target-id-input")) return ".audit-target-id-input";
    return null;
  })();
  const caret = focusedSelector ? document.activeElement.selectionStart : null;

  clear(canvas);
  canvas.append(
    el("div", { class: "admin-page-header" },
      el("div", {},
        el("h1", { class: "admin-page-title" }, "Audit log"),
        el("p", { class: "admin-page-subtitle" }, "Every admin write across licenses, trials, users, and feedback."),
      ),
    ),
  );

  // Facets. Cache the first response so filter-toggle doesn't re-fetch.
  if (!auditFacetsCache) {
    try {
      auditFacetsCache = await apiFetch("/admin/audit/facets");
    } catch (_) {
      auditFacetsCache = { actions: [], target_types: [], actors: [] };
    }
  }
  const facets = auditFacetsCache;

  const actionVal = params.get("action") || "";
  const targetTypeVal = params.get("target_type") || "";
  const targetIdVal = params.get("target_id") || "";
  const sinceVal = params.get("since") || "";
  const untilVal = params.get("until") || "";
  const qVal = params.get("q") || "";
  const page = parseInt(params.get("page") || "1", 10) || 1;
  const limit = 50;

  const setParam = (key, value) =>
    updateHashParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
      p.delete("page");
      p.delete("expand");
    });

  const actionSel = el("select", {
    class: "audit-select", "aria-label": "Filter by action",
    onchange: (e) => setParam("action", e.target.value),
  });
  actionSel.append(el("option", { value: "" }, "Any action"));
  for (const a of facets.actions) {
    actionSel.append(el("option", { value: a, ...(a === actionVal ? { selected: true } : {}) }, a));
  }

  const targetSel = el("select", {
    class: "audit-select", "aria-label": "Filter by target type",
    onchange: (e) => setParam("target_type", e.target.value),
  });
  targetSel.append(el("option", { value: "" }, "Any target type"));
  for (const t of facets.target_types) {
    targetSel.append(el("option", { value: t, ...(t === targetTypeVal ? { selected: true } : {}) }, t));
  }

  const targetIdInput = el("input", {
    type: "search", class: "audit-input audit-target-id-input", placeholder: "Target id contains…",
    value: targetIdVal, autocomplete: "off", spellcheck: "false",
    "aria-label": "Filter by target id",
  });
  let targetDebounce = null;
  targetIdInput.addEventListener("input", () => {
    if (targetDebounce) clearTimeout(targetDebounce);
    targetDebounce = setTimeout(() => setParam("target_id", targetIdInput.value.trim()), 250);
  });

  const sinceInput = el("input", {
    type: "date", class: "audit-input", value: dateInputValueFromISO(sinceVal),
    "aria-label": "From date",
    onchange: (e) => setParam("since", localMidnightISO(e.target.value)),
  });
  const untilInput = el("input", {
    type: "date", class: "audit-input", value: dateInputValueFromISO(untilVal),
    "aria-label": "Until date (exclusive)",
    onchange: (e) => setParam("until", localMidnightISO(e.target.value)),
  });

  const searchInput = el("input", {
    // The hint reminds the user that q substring-matches the JSON details
    // blob too, so a query like "to" lights up every change_email row
    // (because `"to"` is a key in that event's details JSON, not just a
    // value). Knowing that up-front beats wondering why the result set
    // looks weird.
    type: "search", placeholder: "Search target id, action, or details JSON…",
    value: qVal, autocomplete: "off", spellcheck: "false",
    "aria-label": "Free-text search",
  });
  let searchDebounce = null;
  searchInput.addEventListener("input", () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => setParam("q", searchInput.value.trim()), 250);
  });

  const hasAnyFilter = !!(actionVal || targetTypeVal || targetIdVal || sinceVal || untilVal || qVal);
  const clearBtn = el("button", {
    class: "audit-clear", type: "button",
    onclick: () => updateHashParams((p) => {
      for (const k of ["action", "target_type", "target_id", "since", "until", "q", "page", "expand"]) p.delete(k);
    }),
  }, "Clear filters");

  canvas.append(
    el("div", { class: "audit-toolbar" },
      el("div", { class: "lic-search" }, icon("search", 16), searchInput),
      actionSel,
      targetSel,
      targetIdInput,
      sinceInput,
      untilInput,
      hasAnyFilter ? clearBtn : null,
    ),
  );

  if (focusedSelector) {
    const restored = canvas.querySelector(focusedSelector);
    if (restored) {
      restored.focus();
      if (caret != null) {
        try { restored.setSelectionRange(caret, caret); } catch (_) { /* type=search may not support setSelectionRange in some engines */ }
      }
    }
  }

  const tableMount = el("div");
  canvas.append(tableMount);
  tableMount.append(el("div", { class: "admin-loading" }, "Loading audit log…"));

  let data;
  try {
    const qs = buildAuditQuery(params);
    data = await apiFetch(`/admin/audit${qs ? `?${qs}` : ""}`);
  } catch (err) {
    clear(tableMount);
    tableMount.append(el("div", { class: "admin-error" }, `Couldn't load audit log: ${err.message || err}`));
    return;
  }

  clear(tableMount);
  const expand = params.get("expand") || "";
  tableMount.append(renderAuditTable(data, { page, limit, expand }));

  // When the page boots with ?expand=<id> in the URL — typically a deep
  // link from the licenses drawer or a previous session reload — scroll
  // the expanded row into view so the user lands on it directly. Without
  // this, an event below the fold gets its panel inserted but the
  // viewport stays at the top and the click feels broken.
  if (expand) {
    const target = tableMount.querySelector(`tr.audit-row-details[data-expand-id="${CSS.escape(expand)}"]`);
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "center", behavior: "smooth" }));
  }
};

const renderAuditTable = (data, { page, limit, expand }) => {
  const card = el("div", { class: "lic-table-card" });

  if (!data.rows || data.rows.length === 0) {
    card.append(el("div", { class: "lic-empty" }, "No audit events match these filters."));
    return wrapWithPagination(card, data, { page, limit });
  }

  const table = el("table", { class: "lic-table" });
  table.append(
    el("thead", {},
      el("tr", {},
        el("th", {}, "When"),
        el("th", {}, "Actor"),
        el("th", {}, "Action"),
        el("th", {}, "Target"),
      ),
    ),
  );

  const tbody = el("tbody");
  for (const row of data.rows) {
    const isExpanded = expand === row.id;
    const tr = el("tr", {
      tabindex: "0",
      onclick: () => updateHashParams((p) => {
        if (isExpanded) p.delete("expand");
        else p.set("expand", row.id);
      }),
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          updateHashParams((p) => {
            if (isExpanded) p.delete("expand");
            else p.set("expand", row.id);
          });
        }
      },
    });
    tr.append(
      el("td", {}, el("span", { class: "lic-meta" }, fmtRelative(row.created_at))),
      el("td", {}, el("span", { class: "lic-meta" }, truncateEmail(row.actor_email, 24))),
      el("td", {}, el("span", { class: `audit-action ${auditActionClass(row.action)}` }, fmtAuditAction(row.action))),
      el("td", {}, renderAuditTargetCell(row)),
    );
    tbody.append(tr);
    if (isExpanded) tbody.append(renderAuditDetailsRow(row));
  }
  table.append(tbody);
  card.append(table);
  return wrapWithPagination(card, data, { page, limit });
};

const renderAuditTargetCell = (row) => {
  const cell = el("span", { class: "audit-target" });
  cell.append(el("span", { class: "audit-target-type" }, row.target_type));
  // Cross-link to the resource page when one exists. Licenses pivot to
  // the licenses list with the drawer pre-opened.
  if (row.target_type === "license") {
    cell.append(
      el("a", {
        class: "audit-target-link",
        href: `#/licenses?key=${encodeURIComponent(row.target_id)}`,
        onclick: (e) => e.stopPropagation(),
      }, row.target_id),
    );
  } else {
    cell.append(el("span", {}, row.target_id));
  }
  return cell;
};

const renderAuditDetailsRow = (row) => {
  let details = null;
  if (row.details) {
    try { details = JSON.parse(row.details); } catch (_) { details = row.details; }
  }
  let body;
  if (details == null) {
    body = el("div", { class: "audit-details-empty" }, "No details recorded for this event.");
  } else {
    const text = typeof details === "string" ? details : JSON.stringify(details, null, 2);
    body = el("pre", { class: "audit-details-pre" }, text);
  }
  return el("tr", { class: "audit-row-details", "data-expand-id": row.id },
    el("td", { colspan: "4" },
      el("div", { class: "lic-section-title" },
        "Event ", row.id, " · ", fmtDateTime(row.created_at),
      ),
      body,
    ),
  );
};
