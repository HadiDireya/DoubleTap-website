// DoubleTap admin — single-page app with hash routing.
//
// Boot:
//   1. Inline the icon sprite so <use href="#i-…"> works.
//   2. Hit /auth/get-session. If signed out → gate. If signed in but not
//      admin → 403 gate. If admin → render shell + dispatch route.
//
// Routing is plain `location.hash`. Each route is a render function that
// receives the canvas element and returns a cleanup callback (for any
// in-flight fetches or listeners) — keeps memory bounded across nav.
//
// All DOM is built via createElement / append (no innerHTML — CSP and
// CLAUDE.md both forbid it). The `el()` helper at the top handles
// attribute setting, event binding, and SVG namespace lookup.

const API_BASE =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:8787"
    : "https://api.doubletap-app.com";

const ADMIN_EMAIL = "hadidireya@gmail.com";
const SVG_NS = "http://www.w3.org/2000/svg";

// OAuth host allowlist matches the rest of the site (roadmap.js, feedback.js).
// Better Auth's /sign-in/social returns a `url` to redirect to; we refuse to
// navigate anywhere not on this list, so a tampered/spoofed response can't
// route the admin into a phishing page.
const OAUTH_HOSTS = new Set(["accounts.google.com", "appleid.apple.com"]);

// Local-only demo mode: when /admin/?demo=1 is loaded from localhost, the
// admin endpoints are answered from in-page fixtures instead of the API.
// Lets you click through the full signed-in UI without configuring OAuth
// + Better Auth secrets locally. Production never activates this — the
// hostname check makes the flag a no-op on doubletap-app.com.
const IS_DEMO =
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
  new URLSearchParams(window.location.search).has("demo");

// ── DOM helper ────────────────────────────────────────────────────────────

const el = (tag, props = {}, ...children) => {
  const isSvg = tag === "svg" || tag === "use" || tag === "path" || tag === "rect";
  const node = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") {
      node.setAttribute("class", v);
    } else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "href" && isSvg) {
      // SVGElement.setAttribute('href', …) works, but xlink:href is the
      // safe fallback for older renderers.
      node.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", v);
      node.setAttribute("href", v);
    } else {
      node.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(typeof child === "string" || typeof child === "number" ? String(child) : child);
  }
  return node;
};

const icon = (id, size = 18) =>
  el("svg", { class: "icon", width: size, height: size, "aria-hidden": "true", focusable: "false" },
    el("use", { href: `#i-${id}` }),
  );

const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
};

// ── Formatting ────────────────────────────────────────────────────────────

const fmtNum = (n) => {
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1000) return new Intl.NumberFormat("en-US").format(Math.round(n));
  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 10) / 10).toString();
};

const fmtPct = (frac) => {
  if (frac == null || Number.isNaN(frac)) return "—";
  return `${(frac * 100).toFixed(1).replace(/\.0$/, "")}%`;
};

const fmtDelta = (frac) => {
  if (frac == null || Number.isNaN(frac)) return "—";
  const pct = Math.round(frac * 100);
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : ""}${pct}%`;
};

const fmtRelative = (iso) => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const fmtDay = (yyyymmdd) => {
  const [y, m, d] = yyyymmdd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return yyyymmdd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const truncateEmail = (email, max = 28) => {
  if (!email) return "—";
  if (email.length <= max) return email;
  const [local, domain] = email.split("@");
  if (!domain) return email.slice(0, max - 1) + "…";
  return `${local.slice(0, max - domain.length - 2)}…@${domain}`;
};

// ── Network ───────────────────────────────────────────────────────────────

const apiFetch = async (path, opts = {}) => {
  if (IS_DEMO) {
    const fixture = demoFixture(path);
    if (fixture !== undefined) return fixture;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* empty body OK */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
};

// ── Demo fixtures (only reached when IS_DEMO) ────────────────────────────
// Returns undefined for paths that should fall through to the network so
// non-stubbed routes still surface real errors during development.
const demoFixture = (path) => {
  if (path === "/admin/me") {
    return { email: ADMIN_EMAIL, name: "Hadi (demo)" };
  }
  if (path.startsWith("/admin/licenses?") || path === "/admin/licenses") {
    const now = Date.now();
    const rows = [
      { source: "lahza", license_key: "LZ-AB12-CD34-EF56-GH78", email: "alice@example.com",
        max_uses: 1, tx_reference: "dt_abc123", issued_at: new Date(now - 30 * 60_000).toISOString(),
        revoked_at: null, active_activations: 1, status: "active" },
      { source: "lahza", license_key: "LZ-XY34-WV56-UV78-TS90", email: "charlie@example.com",
        max_uses: 2, tx_reference: "dt_def456", issued_at: new Date(now - 18 * 3600_000).toISOString(),
        revoked_at: null, active_activations: 2, status: "active" },
      { source: "comp", license_key: "LZ-COMP-9XYZ8-WV7TU", email: "press@example.com",
        max_uses: 1, tx_reference: "comp_aaa", issued_at: new Date(now - 4 * 86400_000).toISOString(),
        revoked_at: null, active_activations: 0, status: "active" },
      { source: "lahza", license_key: "LZ-DEAD-BEEF-CAFE-FOOD", email: "bob@example.com",
        max_uses: 5, tx_reference: "dt_ghi789", issued_at: new Date(now - 9 * 86400_000).toISOString(),
        revoked_at: new Date(now - 1 * 86400_000).toISOString(), active_activations: 1, status: "revoked" },
      { source: "gumroad", license_key: "ABCD1234-EFGH5678", email: "veteran@example.com",
        max_uses: null, tx_reference: "sale_xyz", issued_at: new Date(now - 12 * 86400_000).toISOString(),
        revoked_at: null, active_activations: 1, status: "active" },
    ];
    return {
      rows, page: 1, limit: 50, total: rows.length,
      counts: { lahza: 3, gumroad: 1 },
    };
  }
  if (path.startsWith("/admin/licenses/")) {
    const suffix = path.slice("/admin/licenses/".length).split("?")[0];
    // /admin/licenses/comp — issue-comp endpoint (POST)
    if (suffix === "comp") {
      return {
        ok: true,
        license_key: "LZ-COMP-DEM01-DEM02-DEM03",
        email: "demo@example.com",
        max_uses: 1,
        emailed: true,
      };
    }
    // /admin/licenses/<key>/<action…>  → action result. Detail endpoint
    // is the bare /admin/licenses/<key> (one segment after the prefix).
    if (suffix.includes("/")) {
      return { ok: true };
    }
    const key = decodeURIComponent(suffix);
    const now = Date.now();
    const isComp = key.startsWith("LZ-COMP-");
    const isGumroad = !key.startsWith("LZ-");
    return {
      source: isGumroad ? "gumroad" : isComp ? "comp" : "lahza",
      license_key: key,
      email: "alice@example.com",
      max_uses: isGumroad ? null : 2,
      tx_reference: isGumroad ? null : "dt_demo",
      product_id: isGumroad ? "abc" : undefined,
      sale_id: isGumroad ? "sale_xyz" : undefined,
      issued_at: new Date(now - 30 * 60_000).toISOString(),
      revoked_at: null,
      activations: [
        { id: 1, machine_id: "MAC-A1B2C3D4E5F6", activated_at: new Date(now - 10 * 60_000).toISOString() },
        { id: 2, machine_id: "MAC-Z9Y8X7W6V5U4", activated_at: new Date(now - 4 * 86400_000).toISOString() },
      ],
      audit: [
        { id: "1", actor_email: ADMIN_EMAIL, action: "license.issue_comp",
          details: JSON.stringify({ email: "alice@example.com", max_uses: 2 }),
          created_at: new Date(now - 30 * 60_000).toISOString() },
      ],
    };
  }
  if (path.startsWith("/admin/users/")) {
    const id = decodeURIComponent(path.slice("/admin/users/".length).split("?")[0]);
    const now = Date.now();
    return {
      id,
      name: "Alice Demo",
      email: "alice@example.com",
      email_verified: true,
      image: null,
      created_at: new Date(now - 90 * 86400_000).toISOString(),
      updated_at: new Date(now - 5 * 86400_000).toISOString(),
      licenses: {
        gumroad: [
          { license_key: "GR-OLD1234-EFGH5678", product_id: "abc", sale_id: "sale_old",
            issued_at: new Date(now - 60 * 86400_000).toISOString() },
        ],
        lahza: [
          { license_key: "LZ-AB12-CD34-EF56-GH78", email: "alice@example.com",
            max_uses: 2, tx_reference: "dt_demo", issued_at: new Date(now - 14 * 86400_000).toISOString(),
            revoked_at: null, active_activations: 1 },
        ],
      },
      feedback: {
        total: 3,
        recent: [
          { id: "p1", type: "feature", title: "Per-app trigger overrides", status: "suggested",
            created_at: new Date(now - 7 * 86400_000).toISOString() },
        ],
      },
      audit: [],
    };
  }
  if (path.startsWith("/admin/users")) {
    const now = Date.now();
    const rows = [
      { id: "u_alice", name: "Alice Demo", email: "alice@example.com", email_verified: true,
        image: null, created_at: new Date(now - 90 * 86400_000).toISOString(), gumroad_license_count: 1 },
      { id: "u_bob", name: "Bob Tester", email: "bob@example.com", email_verified: true,
        image: null, created_at: new Date(now - 30 * 86400_000).toISOString(), gumroad_license_count: 0 },
      { id: "u_charlie", name: "Charlie Recent", email: "charlie@example.com", email_verified: false,
        image: null, created_at: new Date(now - 2 * 86400_000).toISOString(), gumroad_license_count: 0 },
    ];
    return { rows, page: 1, limit: 50, total: rows.length };
  }
  if (path.startsWith("/admin/trials/")) {
    const suffix = path.slice("/admin/trials/".length).split("?")[0];
    // Action endpoints (PATCH /:id/extend, /:id/terminate) — return ok.
    if (suffix.includes("/")) return { ok: true, deadline: new Date().toISOString() };
    // Detail endpoint
    const id = decodeURIComponent(suffix);
    const now = Date.now();
    return {
      machine_id: id,
      started_at: new Date(now - 4 * 86400_000).toISOString(),
      deadline: new Date(now + 10 * 86400_000).toISOString(),
      status: "active",
      converted_license_key: null,
      converted_at: null,
      activations: [],
      audit: [],
      now: new Date(now).toISOString(),
    };
  }
  if (path.startsWith("/admin/trials")) {
    const now = Date.now();
    const rows = [
      { machine_id: "MAC-AAAA1111-BBBB2222-CCCC3333", started_at: new Date(now - 1 * 86400_000).toISOString(),
        deadline: new Date(now + 13 * 86400_000).toISOString(), converted_license_key: null, converted_at: null,
        status: "active" },
      { machine_id: "MAC-DEAD1111-BEEF2222-CAFE3333", started_at: new Date(now - 6 * 86400_000).toISOString(),
        deadline: new Date(now + 8 * 86400_000).toISOString(), converted_license_key: "LZ-AB12-CD34-EF56-GH78",
        converted_at: new Date(now - 5 * 86400_000).toISOString(), status: "active" },
      { machine_id: "MAC-OLD1234-EXPIRED-99887766", started_at: new Date(now - 22 * 86400_000).toISOString(),
        deadline: new Date(now - 8 * 86400_000).toISOString(), converted_license_key: null, converted_at: null,
        status: "expired" },
      { machine_id: "MAC-CONVERTED-77665544", started_at: new Date(now - 30 * 86400_000).toISOString(),
        deadline: new Date(now - 16 * 86400_000).toISOString(),
        converted_license_key: "LZ-XY34-WV56-UV78-TS90",
        converted_at: new Date(now - 18 * 86400_000).toISOString(), status: "expired" },
    ];
    return { rows, page: 1, limit: 50, total: rows.length, now: new Date(now).toISOString() };
  }
  if (path.startsWith("/admin/audit/facets")) {
    return {
      actions: [
        "license.revoke", "license.unrevoke", "license.issue_comp",
        "license.update_max_uses", "license.change_email", "license.resend_email",
        "activation.free", "trial.extend", "trial.terminate",
        "user.ban", "user.unban", "user.delete", "user.change_email",
      ],
      target_types: ["license", "trial", "user"],
      actors: [ADMIN_EMAIL],
    };
  }
  if (path.startsWith("/admin/audit")) {
    const now = Date.now();
    const rows = [
      { id: "a1", actor_email: ADMIN_EMAIL, action: "license.issue_comp",
        target_type: "license", target_id: "LZ-COMP-9XYZ8-WV7TU",
        details: JSON.stringify({ email: "press@example.com", max_uses: 1, note: "TechCrunch reviewer", emailed: true }),
        created_at: new Date(now - 30 * 60_000).toISOString() },
      { id: "a2", actor_email: ADMIN_EMAIL, action: "license.revoke",
        target_type: "license", target_id: "LZ-DEAD-BEEF-CAFE-FOOD",
        details: JSON.stringify({ reason: "chargeback received via Lahza" }),
        created_at: new Date(now - 4 * 3600_000).toISOString() },
      { id: "a3", actor_email: ADMIN_EMAIL, action: "license.change_email",
        target_type: "license", target_id: "LZ-AB12-CD34-EF56-GH78",
        details: JSON.stringify({ from: "old@example.com", to: "alice@example.com" }),
        created_at: new Date(now - 22 * 3600_000).toISOString() },
      { id: "a4", actor_email: ADMIN_EMAIL, action: "activation.free",
        target_type: "license", target_id: "LZ-AB12-CD34-EF56-GH78",
        details: JSON.stringify({ activation_id: 7, machine_id: "MAC-OLD-LAPTOP-A1B2", activated_at: new Date(now - 30 * 86400_000).toISOString() }),
        created_at: new Date(now - 25 * 3600_000).toISOString() },
      { id: "a5", actor_email: ADMIN_EMAIL, action: "license.update_max_uses",
        target_type: "license", target_id: "LZ-XY34-WV56-UV78-TS90",
        details: JSON.stringify({ from: 1, to: 2 }),
        created_at: new Date(now - 3 * 86400_000).toISOString() },
      { id: "a6", actor_email: ADMIN_EMAIL, action: "license.resend_email",
        target_type: "license", target_id: "LZ-AB12-CD34-EF56-GH78",
        details: JSON.stringify({ to: "alice@example.com" }),
        created_at: new Date(now - 6 * 86400_000).toISOString() },
    ];
    return { rows, page: 1, limit: 50, total: rows.length };
  }
  if (path.startsWith("/admin/dashboard")) {
    const days = (n) => {
      const out = [];
      const today = new Date();
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        out.push({
          date: d.toISOString().slice(0, 10),
          lahza: Math.max(0, Math.round(2 + Math.sin(i / 3) * 4)),
          comp: i % 7 === 0 ? 1 : 0,
        });
      }
      return out;
    };
    const now = Date.now();
    return {
      range: "30d",
      generatedAt: new Date(now).toISOString(),
      kpis: {
        activeLicenses: { total: 137, lahza: 89, gumroad: 48 },
        activeTrials: 23,
        issuedInPeriod: { total: 41, lahza: 32, gumroad: 9, delta: 0.18 },
        revokedInPeriod: { total: 3, delta: -0.4 },
      },
      bottomRow: {
        conversion: { started: 60, converted: 19, pct: 19 / 60 },
        users: { total: 412, new: 27 },
        utilisation: { activations: 178, avgPerLicense: 2.0 },
        trialsStarted: 60,
      },
      issuanceSeries: days(30),
      feed: [
        { kind: "license", at: new Date(now - 5 * 60_000).toISOString(),
          type: "license.issued", licenseKey: "LZ-AB12-CD34", email: "alice@example.com", source: "lahza" },
        { kind: "license", at: new Date(now - 45 * 60_000).toISOString(),
          type: "activation.added", licenseKey: "LZ-AB12-CD34", email: "alice@example.com",
          source: "lahza", detail: "MAC-A1B2C3D4E5" },
        { kind: "license", at: new Date(now - 3 * 3600_000).toISOString(),
          type: "license.revoked", licenseKey: "LZ-COMP-99XY", email: "bob@example.com", source: "comp" },
        { kind: "feedback", at: new Date(now - 6 * 3600_000).toISOString(),
          postId: "p1", title: "F-row triggers should support left/right modifiers", type: "feature" },
        { kind: "license", at: new Date(now - 18 * 3600_000).toISOString(),
          type: "license.issued", licenseKey: "LZ-XY34-WV56", email: "charlie@example.com", source: "lahza" },
        { kind: "license", at: new Date(now - 26 * 3600_000).toISOString(),
          type: "activation.added", licenseKey: "LZ-XY34-WV56", email: "charlie@example.com",
          source: "lahza", detail: "MAC-Z9Y8X7W6V5" },
      ],
    };
  }
  return undefined;
};

// ── Sprite loader ─────────────────────────────────────────────────────────

const loadSprite = async () => {
  const res = await fetch("/assets/admin-icons.svg", { cache: "force-cache" });
  if (!res.ok) return;
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg && svg.tagName.toLowerCase() === "svg") {
    document.body.prepend(svg);
  }
};

// ── Sign-in / sign-out ────────────────────────────────────────────────────

const safeOauthRedirect = (raw) => {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && OAUTH_HOSTS.has(u.host);
  } catch (_) {
    return false;
  }
};

const startSocial = async (provider) => {
  const callback = `${window.location.origin}/admin/`;
  const data = await apiFetch("/auth/sign-in/social", {
    method: "POST",
    body: JSON.stringify({ provider, callbackURL: callback }),
  });
  const target = data && typeof data.url === "string" ? data.url : null;
  if (!target || !safeOauthRedirect(target)) throw new Error("untrusted_redirect");
  window.location.assign(target);
};

const sendMagicLink = (email) =>
  apiFetch("/auth/sign-in/magic-link", {
    method: "POST",
    body: JSON.stringify({ email, callbackURL: `${window.location.origin}/admin/` }),
  });

const signOut = async () => {
  try {
    await apiFetch("/auth/sign-out", { method: "POST" });
  } catch (_) {
    // Even if sign-out fails server-side, clearing the cookie locally is
    // best-effort — the next /admin/me call will 401 and re-gate the user.
  }
  window.location.href = "/";
};

// ── Gates ─────────────────────────────────────────────────────────────────

const renderGate = (root, kind) => {
  clear(root);
  const wrap = el("div", { class: "admin-gate" });
  if (kind === "signin") {
    const status = el("p", { class: "admin-gate-status" });
    const onSocial = (provider) => async () => {
      status.textContent = `Redirecting to ${provider}…`;
      try {
        await startSocial(provider);
      } catch (err) {
        status.textContent = `Sign-in failed (${err.message || err}). Try magic link below.`;
      }
    };
    const onMagic = async (e) => {
      e.preventDefault();
      const input = wrap.querySelector("input[type=email]");
      const email = input ? input.value.trim() : "";
      if (!email) return;
      status.textContent = "Sending magic link…";
      try {
        await sendMagicLink(email);
        status.textContent = "Check your email for the sign-in link.";
      } catch (err) {
        status.textContent = `Couldn’t send link (${err.message || err}).`;
      }
    };
    wrap.append(
      el("div", { class: "admin-gate-title" }, "Sign in to continue"),
      el("p", { class: "admin-gate-message" },
        "This area is for the DoubleTap admin only. Sign in with the admin Google or Apple account."),
      el("div", { class: "admin-gate-buttons" },
        el("button", { class: "admin-gate-cta", type: "button", onclick: onSocial("google") }, "Sign in with Google"),
        el("button", { class: "admin-gate-cta", type: "button", onclick: onSocial("apple") }, "Sign in with Apple"),
      ),
      el("form", { class: "admin-gate-magic", onsubmit: onMagic },
        el("input", { type: "email", placeholder: "or email me a link…", required: true, autocomplete: "email" }),
        el("button", { class: "admin-gate-magic-cta", type: "submit" }, "Send"),
      ),
      status,
    );
  } else if (kind === "forbidden") {
    wrap.append(
      el("div", { class: "admin-gate-title" }, "Not authorised"),
      el("p", { class: "admin-gate-message" },
        "Your account is signed in but does not have admin access. Sign out and back in with the admin account."),
      el("button", { class: "admin-gate-cta", type: "button", onclick: signOut }, "Sign out"),
    );
  } else {
    wrap.append(
      el("div", { class: "admin-gate-title" }, "Couldn’t reach the API"),
      el("p", { class: "admin-gate-message" },
        "The admin API didn’t respond. Check the api.doubletap-app.com Worker is up, then refresh."),
      el("button", { class: "admin-gate-cta", type: "button", onclick: () => window.location.reload() }, "Retry"),
    );
  }
  root.append(wrap);
};

// ── Sidebar / topbar ──────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: "#/", id: "dashboard", icon: "dashboard", label: "Dashboard" },
  { href: "#/licenses", id: "licenses", icon: "key", label: "Licenses" },
  { href: "#/customers", id: "customers", icon: "users", label: "Customers" },
  { href: "#/trials", id: "trials", icon: "clock", label: "Trials" },
  { href: "#/activations", id: "activations", icon: "activity", label: "Activations", soon: true },
  { href: "#/feedback", id: "feedback", icon: "message", label: "Feedback", soon: true },
  { href: "#/audit", id: "audit", icon: "scroll", label: "Audit log" },
  { href: "#/settings", id: "settings", icon: "settings", label: "Settings", soon: true },
];

const renderSidebar = (activeId) => {
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

const renderTopbar = (title, sessionEmail) =>
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

// ── KPI card ──────────────────────────────────────────────────────────────

// `invertedDelta` flips colour semantics: for "good" metrics (issued, users)
// up = green; for "bad" metrics (revoked, refunds) up = red. Arrow direction
// always reflects the sign of the change — green/red is purely valence.
const renderKpiCard = ({ eyebrow, value, breakdown, delta, deltaSuffix, ghostIcon, span = 3, invertedDelta = false }) => {
  const card = el("div", { class: `admin-card span-${span}` },
    ghostIcon ? el("div", { class: "kpi-ghost" }, icon(ghostIcon, 64)) : null,
    el("div", { class: "kpi-eyebrow" }, eyebrow),
    el("div", { class: "kpi-value" }, value),
    breakdown ? el("div", { class: "kpi-breakdown" }, ...breakdown) : null,
  );
  if (delta != null && Number.isFinite(delta)) {
    const isPositiveValence = invertedDelta ? delta < 0 : delta > 0;
    const isNegativeValence = invertedDelta ? delta > 0 : delta < 0;
    const cls = isPositiveValence ? "is-up" : isNegativeValence ? "is-down" : "is-neutral";
    const arrow = delta > 0 ? "trending-up" : delta < 0 ? "trending-down" : "minus";
    const row = el("div", { class: "kpi-delta-row" },
      el("span", { class: `kpi-delta ${cls}` }, icon(arrow, 12), fmtDelta(delta)),
      deltaSuffix ? el("span", { class: "kpi-delta-suffix" }, deltaSuffix) : null,
    );
    card.append(row);
  }
  return card;
};

// ── Issuance chart (stacked SVG bars) ─────────────────────────────────────
// SVG instead of HTML divs because CSP `style-src 'self'` blocks inline
// `style="height:N%"` on DOM nodes. Geometry attributes on <rect> are not
// styles — they're SVG attributes and aren't gated by the CSP.

const VIEW_W = 100;
const VIEW_H = 100;

const renderChart = (series) => {
  const card = el("div", { class: "admin-card span-8" });
  card.append(
    el("div", { class: "chart-card-header" },
      el("div", { class: "chart-title" }, "License issuance"),
      el("div", { class: "chart-legend" },
        el("span", {}, el("span", { class: "chart-legend-swatch lahza" }), "Lahza"),
        el("span", {}, el("span", { class: "chart-legend-swatch comp" }), "Comp"),
      ),
    ),
  );

  const canvas = el("div", { class: "chart-canvas" });

  if (series.length === 0) {
    canvas.append(el("div", { class: "chart-empty" }, "No issuance in this period"));
    card.append(canvas);
    return card;
  }

  const max = Math.max(1, ...series.map((p) => (p.lahza ?? 0) + (p.comp ?? 0)));
  const n = series.length;
  const gap = 0.4;
  const cellW = VIEW_W / n;
  const barW = Math.max(0.5, cellW - gap);
  const radius = Math.min(0.8, barW / 4);

  const svg = el("svg", {
    class: "chart-svg",
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    preserveAspectRatio: "none",
    "aria-label": "License issuance over time",
  });

  series.forEach((point, i) => {
    const x = i * cellW + gap / 2;
    const lahza = point.lahza ?? 0;
    const comp = point.comp ?? 0;
    const total = lahza + comp;
    const totalH = (total / max) * VIEW_H;
    const compH = total > 0 ? ((comp / total) * totalH) : 0;
    const lahzaH = total > 0 ? ((lahza / total) * totalH) : 0;

    if (compH > 0) {
      svg.append(el("rect", {
        class: "comp",
        x, y: VIEW_H - totalH, width: barW, height: compH, rx: radius,
      }));
    }
    if (lahzaH > 0) {
      svg.append(el("rect", {
        class: "lahza",
        x, y: VIEW_H - lahzaH, width: barW, height: lahzaH,
        rx: compH > 0 ? 0 : radius,
      }));
    }
  });

  canvas.append(svg);
  card.append(canvas);

  const first = series[0];
  const last = series[series.length - 1];
  const middle = series[Math.floor(series.length / 2)];
  card.append(
    el("div", { class: "chart-axis" },
      el("span", {}, fmtDay(first.date)),
      el("span", {}, fmtDay(middle.date)),
      el("span", {}, fmtDay(last.date)),
    ),
  );
  return card;
};

// ── Activity feed ─────────────────────────────────────────────────────────

const renderFeed = (feed) => {
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

// ── Bottom-row stats ──────────────────────────────────────────────────────

const renderStat = ({ label, value, foot, span = 4 }) =>
  el("div", { class: `admin-card span-${span}` },
    el("div", { class: "stat-card-label" }, label),
    el("div", { class: "stat-card-value" }, value),
    foot ? el("div", { class: "stat-card-foot" }, foot) : null,
  );

// ── Range selector ────────────────────────────────────────────────────────

const RANGES = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
];

const renderRangeSelector = (current, onChange) => {
  const wrap = el("div", { class: "admin-range", role: "tablist", "aria-label": "Time range" });
  for (const r of RANGES) {
    const btn = el("button", {
      type: "button",
      class: r.id === current ? "is-active" : "",
      "aria-pressed": r.id === current ? "true" : "false",
      onclick: () => onChange(r.id),
    }, r.label);
    wrap.append(btn);
  }
  return wrap;
};

// ── Dashboard ─────────────────────────────────────────────────────────────

const renderDashboard = async (canvas, { range = "30d" } = {}) => {
  const loadingHeader = el("div", { class: "admin-page-header" },
    el("div", {},
      el("h1", { class: "admin-page-title" }, "Dashboard"),
      el("p", { class: "admin-page-subtitle" }, "Customer activity at a glance."),
    ),
    renderRangeSelector(range, (next) => {
      window.location.hash = next === "30d" ? "#/" : `#/?range=${next}`;
    }),
  );
  clear(canvas);
  canvas.append(loadingHeader, el("div", { class: "admin-loading" }, "Loading dashboard…"));

  let data;
  try {
    data = await apiFetch(`/admin/dashboard?range=${encodeURIComponent(range)}`);
  } catch (err) {
    clear(canvas);
    canvas.append(loadingHeader, el("div", { class: "admin-error" }, `Couldn’t load dashboard: ${err.message || err}`));
    return;
  }

  clear(canvas);
  canvas.append(loadingHeader);

  const bento = el("div", { class: "admin-bento" });

  const k = data.kpis;
  bento.append(
    renderKpiCard({
      eyebrow: "Active licenses",
      value: fmtNum(k.activeLicenses.total),
      breakdown: [
        el("span", {}, "Lahza ", el("strong", {}, fmtNum(k.activeLicenses.lahza))),
        el("span", {}, "Gumroad ", el("strong", {}, fmtNum(k.activeLicenses.gumroad))),
      ],
      ghostIcon: "key",
    }),
    renderKpiCard({
      eyebrow: "Active trials",
      value: fmtNum(k.activeTrials),
      ghostIcon: "clock",
    }),
    renderKpiCard({
      eyebrow: "Issued · this period",
      value: fmtNum(k.issuedInPeriod.total),
      breakdown: [
        el("span", {}, "Lahza ", el("strong", {}, fmtNum(k.issuedInPeriod.lahza))),
        el("span", {}, "Gumroad ", el("strong", {}, fmtNum(k.issuedInPeriod.gumroad))),
      ],
      delta: k.issuedInPeriod.delta,
      deltaSuffix: "vs prior period",
      ghostIcon: "trending-up",
    }),
    renderKpiCard({
      eyebrow: "Revoked · this period",
      value: fmtNum(k.revokedInPeriod.total),
      delta: k.revokedInPeriod.delta,
      deltaSuffix: "vs prior period",
      ghostIcon: "x-circle",
      invertedDelta: true,
    }),
  );

  bento.append(renderChart(data.issuanceSeries), renderFeed(data.feed));

  const b = data.bottomRow;
  bento.append(
    renderStat({
      label: "Trial → paid · conversion",
      value: fmtPct(b.conversion.pct),
      foot: `${fmtNum(b.conversion.converted)} of ${fmtNum(b.conversion.started)} trials in window`,
    }),
    renderStat({
      label: "Users · total",
      value: fmtNum(b.users.total),
      foot: `${fmtNum(b.users.new)} new in this period`,
    }),
    renderStat({
      label: "Avg activations · per active license",
      value: fmtNum(b.utilisation.avgPerLicense),
      foot: `${fmtNum(b.utilisation.activations)} activations across all licenses`,
    }),
  );

  canvas.append(bento);
};

// ── Toast (transient feedback for actions) ───────────────────────────────
// One global toast instance; subsequent show() calls reset its content + timer.

const toastEl = el("div", { class: "lic-toast", role: "status", "aria-live": "polite" });
let toastTimer = null;
const showToast = (message, kind = "info") => {
  if (!toastEl.isConnected) document.body.append(toastEl);
  clear(toastEl);
  toastEl.classList.toggle("is-error", kind === "error");
  toastEl.append(
    icon(kind === "error" ? "x-circle" : "check", 14),
    el("span", {}, message),
  );
  toastEl.classList.add("is-open");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-open"), 2400);
};

// ── Confirm modal (Promise-based) ─────────────────────────────────────────
// Returns true on confirm, false on cancel/backdrop. Used for destructive
// or significant actions (revoke, free-all-slots).

const confirmModal = ({ title, message, confirmLabel = "Confirm", danger = false }) =>
  new Promise((resolve) => {
    const backdrop = el("div", { class: "lic-modal-backdrop is-open" });
    let settled = false;
    const close = (v) => {
      if (settled) return;
      settled = true;
      backdrop.remove();
      resolve(v);
    };
    const modal = el("div", { class: "lic-modal", role: "dialog", "aria-modal": "true" });
    modal.append(
      el("div", { class: "lic-modal-title" }, title),
      el("p", { class: "lic-modal-message" }, message),
      el("div", { class: "lic-modal-actions" },
        el("button", { class: "lic-modal-cancel", type: "button", onclick: () => close(false) }, "Cancel"),
        el("button", {
          class: "lic-modal-submit" + (danger ? " is-danger" : ""),
          type: "button",
          onclick: () => close(true),
        }, confirmLabel),
      ),
    );
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(false); });
    backdrop.append(modal);
    document.body.append(backdrop);
    setTimeout(() => modal.querySelector("button.lic-modal-submit")?.focus(), 0);
  });

// ── Licenses list ─────────────────────────────────────────────────────────
//
// Routing:
//   #/licenses                 → list (default filters)
//   #/licenses?source=lahza    → preset source filter
//   #/licenses?status=revoked  → preset status filter
//   #/licenses?q=alice         → preset search
//   #/licenses?key=LZ-…        → list + open detail drawer for that key
//
// We keep the "open key" in the hash query so the back button closes the
// drawer (no separate history entries — that'd double-back through filters
// the user didn't change).

const SOURCE_LABELS = { all: "All", lahza: "Lahza", comp: "Comp", gumroad: "Gumroad" };
const STATUS_LABELS = { all: "Any status", active: "Active", revoked: "Revoked" };

const updateHashParams = (mutate) => {
  const { path, params } = parseHash();
  mutate(params);
  const qs = params.toString();
  window.location.hash = `#${path}${qs ? `?${qs}` : ""}`;
};

const buildListQuery = (params) => {
  const out = new URLSearchParams();
  const q = params.get("q");
  if (q) out.set("q", q);
  const source = params.get("source");
  if (source && source !== "all") out.set("source", source);
  const status = params.get("status");
  if (status && status !== "all") out.set("status", status);
  const page = params.get("page");
  if (page) out.set("page", page);
  return out.toString();
};

const fmtDateTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

const renderLicensesHeader = (canvas) => {
  const header = el("div", { class: "admin-page-header" },
    el("div", {},
      el("h1", { class: "admin-page-title" }, "Licenses"),
      el("p", { class: "admin-page-subtitle" }, "Issue, revoke, and manage license keys across Lahza, Gumroad, and comps."),
    ),
  );
  canvas.append(header);
};

const renderLicenses = async (canvas, { params }) => {
  // Preserve focus across re-renders so the user can keep typing in the
  // search box while the hash-driven re-fetch runs underneath.
  const prevSearch = canvas.querySelector?.(".lic-search input");
  const wasFocused = prevSearch && document.activeElement === prevSearch;
  const caret = wasFocused ? prevSearch.selectionStart : null;

  clear(canvas);
  renderLicensesHeader(canvas);

  const q = params.get("q") ?? "";
  const source = params.get("source") ?? "all";
  const status = params.get("status") ?? "all";
  const page = parseInt(params.get("page") ?? "1", 10) || 1;
  const limit = 50;

  // Toolbar — always rendered first (synchronously) so the search input
  // exists while the table fetch is in flight. Reduces perceived latency.
  const searchInput = el("input", {
    type: "search",
    placeholder: "Search by email, key, tx reference…",
    value: q,
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Search licenses",
  });
  // Debounced — every keystroke would otherwise re-fetch on every char.
  let debounce = null;
  searchInput.addEventListener("input", () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      updateHashParams((p) => {
        if (searchInput.value.trim()) p.set("q", searchInput.value.trim());
        else p.delete("q");
        p.delete("page"); // reset to page 1 on new query
      });
    }, 250);
  });

  const filters = el("div", { class: "lic-filters" });
  for (const [k, label] of Object.entries(SOURCE_LABELS)) {
    const cls = ["lic-chip"];
    if (k === source) cls.push("is-active");
    filters.append(
      el("button", {
        type: "button",
        class: cls.join(" "),
        onclick: () => updateHashParams((p) => {
          if (k === "all") p.delete("source");
          else p.set("source", k);
          p.delete("page");
        }),
      }, label),
    );
  }

  const statusFilters = el("div", { class: "lic-filters" });
  for (const [k, label] of Object.entries(STATUS_LABELS)) {
    const cls = ["lic-chip"];
    if (k === status) cls.push("is-active");
    statusFilters.append(
      el("button", {
        type: "button",
        class: cls.join(" "),
        onclick: () => updateHashParams((p) => {
          if (k === "all") p.delete("status");
          else p.set("status", k);
          p.delete("page");
        }),
      }, label),
    );
  }

  const issueBtn = el("button", { class: "lic-toolbar-action", type: "button", onclick: openIssueCompDialog },
    icon("plus", 14), "Issue comp",
  );

  const toolbar = el("div", { class: "lic-toolbar" },
    el("div", { class: "lic-search" }, icon("search", 16), searchInput),
    filters,
    statusFilters,
    el("div", { class: "lic-toolbar-spacer" }),
    issueBtn,
  );
  canvas.append(toolbar);

  if (wasFocused) {
    searchInput.focus();
    if (caret != null) {
      try { searchInput.setSelectionRange(caret, caret); } catch (_) { /* type=search may not support this in all engines */ }
    }
  }

  const tableMount = el("div");
  canvas.append(tableMount);
  tableMount.append(el("div", { class: "admin-loading" }, "Loading licenses…"));

  let data;
  try {
    const qs = buildListQuery(params);
    data = await apiFetch(`/admin/licenses${qs ? `?${qs}` : ""}`);
  } catch (err) {
    clear(tableMount);
    tableMount.append(el("div", { class: "admin-error" }, `Couldn't load licenses: ${err.message || err}`));
    return;
  }

  clear(tableMount);
  tableMount.append(renderLicensesTable(data, { page, limit, q, source, status }));

  // Reflect URL state. ?key=… opens the detail drawer; absence closes any
  // drawer left over from prior navigation (e.g. Back from a detail view).
  const openKey = params.get("key");
  if (openKey) openLicenseDrawer(openKey);
  else if (drawerEl) closeDrawer();
};

const renderLicensesTable = (data, { page, limit }) => {
  const card = el("div", { class: "lic-table-card" });

  if (!data.rows || data.rows.length === 0) {
    card.append(el("div", { class: "lic-empty" }, "No licenses match these filters."));
    return wrapWithPagination(card, data, { page, limit });
  }

  const table = el("table", { class: "lic-table" });
  const thead = el("thead", {},
    el("tr", {},
      el("th", {}, "Key"),
      el("th", {}, "Email"),
      el("th", {}, "Source"),
      el("th", {}, "Status"),
      el("th", {}, "Seats"),
      el("th", {}, "Issued"),
    ),
  );
  table.append(thead);

  const tbody = el("tbody");
  for (const row of data.rows) {
    const tr = el("tr", {
      tabindex: "0",
      onclick: () => openLicenseDrawer(row.license_key),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLicenseDrawer(row.license_key); } },
    });
    tr.append(
      el("td", {}, el("span", { class: "lic-key" }, row.license_key)),
      el("td", {}, el("span", { class: "lic-email" }, truncateEmail(row.email, 32))),
      el("td", {}, el("span", { class: `lic-badge src-${row.source}` }, row.source.toUpperCase())),
      el("td", {}, el("span", { class: `lic-badge status-${row.status}` }, row.status.toUpperCase())),
      el("td", {}, el("span", { class: "lic-meta" },
        row.max_uses == null
          ? `${row.active_activations}/—`
          : `${row.active_activations}/${row.max_uses}`,
      )),
      el("td", {}, el("span", { class: "lic-meta" }, fmtRelative(row.issued_at))),
    );
    tbody.append(tr);
  }
  table.append(tbody);
  card.append(table);

  return wrapWithPagination(card, data, { page, limit });
};

const wrapWithPagination = (card, data, { page, limit }) => {
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

// ── License detail drawer ────────────────────────────────────────────────

let drawerEl = null;
let drawerBackdrop = null;
// Tracks the license_key currently being fetched into the drawer so that
// re-entrant calls (the hashchange from updateHashParams triggers route(),
// which fast-paths back into openLicenseDrawer with the same key) don't
// race a second apiFetch. The guard releases on completion or error.
let drawerLoadingKey = null;

const closeDrawer = () => {
  if (!drawerEl) return;
  drawerEl.classList.remove("is-open");
  drawerBackdrop?.classList.remove("is-open");
  // Clear ?key=… from the hash without reloading the list (preserve filters).
  const { path, params } = parseHash();
  if (params.has("key")) {
    params.delete("key");
    const qs = params.toString();
    history.replaceState(null, "", `#${path}${qs ? `?${qs}` : ""}`);
  }
  // Capture the nodes locally before the post-animation cleanup. Module-level
  // refs may be reassigned by a fresh openLicenseDrawer() call within the
  // 260 ms close window — without the local capture, the timeout would
  // remove the *new* drawer mid-animation and null the live refs.
  const elToRemove = drawerEl;
  const backdropToRemove = drawerBackdrop;
  drawerEl = null;
  drawerBackdrop = null;
  setTimeout(() => {
    elToRemove?.remove();
    backdropToRemove?.remove();
  }, 260);
};

const openLicenseDrawer = async (licenseKey) => {
  // Re-entrancy guard — see drawerLoadingKey declaration above.
  if (drawerLoadingKey === licenseKey) return;
  drawerLoadingKey = licenseKey;

  // Reflect open state in the URL so back-button closes it.
  updateHashParams((p) => p.set("key", licenseKey));

  if (!drawerEl) {
    drawerBackdrop = el("div", { class: "lic-drawer-backdrop", onclick: closeDrawer });
    drawerEl = el("aside", { class: "lic-drawer", role: "dialog", "aria-modal": "true" });
    document.body.append(drawerBackdrop, drawerEl);
    // Trigger transition next frame so the slide-in animation actually plays.
    requestAnimationFrame(() => {
      drawerBackdrop.classList.add("is-open");
      drawerEl.classList.add("is-open");
    });
  }

  // Skeleton while we fetch
  clear(drawerEl);
  drawerEl.append(
    el("div", { class: "lic-drawer-header" },
      el("div", { class: "lic-drawer-key" }, licenseKey),
      el("button", { class: "lic-drawer-close", type: "button", onclick: closeDrawer, "aria-label": "Close" },
        icon("x-circle", 18)),
    ),
    el("div", { class: "lic-drawer-body" },
      el("div", { class: "admin-loading" }, "Loading…"),
    ),
  );

  let data;
  try {
    data = await apiFetch(`/admin/licenses/${encodeURIComponent(licenseKey)}`);
  } catch (err) {
    clear(drawerEl);
    drawerEl.append(
      el("div", { class: "lic-drawer-header" },
        el("div", { class: "lic-drawer-key" }, licenseKey),
        el("button", { class: "lic-drawer-close", type: "button", onclick: closeDrawer, "aria-label": "Close" },
          icon("x-circle", 18)),
      ),
      el("div", { class: "lic-drawer-body" },
        el("div", { class: "admin-error" }, `Couldn't load license: ${err.message || err}`),
      ),
    );
    if (drawerLoadingKey === licenseKey) drawerLoadingKey = null;
    return;
  }

  paintDrawer(data);
  if (drawerLoadingKey === licenseKey) drawerLoadingKey = null;
};

const paintDrawer = (data) => {
  if (!drawerEl) return;
  clear(drawerEl);

  const isGumroad = data.source === "gumroad";
  const isRevoked = !!data.revoked_at;

  drawerEl.append(
    el("div", { class: "lic-drawer-header" },
      el("div", {},
        el("div", { class: "lic-drawer-key" },
          el("span", {}, data.license_key),
          el("button", {
            class: "lic-drawer-key-copy",
            type: "button",
            "aria-label": "Copy license key",
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(data.license_key);
                showToast("Key copied");
              } catch (_) { showToast("Couldn't copy", "error"); }
            },
          }, icon("copy", 14)),
        ),
        el("div", { class: "lic-drawer-badges" },
          el("span", { class: `lic-badge src-${data.source}` }, data.source.toUpperCase()),
          el("span", { class: `lic-badge status-${isRevoked ? "revoked" : "active"}` },
            isRevoked ? "REVOKED" : "ACTIVE"),
        ),
      ),
      el("button", { class: "lic-drawer-close", type: "button", onclick: closeDrawer, "aria-label": "Close" },
        icon("x-circle", 18)),
    ),
  );

  const body = el("div", { class: "lic-drawer-body" });

  // Meta grid
  const meta = el("dl", { class: "lic-meta-grid" });
  const addMeta = (label, value) => {
    if (value == null || value === "") return;
    meta.append(el("dt", {}, label), el("dd", {}, String(value)));
  };
  addMeta("Email", data.email ?? "—");
  if (data.max_uses != null) addMeta("Seats", `${data.activations.length} active / ${data.max_uses} max`);
  else addMeta("Activations", String(data.activations.length));
  addMeta("Issued", fmtDateTime(data.issued_at));
  if (isRevoked) addMeta("Revoked", fmtDateTime(data.revoked_at));
  if (data.tx_reference) addMeta("Tx reference", data.tx_reference);
  if (data.sale_id) addMeta("Gumroad sale", data.sale_id);
  if (data.product_id) addMeta("Gumroad product", data.product_id);

  body.append(
    el("div", {},
      el("div", { class: "lic-section-title" }, "Details"),
      meta,
    ),
  );

  // Actions
  const actions = el("div", { class: "lic-actions" });
  if (isGumroad) {
    actions.append(
      el("a", {
        class: "lic-action-btn",
        href: `https://app.gumroad.com/products`,
        target: "_blank",
        rel: "noopener noreferrer",
      }, icon("arrow-up-right", 12), "Manage in Gumroad"),
    );
  } else {
    if (isRevoked) {
      actions.append(
        el("button", {
          class: "lic-action-btn", type: "button",
          onclick: () => doAction(data.license_key, "unrevoke", { method: "POST" }, "License un-revoked"),
        }, icon("rotate-ccw", 12), "Un-revoke"),
      );
    } else {
      actions.append(
        el("button", {
          class: "lic-action-btn is-danger", type: "button",
          onclick: async () => {
            const ok = await confirmModal({
              title: "Revoke this license?",
              message: "The next /verify call from any of this license's machines will fail and DoubleTap will revert to trial state. This is reversible.",
              confirmLabel: "Revoke",
              danger: true,
            });
            if (ok) doAction(data.license_key, "revoke", { method: "POST" }, "License revoked");
          },
        }, icon("x-circle", 12), "Revoke"),
      );
    }
    actions.append(
      el("button", {
        class: "lic-action-btn", type: "button",
        onclick: () => editLicenseEmail(data),
      }, icon("edit", 12), "Change email"),
      el("button", {
        class: "lic-action-btn", type: "button",
        onclick: () => editLicenseSeats(data),
      }, icon("users", 12), "Set seats"),
      el("button", {
        class: "lic-action-btn", type: "button",
        onclick: () => doAction(data.license_key, "resend-email", { method: "POST" }, "Email resent"),
      }, icon("mail", 12), "Resend email"),
    );
  }
  if (data.activations.length > 0) {
    actions.append(
      el("button", {
        class: "lic-action-btn is-danger", type: "button",
        onclick: async () => {
          const ok = await confirmModal({
            title: "Free all seats?",
            message: `This drops all ${data.activations.length} machine(s) from this license. Each Mac will fall back to trial state on its next /verify.`,
            confirmLabel: "Free all",
            danger: true,
          });
          if (ok) doAction(data.license_key, "activations/free-all", { method: "POST" }, "All seats freed");
        },
      }, icon("trash", 12), "Free all seats"),
    );
  }

  body.append(
    el("div", {},
      el("div", { class: "lic-section-title" }, "Actions"),
      actions,
    ),
  );

  // Activations
  const activationsSection = el("div", {},
    el("div", { class: "lic-section-title" }, `Active machines (${data.activations.length})`),
  );
  if (data.activations.length === 0) {
    activationsSection.append(el("div", { class: "lic-empty" }, "No active machines."));
  } else {
    const list = el("div", { class: "lic-activations-list" });
    for (const a of data.activations) {
      list.append(
        el("div", { class: "lic-activation" },
          el("div", {},
            // Machine id pivots to the trial detail drawer for this
            // machine — `?machine=` opens the drawer directly so the admin
            // doesn't have to click through the list. The trials page
            // gracefully empty-states if no trial row exists.
            el("a", {
              class: "lic-pivot-link",
              href: `#/trials?machine=${encodeURIComponent(a.machine_id)}`,
            }, a.machine_id),
            el("div", { class: "lic-activation-meta" }, "Activated ", fmtDateTime(a.activated_at)),
          ),
          el("button", {
            class: "lic-activation-free", type: "button", "aria-label": "Free this seat",
            onclick: async () => {
              const ok = await confirmModal({
                title: "Free this seat?",
                message: `Drops machine ${a.machine_id.slice(0, 14)}… from this license. The Mac will fall back to trial state on its next /verify.`,
                confirmLabel: "Free seat",
                danger: true,
              });
              if (ok) doAction(data.license_key, `activations/${a.id}/free`, { method: "POST" }, "Seat freed");
            },
          }, icon("trash", 12)),
        ),
      );
    }
    activationsSection.append(list);
  }
  body.append(activationsSection);

  // Audit timeline. Link out to the global audit log page filtered to
  // this license so the user can see context from neighbouring rows
  // (e.g. "what else happened the day this was revoked").
  const auditSection = el("div", {},
    el("div", { class: "lic-section-title" },
      "Audit timeline",
      " · ",
      el("a", {
        class: "audit-target-link",
        href: `#/audit?target_type=license&target_id=${encodeURIComponent(data.license_key)}`,
      }, "view in log"),
    ),
  );
  if (!data.audit || data.audit.length === 0) {
    auditSection.append(el("div", { class: "lic-empty" }, "No admin actions recorded yet."));
  } else {
    const list = el("div", { class: "lic-audit-list" });
    for (const e of data.audit) list.append(renderAuditItem(e));
    auditSection.append(list);
  }
  body.append(auditSection);

  drawerEl.append(body);
};

const renderAuditItem = (e) => {
  const item = el("div", { class: "lic-audit-item" });
  let detailsLine = "";
  if (e.details) {
    try {
      const d = JSON.parse(e.details);
      detailsLine = Object.entries(d)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v).slice(0, 40)}`)
        .join(", ");
    } catch (_) { /* leave blank */ }
  }
  item.append(
    el("div", {}, el("strong", {}, e.action.replace(/^license\./, "").replace(/\./g, " ").replace(/_/g, " "))),
    detailsLine ? el("div", { class: "lic-audit-meta" }, detailsLine) : null,
    el("div", { class: "lic-audit-meta" },
      e.actor_email, " · ", fmtDateTime(e.created_at), " (", fmtRelative(e.created_at), ")",
    ),
  );
  return item;
};

// ── License action helper ─────────────────────────────────────────────────

const doAction = async (licenseKey, action, opts, successMessage) => {
  try {
    await apiFetch(`/admin/licenses/${encodeURIComponent(licenseKey)}/${action}`, opts);
    showToast(successMessage);
    // Re-fetch the detail so the drawer shows the new state.
    openLicenseDrawer(licenseKey);
  } catch (err) {
    showToast(err.message || "Action failed", "error");
  }
};

// Inline-edit helpers — open a modal with a single field, then PATCH.

const editLicenseEmail = (data) => {
  const input = el("input", { type: "email", value: data.email ?? "", required: true, autocomplete: "off" });
  const submit = el("button", { class: "lic-modal-submit", type: "submit" }, "Save");
  const cancel = el("button", { class: "lic-modal-cancel", type: "button" }, "Cancel");
  const form = el("form", { onsubmit: async (e) => {
    e.preventDefault();
    const next = input.value.trim().toLowerCase();
    if (!next || next === (data.email ?? "")) { close(); return; }
    try {
      await apiFetch(`/admin/licenses/${encodeURIComponent(data.license_key)}`, {
        method: "PATCH",
        body: JSON.stringify({ email: next }),
      });
      showToast("Email updated");
      close();
      openLicenseDrawer(data.license_key);
    } catch (err) {
      showToast(err.message || "Update failed", "error");
    }
  } });
  let backdrop;
  const close = () => backdrop?.remove();
  cancel.addEventListener("click", close);
  form.append(
    el("label", {}, "New email", input),
    el("div", { class: "lic-modal-actions" }, cancel, submit),
  );
  backdrop = el("div", { class: "lic-modal-backdrop is-open" },
    el("div", { class: "lic-modal" },
      el("div", { class: "lic-modal-title" }, "Change customer email"),
      form,
    ),
  );
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  setTimeout(() => input.focus(), 0);
};

const editLicenseSeats = (data) => {
  const input = el("input", { type: "number", value: String(data.max_uses ?? 1), min: "1", max: "100", required: true });
  const submit = el("button", { class: "lic-modal-submit", type: "submit" }, "Save");
  const cancel = el("button", { class: "lic-modal-cancel", type: "button" }, "Cancel");
  const form = el("form", { onsubmit: async (e) => {
    e.preventDefault();
    const next = parseInt(input.value, 10);
    if (!Number.isFinite(next) || next < 1 || next === data.max_uses) { close(); return; }
    try {
      await apiFetch(`/admin/licenses/${encodeURIComponent(data.license_key)}`, {
        method: "PATCH",
        body: JSON.stringify({ max_uses: next }),
      });
      showToast("Seats updated");
      close();
      openLicenseDrawer(data.license_key);
    } catch (err) {
      showToast(err.message || "Update failed", "error");
    }
  } });
  let backdrop;
  const close = () => backdrop?.remove();
  cancel.addEventListener("click", close);
  form.append(
    el("label", {}, "Max seats", input),
    el("p", { class: "lic-modal-message" },
      "Lowering this below current activations doesn't auto-free seats — use ", "Free all seats", " for that."),
    el("div", { class: "lic-modal-actions" }, cancel, submit),
  );
  backdrop = el("div", { class: "lic-modal-backdrop is-open" },
    el("div", { class: "lic-modal" },
      el("div", { class: "lic-modal-title" }, "Set max seats"),
      form,
    ),
  );
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  setTimeout(() => input.focus(), 0);
};

// ── Issue comp dialog ────────────────────────────────────────────────────

const openIssueCompDialog = () => {
  const emailInput = el("input", { type: "email", required: true, autocomplete: "off", placeholder: "customer@example.com" });
  const seatsInput = el("input", { type: "number", value: "1", min: "1", max: "100", required: true });
  const noteInput = el("textarea", { placeholder: "Optional internal note (visible in audit log only)" });
  const submit = el("button", { class: "lic-modal-submit", type: "submit" }, "Issue + email");
  const cancel = el("button", { class: "lic-modal-cancel", type: "button" }, "Cancel");
  let backdrop;
  const close = () => backdrop?.remove();
  cancel.addEventListener("click", close);
  const form = el("form", { onsubmit: async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    const seats = parseInt(seatsInput.value, 10);
    const note = noteInput.value.trim();
    if (!email || !Number.isFinite(seats) || seats < 1) return;
    submit.disabled = true;
    try {
      const res = await apiFetch("/admin/licenses/comp", {
        method: "POST",
        body: JSON.stringify({ email, max_uses: seats, note }),
      });
      showToast(`Issued ${res.license_key}`);
      close();
      // Reload the list so the new key appears, and open the drawer.
      // If the user had filtered to a non-comp source, swap to comp so the
      // new row is visible. Same for status=revoked (the comp is active).
      const { path, params } = parseHash();
      if (path === "/licenses") {
        const currentSource = params.get("source");
        if (currentSource && currentSource !== "all" && currentSource !== "comp") {
          params.set("source", "comp");
        }
        if (params.get("status") === "revoked") params.delete("status");
        params.delete("page");
        params.set("key", res.license_key);
        window.location.hash = `#${path}?${params.toString()}`;
      } else {
        window.location.hash = `#/licenses?source=comp&key=${encodeURIComponent(res.license_key)}`;
      }
    } catch (err) {
      submit.disabled = false;
      showToast(err.message || "Couldn't issue comp", "error");
    }
  } });
  form.append(
    el("label", {}, "Customer email", emailInput),
    el("label", {}, "Seats (max activations)", seatsInput),
    el("label", {}, "Internal note", noteInput),
    el("div", { class: "lic-modal-actions" }, cancel, submit),
  );
  backdrop = el("div", { class: "lic-modal-backdrop is-open" },
    el("div", { class: "lic-modal" },
      el("div", { class: "lic-modal-title" }, "Issue comp license"),
      el("p", { class: "lic-modal-message" },
        "Mints an LZ-COMP- key, stores it in the licenses DB, and emails it via Resend. The action is recorded in the audit log."),
      form,
    ),
  );
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  setTimeout(() => emailInput.focus(), 0);
};

// ── Customers (users) page ────────────────────────────────────────────────
//
// Routing:
//   #/customers              → list (default)
//   #/customers?q=…          → search on name + email
//   #/customers?since=…      → joined on or after, ISO 8601
//   #/customers?until=…      → joined before (exclusive)
//   #/customers?u=<userId>   → list + open detail drawer
//
// v1 is read-only. The drawer shows linked Gumroad licenses (hard userId
// FK) and Lahza/comp licenses (soft email match — see backend
// listLicensesByEmail). Write actions (ban / delete / change-email) are
// deferred to a later PR: ban needs a `banned` column on `user` (no
// migration shipped yet); delete cascades sessions+gumroad_license+
// feedback but leaves Lahza/comp orphaned in LICENSE_DB; change-email
// needs to coordinate with Better Auth's `account` rows. None of these
// are urgent enough to justify the schema/coordination work today.

let customersDrawerEl = null;
let customersDrawerBackdrop = null;
let customersDrawerLoadingId = null;
let lastCustomersFilterSig = null;
const customersFilterSig = (params) =>
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

const renderCustomers = async (canvas, { params }) => {
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
  else if (customersDrawerEl) closeCustomerDrawer();
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

const closeCustomerDrawer = () => {
  if (!customersDrawerEl) return;
  customersDrawerEl.classList.remove("is-open");
  customersDrawerBackdrop?.classList.remove("is-open");
  const { path, params } = parseHash();
  if (params.has("u")) {
    params.delete("u");
    const qs = params.toString();
    history.replaceState(null, "", `#${path}${qs ? `?${qs}` : ""}`);
  }
  // Local capture so a fresh open within the close animation doesn't get
  // torn down here — see closeDrawer for the canonical note.
  const elToRemove = customersDrawerEl;
  const backdropToRemove = customersDrawerBackdrop;
  customersDrawerEl = null;
  customersDrawerBackdrop = null;
  setTimeout(() => {
    elToRemove?.remove();
    backdropToRemove?.remove();
  }, 260);
};

const openCustomerDrawer = async (userId) => {
  if (customersDrawerLoadingId === userId) return;
  customersDrawerLoadingId = userId;

  updateHashParams((p) => p.set("u", userId));

  if (!customersDrawerEl) {
    customersDrawerBackdrop = el("div", { class: "lic-drawer-backdrop", onclick: closeCustomerDrawer });
    customersDrawerEl = el("aside", { class: "lic-drawer", role: "dialog", "aria-modal": "true" });
    document.body.append(customersDrawerBackdrop, customersDrawerEl);
    requestAnimationFrame(() => {
      customersDrawerBackdrop.classList.add("is-open");
      customersDrawerEl.classList.add("is-open");
    });
  }

  clear(customersDrawerEl);
  customersDrawerEl.append(
    el("div", { class: "lic-drawer-header" },
      el("div", { class: "lic-drawer-key" }, userId),
      el("button", { class: "lic-drawer-close", type: "button", onclick: closeCustomerDrawer, "aria-label": "Close" },
        icon("x-circle", 18)),
    ),
    el("div", { class: "lic-drawer-body" },
      el("div", { class: "admin-loading" }, "Loading…"),
    ),
  );

  let data;
  try {
    data = await apiFetch(`/admin/users/${encodeURIComponent(userId)}`);
  } catch (err) {
    clear(customersDrawerEl);
    customersDrawerEl.append(
      el("div", { class: "lic-drawer-header" },
        el("div", { class: "lic-drawer-key" }, userId),
        el("button", { class: "lic-drawer-close", type: "button", onclick: closeCustomerDrawer, "aria-label": "Close" },
          icon("x-circle", 18)),
      ),
      el("div", { class: "lic-drawer-body" },
        el("div", { class: "admin-error" }, `Couldn't load customer: ${err.message || err}`),
      ),
    );
    if (customersDrawerLoadingId === userId) customersDrawerLoadingId = null;
    return;
  }

  paintCustomerDrawer(data);
  if (customersDrawerLoadingId === userId) customersDrawerLoadingId = null;
};

const paintCustomerDrawer = (data) => {
  if (!customersDrawerEl) return;
  clear(customersDrawerEl);

  customersDrawerEl.append(
    el("div", { class: "lic-drawer-header" },
      el("div", {},
        el("div", { class: "lic-drawer-key" },
          el("span", {}, data.name || data.email || data.id),
        ),
        el("div", { class: "lic-drawer-badges" },
          data.email_verified
            ? el("span", { class: "lic-badge status-active" }, "VERIFIED")
            : el("span", { class: "lic-badge status-expired" }, "PENDING"),
        ),
      ),
      el("button", { class: "lic-drawer-close", type: "button", onclick: closeCustomerDrawer, "aria-label": "Close" },
        icon("x-circle", 18)),
    ),
  );

  const body = el("div", { class: "lic-drawer-body" });

  const meta = el("dl", { class: "lic-meta-grid" });
  const addMeta = (label, value) => {
    if (value == null || value === "") return;
    meta.append(el("dt", {}, label), el("dd", {}, value));
  };
  addMeta("Email", data.email);
  addMeta("Name", data.name);
  addMeta("Joined", fmtDateTime(data.created_at));
  if (data.updated_at && data.updated_at !== data.created_at) {
    addMeta("Updated", fmtDateTime(data.updated_at));
  }
  addMeta("User id", data.id);
  body.append(
    el("div", {},
      el("div", { class: "lic-section-title" }, "Details"),
      meta,
    ),
  );

  // Linked licenses — Gumroad rows are joined hard via userId; Lahza/comp
  // are matched on email, so the section header makes the join basis
  // visible (a Lahza row showing here means email matches data.email).
  const gumroad = data.licenses?.gumroad ?? [];
  const lahza = data.licenses?.lahza ?? [];
  const totalLicenses = gumroad.length + lahza.length;
  const licensesSection = el("div", {},
    el("div", { class: "lic-section-title" }, `Linked licenses (${totalLicenses})`),
  );
  if (totalLicenses === 0) {
    licensesSection.append(el("div", { class: "lic-empty" }, "No licenses linked to this account."));
  } else {
    const list = el("div", { class: "lic-activations-list" });
    for (const r of gumroad) {
      list.append(renderLinkedLicenseRow({
        license_key: r.license_key,
        source: "gumroad",
        meta: `Issued ${fmtDateTime(r.issued_at)} · Sale ${r.sale_id || "—"}`,
        revoked: false,
      }));
    }
    for (const r of lahza) {
      const isComp = r.license_key.startsWith("LZ-COMP-");
      list.append(renderLinkedLicenseRow({
        license_key: r.license_key,
        source: isComp ? "comp" : "lahza",
        meta: `Issued ${fmtDateTime(r.issued_at)} · ${r.active_activations}/${r.max_uses ?? "—"} seats`,
        revoked: !!r.revoked_at,
      }));
    }
    licensesSection.append(list);
  }
  body.append(licensesSection);

  // Feedback
  const fb = data.feedback ?? { total: 0, recent: [] };
  const feedbackSection = el("div", {},
    el("div", { class: "lic-section-title" }, `Feedback (${fb.total})`),
  );
  if (fb.total === 0) {
    feedbackSection.append(el("div", { class: "lic-empty" }, "No feedback posts."));
  } else {
    const list = el("div", { class: "lic-activations-list" });
    for (const post of fb.recent) {
      list.append(
        el("div", { class: "lic-activation" },
          el("div", {},
            // Plain text title — no `lic-activation-machine` here; that
            // class is for monospaced machine-id-shaped strings, not
            // free-form post titles.
            el("div", { class: "feedback-post-title" }, post.title),
            el("div", { class: "lic-activation-meta" },
              post.type, " · ", post.status, " · ", fmtRelative(post.created_at)),
          ),
        ),
      );
    }
    feedbackSection.append(list);
    if (fb.total > fb.recent.length) {
      feedbackSection.append(
        el("div", { class: "lic-activation-meta" },
          `Showing ${fb.recent.length} of ${fb.total} — full feedback view coming in a later PR.`),
      );
    }
  }
  body.append(feedbackSection);

  // Audit timeline
  const auditSection = el("div", {},
    el("div", { class: "lic-section-title" },
      "Audit timeline",
      " · ",
      el("a", {
        class: "audit-target-link",
        href: `#/audit?target_type=user&target_id=${encodeURIComponent(data.id)}`,
      }, "view in log"),
    ),
  );
  if (!data.audit || data.audit.length === 0) {
    auditSection.append(el("div", { class: "lic-empty" }, "No admin actions recorded yet."));
  } else {
    const list = el("div", { class: "lic-audit-list" });
    for (const e of data.audit) list.append(renderAuditItem(e));
    auditSection.append(list);
  }
  body.append(auditSection);

  customersDrawerEl.append(body);
};

const renderLinkedLicenseRow = ({ license_key, source, meta, revoked }) =>
  el("div", { class: "lic-activation" },
    el("div", {},
      el("a", {
        class: "lic-pivot-link",
        href: `#/licenses?key=${encodeURIComponent(license_key)}`,
      }, license_key),
      el("div", { class: "lic-activation-meta" }, meta),
    ),
    el("span", { class: `lic-badge src-${source}` }, source.toUpperCase()),
    revoked ? el("span", { class: "lic-badge status-revoked" }, "REVOKED") : null,
  );

// ── Trials page ───────────────────────────────────────────────────────────
//
// Routing:
//   #/trials                       → list (default: all)
//   #/trials?status=active|expired → filter by deadline vs now
//   #/trials?since=…&until=…       → filter on started_at, ISO 8601
//   #/trials?q=<machine-id>        → substring match on machine_id (also
//                                    used as the deep-link target from the
//                                    licenses drawer "Active machines" list)
//   #/trials?machine=<id>          → list + open detail drawer
//
// Trial rows are not deletable from the UI on purpose: the trials table
// exists to bind a machine_id to "trial already used", and removing the
// row re-opens the "wipe Keychain → fresh 14 days" exploit that
// `0002_trials.sql` was added to close. Terminate sets deadline=now
// instead — the machine remains bound.

const TRIAL_STATUS_LABELS = { all: "Any status", active: "Active", expired: "Expired" };

// Days remaining (negative when expired). Used for the row hint and the
// drawer headline. Keeping the rounding consistent across both places lets
// the user reconcile what the drawer says with what they clicked.
const trialDaysLeft = (deadlineISO, nowISO) => {
  const deadline = new Date(deadlineISO).getTime();
  const now = new Date(nowISO).getTime();
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return 0;
  return Math.round((deadline - now) / 86_400_000);
};

const trialDeadlineLabel = (deadlineISO, nowISO) => {
  const days = trialDaysLeft(deadlineISO, nowISO);
  if (days >= 1) return `${days}d left`;
  if (days === 0) return "ends today";
  return `expired ${Math.abs(days)}d ago`;
};

const buildTrialsQuery = (params) => {
  const out = new URLSearchParams();
  for (const k of ["q", "status", "since", "until", "page"]) {
    const v = params.get(k);
    if (v && (k !== "status" || v !== "all")) out.set(k, v);
  }
  return out.toString();
};

let trialsDrawerEl = null;
let trialsDrawerBackdrop = null;
// Re-entrancy guard for openTrialDrawer — same rationale as drawerLoadingKey.
let trialsDrawerLoadingMachine = null;
let lastTrialsFilterSig = null;
const trialsFilterSig = (params) =>
  [params.get("q") ?? "", params.get("status") ?? "", params.get("since") ?? "",
   params.get("until") ?? "", params.get("page") ?? ""].join("|");

const renderTrials = async (canvas, { params }) => {
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
        el("h1", { class: "admin-page-title" }, "Trials"),
        el("p", { class: "admin-page-subtitle" },
          "Active and expired 14-day trials, keyed by machine_id. Extend or terminate from the drawer."),
      ),
    ),
  );

  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
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
    placeholder: "Search by machine_id…",
    value: q,
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Search trials by machine id",
  });
  let debounce = null;
  searchInput.addEventListener("input", () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => setParam("q", searchInput.value.trim()), 250);
  });

  const statusFilters = el("div", { class: "lic-filters" });
  for (const [k, label] of Object.entries(TRIAL_STATUS_LABELS)) {
    const cls = ["lic-chip"];
    if (k === status) cls.push("is-active");
    statusFilters.append(
      el("button", {
        type: "button",
        class: cls.join(" "),
        onclick: () => updateHashParams((p) => {
          if (k === "all") p.delete("status");
          else p.set("status", k);
          p.delete("page");
        }),
      }, label),
    );
  }

  const sinceInput = el("input", {
    type: "date", class: "audit-input", value: dateInputValueFromISO(since),
    "aria-label": "Started on or after",
    onchange: (e) => setParam("since", localMidnightISO(e.target.value)),
  });
  const untilInput = el("input", {
    type: "date", class: "audit-input", value: dateInputValueFromISO(until),
    "aria-label": "Started before (exclusive)",
    onchange: (e) => setParam("until", localMidnightISO(e.target.value)),
  });

  canvas.append(
    el("div", { class: "lic-toolbar" },
      el("div", { class: "lic-search" }, icon("search", 16), searchInput),
      statusFilters,
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
  tableMount.append(el("div", { class: "admin-loading" }, "Loading trials…"));

  let data;
  try {
    const qs = buildTrialsQuery(params);
    data = await apiFetch(`/admin/trials${qs ? `?${qs}` : ""}`);
  } catch (err) {
    clear(tableMount);
    tableMount.append(el("div", { class: "admin-error" }, `Couldn't load trials: ${err.message || err}`));
    return;
  }

  clear(tableMount);
  tableMount.append(renderTrialsTable(data, { page, limit }));

  const openMachine = params.get("machine");
  if (openMachine) openTrialDrawer(openMachine);
  else if (trialsDrawerEl) closeTrialDrawer();
};

const renderTrialsTable = (data, { page, limit }) => {
  const card = el("div", { class: "lic-table-card" });
  if (!data.rows || data.rows.length === 0) {
    card.append(el("div", { class: "lic-empty" }, "No trials match these filters."));
    return wrapWithPagination(card, data, { page, limit });
  }

  const nowISO = data.now || new Date().toISOString();
  const table = el("table", { class: "lic-table" });
  table.append(
    el("thead", {},
      el("tr", {},
        el("th", {}, "Machine"),
        el("th", {}, "Started"),
        el("th", {}, "Deadline"),
        el("th", {}, "Status"),
        el("th", {}, "Converted"),
      ),
    ),
  );

  const tbody = el("tbody");
  for (const row of data.rows) {
    const tr = el("tr", {
      tabindex: "0",
      onclick: () => openTrialDrawer(row.machine_id),
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTrialDrawer(row.machine_id); }
      },
    });
    const statusCell = el("span", { class: `lic-badge status-${row.status}` },
      row.status.toUpperCase());
    const convertedCell = row.converted_license_key
      ? el("a", {
          class: "audit-target-link",
          href: `#/licenses?key=${encodeURIComponent(row.converted_license_key)}`,
          onclick: (e) => e.stopPropagation(),
        }, row.converted_license_key)
      : el("span", { class: "lic-meta" }, "—");
    tr.append(
      el("td", {}, el("span", { class: "lic-key" }, row.machine_id)),
      el("td", {}, el("span", { class: "lic-meta" }, fmtRelative(row.started_at))),
      el("td", {}, el("span", { class: "lic-meta" }, trialDeadlineLabel(row.deadline, nowISO))),
      el("td", {}, statusCell),
      el("td", {}, convertedCell),
    );
    tbody.append(tr);
  }
  table.append(tbody);
  card.append(table);
  return wrapWithPagination(card, data, { page, limit });
};

const closeTrialDrawer = () => {
  if (!trialsDrawerEl) return;
  trialsDrawerEl.classList.remove("is-open");
  trialsDrawerBackdrop?.classList.remove("is-open");
  const { path, params } = parseHash();
  if (params.has("machine")) {
    params.delete("machine");
    const qs = params.toString();
    history.replaceState(null, "", `#${path}${qs ? `?${qs}` : ""}`);
  }
  // See the matching note in closeDrawer — local capture so a fresh open
  // within the 260 ms animation window doesn't get torn down here.
  const elToRemove = trialsDrawerEl;
  const backdropToRemove = trialsDrawerBackdrop;
  trialsDrawerEl = null;
  trialsDrawerBackdrop = null;
  setTimeout(() => {
    elToRemove?.remove();
    backdropToRemove?.remove();
  }, 260);
};

const openTrialDrawer = async (machineId) => {
  if (trialsDrawerLoadingMachine === machineId) return;
  trialsDrawerLoadingMachine = machineId;

  updateHashParams((p) => p.set("machine", machineId));

  if (!trialsDrawerEl) {
    trialsDrawerBackdrop = el("div", { class: "lic-drawer-backdrop", onclick: closeTrialDrawer });
    trialsDrawerEl = el("aside", { class: "lic-drawer", role: "dialog", "aria-modal": "true" });
    document.body.append(trialsDrawerBackdrop, trialsDrawerEl);
    requestAnimationFrame(() => {
      trialsDrawerBackdrop.classList.add("is-open");
      trialsDrawerEl.classList.add("is-open");
    });
  }

  clear(trialsDrawerEl);
  trialsDrawerEl.append(
    el("div", { class: "lic-drawer-header" },
      el("div", { class: "lic-drawer-key" }, machineId),
      el("button", { class: "lic-drawer-close", type: "button", onclick: closeTrialDrawer, "aria-label": "Close" },
        icon("x-circle", 18)),
    ),
    el("div", { class: "lic-drawer-body" },
      el("div", { class: "admin-loading" }, "Loading…"),
    ),
  );

  let data;
  try {
    data = await apiFetch(`/admin/trials/${encodeURIComponent(machineId)}`);
  } catch (err) {
    clear(trialsDrawerEl);
    trialsDrawerEl.append(
      el("div", { class: "lic-drawer-header" },
        el("div", { class: "lic-drawer-key" }, machineId),
        el("button", { class: "lic-drawer-close", type: "button", onclick: closeTrialDrawer, "aria-label": "Close" },
          icon("x-circle", 18)),
      ),
      el("div", { class: "lic-drawer-body" },
        el("div", { class: "admin-error" }, `Couldn't load trial: ${err.message || err}`),
      ),
    );
    if (trialsDrawerLoadingMachine === machineId) trialsDrawerLoadingMachine = null;
    return;
  }

  paintTrialDrawer(data);
  if (trialsDrawerLoadingMachine === machineId) trialsDrawerLoadingMachine = null;
};

const paintTrialDrawer = (data) => {
  if (!trialsDrawerEl) return;
  clear(trialsDrawerEl);

  const isActive = data.status === "active";
  const nowISO = data.now || new Date().toISOString();

  trialsDrawerEl.append(
    el("div", { class: "lic-drawer-header" },
      el("div", {},
        el("div", { class: "lic-drawer-key" },
          el("span", {}, data.machine_id),
          el("button", {
            class: "lic-drawer-key-copy",
            type: "button",
            "aria-label": "Copy machine id",
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(data.machine_id);
                showToast("Machine id copied");
              } catch (_) { showToast("Couldn't copy", "error"); }
            },
          }, icon("copy", 14)),
        ),
        el("div", { class: "lic-drawer-badges" },
          el("span", { class: `lic-badge status-${isActive ? "active" : "expired"}` },
            isActive ? "ACTIVE" : "EXPIRED"),
          data.converted_license_key
            ? el("span", { class: "lic-badge converted" }, "CONVERTED")
            : null,
        ),
      ),
      el("button", { class: "lic-drawer-close", type: "button", onclick: closeTrialDrawer, "aria-label": "Close" },
        icon("x-circle", 18)),
    ),
  );

  const body = el("div", { class: "lic-drawer-body" });

  // Meta grid
  const meta = el("dl", { class: "lic-meta-grid" });
  const addMeta = (label, value) => {
    if (value == null || value === "") return;
    meta.append(el("dt", {}, label), el("dd", {}, value));
  };
  addMeta("Started", fmtDateTime(data.started_at));
  addMeta("Deadline", `${fmtDateTime(data.deadline)} · ${trialDeadlineLabel(data.deadline, nowISO)}`);
  if (data.converted_license_key) {
    addMeta("Converted to",
      el("a", {
        class: "audit-target-link",
        href: `#/licenses?key=${encodeURIComponent(data.converted_license_key)}`,
      }, data.converted_license_key));
  }
  if (data.converted_at) addMeta("Converted on", fmtDateTime(data.converted_at));

  body.append(
    el("div", {},
      el("div", { class: "lic-section-title" }, "Details"),
      meta,
    ),
  );

  // Actions
  const actions = el("div", { class: "lic-actions" });
  actions.append(
    el("button", {
      class: "lic-action-btn", type: "button",
      onclick: () => extendTrialDialog(data),
    }, icon("plus", 12), "Extend deadline"),
  );
  if (isActive) {
    actions.append(
      el("button", {
        class: "lic-action-btn is-danger", type: "button",
        onclick: async () => {
          const ok = await confirmModal({
            title: "Terminate this trial?",
            message: "Sets the deadline to now. The machine will fall back to trialExpired on its next /verify. The trial row stays so a Keychain wipe can't earn a fresh 14 days.",
            confirmLabel: "Terminate",
            danger: true,
          });
          if (ok) doTrialAction(data.machine_id, "terminate", "Trial terminated");
        },
      }, icon("x-circle", 12), "Terminate now"),
    );
  }

  body.append(
    el("div", {},
      el("div", { class: "lic-section-title" }, "Actions"),
      actions,
    ),
  );

  // Activations on this machine_id (across any license).
  const activationsSection = el("div", {},
    el("div", { class: "lic-section-title" }, `Activations on this machine (${data.activations.length})`),
  );
  if (data.activations.length === 0) {
    activationsSection.append(el("div", { class: "lic-empty" }, "No activations on this machine."));
  } else {
    const list = el("div", { class: "lic-activations-list" });
    for (const a of data.activations) {
      list.append(
        el("div", { class: "lic-activation" },
          el("div", {},
            el("a", {
              class: "lic-pivot-link",
              href: `#/licenses?key=${encodeURIComponent(a.license_key)}`,
            }, a.license_key),
            el("div", { class: "lic-activation-meta" }, "Activated ", fmtDateTime(a.activated_at)),
          ),
        ),
      );
    }
    activationsSection.append(list);
  }
  body.append(activationsSection);

  // Audit timeline
  const auditSection = el("div", {},
    el("div", { class: "lic-section-title" },
      "Audit timeline",
      " · ",
      el("a", {
        class: "audit-target-link",
        href: `#/audit?target_type=trial&target_id=${encodeURIComponent(data.machine_id)}`,
      }, "view in log"),
    ),
  );
  if (!data.audit || data.audit.length === 0) {
    auditSection.append(el("div", { class: "lic-empty" }, "No admin actions recorded yet."));
  } else {
    const list = el("div", { class: "lic-audit-list" });
    for (const e of data.audit) list.append(renderAuditItem(e));
    auditSection.append(list);
  }
  body.append(auditSection);

  trialsDrawerEl.append(body);
};

const doTrialAction = async (machineId, action, successMessage, opts = {}) => {
  try {
    await apiFetch(`/admin/trials/${encodeURIComponent(machineId)}/${action}`, {
      method: "PATCH",
      ...opts,
    });
    showToast(successMessage);
    openTrialDrawer(machineId);
  } catch (err) {
    showToast(err.message || "Action failed", "error");
  }
};

const extendTrialDialog = (data) => {
  const isExpired = data.status === "expired";
  const input = el("input", { type: "number", value: "14", min: "1", max: "365", required: true });
  const submit = el("button", { class: "lic-modal-submit", type: "submit" }, "Extend");
  const cancel = el("button", { class: "lic-modal-cancel", type: "button" }, "Cancel");
  let backdrop;
  const close = () => backdrop?.remove();
  cancel.addEventListener("click", close);
  const form = el("form", { onsubmit: async (e) => {
    e.preventDefault();
    const days = parseInt(input.value, 10);
    // Mirror the server bounds (1-365) on the client so a fat-fingered
    // value gets a clear toast instead of a generic "invalid_days" 400.
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      showToast("Days must be between 1 and 365", "error");
      return;
    }
    submit.disabled = true;
    try {
      await apiFetch(`/admin/trials/${encodeURIComponent(data.machine_id)}/extend`, {
        method: "PATCH",
        body: JSON.stringify({ days }),
      });
      showToast(`Extended by ${days}d`);
      close();
      openTrialDrawer(data.machine_id);
    } catch (err) {
      submit.disabled = false;
      showToast(err.message || "Couldn't extend", "error");
    }
  } });
  // For active trials we anchor at the existing deadline ("+N days from
  // current deadline"); for expired trials the server anchors at now,
  // effectively reactivating the trial for N days. Surface that distinction
  // up-front so the admin doesn't expect a different behaviour.
  const helpText = isExpired
    ? "This trial is already expired. Extending will reactivate it for N days starting now."
    : "Pushes the existing deadline forward — not from now. So extending an already-extended trial adds N more days, rather than silently shortening it.";
  form.append(
    el("label", {}, "Add days", input),
    el("p", { class: "lic-modal-message" }, helpText),
    el("div", { class: "lic-modal-actions" }, cancel, submit),
  );
  backdrop = el("div", { class: "lic-modal-backdrop is-open" },
    el("div", { class: "lic-modal" },
      el("div", { class: "lic-modal-title" }, isExpired ? "Reactivate trial" : "Extend trial"),
      form,
    ),
  );
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  setTimeout(() => input.focus(), 0);
};

// ── Audit log page ────────────────────────────────────────────────────────
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
// Filters chain — every set param narrows the result. Facets endpoint
// populates the action / target_type dropdowns so the UI tracks new
// `AuditAction` enum values without manual sync.

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

// Date pickers (`<input type="date">`) speak YYYY-MM-DD. URL state needs
// a full ISO so the backend can filter inclusive of the user's local
// wall-clock day, not UTC midnight. Both helpers below use the user's
// local timezone — picking "2026-05-06" in Tokyo means 2026-05-06 00:00
// JST, which serialises to 2026-05-05T15:00:00.000Z; a Pacific user
// picking the same date gets 2026-05-06T07:00:00.000Z. This keeps the
// SINCE/UNTIL filter aligned with what the user sees in the picker.

const dateInputValueFromISO = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const localMidnightISO = (yyyymmdd) => {
  if (!yyyymmdd) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  if (!m) return "";
  const [, y, mo, d] = m;
  return new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10)).toISOString();
};

const buildAuditQuery = (params) => {
  const out = new URLSearchParams();
  for (const k of ["action", "target_type", "target_id", "actor_email", "since", "until", "q", "page"]) {
    const v = params.get(k);
    if (v) out.set(k, v);
  }
  return out.toString();
};

const renderAudit = async (canvas, { params }) => {
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

// ── Coming-soon placeholder ───────────────────────────────────────────────

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

// ── Router ────────────────────────────────────────────────────────────────

const parseHash = () => {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  return { path, params };
};

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

// Signature of the last licenses-list render (filters/page only, NOT the
// open drawer key). Used to skip a full re-render + table re-fetch when
// only `?key=…` changed — clicking a row, opening, closing, etc.
let lastLicensesFilterSig = null;
const licensesFilterSig = (params) =>
  [params.get("q") ?? "", params.get("source") ?? "", params.get("status") ?? "", params.get("page") ?? ""].join("|");

const route = (canvas, topbar, sidebarMount, session) => {
  const { path, params } = parseHash();
  const title = TITLES[path] || "Dashboard";

  // Tear down any drawer / open modal left over from the prior route.
  // Modals are appended to <body>, so they survive canvas re-renders and
  // have to be cleaned up explicitly on navigation.
  if (path !== "/licenses" && drawerEl) closeDrawer();
  if (path !== "/trials" && trialsDrawerEl) closeTrialDrawer();
  if (path !== "/customers" && customersDrawerEl) closeCustomerDrawer();
  if (path !== "/licenses" && path !== "/trials" && path !== "/customers") {
    document.querySelectorAll(".lic-modal-backdrop").forEach((n) => n.remove());
  }
  if (path !== "/licenses") lastLicensesFilterSig = null;
  if (path !== "/trials") lastTrialsFilterSig = null;
  if (path !== "/customers") lastCustomersFilterSig = null;

  // Hot-path: opening or closing the drawer mutates the hash (?key=…),
  // which fires hashchange and would otherwise re-run renderLicenses on
  // every drawer click — including a fresh table fetch. If only `key`
  // changed, just open or close the drawer; leave the rendered list alone.
  if (path === "/licenses" && lastLicensesFilterSig === licensesFilterSig(params)) {
    const openKey = params.get("key");
    if (openKey) openLicenseDrawer(openKey);
    else if (drawerEl) closeDrawer();
    return;
  }
  if (path === "/trials" && lastTrialsFilterSig === trialsFilterSig(params)) {
    const openMachine = params.get("machine");
    if (openMachine) openTrialDrawer(openMachine);
    else if (trialsDrawerEl) closeTrialDrawer();
    return;
  }
  if (path === "/customers" && lastCustomersFilterSig === customersFilterSig(params)) {
    const openId = params.get("u");
    if (openId) openCustomerDrawer(openId);
    else if (customersDrawerEl) closeCustomerDrawer();
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

  if (path === "/") {
    const range = params.get("range") || "30d";
    renderDashboard(canvas, { range });
    return;
  }
  if (path === "/licenses") {
    lastLicensesFilterSig = licensesFilterSig(params);
    renderLicenses(canvas, { params });
    return;
  }
  if (path === "/trials") {
    lastTrialsFilterSig = trialsFilterSig(params);
    renderTrials(canvas, { params });
    return;
  }
  if (path === "/customers") {
    lastCustomersFilterSig = customersFilterSig(params);
    renderCustomers(canvas, { params });
    return;
  }
  if (path === "/audit") {
    renderAudit(canvas, { params });
    return;
  }
  renderComingSoon(canvas, title);
};

// ── Boot ──────────────────────────────────────────────────────────────────

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

  // Guard against stale session bound to a non-admin email (defence-in-depth;
  // server already enforces this).
  if (me.email !== ADMIN_EMAIL) {
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
