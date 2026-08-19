-- Destination type enum
CREATE TYPE "DestinationType" AS ENUM ('PERSONAL', 'PAGE', 'GROUP');

-- SocialAccount: add destinationType, backfill from existing data (Facebook rows
-- so far are always Pages; everything else so far is a personal account), then
-- relax the unique constraint so multiple destinations per platform can coexist.
ALTER TABLE "social_accounts" ADD COLUMN "destinationType" "DestinationType" NOT NULL DEFAULT 'PERSONAL';
UPDATE "social_accounts" SET "destinationType" = 'PAGE' WHERE "platform" = 'FACEBOOK';

DROP INDEX "social_accounts_userId_platform_key";
CREATE UNIQUE INDEX "social_accounts_userId_platform_platformUserId_key" ON "social_accounts"("userId", "platform", "platformUserId");

-- Post: track which specific destinations it targets, backfilled from the
-- 1-account-per-platform-per-user data that existed before this migration.
ALTER TABLE "posts" ADD COLUMN "destinationIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "posts" p
SET "destinationIds" = COALESCE((
  SELECT array_agg(sa.id)
  FROM "social_accounts" sa
  WHERE sa."userId" = p."userId" AND sa.platform = ANY(p.platforms)
), ARRAY[]::TEXT[]);

-- PostPublishResult: point at the specific destination instead of just a platform
-- (nullable since a result's account may since have been disconnected), backfilled
-- from the same 1-account-per-platform-per-user data, then relax the unique
-- constraint to allow more than one result per platform per post.
ALTER TABLE "post_publish_results" ADD COLUMN "socialAccountId" TEXT;
ALTER TABLE "post_publish_results" ADD COLUMN "destinationLabel" TEXT;

UPDATE "post_publish_results" r
SET "socialAccountId" = sa.id,
    "destinationLabel" = sa."platformUsername"
FROM "posts" p, "social_accounts" sa
WHERE r."postId" = p.id AND sa."userId" = p."userId" AND sa.platform = r.platform;

ALTER TABLE "post_publish_results" ADD CONSTRAINT "post_publish_results_socialAccountId_fkey"
  FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX "post_publish_results_postId_platform_key";
CREATE UNIQUE INDEX "post_publish_results_postId_socialAccountId_key" ON "post_publish_results"("postId", "socialAccountId");
