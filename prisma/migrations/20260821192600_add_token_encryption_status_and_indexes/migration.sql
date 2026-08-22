-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'NEEDS_RECONNECT');

-- AlterTable
ALTER TABLE "posts" ALTER COLUMN "destinationIds" DROP DEFAULT;

-- AlterTable
ALTER TABLE "social_accounts" ADD COLUMN     "keyVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "post_publish_results_postId_idx" ON "post_publish_results"("postId");

-- CreateIndex
CREATE INDEX "posts_status_scheduledAt_idx" ON "posts"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "posts_userId_idx" ON "posts"("userId");

-- CreateIndex
CREATE INDEX "social_accounts_userId_idx" ON "social_accounts"("userId");

-- CreateIndex
CREATE INDEX "social_accounts_status_tokenExpiresAt_idx" ON "social_accounts"("status", "tokenExpiresAt");
