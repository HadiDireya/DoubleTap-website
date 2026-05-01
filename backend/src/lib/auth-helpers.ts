import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { createAuth } from "../auth";
import { getDb } from "../db/client";
import { gumroadLicense } from "../db/schema";
import type { Env } from "../env";

export const ADMIN_EMAIL = "hadidireya@gmail.com";

export const STATUSES = [
  "suggested",
  "under_review",
  "planned",
  "in_progress",
  "shipped",
  "declined",
] as const;
export type Status = (typeof STATUSES)[number];

type AppContext = Context<{ Bindings: Env }>;

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
