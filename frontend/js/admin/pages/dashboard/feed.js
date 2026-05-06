// Recent-activity feed for the dashboard. Renders heterogeneous events
// (license issued / revoked / activation, plus feedback posts) into the
// same vertical list with kind-specific icons and inline detail.

import { el, icon } from "../../lib/dom.js";
import { fmtRelative, truncateEmail } from "../../lib/format.js";

export const renderFeed = (feed) => {
  const card = el("div", { class: "admin-card span-4" });
  card.append(
    el("div", { class: "feed-header" },
      el("div", { class: "feed-title" }, "Recent activity"),
    ),
  );
  const list = el("div", { class: "feed-list" });
  if (feed.length === 0) {
    list.append(el("div", { class: "admin-empty" }, "Nothing here yet"));
  }
  for (const item of feed) {
    list.append(renderFeedItem(item));
  }
  card.append(list);
  return card;
};

const renderFeedItem = (item) => {
  if (item.kind === "feedback") {
    return el(
      "div",
      { class: "feed-item" },
      el("div", { class: "feed-item-icon is-feedback" }, icon("message", 14)),
      el("div", { class: "feed-item-body" },
        el("div", { class: "feed-item-line" },
          "New ", item.type, " · ", el("span", { class: "feed-item-key" }, item.title),
        ),
        el("div", { class: "feed-item-meta" }, fmtRelative(item.at)),
      ),
    );
  }

  // license event
  let iconClass, iconName, line;
  const keyEl = el("span", { class: "feed-item-key" }, item.licenseKey);
  if (item.type === "license.issued") {
    iconClass = "is-issued";
    iconName = "plus";
    line = el("div", { class: "feed-item-line" },
      "Issued ", keyEl, " to ", truncateEmail(item.email),
    );
  } else if (item.type === "license.revoked") {
    iconClass = "is-revoked";
    iconName = "x-circle";
    line = el("div", { class: "feed-item-line" },
      "Revoked ", keyEl, " (", truncateEmail(item.email), ")",
    );
  } else {
    iconClass = "is-activation";
    iconName = "zap";
    line = el("div", { class: "feed-item-line" },
      "Activation on ", keyEl,
    );
  }
  return el(
    "div",
    { class: "feed-item" },
    el("div", { class: `feed-item-icon ${iconClass}` }, icon(iconName, 14)),
    el("div", { class: "feed-item-body" },
      line,
      el("div", { class: "feed-item-meta" },
        fmtRelative(item.at), " · ", item.source.toUpperCase(),
        item.detail ? ` · ${item.detail.slice(0, 12)}…` : "",
      ),
    ),
  );
};
