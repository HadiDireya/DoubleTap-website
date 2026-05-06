// Feedback route — list with type/status/since/until/q filters. Drawer
// state lives in ./drawer.js.
//
// Routing:
//   #/feedback                            → list (default: all)
//   #/feedback?q=…                        → substring on title/body
//   #/feedback?type=bug|feature|praise    → filter by post type
//   #/feedback?status=<status>            → filter by moderation status
//   #/feedback?since=…&until=…            → bounds on createdAt, ISO 8601
//   #/feedback?id=<post-id>               → list + open detail drawer
//
// Pin/unpin is deferred (see backend feedback.ts header). Ban-author also
// deferred (no `banned` column on user yet, per PR5 design notes). Status
// change + delete-post + delete-comment land here.

import { el, clear, icon } from "../../lib/dom.js";
import { fmtRelative, truncateEmail } from "../../lib/format.js";
import { apiFetch } from "../../lib/api.js";
import { updateHashParams, dateInputValueFromISO, localMidnightISO } from "../../lib/url.js";
import { wrapWithPagination } from "../../lib/pagination.js";
import { openFeedbackDrawer, closeFeedbackDrawer } from "./drawer.js";

export const FEEDBACK_TYPE_LABELS = { all: "All types", bug: "Bug", feature: "Feature", praise: "Praise" };
export const FEEDBACK_STATUS_LABELS = {
  all: "Any status",
  suggested: "Suggested",
  under_review: "Under review",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  declined: "Declined",
};

// Status valence map → status badge class. Mirrors how the trials/licenses
// pages map their state spaces onto the existing semantic palette so a
// scan across the admin reads consistently:
//   shipped    → status-active   (positive milestone, accent green)
//   in_progress→ status-shared   (in-flight signal, praise yellow)
//   planned    → converted       (locked-in commitment, praise yellow)
//   under_review→ status-expired (passive review state, muted gray)
//   suggested  → status-expired  (passive default, muted gray)
//   declined   → status-revoked  (admin closed it, bug red)
export const FEEDBACK_STATUS_BADGE = {
  suggested: "status-expired",
  under_review: "status-expired",
  planned: "converted",
  in_progress: "status-shared",
  shipped: "status-active",
  declined: "status-revoked",
};

export const feedbackFilterSig = (params) =>
  [params.get("q") ?? "", params.get("type") ?? "", params.get("status") ?? "",
   params.get("since") ?? "", params.get("until") ?? "", params.get("page") ?? ""].join("|");

const buildFeedbackQuery = (params) => {
  const out = new URLSearchParams();
  for (const k of ["q", "type", "status", "since", "until", "page"]) {
    const v = params.get(k);
    if (v && ((k !== "type" && k !== "status") || v !== "all")) out.set(k, v);
  }
  return out.toString();
};

export const renderFeedback = async (canvas, { params }) => {
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
        el("h1", { class: "admin-page-title" }, "Feedback"),
        el("p", { class: "admin-page-subtitle" },
          "Bugs, feature requests, and praise from signed-in users. Change status, delete posts/comments from the drawer."),
      ),
    ),
  );

  const q = params.get("q") ?? "";
  const typeVal = params.get("type") ?? "all";
  const statusVal = params.get("status") ?? "all";
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
    placeholder: "Search title or body…",
    value: q,
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Search feedback posts",
  });
  let debounce = null;
  searchInput.addEventListener("input", () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => setParam("q", searchInput.value.trim()), 250);
  });

  const typeFilters = el("div", { class: "lic-filters", role: "group", "aria-label": "Filter by type" });
  for (const [k, label] of Object.entries(FEEDBACK_TYPE_LABELS)) {
    const cls = ["lic-chip"];
    if (k === typeVal) cls.push("is-active");
    typeFilters.append(
      el("button", {
        type: "button",
        class: cls.join(" "),
        onclick: () => updateHashParams((p) => {
          if (k === "all") p.delete("type");
          else p.set("type", k);
          p.delete("page");
        }),
      }, label),
    );
  }

  const statusSel = el("select", {
    class: "audit-select", "aria-label": "Filter by status",
    onchange: (e) => setParam("status", e.target.value === "all" ? "" : e.target.value),
  });
  for (const [k, label] of Object.entries(FEEDBACK_STATUS_LABELS)) {
    statusSel.append(el("option", { value: k, ...(k === statusVal ? { selected: true } : {}) }, label));
  }

  const sinceInput = el("input", {
    type: "date", class: "audit-input", value: dateInputValueFromISO(since),
    "aria-label": "Posted on or after",
    onchange: (e) => setParam("since", localMidnightISO(e.target.value)),
  });
  const untilInput = el("input", {
    type: "date", class: "audit-input", value: dateInputValueFromISO(until),
    "aria-label": "Posted before (exclusive)",
    onchange: (e) => setParam("until", localMidnightISO(e.target.value)),
  });

  canvas.append(
    el("div", { class: "lic-toolbar" },
      el("div", { class: "lic-search" }, icon("search", 16), searchInput),
      typeFilters,
      statusSel,
      sinceInput,
      untilInput,
    ),
    el("div", { class: "lic-toolbar-help" },
      el("small", { class: "lic-toolbar-hint" },
        "End date is exclusive — pick tomorrow to include today."),
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
  tableMount.append(el("div", { class: "admin-loading" }, "Loading feedback…"));

  let data;
  try {
    const qs = buildFeedbackQuery(params);
    data = await apiFetch(`/admin/feedback${qs ? `?${qs}` : ""}`);
  } catch (err) {
    clear(tableMount);
    tableMount.append(el("div", { class: "admin-error" }, `Couldn't load feedback: ${err.message || err}`));
    return;
  }

  clear(tableMount);
  tableMount.append(renderFeedbackTable(data, { page, limit }));

  const openId = params.get("id");
  if (openId) openFeedbackDrawer(openId);
  else closeFeedbackDrawer();
};

const renderFeedbackTable = (data, { page, limit }) => {
  const card = el("div", { class: "lic-table-card" });
  if (!data.rows || data.rows.length === 0) {
    card.append(el("div", { class: "lic-empty" }, "No feedback posts match these filters."));
    return wrapWithPagination(card, data, { page, limit });
  }

  const table = el("table", { class: "lic-table" });
  table.append(
    el("thead", {},
      el("tr", {},
        el("th", {}, "Title"),
        el("th", {}, "Type"),
        el("th", {}, "Status"),
        el("th", {}, "Author"),
        el("th", {}, "Votes"),
        el("th", {}, "Comments"),
        el("th", {}, "Posted"),
      ),
    ),
  );

  const tbody = el("tbody");
  for (const row of data.rows) {
    const tr = el("tr", {
      tabindex: "0",
      onclick: () => openFeedbackDrawer(row.id),
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFeedbackDrawer(row.id); }
      },
    });
    const statusClass = FEEDBACK_STATUS_BADGE[row.status] || "status-expired";
    const statusBadge = el("span", { class: `lic-badge ${statusClass}` },
      (row.status || "").replace(/_/g, " ").toUpperCase());
    const typeBadge = el("span", { class: `lic-badge fb-type-${row.type}` },
      (row.type || "").toUpperCase());
    const authorCell = row.author
      ? el("a", {
          class: "lic-pivot-link",
          href: `#/customers?u=${encodeURIComponent(row.author.id)}`,
          onclick: (e) => e.stopPropagation(),
        }, truncateEmail(row.author.email || row.author.name || row.author.id, 28))
      : el("span", { class: "lic-meta" }, "—");
    tr.append(
      el("td", {}, el("div", { class: "feedback-post-title" }, row.title)),
      el("td", {}, typeBadge),
      el("td", {}, statusBadge),
      el("td", {}, authorCell),
      el("td", {}, el("span", { class: "lic-meta" }, String(row.vote_count ?? 0))),
      el("td", {}, el("span", { class: "lic-meta" }, String(row.comment_count ?? 0))),
      el("td", {}, el("span", { class: "lic-meta" }, fmtRelative(row.created_at))),
    );
    tbody.append(tr);
  }
  table.append(tbody);
  card.append(table);
  return wrapWithPagination(card, data, { page, limit });
};
