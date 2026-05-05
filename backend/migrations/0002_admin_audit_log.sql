-- Append-only log of every admin write (revoke, un-revoke, free-slot,
-- issue-comp, ban, etc.). The admin panel reads from this table for the
-- activity feed and the dedicated audit view; nothing else should write
-- to it (only `lib/audit.ts`).
--
-- target_type / target_id is a polymorphic pointer ("license" / "LZ-…",
-- "user" / "<userId>", "trial" / "<machine_id>", …) so a single table
-- covers every resource without per-resource history tables.
--
-- details is a JSON blob for action-specific context ({reason}, {old, new},
-- a dropped activation row, etc.). Stored as TEXT — D1 doesn't have a
-- native JSON type and JSON1 functions work on plain TEXT just fine.
CREATE TABLE `admin_audit_log` (
    `id` text PRIMARY KEY NOT NULL,
    `actor_email` text NOT NULL,
    `action` text NOT NULL,
    `target_type` text NOT NULL,
    `target_id` text NOT NULL,
    `details` text,
    `created_at` integer NOT NULL
);

CREATE INDEX `admin_audit_log_created_idx` ON `admin_audit_log` (`created_at` DESC);
CREATE INDEX `admin_audit_log_target_idx` ON `admin_audit_log` (`target_type`, `target_id`);
CREATE INDEX `admin_audit_log_actor_idx` ON `admin_audit_log` (`actor_email`);
