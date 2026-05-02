-- Add type column to feedback_post (bug | feature | praise; default feature for back-compat).
ALTER TABLE `feedback_post` ADD COLUMN `type` text NOT NULL DEFAULT 'feature';
CREATE INDEX `feedback_post_type_idx` ON `feedback_post` (`type`);
