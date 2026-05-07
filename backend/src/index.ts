import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { createAuth } from "./auth";
import { buildOrigins } from "./lib/origins";
import admin from "./routes/admin";
import feedback from "./routes/feedback";
import gumroad from "./routes/gumroad";
import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

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
