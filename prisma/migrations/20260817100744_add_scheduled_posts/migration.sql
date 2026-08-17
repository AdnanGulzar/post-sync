-- AlterEnum
ALTER TYPE "PostStatus" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "scheduledAt" TIMESTAMP(3);
