/*
  Warnings:

  - A unique constraint covering the columns `[ebaySearchId]` on the table `saved_searches` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "saved_searches_userId_ebaySearchId_key";

-- DropIndex
DROP INDEX "wishlist_items_userId_ebayItemId_key";

-- AlterTable
ALTER TABLE "saved_searches" ADD COLUMN     "isEbayImported" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "wishlist_items" ADD COLUMN     "isEbayImported" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "ebayItemId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "saved_searches_ebaySearchId_key" ON "saved_searches"("ebaySearchId");
