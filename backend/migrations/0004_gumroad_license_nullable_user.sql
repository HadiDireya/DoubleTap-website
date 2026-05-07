-- Allow `gumroad_license.userId` to be NULL so /gumroad/webhook can
-- insert a row at the moment of sale, before the buyer has ever
-- created an account on the website. The email column (added in
-- 0003) carries the attribution; userId is set later when (and if)
-- the buyer signs in and either: (a) the email-match leg of
-- resolveVerifiedBuyers picks up the badge automatically, or (b) the
-- user pastes their key into /gumroad/verify and the route claims
-- the unclaimed row.
--
-- SQLite can't drop NOT NULL on an existing column in place, so
-- rebuild the table the standard way: copy out, drop, rename, redo
-- indexes. D1 wraps each migration in a transaction, so a partial
-- failure rolls back cleanly.
CREATE TABLE `gumroad_license_new` (
  `id` text PRIMARY KEY NOT NULL,
  `userId` text REFERENCES `user`(`id`) ON DELETE CASCADE,
  `licenseKey` text NOT NULL,
  `productId` text NOT NULL,
  `saleId` text,
  `email` text,
  `verifiedAt` integer NOT NULL
);

INSERT INTO `gumroad_license_new` (id, userId, licenseKey, productId, saleId, email, verifiedAt)
SELECT id, userId, licenseKey, productId, saleId, email, verifiedAt FROM `gumroad_license`;

DROP TABLE `gumroad_license`;
ALTER TABLE `gumroad_license_new` RENAME TO `gumroad_license`;

CREATE UNIQUE INDEX `gumroad_license_licenseKey_unique` ON `gumroad_license` (`licenseKey`);
CREATE INDEX `gumroad_license_email_idx` ON `gumroad_license` (`email`);
