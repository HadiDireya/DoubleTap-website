import type { HonoRequest } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { createAuth } from "../auth";
import { getDb } from "../db/client";
import { gumroadLicense } from "../db/schema";
import type { Env } from "../env";

// Single hard-coded admin email. Surfaced to the admin panel via
// `ADMIN_EMAILS` (read-only — see /admin/settings). A misconfigured row
// in a writable DB-backed admin list could lock the user out of the
// admin panel; v1 keeps this in code on purpose.
export const ADMIN_EMAIL = "hadidireya@gmail.com";

// All emails currently allowed admin access. v1 has exactly one entry —
// the array shape exists so /admin/settings can surface "what counts as
// admin today" without claiming "edit me from the UI". Add more entries
// here (and re-deploy) to grant additional admin access.
export const ADMIN_EMAILS: ReadonlyArray<string> = [ADMIN_EMAIL];

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
  if (session.user.email !== ADMIN_EMAIL) {
    throw new HTTPException(403, { message: "forbidden" });
  }
  return session;
};

export const isAdmin = (email: string | null | undefined) => email === ADMIN_EMAIL;

export const verifiedBuyerSet = async (c: AppContext, userIds: string[]) => {
  if (userIds.length === 0) return new Set<string>();
  const db = getDb(c.env);
  const rows = await db
    .select({ userId: gumroadLicense.userId })
    .from(gumroadLicense);
  const all = new Set(rows.map((r) => r.userId));
  return new Set(userIds.filter((id) => all.has(id)));
};
