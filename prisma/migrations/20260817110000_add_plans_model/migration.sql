-- Create plans table
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "postsLimit" INTEGER,
    "connectedAccountsLimit" INTEGER,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- Seed the four default plans with fixed ids, matching the old hardcoded PLAN_DEFINITIONS
INSERT INTO "plans" ("id","name","price","postsLimit","connectedAccountsLimit","isCustom","isActive","createdAt","updatedAt") VALUES
  ('00000000-0000-0000-0000-000000000001','Free',0,20,2,false,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('00000000-0000-0000-0000-000000000002','Creator',15,NULL,5,false,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('00000000-0000-0000-0000-000000000003','Professional',49,NULL,15,false,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('00000000-0000-0000-0000-000000000004','Agency',199,NULL,100,false,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

-- Add the new FK column, backfill it from the old enum column, then enforce NOT NULL + FK
ALTER TABLE "subscriptions" ADD COLUMN "planId" TEXT;

UPDATE "subscriptions" SET "planId" = CASE "plan"
  WHEN 'FREE' THEN '00000000-0000-0000-0000-000000000001'
  WHEN 'CREATOR' THEN '00000000-0000-0000-0000-000000000002'
  WHEN 'PROFESSIONAL' THEN '00000000-0000-0000-0000-000000000003'
  WHEN 'AGENCY' THEN '00000000-0000-0000-0000-000000000004'
END;

ALTER TABLE "subscriptions" ALTER COLUMN "planId" SET NOT NULL;

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop the old enum column + type now that planId fully replaces it
ALTER TABLE "subscriptions" DROP COLUMN "plan";
DROP TYPE "SubscriptionPlan";

-- postsLimit is now a per-user override of the plan's own limit; null = use the plan's.
-- Existing values are kept as explicit overrides.
ALTER TABLE "subscriptions" ALTER COLUMN "postsLimit" DROP NOT NULL;
ALTER TABLE "subscriptions" ALTER COLUMN "postsLimit" DROP DEFAULT;

-- New per-user override for how many platforms/social accounts can be connected.
ALTER TABLE "subscriptions" ADD COLUMN "connectedAccountsLimit" INTEGER;
