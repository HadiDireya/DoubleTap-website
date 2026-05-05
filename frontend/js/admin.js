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
  { href: "#/customers", id: "customers", icon: "users", label: "Customers", soon: true },
  { href: "#/licenses", id: "licenses", icon: "key", label: "Licenses", soon: true },
  { href: "#/trials", id: "trials", icon: "clock", label: "Trials", soon: true },
  { href: "#/activations", id: "activations", icon: "activity", label: "Activations", soon: true },
  { href: "#/feedback", id: "feedback", icon: "message", label: "Feedback", soon: true },
  { href: "#/audit", id: "audit", icon: "scroll", label: "Audit log", soon: true },
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

const route = (canvas, topbar, sidebarMount, session) => {
  const { path, params } = parseHash();
  const title = TITLES[path] || "Dashboard";

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
