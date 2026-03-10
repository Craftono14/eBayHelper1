-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "notificationPreference" TEXT NOT NULL DEFAULT 'DISCORD',
  ADD COLUMN "pushoverUserKey" TEXT,
  ADD COLUMN "pushoverDevice" TEXT;
