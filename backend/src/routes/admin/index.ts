import { Hono } from "hono";
import { requireAdmin } from "../../lib/auth-helpers";
import dashboard from "./dashboard";
import type { Env } from "../../env";

type Session = Awaited<ReturnType<typeof requireAdmin>>;
export type AdminVariables = { session: Session };

// Sub-app: every /admin/* route runs through requireAdmin. It throws an
// HTTPException (401 / 403), which the global onError handler in
// src/index.ts surfaces as JSON. Routes mounted under this app get
// c.var.session pre-populated.
const admin = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

admin.use("*", async (c, next) => {
  const session = await requireAdmin(c);
  c.set("session", session);
  await next();
});

admin.get("/me", (c) => {
  const session = c.var.session;
  return c.json({ email: session.user.email, name: session.user.name });
});

admin.route("/dashboard", dashboard);

export default admin;
