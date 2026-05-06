// Module-wide constants for the admin panel. Pure data — no side effects on
// import, no DOM access. Anything that needs to differ between dev and prod
// branches off the runtime hostname here so the rest of the codebase can
// import a stable surface.

export const API_BASE =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:8787"
    : "https://api.doubletap-app.com";

// Mirrors backend/src/lib/auth-helpers.ts → ADMIN_EMAILS. The SPA gate is
// defence-in-depth (server already 403s a non-admin); keeping it list-aware
// means a second admin doesn't get stuck on the gate even when the backend
// would let them in. ADMIN_EMAIL is retained as a derived alias for in-page
// demo fixtures (signed-in identity, audit actor) — it is not a configuration
// knob; edit the array.
export const ADMIN_EMAILS = ["hadidireya@gmail.com"];
export const ADMIN_EMAILS_LOWER = ADMIN_EMAILS.map((e) => e.toLowerCase());
export const ADMIN_EMAIL = ADMIN_EMAILS[0];

export const SVG_NS = "http://www.w3.org/2000/svg";

// OAuth host allowlist matches the rest of the site (roadmap.js, feedback.js).
// Better Auth's /sign-in/social returns a `url` to redirect to; we refuse to
// navigate anywhere not on this list, so a tampered/spoofed response can't
// route the admin into a phishing page.
export const OAUTH_HOSTS = new Set(["accounts.google.com", "appleid.apple.com"]);

// Local-only demo mode: when /admin/?demo=1 is loaded from localhost, the
// admin endpoints are answered from in-page fixtures instead of the API.
// Lets you click through the full signed-in UI without configuring OAuth +
// Better Auth secrets locally. Production never activates this — the
// hostname check makes the flag a no-op on doubletap-app.com.
export const IS_DEMO =
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
  new URLSearchParams(window.location.search).has("demo");
