-- Capture the Gumroad purchaser email at verify time so buyers who
-- sign in with the email they bought with are recognized as verified
-- buyers automatically — even if they never paste their license key
-- into the feedback flow.
ALTER TABLE `gumroad_license` ADD COLUMN `email` text;
CREATE INDEX `gumroad_license_email_idx` ON `gumroad_license` (`email`);
