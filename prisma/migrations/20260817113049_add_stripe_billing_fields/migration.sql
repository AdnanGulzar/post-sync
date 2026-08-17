-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "stripePriceId" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;
