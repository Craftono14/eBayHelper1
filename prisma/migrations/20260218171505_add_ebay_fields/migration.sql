/*
  Warnings:

  - You are about to drop the column `ebayOAuthExpiresAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `ebayOAuthRefreshToken` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `ebayOAuthToken` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,ebaySearchId]` on the table `saved_searches` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "saved_searches" ADD COLUMN     "ebaySearchId" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" DROP COLUMN "ebayOAuthExpiresAt",
DROP COLUMN "ebayOAuthRefreshToken",
DROP COLUMN "ebayOAuthToken",
ADD COLUMN     "ebayAccessToken" TEXT,
ADD COLUMN     "ebayRefreshToken" TEXT,
ADD COLUMN     "ebayTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "ebayUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "saved_searches_userId_ebaySearchId_key" ON "saved_searches"("userId", "ebaySearchId");
