/*
  Warnings:

  - A unique constraint covering the columns `[userId,ebayItemId]` on the table `wishlist_items` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_userId_ebayItemId_key" ON "wishlist_items"("userId", "ebayItemId");
