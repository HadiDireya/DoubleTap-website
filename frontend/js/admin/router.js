// Hash router. Single entry point — every navigation runs through `route()`,
// which fires once on boot and again on every `hashchange`.
//
// Two responsibilities live here:
//
//   1. Drawer-only short-circuit. Opening a drawer mutates the hash
//      (?key=… / ?machine=… / ?u=… / ?id=…) which fires hashchange and
//      would otherwise re-render the whole list (incl. a fresh table
//      fetch). Each list page exposes `xyzFilterSig(params)` — when only
//      the open-drawer param changed, we just toggle the drawer and
//      return.
//
//   2. Cleanup. Navigating off a list page closes any open drawer for that
//      page and clears the cached filter sig (so a return visit does a
//      full re-render). Modals appended to <body> survive canvas
//      re-renders so we strip them explicitly when leaving the four pages
//      that use them.

import { el, clear } from "./lib/dom.js";
import { parseHash } from "./lib/url.js";
import { renderSidebar } from "./shell/sidebar.js";
import { signOut } from "./shell/auth.js";

import { renderDashboard } from "./pages/dashboard/index.js";
import { renderLicenses, licensesFilterSig } from "./pages/licenses/index.js";
import { closeLicenseDrawer, openLicenseDrawer } from "./pages/licenses/drawer.js";
import { renderCustomers, customersFilterSig } from "./pages/customers/index.js";
import { closeCustomerDrawer, openCustomerDrawer } from "./pages/customers/drawer.js";
import { renderTrials, trialsFilterSig } from "./pages/trials/index.js";
import { closeTrialDrawer, openTrialDrawer } from "./pages/trials/drawer.js";
import { renderActivations } from "./pages/activations/index.js";
import { renderAudit } from "./pages/audit/index.js";
import { renderFeedback, feedbackFilterSig } from "./pages/feedback/index.js";
import { closeFeedbackDrawer, openFeedbackDrawer } from "./pages/feedback/drawer.js";
import { renderSettings } from "./pages/settings/index.js";

const TITLES = {
  "/": "Dashboard",
  "/customers": "Customers",
  "/licenses": "Licenses",
  "/trials": "Trials",
  "/activations": "Activations",
  "/feedback": "Feedback",
  "/audit": "Audit log",
  "/settings": "Settings",
};

// Per-page cache of the last seen filter signature. Keys match the page
// id used inside the page-config block below. Drawer state lives in each
// page's drawer.js — only the filter sig (the input to the short-circuit)
// is centralised here.
const lastFilterSig = {
  licenses: null,
  customers: null,
  trials: null,
  feedback: null,
};

// Public hook for action paths that need to force a re-render after a
// destructive write — e.g. feedback delete-post drops a row from the table
// and the cached sig would otherwise short-circuit the re-render away.
export const clearLastFilterSig = (pageId) => {
  if (pageId in lastFilterSig) lastFilterSig[pageId] = null;
};

// Page configuration table. Adding a new list+drawer page = drop a row.
// `drawerParam` is the URL param the drawer's open key lives in;
// `openDrawer`/`closeDrawer` toggle that page's drawer; `filterSig` /
// `render` are the per-page exports defined above.
const PAGES = [
  { id: "licenses",  path: "/licenses",  drawerParam: "key",     openDrawer: openLicenseDrawer,  closeDrawer: closeLicenseDrawer,  filterSig: licensesFilterSig,  render: renderLicenses },
  { id: "trials",    path: "/trials",    drawerParam: "machine", openDrawer: openTrialDrawer,    closeDrawer: closeTrialDrawer,    filterSig: trialsFilterSig,    render: renderTrials },
  { id: "customers", path: "/customers", drawerParam: "u",       openDrawer: openCustomerDrawer, closeDrawer: closeCustomerDrawer, filterSig: customersFilterSig, render: renderCustomers },
  { id: "feedback",  path: "/feedback",  drawerParam: "id",      openDrawer: openFeedbackDrawer, closeDrawer: closeFeedbackDrawer, filterSig: feedbackFilterSig,  render: renderFeedback },
];

const renderComingSoon = (canvas, label) => {
  clear(canvas);
  canvas.append(
    el("div", { class: "admin-page-header" },
      el("div", {},
        el("h1", { class: "admin-page-title" }, label),
        el("p", { class: "admin-page-subtitle" }, "This section is part of the admin roadmap and isn’t built yet."),
      ),
    ),
    el("div", { class: "admin-empty" }, "Coming soon."),
  );
};

export const route = (canvas, topbar, sidebarMount, session) => {
  const { path, params } = parseHash();
  const title = TITLES[path] || "Dashboard";

  // Tear down any drawer / open modal left over from the prior route.
  // Modals are appended to <body>, so they survive canvas re-renders and
  // have to be cleaned up explicitly on navigation.
  for (const page of PAGES) {
    if (path !== page.path) page.closeDrawer();
  }
  const onAnyDrawerPage = PAGES.some((p) => p.path === path);
  if (!onAnyDrawerPage) {
    document.querySelectorAll(".lic-modal-backdrop").forEach((n) => n.remove());
  }
  // Drop cached filter sigs for any page we're not on.
  for (const page of PAGES) {
    if (path !== page.path) lastFilterSig[page.id] = null;
  }

  // Hot-path: opening or closing a drawer mutates the hash (?key=… etc.),
  // which fires hashchange and would otherwise re-run renderXyz on every
  // drawer click — including a fresh table fetch. If only the drawer
  // param changed (filter sig matches), just toggle the drawer; leave
  // the rendered list alone.
  for (const page of PAGES) {
    if (path !== page.path) continue;
    if (lastFilterSig[page.id] !== page.filterSig(params)) break;
    const openId = params.get(page.drawerParam);
    if (openId) page.openDrawer(openId);
    else page.closeDrawer();
    return;
  }

  // Refresh sidebar active state.
  clear(sidebarMount);
  const activeId = path === "/" ? "dashboard" : path.replace(/^\//, "");
  sidebarMount.append(renderSidebar(activeId));

  // Refresh top-bar title (email/sign-out are stable).
  clear(topbar);
  topbar.append(
    el("div", { class: "admin-topbar-title" }, title),
    el(
      "div",
      { class: "admin-topbar-right" },
      el("span", { class: "admin-topbar-email" }, session.email || ""),
      el("button", { class: "admin-topbar-signout", type: "button", onclick: signOut }, "Sign out"),
    ),
  );

  // Pages with drawers + filter sigs all flow through the same shape:
  // store the current sig, then call the renderer.
  for (const page of PAGES) {
    if (path === page.path) {
      lastFilterSig[page.id] = page.filterSig(params);
      page.render(canvas, { params });
      return;
    }
  }

  // Pages without drawers / sigs.
  if (path === "/") {
    const range = params.get("range") || "30d";
    renderDashboard(canvas, { range });
    return;
  }
  if (path === "/activations") {
    renderActivations(canvas, { params });
    return;
  }
  if (path === "/audit") {
    renderAudit(canvas, { params });
    return;
  }
  if (path === "/settings") {
    renderSettings(canvas);
    return;
  }
  renderComingSoon(canvas, title);
};
