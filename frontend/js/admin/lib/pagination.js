// Wraps a list card with a "X–Y of Z" footer + Prev/Next buttons. Returns
// the original card untouched when the result fits on one page so callers
// don't need to gate the call. Page state is stored in the hash via
// updateHashParams so back/forward works.

import { el, icon } from "./dom.js";
import { fmtNum } from "./format.js";
import { updateHashParams } from "./url.js";

export const wrapWithPagination = (card, data, { page, limit }) => {
  const wrap = el("div");
  wrap.append(card);
  const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / limit));
  if (totalPages <= 1) return wrap;
  const firstIndex = (page - 1) * limit + 1;
  const lastIndex = Math.min(page * limit, data.total ?? 0);
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  const goto = (p) => updateHashParams((params) => params.set("page", String(p)));
  wrap.append(
    el("div", { class: "lic-pagination" },
      el("span", {}, `${fmtNum(firstIndex)}–${fmtNum(lastIndex)} of ${fmtNum(data.total ?? 0)}`),
      el("div", { class: "lic-pagination-buttons" },
        el("button", {
          class: "lic-page-btn", type: "button", disabled: prevDisabled,
          onclick: () => !prevDisabled && goto(page - 1),
        }, icon("chevron-left", 12), "Prev"),
        el("button", {
          class: "lic-page-btn", type: "button", disabled: nextDisabled,
          onclick: () => !nextDisabled && goto(page + 1),
        }, "Next", icon("chevron-right", 12)),
      ),
    ),
  );
  return wrap;
};
