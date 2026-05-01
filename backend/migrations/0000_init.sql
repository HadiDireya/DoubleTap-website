-- Better Auth core tables ----------------------------------------------------

CREATE TABLE `user` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `emailVerified` integer NOT NULL DEFAULT 0,
  `image` text,
  `createdAt` integer NOT NULL,
  `updatedAt` integer NOT NULL
);
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);

CREATE TABLE `session` (
  `id` text PRIMARY KEY NOT NULL,
  `expiresAt` integer NOT NULL,
  `token` text NOT NULL,
  `createdAt` integer NOT NULL,
  `updatedAt` integer NOT NULL,
  `ipAddress` text,
  `userAgent` text,
  `userId` text NOT NULL,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);

CREATE TABLE `account` (
  `id` text PRIMARY KEY NOT NULL,
  `accountId` text NOT NULL,
  `providerId` text NOT NULL,
  `userId` text NOT NULL,
  `accessToken` text,
  `refreshToken` text,
  `idToken` text,
  `accessTokenExpiresAt` integer,
  `refreshTokenExpiresAt` integer,
  `scope` text,
  `password` text,
  `createdAt` integer NOT NULL,
  `updatedAt` integer NOT NULL,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE TABLE `verification` (
  `id` text PRIMARY KEY NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expiresAt` integer NOT NULL,
  `createdAt` integer,
  `updatedAt` integer
);

-- App tables -----------------------------------------------------------------

CREATE TABLE `gumroad_license` (
  `id` text PRIMARY KEY NOT NULL,
  `userId` text NOT NULL,
  `licenseKey` text NOT NULL,
  `productId` text NOT NULL,
  `saleId` text,
  `verifiedAt` integer NOT NULL,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `gumroad_license_licenseKey_unique` ON `gumroad_license` (`licenseKey`);

CREATE TABLE `feedback_post` (
  `id` text PRIMARY KEY NOT NULL,
  `userId` text NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `status` text NOT NULL DEFAULT 'open',
  `createdAt` integer NOT NULL,
  `updatedAt` integer NOT NULL,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
CREATE INDEX `feedback_post_status_idx` ON `feedback_post` (`status`);
CREATE INDEX `feedback_post_user_idx` ON `feedback_post` (`userId`);

CREATE TABLE `feedback_vote` (
  `id` text PRIMARY KEY NOT NULL,
  `postId` text NOT NULL,
  `userId` text NOT NULL,
  `createdAt` integer NOT NULL,
  FOREIGN KEY (`postId`) REFERENCES `feedback_post`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `feedback_vote_post_user_unique` ON `feedback_vote` (`postId`, `userId`);

CREATE TABLE `feedback_comment` (
  `id` text PRIMARY KEY NOT NULL,
  `postId` text NOT NULL,
  `userId` text NOT NULL,
  `body` text NOT NULL,
  `createdAt` integer NOT NULL,
  `updatedAt` integer NOT NULL,
  FOREIGN KEY (`postId`) REFERENCES `feedback_post`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
CREATE INDEX `feedback_comment_post_idx` ON `feedback_comment` (`postId`);
