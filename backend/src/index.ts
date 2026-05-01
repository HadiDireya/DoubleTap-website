import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { createAuth } from "./auth";
import feedback from "./routes/feedback";
import gumroad from "./routes/gumroad";
import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

// Localhost origins are added only in dev (env.DEV === "true") so a malicious
// local server on a user's machine cannot make credentialed requests in prod.
const buildOrigins = (env: Env) => {
  const list = ["https://doubletap-app.com", "https://www.doubletap-app.com"];
  if (env.DEV === "true") {
    list.push("http://localhost:8000", "http://127.0.0.1:8000");
  }
  return list;
};

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

export default app;
