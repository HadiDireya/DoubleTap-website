// Sticky top bar: page title on the left, signed-in email + sign-out on the
// right. Mounted once in boot() and rewritten in place by router on every
// navigation (to swap the title).

import { el } from "../lib/dom.js";
import { signOut } from "./auth.js";

export const renderTopbar = (title, sessionEmail) =>
  el(
    "header",
    { class: "admin-topbar" },
    el("div", { class: "admin-topbar-title" }, title),
    el(
      "div",
      { class: "admin-topbar-right" },
      el("span", { class: "admin-topbar-email" }, sessionEmail || ""),
      el("button", { class: "admin-topbar-signout", type: "button", onclick: signOut }, "Sign out"),
    ),
  );
