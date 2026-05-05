import { Hono } from "hono";
import { and, count, desc, gte, lt } from "drizzle-orm";
import { getDb } from "../../db/client";
import { gumroadLicense, user, feedbackPost } from "../../db/schema";
import {
  avgActivationsPerLicense,
  countActiveLahzaLicenses,
  countActiveTrials,
  countActivations,
  countLahzaLicensesIssuedBetween,
  countLahzaLicensesRevokedBetween,
  countTrialsStartedBetween,
  lahzaIssuanceByDay,
  recentLicenseEvents,
  trialConversionBetween,
} from "../../lib/license-db";
import type { AdminVariables } from "./index";
import type { Env } from "../../env";

const dashboard = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;
type RangeKey = keyof typeof RANGE_DAYS;
const isRangeKey = (s: string): s is RangeKey => s in RANGE_DAYS;

// (curr - prev) / prev with a sane fallback when prev is 0:
//   0 → 0 if curr == 0, else +∞ collapses to 1 (i.e. "+100%") so the UI
//   pill doesn't render NaN or Infinity.
const delta = (curr: number, prev: number) => {
  if (prev === 0) return curr === 0 ? 0 : 1;
  return (curr - prev) / prev;
};

dashboard.get("/", async (c) => {
  const range: RangeKey = isRangeKey(c.req.query("range") ?? "") ? (c.req.query("range") as RangeKey) : "30d";
  const days = RANGE_DAYS[range];

  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prevSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);
  const sinceISO = since.toISOString();
  const prevSinceISO = prevSince.toISOString();
  const nowISO = now.toISOString();

  const db = getDb(c.env);
  const ldb = c.env.LICENSE_DB;

  const [
    activeLahza,
    activeGumroad,
    activeTrials,
    lahzaIssuedNow,
    lahzaIssuedPrev,
    gumroadIssuedNow,
    gumroadIssuedPrev,
    revokedNow,
    revokedPrev,
    activations,
    avgUtil,
    totalUsers,
    newUsers,
    conversion,
    trialsStarted,
    issuanceSeries,
    licenseEvents,
    feedbackEvents,
  ] = await Promise.all([
    countActiveLahzaLicenses(ldb),
    db.select({ n: count() }).from(gumroadLicense).then((r) => r[0]?.n ?? 0),
    countActiveTrials(ldb, nowISO),
    countLahzaLicensesIssuedBetween(ldb, sinceISO, nowISO),
    countLahzaLicensesIssuedBetween(ldb, prevSinceISO, sinceISO),
    db
      .select({ n: count() })
      .from(gumroadLicense)
      .where(and(gte(gumroadLicense.verifiedAt, since), lt(gumroadLicense.verifiedAt, now)))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: count() })
      .from(gumroadLicense)
      .where(and(gte(gumroadLicense.verifiedAt, prevSince), lt(gumroadLicense.verifiedAt, since)))
      .then((r) => r[0]?.n ?? 0),
    countLahzaLicensesRevokedBetween(ldb, sinceISO, nowISO),
    countLahzaLicensesRevokedBetween(ldb, prevSinceISO, sinceISO),
    countActivations(ldb),
    avgActivationsPerLicense(ldb),
    db.select({ n: count() }).from(user).then((r) => r[0]?.n ?? 0),
    db
      .select({ n: count() })
      .from(user)
      .where(gte(user.createdAt, since))
      .then((r) => r[0]?.n ?? 0),
    trialConversionBetween(ldb, sinceISO, nowISO),
    countTrialsStartedBetween(ldb, sinceISO, nowISO),
    lahzaIssuanceByDay(ldb, sinceISO),
    recentLicenseEvents(ldb, 12),
    db
      .select({
        id: feedbackPost.id,
        title: feedbackPost.title,
        type: feedbackPost.type,
        createdAt: feedbackPost.createdAt,
      })
      .from(feedbackPost)
      .orderBy(desc(feedbackPost.createdAt))
      .limit(6),
  ]);

  const issuedNow = lahzaIssuedNow + gumroadIssuedNow;
  const issuedPrev = lahzaIssuedPrev + gumroadIssuedPrev;

  type FeedItem =
    | {
        kind: "license";
        at: string;
        type: "license.issued" | "license.revoked" | "activation.added";
        licenseKey: string;
        email: string | null;
        source: "lahza" | "comp";
        detail?: string;
      }
    | {
        kind: "feedback";
        at: string;
        postId: string;
        title: string;
        type: string;
      };

  const feed: FeedItem[] = [
    ...licenseEvents.map<FeedItem>((e) => ({
      kind: "license",
      at: e.at,
      type: e.type,
      licenseKey: e.licenseKey,
      email: e.email,
      source: e.source,
      detail: e.detail,
    })),
    ...feedbackEvents.map<FeedItem>((p) => ({
      kind: "feedback",
      at: (p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt as unknown as number)).toISOString(),
      postId: p.id,
      title: p.title,
      type: p.type,
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 12);

  return c.json({
    range,
    generatedAt: nowISO,
    kpis: {
      activeLicenses: {
        total: activeLahza + activeGumroad,
        lahza: activeLahza,
        gumroad: activeGumroad,
      },
      activeTrials,
      issuedInPeriod: {
        total: issuedNow,
        lahza: lahzaIssuedNow,
        gumroad: gumroadIssuedNow,
        delta: delta(issuedNow, issuedPrev),
      },
      revokedInPeriod: {
        total: revokedNow,
        delta: delta(revokedNow, revokedPrev),
      },
    },
    bottomRow: {
      conversion,
      users: { total: totalUsers, new: newUsers },
      utilisation: { activations, avgPerLicense: avgUtil },
      trialsStarted,
    },
    issuanceSeries,
    feed,
  });
});

export default dashboard;
