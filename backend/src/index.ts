import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { createAuth } from "./auth";
import { buildOrigins } from "./lib/origins";
import admin from "./routes/admin";
import feedback from "./routes/feedback";
import gumroad from "./routes/gumroad";
import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

// Baseline security headers on every API response. The four overrides
// below are tuned for an API on api.doubletap-app.com:
//   - HSTS: 1 year + includeSubDomains + preload (matches the website's
//     _headers; default is 180 days without preload).
//   - XFO=DENY: API never serves framable HTML.
//   - Referrer-Policy=strict-origin-when-cross-origin: default is the
//     stricter `no-referrer`, but stripping the Origin makes some auth
//     callbacks trickier to trace; this is the OWASP-recommended balance.
//   - CORP=same-site: the marketing site (doubletap-app.com) and this
//     API (api.doubletap-app.com) share registered domain, so same-site
//     passes; the default `same-origin` would block fetch from the site.
// Hono's defaults additionally ship X-Content-Type-Options=nosniff,
// COOP=same-origin, Origin-Agent-Cluster=?1, X-DNS-Prefetch-Control=off,
// X-Download-Options=noopen, X-Permitted-Cross-Domain-Policies=none,
// X-XSS-Protection=0, and remove X-Powered-By. COOP=same-origin is safe
// here because Better Auth uses top-level OAuth redirects, not popups.
app.use(
  "*",
  secureHeaders({
    strictTransportSecurity: "max-age=31536000; includeSubDomains; preload",
    xFrameOptions: "DENY",
    referrerPolicy: "strict-origin-when-cross-origin",
    crossOriginResourcePolicy: "same-site",
  }),
);

app.use("*", async (c, next) => {
  const middleware = cors({ origin: buildOrigins(c.env), credentials: true });
  return middleware(c, next);
});

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});

app.get("/health", (c) => c.json({ ok: true }));

// Better Auth: /auth/sign-in/*, /auth/callback/*, /auth/sign-out, /auth/get-session, etc.
app.on(["GET", "POST"], "/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

app.route("/feedback", feedback);
app.route("/gumroad", gumroad);
app.route("/admin", admin);

export default app;
