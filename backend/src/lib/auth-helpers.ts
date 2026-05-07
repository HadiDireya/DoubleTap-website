import type { HonoRequest } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAuth } from "../auth";
import type { Env } from "../env";

// All emails currently allowed admin access. Surfaced to the admin panel
// via /admin/settings as read-only. A misconfigured row in a writable
// DB-backed admin list could lock the user out of the admin panel; v1
// keeps this in code on purpose. Add more entries here (and re-deploy)
// to grant additional admin access. Comparisons are case-insensitive
// because email addresses are.
export const ADMIN_EMAILS: ReadonlyArray<string> = ["hadidireya@gmail.com"];

const ADMIN_EMAILS_LOWER = ADMIN_EMAILS.map((e) => e.toLowerCase());

export const STATUSES = [
  "suggested",
  "under_review",
  "planned",
  "in_progress",
  "shipped",
  "declined",
] as const;
export type Status = (typeof STATUSES)[number];

export const FEEDBACK_TYPES = ["bug", "feature", "praise"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

// Type guards live next to the tuples they validate so the public route,
// the admin route, and any future caller share one definition. The cast
// to `readonly string[]` is unfortunate but unavoidable: `.includes()`
// on a `readonly Status[]` requires its argument to already be a Status.
export const isStatus = (s: string): s is Status =>
  (STATUSES as readonly string[]).includes(s);

export const isFeedbackType = (s: string): s is FeedbackType =>
  (FEEDBACK_TYPES as readonly string[]).includes(s);

// Structural minimal type so any Hono sub-app can pass its context here
// regardless of how it parameterised Variables (the Variables generic is
// invariant in Hono, so a nominal Context<...> alias would reject any
// caller whose sub-app declared its own Variables shape). The helpers
// only ever touch env and req.raw.headers — that's all this type needs.
type AppContext = { env: Env; req: HonoRequest };

export const getSession = async (c: AppContext) => {
  const auth = createAuth(c.env);
  return auth.api.getSession({ headers: c.req.raw.headers });
};

export const requireSession = async (c: AppContext) => {
  const session = await getSession(c);
  if (!session) {
    throw new HTTPException(401, { message: "unauthorized" });
  }
  return session;
};

export const requireAdmin = async (c: AppContext) => {
  const session = await requireSession(c);
  const email = session.user.email?.toLowerCase();
  if (!email || !ADMIN_EMAILS_LOWER.includes(email)) {
    throw new HTTPException(403, { message: "forbidden" });
  }
  return session;
};

export const isAdmin = (email: string | null | undefined) =>
  !!email && ADMIN_EMAILS_LOWER.includes(email.toLowerCase());
