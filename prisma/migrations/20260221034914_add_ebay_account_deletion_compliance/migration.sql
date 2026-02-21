-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ebay_account_deletions" (
    "id" SERIAL NOT NULL,
    "ebayUserId" TEXT NOT NULL,
    "deletionReason" TEXT NOT NULL,
    "deletionDate" TIMESTAMP(3) NOT NULL,
    "notificationId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ebay_account_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ebay_account_deletions_ebayUserId_key" ON "ebay_account_deletions"("ebayUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ebay_account_deletions_notificationId_key" ON "ebay_account_deletions"("notificationId");

-- CreateIndex
CREATE INDEX "ebay_account_deletions_ebayUserId_idx" ON "ebay_account_deletions"("ebayUserId");

-- CreateIndex
CREATE INDEX "ebay_account_deletions_processedAt_idx" ON "ebay_account_deletions"("processedAt");
