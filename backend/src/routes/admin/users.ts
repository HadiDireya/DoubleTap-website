import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, count, desc, eq, gte, inArray, like, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../db/client";
import {
  adminAuditLog,
  feedbackPost,
  gumroadLicense,
  user,
} from "../../db/schema";
import { serializeAuditEntry } from "../../lib/audit";
import { parseISODate, toISO } from "../../lib/dates";
import { listLicensesByEmail } from "../../lib/license-db";
import { parsePositiveInt } from "../../lib/query";
import type { AdminVariables } from "./index";
import type { Env } from "../../env";

const users = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

// ── GET / — paginated list ────────────────────────────────────────────────
users.get("/", async (c) => {
  const q = (c.req.query("q") || "").trim();
  const since = parseISODate(c.req.query("since"));
  const until = parseISODate(c.req.query("until"));
  const page = parsePositiveInt(c.req.query("page"), 1, 1_000_000);
  // Capped at 100 (not 200 like the other routes) because the gumroadCounts
  // fan-in below uses `inArray(userIds)` which expands into one bind per id,
  // and D1 prepared statements top out around 100 binds. 100 is still 2× the
  // default page size, so this only matters for someone hand-crafting a
  // ?limit= override; the default 50 leaves plenty of headroom.
  const limit = parsePositiveInt(c.req.query("limit"), 50, 100);
  const offset = (page - 1) * limit;

  const db = getDb(c.env);

  // SQLite's default LIKE is case-insensitive for ASCII (and emails are
  // ASCII), so a search for "Alice" already matches "alice@example.com".
  // But name can be Unicode — Better Auth surfaces whatever the provider
  // returns — and SQLite's built-in LIKE doesn't case-fold non-ASCII
  // (e.g. "Álvaro" vs. "álvaro"). lower() on both sides makes the search
  // case-insensitive for both the ASCII and the Unicode cases, and stays
  // symmetric with `listLicensesByEmail`'s lower-on-both-sides join.
  const qLower = q.toLowerCase();
  const filters: (SQL | undefined)[] = [
    q
      ? or(
          like(sql`lower(${user.name})`, `%${qLower}%`),
          like(sql`lower(${user.email})`, `%${qLower}%`),
        )
      : undefined,
    since ? gte(user.createdAt, since) : undefined,
    until ? lt(user.createdAt, until) : undefined,
  ];
  const active = filters.filter((c): c is SQL => c !== undefined);
  const where = active.length > 0 ? and(...active) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ n: count() })
      .from(user)
      .where(where)
      .then((r) => r[0]?.n ?? 0),
  ]);

  // Per-row Gumroad license count — single batched query so the table can
  // show a "1 license" hint without an N+1 fan-out. Lahza/comp counts are
  // intentionally not joined here: they require a per-user round-trip into
  // LICENSE_DB and the list view doesn't justify cross-DB hits.
  const userIds = rows.map((r) => r.id);
  const gumroadCounts = new Map<string, number>();
  if (userIds.length > 0) {
    const counts = await db
      .select({ userId: gumroadLicense.userId, n: count() })
      .from(gumroadLicense)
      .where(inArray(gumroadLicense.userId, userIds))
      .groupBy(gumroadLicense.userId);
    for (const r of counts) gumroadCounts.set(r.userId, r.n);
  }

  return c.json({
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      email_verified: r.emailVerified,
      image: r.image,
      created_at: toISO(r.createdAt),
      gumroad_license_count: gumroadCounts.get(r.id) ?? 0,
    })),
    page,
    limit,
    total: totalRow,
  });
});

// ── GET /:id — detail with linked licenses + feedback + audit timeline ───
users.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env);
  const ldb = c.env.LICENSE_DB;

  const userRow = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.id, id))
    .limit(1)
    .then((r) => r[0]);
  if (!userRow) throw new HTTPException(404, { message: "user_not_found" });

  // Fan out the five secondary lookups in parallel — they're independent.
  // Lahza join is by email (soft); see listLicensesByEmail's note. The
  // Lahza call is the only one against LICENSE_DB (a separate D1) — wrap
  // it so a transient cross-DB outage degrades to "no Lahza licenses" on
  // the response rather than a 500 that hides the rest of the customer's
  // record. Other lookups hit DB directly; if those fail the page can't
  // render anyway, so let the 500 propagate.
  const [gumroadRows, lahzaRows, feedbackRows, feedbackTotal, auditRows] =
    await Promise.all([
      db
        .select({
          licenseKey: gumroadLicense.licenseKey,
          productId: gumroadLicense.productId,
          saleId: gumroadLicense.saleId,
          verifiedAt: gumroadLicense.verifiedAt,
        })
        .from(gumroadLicense)
        .where(eq(gumroadLicense.userId, id))
        .orderBy(desc(gumroadLicense.verifiedAt)),
      listLicensesByEmail(ldb, userRow.email).catch((err) => {
        console.error("listLicensesByEmail_failed", (err as Error).message);
        return [];
      }),
      db
        .select({
          id: feedbackPost.id,
          type: feedbackPost.type,
          title: feedbackPost.title,
          status: feedbackPost.status,
          createdAt: feedbackPost.createdAt,
        })
        .from(feedbackPost)
        .where(eq(feedbackPost.userId, id))
        .orderBy(desc(feedbackPost.createdAt))
        .limit(5),
      db
        .select({ n: count() })
        .from(feedbackPost)
        .where(eq(feedbackPost.userId, id))
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
        .where(and(eq(adminAuditLog.targetType, "user"), eq(adminAuditLog.targetId, id)))
        .orderBy(desc(adminAuditLog.createdAt))
        .limit(50),
    ]);

  return c.json({
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    email_verified: userRow.emailVerified,
    image: userRow.image,
    created_at: toISO(userRow.createdAt),
    updated_at: toISO(userRow.updatedAt),
    licenses: {
      gumroad: gumroadRows.map((r) => ({
        license_key: r.licenseKey,
        product_id: r.productId,
        sale_id: r.saleId,
        issued_at: toISO(r.verifiedAt),
      })),
      // Lahza+comp surfaced together, distinguished by the LZ-COMP- prefix
      // on the frontend (same convention as the licenses list/page).
      lahza: lahzaRows.map((r) => ({
        license_key: r.license_key,
        email: r.email,
        max_uses: r.max_uses,
        tx_reference: r.tx_reference,
        issued_at: r.issued_at,
        revoked_at: r.revoked_at,
        active_activations: r.active_activations,
      })),
    },
    feedback: {
      total: feedbackTotal,
      recent: feedbackRows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        status: r.status,
        created_at: toISO(r.createdAt),
      })),
    },
    audit: auditRows.map(serializeAuditEntry),
  });
});

export default users;
