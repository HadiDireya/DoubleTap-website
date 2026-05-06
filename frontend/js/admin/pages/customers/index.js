// Customers route. v1 is read-only.
//
// Routing:
//   #/customers              → list (default)
//   #/customers?q=…          → search on name + email
//   #/customers?since=…      → joined on or after, ISO 8601
//   #/customers?until=…      → joined before (exclusive)
//   #/customers?u=<userId>   → list + open detail drawer
//
// The drawer shows linked Gumroad licenses (hard userId FK) and Lahza/comp
// licenses (soft email match — see backend listLicensesByEmail). Write
// actions (ban / delete / change-email) are deferred to a later PR: ban
// needs a `banned` column on `user`; delete cascades sessions+
// gumroad_license+feedback but leaves Lahza/comp orphaned in LICENSE_DB;
// change-email needs to coordinate with Better Auth's `account` rows.

import { el, clear, icon } from "../../lib/dom.js";
import { fmtRelative, truncateEmail } from "../../lib/format.js";
import { apiFetch } from "../../lib/api.js";
import { updateHashParams, dateInputValueFromISO, localMidnightISO } from "../../lib/url.js";
import { wrapWithPagination } from "../../lib/pagination.js";
import { openCustomerDrawer, closeCustomerDrawer } from "./drawer.js";

export const customersFilterSig = (params) =>
  [params.get("q") ?? "", params.get("since") ?? "",
   params.get("until") ?? "", params.get("page") ?? ""].join("|");

const buildCustomersQuery = (params) => {
  const out = new URLSearchParams();
  for (const k of ["q", "since", "until", "page"]) {
    const v = params.get(k);
    if (v) out.set(k, v);
  }
  return out.toString();
};

export const renderCustomers = async (canvas, { params }) => {
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
        el("h1", { class: "admin-page-title" }, "Customers"),
        el("p", { class: "admin-page-subtitle" },
          "Signed-up accounts and their linked licenses, trials, and feedback."),
      ),
    ),
  );

  const q = params.get("q") ?? "";
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
    placeholder: "Search by name or email…",
    value: q,
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Search customers",
  });
  let debounce = null;
  searchInput.addEventListener("input", () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => setParam("q", searchInput.value.trim()), 250);
  });

  const sinceInput = el("input", {
    type: "date", class: "audit-input", value: dateInputValueFromISO(since),
    "aria-label": "Joined on or after",
    onchange: (e) => setParam("since", localMidnightISO(e.target.value)),
  });
  const untilInput = el("input", {
    type: "date", class: "audit-input", value: dateInputValueFromISO(until),
    "aria-label": "Joined before (exclusive)",
    onchange: (e) => setParam("until", localMidnightISO(e.target.value)),
  });

  canvas.append(
    el("div", { class: "lic-toolbar" },
      el("div", { class: "lic-search" }, icon("search", 16), searchInput),
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
  tableMount.append(el("div", { class: "admin-loading" }, "Loading customers…"));

  let data;
  try {
    const qs = buildCustomersQuery(params);
    data = await apiFetch(`/admin/users${qs ? `?${qs}` : ""}`);
  } catch (err) {
    clear(tableMount);
    tableMount.append(el("div", { class: "admin-error" }, `Couldn't load customers: ${err.message || err}`));
    return;
  }

  clear(tableMount);
  tableMount.append(renderCustomersTable(data, { page, limit }));

  const openId = params.get("u");
  if (openId) openCustomerDrawer(openId);
  else closeCustomerDrawer();
};

const renderCustomersTable = (data, { page, limit }) => {
  const card = el("div", { class: "lic-table-card" });
  if (!data.rows || data.rows.length === 0) {
    card.append(el("div", { class: "lic-empty" }, "No customers match these filters."));
    return wrapWithPagination(card, data, { page, limit });
  }

  const table = el("table", { class: "lic-table" });
  table.append(
    el("thead", {},
      el("tr", {},
        el("th", {}, "Name"),
        el("th", {}, "Email"),
        el("th", {}, "Joined"),
        el("th", {}, "Verified"),
        el("th", {}, "Gumroad"),
      ),
    ),
  );

  const tbody = el("tbody");
  for (const row of data.rows) {
    const tr = el("tr", {
      tabindex: "0",
      onclick: () => openCustomerDrawer(row.id),
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCustomerDrawer(row.id); }
      },
    });
    tr.append(
      el("td", {}, el("span", { class: "lic-meta" }, row.name || "—")),
      el("td", {}, el("span", { class: "lic-email" }, truncateEmail(row.email, 36))),
      el("td", {}, el("span", { class: "lic-meta" }, fmtRelative(row.created_at))),
      el("td", {}, row.email_verified
        ? el("span", { class: "lic-badge status-active" }, "VERIFIED")
        : el("span", { class: "lic-badge status-expired" }, "PENDING")),
      el("td", {}, el("span", { class: "lic-meta" },
        row.gumroad_license_count > 0 ? String(row.gumroad_license_count) : "—")),
    );
    tbody.append(tr);
  }
  table.append(tbody);
  card.append(table);
  return wrapWithPagination(card, data, { page, limit });
};
