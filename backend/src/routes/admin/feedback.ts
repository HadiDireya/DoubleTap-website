import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, count, desc, eq, gte, inArray, like, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../db/client";
import {
  adminAuditLog,
  feedbackComment,
  feedbackPost,
  feedbackVote,
  user,
} from "../../db/schema";
import { serializeAuditEntry, writeAudit } from "../../lib/audit";
import { parseISODate, toISO } from "../../lib/dates";
import { parsePositiveInt } from "../../lib/query";
import {
  FEEDBACK_TYPES,
  STATUSES,
  type FeedbackType,
  type Status,
} from "../../lib/auth-helpers";
import type { AdminVariables } from "./index";
import type { Env } from "../../env";

// Pin/unpin is deliberately NOT implemented here in PR7. Adding a `pinned`
// column to `feedback_post` requires a SQL migration in
// backend/migrations/, and migration creation was outside the permitted
// edit scope for this PR. Pin/unpin remains on the deferred-forks list and
// will land alongside the next migration that touches feedback. The audit
// actions `feedback.pin` / `feedback.unpin` already exist in the union
// (added pre-emptively when the union was hoisted) so wiring them up later
// is purely additive — no audit-log rewrite needed.

const feedback = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

const isStatus = (s: string): s is Status => (STATUSES as readonly string[]).includes(s);
const isFeedbackType = (s: string): s is FeedbackType =>
  (FEEDBACK_TYPES as readonly string[]).includes(s);

const parseStatusFilter = (raw: string | undefined): Status | "all" => {
  if (raw && isStatus(raw)) return raw;
  return "all";
};

const parseTypeFilter = (raw: string | undefined): FeedbackType | "all" => {
  if (raw && isFeedbackType(raw)) return raw;
  return "all";
};

// ── GET / — paginated list with filters ───────────────────────────────────
//
// Filters:
//   q              — substring match on title OR body (case-insensitive)
//   type           — bug / feature / praise (default: all)
//   status         — suggested / under_review / planned / in_progress /
//                    shipped / declined (default: all)
//   since/until    — ISO 8601 bounds on createdAt
//
// Each row carries its author summary + vote/comment counts so the table
// can render a one-line preview without an N+1 fan-out per row. Vote /
// comment counts are batched into a single GROUP BY query each.
feedback.get("/", async (c) => {
  const q = (c.req.query("q") || "").trim();
  const type = parseTypeFilter(c.req.query("type"));
  const status = parseStatusFilter(c.req.query("status"));
  const since = parseISODate(c.req.query("since"));
  const until = parseISODate(c.req.query("until"));
  const page = parsePositiveInt(c.req.query("page"), 1, 1_000_000);
  // Cap at 100 (not 200): the per-row vote/comment-count fan-in below
  // would otherwise risk D1's prepared-statement bind ceiling on giant
  // pages. Default 50 is still 2× the typical query.
  const limit = parsePositiveInt(c.req.query("limit"), 50, 100);
  const offset = (page - 1) * limit;

  const db = getDb(c.env);
  const qLower = q.toLowerCase();

  const filters: (SQL | undefined)[] = [
    q
      ? or(
          like(sql`lower(${feedbackPost.title})`, `%${qLower}%`),
          like(sql`lower(${feedbackPost.body})`, `%${qLower}%`),
        )
      : undefined,
    type !== "all" ? eq(feedbackPost.type, type) : undefined,
    status !== "all" ? eq(feedbackPost.status, status) : undefined,
    since ? gte(feedbackPost.createdAt, since) : undefined,
    until ? lt(feedbackPost.createdAt, until) : undefined,
  ];
  const active = filters.filter((c): c is SQL => c !== undefined);
  const where = active.length > 0 ? and(...active) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
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
        authorEmail: user.email,
      })
      .from(feedbackPost)
      .leftJoin(user, eq(feedbackPost.userId, user.id))
      .where(where)
      .orderBy(desc(feedbackPost.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ n: count() })
      .from(feedbackPost)
      .where(where)
      .then((r) => r[0]?.n ?? 0),
  ]);

  // Batched vote + comment counts — one GROUP BY each across the visible
  // page only. Same pattern as the licenses route's gumroadActivationCounts.
  const postIds = rows.map((r) => r.id);
  const voteCounts = new Map<string, number>();
  const commentCounts = new Map<string, number>();
  if (postIds.length > 0) {
    const [voteRows, commentRows] = await Promise.all([
      db
        .select({ postId: feedbackVote.postId, n: count() })
        .from(feedbackVote)
        .where(inArray(feedbackVote.postId, postIds))
        .groupBy(feedbackVote.postId),
      db
        .select({ postId: feedbackComment.postId, n: count() })
        .from(feedbackComment)
        .where(inArray(feedbackComment.postId, postIds))
        .groupBy(feedbackComment.postId),
    ]);
    for (const r of voteRows) voteCounts.set(r.postId, r.n);
    for (const r of commentRows) commentCounts.set(r.postId, r.n);
  }

  return c.json({
    rows: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      // Trim the body preview server-side so the JSON response stays small;
      // the table renders the snippet only, the drawer shows the full text.
      body_preview: r.body.length > 160 ? `${r.body.slice(0, 160)}…` : r.body,
      status: r.status,
      created_at: toISO(r.createdAt),
      updated_at: toISO(r.updatedAt),
      author: r.authorId
        ? { id: r.authorId, name: r.authorName, email: r.authorEmail }
        : null,
      vote_count: voteCounts.get(r.id) ?? 0,
      comment_count: commentCounts.get(r.id) ?? 0,
    })),
    page,
    limit,
    total: totalRow,
  });
});

// ── GET /:id — detail with comments + audit timeline ──────────────────────
feedback.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env);

  const postRow = await db
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
      authorEmail: user.email,
      authorImage: user.image,
    })
    .from(feedbackPost)
    .leftJoin(user, eq(feedbackPost.userId, user.id))
    .where(eq(feedbackPost.id, id))
    .limit(1)
    .then((r) => r[0]);
  if (!postRow) throw new HTTPException(404, { message: "post_not_found" });

  // Comments + vote count + audit timeline fan out in parallel — they're
  // all independent. Comments are newest-first to match the "most recent
  // moderation surface" reading order; the public feedback view sorts
  // oldest-first because it's a thread.
  const [comments, voteCountRow, audit] = await Promise.all([
    db
      .select({
        id: feedbackComment.id,
        body: feedbackComment.body,
        createdAt: feedbackComment.createdAt,
        authorId: user.id,
        authorName: user.name,
        authorEmail: user.email,
      })
      .from(feedbackComment)
      .leftJoin(user, eq(feedbackComment.userId, user.id))
      .where(eq(feedbackComment.postId, id))
      .orderBy(desc(feedbackComment.createdAt)),
    db
      .select({ n: count() })
      .from(feedbackVote)
      .where(eq(feedbackVote.postId, id))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({
        id: adminAuditLog.id,
        actorEmail: adminAuditLog.actorEmail,
        action: adminAuditLog.action,
        details: adminAuditLog.details,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .where(
        and(
          eq(adminAuditLog.targetType, "feedback_post"),
          eq(adminAuditLog.targetId, id),
        ),
      )
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(50),
  ]);

  return c.json({
    id: postRow.id,
    type: postRow.type,
    title: postRow.title,
    body: postRow.body,
    status: postRow.status,
    created_at: toISO(postRow.createdAt),
    updated_at: toISO(postRow.updatedAt),
    author: postRow.authorId
      ? {
          id: postRow.authorId,
          name: postRow.authorName,
          email: postRow.authorEmail,
          image: postRow.authorImage,
        }
      : null,
    vote_count: voteCountRow,
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      created_at: toISO(c.createdAt),
      author: c.authorId
        ? { id: c.authorId, name: c.authorName, email: c.authorEmail }
        : null,
    })),
    audit: audit.map(serializeAuditEntry),
  });
});

// ── PATCH /:id/status — change moderation status ──────────────────────────
//
// Body: { status: Status }. Validated against the canonical STATUSES tuple
// in lib/auth-helpers so admin and the public route accept the same values.
// Audit captures from→to so the timeline reads as a one-line state change.
feedback.patch("/:id/status", async (c) => {
  const id = c.req.param("id");
  const body = await c.req
    .json<{ status?: unknown }>()
    .catch(() => ({} as { status?: unknown }));
  if (typeof body.status !== "string" || !isStatus(body.status)) {
    throw new HTTPException(400, { message: "invalid_status" });
  }
  const next = body.status;

  const db = getDb(c.env);
  const before = await db
    .select({ status: feedbackPost.status, title: feedbackPost.title })
    .from(feedbackPost)
    .where(eq(feedbackPost.id, id))
    .limit(1)
    .then((r) => r[0]);
  if (!before) throw new HTTPException(404, { message: "post_not_found" });

  if (before.status === next) {
    // No-op: don't write an audit entry for a status set to its current
    // value. Surface as a 200 so the client doesn't error on a button
    // double-click.
    return c.json({ ok: true, noop: true });
  }

  await db
    .update(feedbackPost)
    .set({ status: next, updatedAt: new Date() })
    .where(eq(feedbackPost.id, id));

  await writeAudit(c, {
    actorEmail: c.var.session.user.email,
    action: "feedback.update_status",
    targetType: "feedback_post",
    targetId: id,
    details: { from: before.status, to: next, title: before.title },
  });
  return c.json({ ok: true });
});

// ── DELETE /:id — delete post + cascade comments + votes ──────────────────
//
// Foreign keys on feedback_comment.postId and feedback_vote.postId both
// declare ON DELETE CASCADE, so SQLite cleans up dependents automatically
// when the parent row is removed. The audit details snapshot the title +
// author so the timeline remains readable after the row is gone.
feedback.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env);

  const before = await db
    .select({
      title: feedbackPost.title,
      type: feedbackPost.type,
      status: feedbackPost.status,
      authorEmail: user.email,
    })
    .from(feedbackPost)
    .leftJoin(user, eq(feedbackPost.userId, user.id))
    .where(eq(feedbackPost.id, id))
    .limit(1)
    .then((r) => r[0]);
  if (!before) throw new HTTPException(404, { message: "post_not_found" });

  await db.delete(feedbackPost).where(eq(feedbackPost.id, id));

  await writeAudit(c, {
    actorEmail: c.var.session.user.email,
    action: "feedback.delete_post",
    targetType: "feedback_post",
    targetId: id,
    details: {
      title: before.title,
      type: before.type,
      status: before.status,
      author_email: before.authorEmail ?? null,
    },
  });
  return c.json({ ok: true });
});

// ── DELETE /:id/comments/:commentId — delete a single comment ─────────────
//
// :id is the parent post — we verify the comment actually belongs to that
// post so a stale URL can't delete somebody else's comment by colliding on
// commentId alone (commentId is a UUID so collisions are astronomically
// unlikely, but the parent check makes the URL self-describing).
feedback.delete("/:id/comments/:commentId", async (c) => {
  const postId = c.req.param("id");
  const commentId = c.req.param("commentId");
  const db = getDb(c.env);

  const before = await db
    .select({
      postId: feedbackComment.postId,
      body: feedbackComment.body,
      authorEmail: user.email,
    })
    .from(feedbackComment)
    .leftJoin(user, eq(feedbackComment.userId, user.id))
    .where(eq(feedbackComment.id, commentId))
    .limit(1)
    .then((r) => r[0]);
  if (!before) throw new HTTPException(404, { message: "comment_not_found" });
  if (before.postId !== postId) {
    throw new HTTPException(404, { message: "comment_not_on_post" });
  }

  await db.delete(feedbackComment).where(eq(feedbackComment.id, commentId));

  await writeAudit(c, {
    actorEmail: c.var.session.user.email,
    action: "feedback.delete_comment",
    targetType: "feedback_comment",
    targetId: commentId,
    details: {
      post_id: postId,
      author_email: before.authorEmail ?? null,
      // Snapshot a body preview so the audit row is meaningful after the
      // comment is gone. Cap at 200 chars — full body is on the audit
      // row's details if needed, but the 1-line preview is what matters.
      body_preview: before.body.length > 200 ? `${before.body.slice(0, 200)}…` : before.body,
    },
  });
  return c.json({ ok: true });
});

export default feedback;
