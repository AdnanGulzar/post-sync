/*
  Warnings:

  - Added the required column `updatedAt` to the `post_publish_results` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "PublishStatus" ADD VALUE 'RETRYING';

-- AlterTable
ALTER TABLE "post_publish_results" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "post_publish_results_status_nextRetryAt_idx" ON "post_publish_results"("status", "nextRetryAt");
