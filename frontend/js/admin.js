// DoubleTap admin — single-page app entry point.
//
// Boot:
//   1. Inline the icon sprite so <use href="#i-…"> works.
//   2. Hit /auth/get-session via /admin/me. If signed out → gate. If
//      signed in but not admin → 403 gate. If admin → render shell +
//      dispatch route.
//
// Routing is plain `location.hash`. The router (./admin/router.js) owns
// dispatch — every page lives under ./admin/pages/<name>/. Shared
// primitives (formatting, fetch, modal, toast, pagination, audit-item)
// live under ./admin/lib/. Cross-cutting chrome (sidebar, topbar, gates,
// auth, sprite, KPI cards) lives under ./admin/shell/.
//
// All DOM is built via createElement / append (no innerHTML — CSP and
// CLAUDE.md both forbid it). The `el()` helper in ./admin/lib/dom.js
// handles attribute setting, event binding, and SVG namespace lookup.

import { ADMIN_EMAILS_LOWER } from "./admin/config.js";
import { el, clear } from "./admin/lib/dom.js";
import { apiFetch } from "./admin/lib/api.js";
import { loadSprite } from "./admin/shell/sprite.js";
import { renderGate } from "./admin/shell/gates.js";
import { route } from "./admin/router.js";

const boot = async () => {
  const root = document.getElementById("root");

  // Sprite first so any subsequent <use> resolves.
  await loadSprite().catch(() => {});

  // Auth check via /admin/me (one round-trip; tells us both signed-in
  // and admin-status in a single 401/403/200).
  let me;
  try {
    me = await apiFetch("/admin/me");
  } catch (err) {
    if (err.status === 401) {
      renderGate(root, "signin");
    } else if (err.status === 403) {
      renderGate(root, "forbidden");
    } else {
      renderGate(root, "network");
    }
    return;
  }

  // Guard against stale session bound to a non-admin email (defence-in-
  // depth; server already enforces this). Case-insensitive list match
  // mirrors the backend's requireAdmin so a second admin doesn't get
  // stuck client-side.
  if (!me.email || !ADMIN_EMAILS_LOWER.includes(me.email.toLowerCase())) {
    renderGate(root, "forbidden");
    return;
  }

  // Build the shell once; routes mutate the canvas/topbar in place.
  clear(root);
  const sidebarMount = el("div");
  const topbar = el("header", { class: "admin-topbar" });
  const canvas = el("main", { class: "admin-canvas" });
  const main = el("div", { class: "admin-main" }, topbar, canvas);
  const shell = el("div", { class: "admin-shell" }, sidebarMount, main);
  root.append(shell);

  const navigate = () => route(canvas, topbar, sidebarMount, me);
  window.addEventListener("hashchange", navigate);
  navigate();
};

boot();
