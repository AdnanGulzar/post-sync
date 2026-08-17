-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "platforms" "SocialPlatform"[] DEFAULT ARRAY['LINKEDIN', 'FACEBOOK', 'X']::"SocialPlatform"[];
