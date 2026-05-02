import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// ── Better Auth core tables ───────────────────────────────────────────────
// Column names match Better Auth's drizzle adapter defaults (camelCase).

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" }),
});

// ── App tables ────────────────────────────────────────────────────────────

export const gumroadLicense = sqliteTable("gumroad_license", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  licenseKey: text("licenseKey").notNull().unique(),
  productId: text("productId").notNull(),
  saleId: text("saleId"),
  verifiedAt: integer("verifiedAt", { mode: "timestamp" }).notNull(),
});

export const feedbackPost = sqliteTable(
  "feedback_post",
  {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("feature"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("suggested"),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    statusIdx: index("feedback_post_status_idx").on(t.status),
    typeIdx: index("feedback_post_type_idx").on(t.type),
    userIdx: index("feedback_post_user_idx").on(t.userId),
  }),
);

export const feedbackVote = sqliteTable(
  "feedback_vote",
  {
    id: text("id").primaryKey(),
    postId: text("postId").notNull().references(() => feedbackPost.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    postUserUnique: uniqueIndex("feedback_vote_post_user_unique").on(t.postId, t.userId),
  }),
);

export const feedbackComment = sqliteTable(
  "feedback_comment",
  {
    id: text("id").primaryKey(),
    postId: text("postId").notNull().references(() => feedbackPost.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    postIdx: index("feedback_comment_post_idx").on(t.postId),
  }),
);
