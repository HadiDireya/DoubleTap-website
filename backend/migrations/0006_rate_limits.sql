-- Fixed-window rate limiter, mirroring license-server's pattern. One row
-- per (key, window_start); the window is one minute. Limiter does an
-- atomic UPSERT-with-RETURNING and lazily GCs old rows so the table
-- stays bounded without a cron — the prior license-server version had
-- no GC at all and is the open MEDIUM finding the audit flagged.
--
-- key: `<bucket-source>:<label>` (e.g. `1.2.3.4:auth`). The middleware
-- in src/lib/rate-limit.ts is the only writer.

CREATE TABLE rate_limits (
    key           TEXT NOT NULL,
    window_start  TEXT NOT NULL,
    count         INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (key, window_start)
);

CREATE INDEX idx_rate_limits_window ON rate_limits(window_start);
