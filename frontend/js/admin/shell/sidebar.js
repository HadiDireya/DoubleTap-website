// Persistent left rail. NAV_ITEMS is the source of truth for what's in the
// admin — adding a new section means dropping a row here, plus a route
// branch in router.js. Items can carry `soon: true` to render the row as
// disabled with a "Soon" pill (no href, no hover).

import { el, icon } from "../lib/dom.js";

export const NAV_ITEMS = [
  { href: "#/", id: "dashboard", icon: "dashboard", label: "Dashboard" },
  { href: "#/licenses", id: "licenses", icon: "key", label: "Licenses" },
  { href: "#/customers", id: "customers", icon: "users", label: "Customers" },
  { href: "#/trials", id: "trials", icon: "clock", label: "Trials" },
  { href: "#/activations", id: "activations", icon: "activity", label: "Activations" },
  { href: "#/feedback", id: "feedback", icon: "message", label: "Feedback" },
  { href: "#/audit", id: "audit", icon: "scroll", label: "Audit log" },
  { href: "#/settings", id: "settings", icon: "settings", label: "Settings" },
];

export const renderSidebar = (activeId) => {
  const navChildren = NAV_ITEMS.map((item) => {
    const cls = ["admin-nav-item"];
    if (item.id === activeId) cls.push("is-active");
    if (item.soon) cls.push("is-disabled");
    const a = el(
      item.soon ? "div" : "a",
      item.soon ? { class: cls.join(" ") } : { class: cls.join(" "), href: item.href },
      icon(item.icon, 16),
      el("span", { class: "label" }, item.label),
      item.soon ? el("span", { class: "pill" }, "Soon") : null,
    );
    return a;
  });

  return el(
    "aside",
    { class: "admin-sidebar" },
    el(
      "div",
      { class: "admin-brand" },
      el("img", { class: "admin-brand-mark", src: "/assets/icons/logo.png", alt: "", width: 32, height: 32 }),
      el(
        "div",
        { class: "admin-brand-text" },
        el("strong", {}, "DoubleTap"),
        el("span", {}, "Admin"),
      ),
    ),
    el("nav", { class: "admin-nav", "aria-label": "Admin sections" },
      el("div", { class: "admin-nav-section-label" }, "Main"),
      ...navChildren,
    ),
    el("div", { class: "admin-sidebar-footer" }, "DoubleTap Admin · v0.1"),
  );
};
