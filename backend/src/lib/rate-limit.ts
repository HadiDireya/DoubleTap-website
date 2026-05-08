import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";

// Fixed-window, one-minute bucket. Mirrors the limiter on license-server
// (see ~/Developer/DoubleTap/license-server/src/index.ts) so the two
// Workers behave consistently when the audit revisits this.
const WINDOW_SECONDS = 60;

// Lazy GC: 1% of the time, drop windows older than 5 minutes. Keeps the
// table to a few hundred rows in steady state without needing a cron.
const GC_PROBABILITY = 0.01;
const GC_HORIZON_SECONDS = 5 * 60;

/**
 * Atomic increment-and-check against the current 60s bucket for `key`.
 * Returns true when the request is allowed, false when this call put the
 * bucket over `limit`.
 */
export const checkRateLimit = async (
  env: Env,
  key: string,
  limit: number,
): Promise<boolean> => {
  const windowStart =
    Math.floor(Date.now() / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS;
  const windowKey = new Date(windowStart * 1000).toISOString();

  const result = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(key, windowKey)
    .first<{ count: number }>();

  if (Math.random() < GC_PROBABILITY) {
    const cutoff = new Date(
      (windowStart - GC_HORIZON_SECONDS) * 1000,
    ).toISOString();
    // Fire-and-forget — failures here don't affect the limiter decision.
    env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?")
      .bind(cutoff)
      .run()
      .catch((err) => console.error("rate_limit_gc_failed", err));
  }

  return (result?.count ?? 0) <= limit;
};

/**
 * Hono middleware factory: bucket by CF-Connecting-IP + label. Different
 * labels keep buckets per-route so a vote storm doesn't lock a user out
 * of `/feedback/posts/:id/comments`. `methods` defaults to ["POST"];
 * pass undefined to apply on every method.
 */
export const rateLimit = (opts: {
  label: string;
  limit: number;
  methods?: ReadonlyArray<string>;
}): MiddlewareHandler<{ Bindings: Env }> => {
  const allowedMethods = opts.methods ?? ["POST"];
  return async (c: Context<{ Bindings: Env }>, next) => {
    if (allowedMethods && !allowedMethods.includes(c.req.method)) {
      return next();
    }
    const ip = c.req.header("CF-Connecting-IP") || "unknown";
    const ok = await checkRateLimit(c.env, `${ip}:${opts.label}`, opts.limit);
    if (!ok) {
      throw new HTTPException(429, { message: "rate_limited" });
    }
    return next();
  };
};
