import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, count, desc, eq } from "drizzle-orm";
import { Resend } from "resend";
import { getDb } from "../db/client";
import {
  feedbackComment,
  feedbackPost,
  feedbackVote,
  gumroadLicense,
  user,
} from "../db/schema";
import {
  FEEDBACK_TYPES,
  getSession,
  isAdmin,
  requireAdmin,
  requireSession,
  STATUSES,
  type FeedbackType,
  type Status,
} from "../lib/auth-helpers";
import type { Env } from "../env";

type PublicAuthor = {
  id: string;
  name: string;
  image: string | null;
  isVerifiedBuyer: boolean;
};

type PublicPost = {
  id: string;
  type: FeedbackType;
  title: string;
  body: string;
  status: Status;
  createdAt: number;
  updatedAt: number;
  voteCount: number;
  commentCount: number;
  userVoted: boolean;
  author: PublicAuthor;
};

const feedback = new Hono<{ Bindings: Env }>();

const isStatus = (s: string): s is Status => (STATUSES as readonly string[]).includes(s);
const isFeedbackType = (s: string): s is FeedbackType =>
  (FEEDBACK_TYPES as readonly string[]).includes(s);

const validateTitle = (s: unknown) => typeof s === "string" && s.trim().length >= 3 && s.length <= 120;
const validateBody = (s: unknown, min: number, max: number) =>
  typeof s === "string" && s.trim().length >= min && s.length <= max;

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sendBugReportEmail = async (
  env: Env,
  args: { id: string; title: string; body: string; authorName: string; authorEmail: string },
) => {
  if (!env.RESEND_API_KEY) return;
  const resend = new Resend(env.RESEND_API_KEY);
  const link = `${env.APP_URL.replace(/\/$/, "")}/feedback#${args.id}`;
  // Strip CR/LF/TAB so a malicious title can't inject extra email headers.
  const safeSubject = args.title.replace(/[\r\n\t]+/g, " ").trim().slice(0, 120);
  await resend.emails.send({
    from: "DoubleTap <noreply@doubletap-app.com>",
    to: "support@doubletap-app.com",
    replyTo: args.authorEmail,
    subject: `[Bug] ${safeSubject}`,
    html: `
      <p><strong>From:</strong> ${escapeHtml(args.authorName)} &lt;${escapeHtml(args.authorEmail)}&gt;</p>
      <p><strong>Title:</strong> ${escapeHtml(args.title)}</p>
      <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(args.body)}</pre>
      <p><a href="${link}">View on the feedback page</a></p>
    `,
  });
};

// GET /feedback/posts — public, grouped by status. Optional ?type=bug|feature|praise filter.
feedback.get("/posts", async (c) => {
  const db = getDb(c.env);
  const session = await getSession(c);
  const viewerId = session?.user.id ?? null;

  const typeFilter = c.req.query("type");
  if (typeFilter !== undefined && !isFeedbackType(typeFilter)) {
    throw new HTTPException(400, { message: "type_invalid" });
  }

  const baseQuery = db
    .select({
      id: feedbackPost.id,
      type: feedbackPost.type,
      title: feedbackPost.title,
      body: feedbackPost.body,
      status: feedbackPost.status,
      createdAt: feedbackPost.createdAt,
      updatedAt: feedbackPost.updatedAt,
      authorId: user.id,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(feedbackPost)
    .innerJoin(user, eq(feedbackPost.userId, user.id));
  const rows = await (typeFilter
    ? baseQuery.where(eq(feedbackPost.type, typeFilter))
    : baseQuery);

  const voteRows = await db
    .select({ postId: feedbackVote.postId, n: count() })
    .from(feedbackVote)
    .groupBy(feedbackVote.postId);
  const voteByPost = new Map(voteRows.map((r) => [r.postId, Number(r.n)]));

  const commentRows = await db
    .select({ postId: feedbackComment.postId, n: count() })
    .from(feedbackComment)
    .groupBy(feedbackComment.postId);
  const commentByPost = new Map(commentRows.map((r) => [r.postId, Number(r.n)]));

  let viewerVotes = new Set<string>();
  if (viewerId) {
    const votes = await db
      .select({ postId: feedbackVote.postId })
      .from(feedbackVote)
      .where(eq(feedbackVote.userId, viewerId));
    viewerVotes = new Set(votes.map((v) => v.postId));
  }

  const buyers = new Set(
    (await db.selectDistinct({ userId: gumroadLicense.userId }).from(gumroadLicense)).map(
      (b) => b.userId,
    ),
  );

  const grouped: Record<Status, PublicPost[]> = {
    suggested: [],
    under_review: [],
    planned: [],
    in_progress: [],
    shipped: [],
    declined: [],
  };

  for (const r of rows) {
    const status: Status = isStatus(r.status) ? r.status : "suggested";
    const type: FeedbackType = isFeedbackType(r.type) ? r.type : "feature";
    grouped[status].push({
      id: r.id,
      type,
      title: r.title,
      body: r.body,
      status,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
      voteCount: voteByPost.get(r.id) ?? 0,
      commentCount: commentByPost.get(r.id) ?? 0,
      userVoted: viewerVotes.has(r.id),
      author: {
        id: r.authorId,
        name: r.authorName,
        image: r.authorImage,
        isVerifiedBuyer: buyers.has(r.authorId),
      },
    });
  }

  for (const s of STATUSES) {
    grouped[s].sort((a, b) =>
      b.voteCount !== a.voteCount ? b.voteCount - a.voteCount : b.createdAt - a.createdAt,
    );
  }

  return c.json({
    suggested: grouped.suggested,
    under_review: grouped.under_review,
    planned: grouped.planned,
    in_progress: grouped.in_progress,
    shipped: grouped.shipped,
    declined: grouped.declined,
  });
});

// GET /feedback/posts/:id — public, with comments
feedback.get("/posts/:id", async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");
  const session = await getSession(c);
  const viewerId = session?.user.id ?? null;

  const [postRow] = await db
    .select({
      id: feedbackPost.id,
      type: feedbackPost.type,
      title: feedbackPost.title,
      body: feedbackPost.body,
      status: feedbackPost.status,
      createdAt: feedbackPost.createdAt,
      updatedAt: feedbackPost.updatedAt,
      authorId: user.id,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(feedbackPost)
    .innerJoin(user, eq(feedbackPost.userId, user.id))
    .where(eq(feedbackPost.id, id))
    .limit(1);

  if (!postRow) throw new HTTPException(404, { message: "post_not_found" });

  const voteRows = await db
    .select({ n: count() })
    .from(feedbackVote)
    .where(eq(feedbackVote.postId, id));
  const voteCount = voteRows[0]?.n ?? 0;

  let userVoted = false;
  if (viewerId) {
    const v = await db
      .select({ id: feedbackVote.id })
      .from(feedbackVote)
      .where(and(eq(feedbackVote.postId, id), eq(feedbackVote.userId, viewerId)))
      .limit(1);
    userVoted = v.length > 0;
  }

  const comments = await db
    .select({
      id: feedbackComment.id,
      body: feedbackComment.body,
      createdAt: feedbackComment.createdAt,
      authorId: user.id,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(feedbackComment)
    .innerJoin(user, eq(feedbackComment.userId, user.id))
    .where(eq(feedbackComment.postId, id))
    .orderBy(feedbackComment.createdAt);

  const buyers = new Set(
    (await db.selectDistinct({ userId: gumroadLicense.userId }).from(gumroadLicense)).map(
      (b) => b.userId,
    ),
  );

  const status: Status = isStatus(postRow.status) ? postRow.status : "suggested";
  const type: FeedbackType = isFeedbackType(postRow.type) ? postRow.type : "feature";

  return c.json({
    id: postRow.id,
    type,
    title: postRow.title,
    body: postRow.body,
    status,
    createdAt: postRow.createdAt.getTime(),
    updatedAt: postRow.updatedAt.getTime(),
    voteCount: Number(voteCount),
    userVoted,
    author: {
      id: postRow.authorId,
      name: postRow.authorName,
      image: postRow.authorImage,
      isVerifiedBuyer: buyers.has(postRow.authorId),
    },
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.getTime(),
      author: {
        id: c.authorId,
        name: c.authorName,
        image: c.authorImage,
        isVerifiedBuyer: buyers.has(c.authorId),
      },
    })),
  });
});

// POST /feedback/posts — auth required. Optional type (default "feature").
feedback.post("/posts", async (c) => {
  const session = await requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  const type: FeedbackType =
    typeof body.type === "string" && isFeedbackType(body.type) ? body.type : "feature";
  if (typeof body.type === "string" && !isFeedbackType(body.type)) {
    throw new HTTPException(400, { message: "type_invalid" });
  }
  if (!validateTitle(body.title)) {
    throw new HTTPException(400, { message: "title_invalid" });
  }
  // Praise can be a short blurb; bugs and feature requests need a real description.
  const bodyMin = type === "praise" ? 5 : 10;
  if (!validateBody(body.body, bodyMin, 2000)) {
    throw new HTTPException(400, { message: "body_invalid" });
  }
  const db = getDb(c.env);
  const now = new Date();
  const id = crypto.randomUUID();
  const title = body.title.trim();
  const text = body.body.trim();
  await db.insert(feedbackPost).values({
    id,
    userId: session.user.id,
    type,
    title,
    body: text,
    status: "suggested",
    createdAt: now,
    updatedAt: now,
  });

  if (type === "bug") {
    try {
      await sendBugReportEmail(c.env, {
        id,
        title,
        body: text,
        authorName: session.user.name,
        authorEmail: session.user.email,
      });
    } catch (err) {
      // Don't fail the user's submission if the email pipe is down — just log.
      console.error("bug_report_email_failed", err);
    }
  }

  return c.json({ id, type }, 201);
});

// POST /feedback/posts/:id/vote — toggle (auth required)
feedback.post("/posts/:id/vote", async (c) => {
  const session = await requireSession(c);
  const postId = c.req.param("id");
  const db = getDb(c.env);

  const [post] = await db
    .select({ id: feedbackPost.id })
    .from(feedbackPost)
    .where(eq(feedbackPost.id, postId))
    .limit(1);
  if (!post) throw new HTTPException(404, { message: "post_not_found" });

  const existing = await db
    .select({ id: feedbackVote.id })
    .from(feedbackVote)
    .where(and(eq(feedbackVote.postId, postId), eq(feedbackVote.userId, session.user.id)))
    .limit(1);

  let voted: boolean;
  if (existing.length > 0) {
    await db
      .delete(feedbackVote)
      .where(and(eq(feedbackVote.postId, postId), eq(feedbackVote.userId, session.user.id)));
    voted = false;
  } else {
    await db.insert(feedbackVote).values({
      id: crypto.randomUUID(),
      postId,
      userId: session.user.id,
      createdAt: new Date(),
    });
    voted = true;
  }

  const finalVotes = await db
    .select({ n: count() })
    .from(feedbackVote)
    .where(eq(feedbackVote.postId, postId));

  return c.json({ voted, voteCount: Number(finalVotes[0]?.n ?? 0) });
});

// POST /feedback/posts/:id/comments — auth required
feedback.post("/posts/:id/comments", async (c) => {
  const session = await requireSession(c);
  const postId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  if (!validateBody(body.body, 1, 2000)) {
    throw new HTTPException(400, { message: "body_invalid" });
  }
  const db = getDb(c.env);

  const [post] = await db
    .select({ id: feedbackPost.id })
    .from(feedbackPost)
    .where(eq(feedbackPost.id, postId))
    .limit(1);
  if (!post) throw new HTTPException(404, { message: "post_not_found" });

  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(feedbackComment).values({
    id,
    postId,
    userId: session.user.id,
    body: body.body.trim(),
    createdAt: now,
    updatedAt: now,
  });
  return c.json({ id }, 201);
});

// PATCH /feedback/posts/:id — admin only
feedback.patch("/posts/:id", async (c) => {
  await requireAdmin(c);
  const postId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const updates: Partial<{
    status: Status;
    type: FeedbackType;
    title: string;
    body: string;
    updatedAt: Date;
  }> = {};
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !isStatus(body.status)) {
      throw new HTTPException(400, { message: "status_invalid" });
    }
    updates.status = body.status;
  }
  if (body.type !== undefined) {
    if (typeof body.type !== "string" || !isFeedbackType(body.type)) {
      throw new HTTPException(400, { message: "type_invalid" });
    }
    updates.type = body.type;
  }
  if (body.title !== undefined) {
    if (!validateTitle(body.title)) throw new HTTPException(400, { message: "title_invalid" });
    updates.title = body.title.trim();
  }
  if (body.body !== undefined) {
    if (!validateBody(body.body, 10, 2000))
      throw new HTTPException(400, { message: "body_invalid" });
    updates.body = body.body.trim();
  }
  if (Object.keys(updates).length === 0) {
    throw new HTTPException(400, { message: "no_changes" });
  }
  updates.updatedAt = new Date();

  const db = getDb(c.env);
  const result = await db.update(feedbackPost).set(updates).where(eq(feedbackPost.id, postId));
  if (result.meta && result.meta.changes === 0) {
    throw new HTTPException(404, { message: "post_not_found" });
  }
  return c.json({ ok: true });
});

// DELETE /feedback/posts/:id — admin only
feedback.delete("/posts/:id", async (c) => {
  await requireAdmin(c);
  const postId = c.req.param("id");
  const db = getDb(c.env);
  const result = await db.delete(feedbackPost).where(eq(feedbackPost.id, postId));
  if (result.meta && result.meta.changes === 0) {
    throw new HTTPException(404, { message: "post_not_found" });
  }
  return c.json({ ok: true });
});

// DELETE /feedback/comments/:id — admin or comment author
feedback.delete("/comments/:id", async (c) => {
  const session = await requireSession(c);
  const commentId = c.req.param("id");
  const db = getDb(c.env);
  const [row] = await db
    .select({ userId: feedbackComment.userId })
    .from(feedbackComment)
    .where(eq(feedbackComment.id, commentId))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "comment_not_found" });
  if (row.userId !== session.user.id && !isAdmin(session.user.email)) {
    throw new HTTPException(403, { message: "forbidden" });
  }
  await db.delete(feedbackComment).where(eq(feedbackComment.id, commentId));
  return c.json({ ok: true });
});

export default feedback;
