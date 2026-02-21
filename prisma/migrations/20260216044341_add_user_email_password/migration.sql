-- CreateEnum
CREATE TYPE "BuyingFormat" AS ENUM ('Buy It Now', 'Auction', 'Both');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('New', 'Refurbished', 'Used', 'For parts or not working');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "ebayOAuthToken" TEXT,
    "ebayOAuthRefreshToken" TEXT,
    "ebayOAuthExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "searchKeywords" TEXT NOT NULL,
    "buyingFormat" TEXT,
    "categories" TEXT,
    "minPrice" DECIMAL(10,2),
    "maxPrice" DECIMAL(10,2),
    "condition" TEXT,
    "itemLocation" TEXT,
    "zipCode" TEXT,
    "authorizedSeller" BOOLEAN NOT NULL DEFAULT false,
    "completedItems" BOOLEAN NOT NULL DEFAULT false,
    "soldItems" BOOLEAN NOT NULL DEFAULT false,
    "freeReturns" BOOLEAN NOT NULL DEFAULT false,
    "returnsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "freeShipping" BOOLEAN NOT NULL DEFAULT false,
    "localPickup" BOOLEAN NOT NULL DEFAULT false,
    "arrivesIn24Days" BOOLEAN NOT NULL DEFAULT false,
    "dealsAndSavings" BOOLEAN NOT NULL DEFAULT false,
    "saleItems" BOOLEAN NOT NULL DEFAULT false,
    "listedAsLots" BOOLEAN NOT NULL DEFAULT false,
    "searchInDescription" BOOLEAN NOT NULL DEFAULT false,
    "benefitsCharity" BOOLEAN NOT NULL DEFAULT false,
    "psaVault" BOOLEAN NOT NULL DEFAULT false,
    "targetGlobalSites" TEXT,
    "notifyOnNewItems" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnPriceDrop" BOOLEAN NOT NULL DEFAULT true,
    "maxNotificationsPerDay" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "ebayItemId" TEXT NOT NULL,
    "itemTitle" TEXT,
    "itemUrl" TEXT,
    "searchId" INTEGER,
    "currentPrice" DECIMAL(10,2),
    "targetPrice" DECIMAL(10,2) NOT NULL,
    "lowestPriceRecorded" DECIMAL(10,2),
    "highestPriceRecorded" DECIMAL(10,2),
    "seller" TEXT,
    "sellerRating" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isPurchased" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_histories" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "wishlistItemId" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "priceDropped" BOOLEAN NOT NULL DEFAULT false,
    "priceDropAmount" DECIMAL(10,2),
    "quantityAvailable" INTEGER,
    "quantitySold" INTEGER,
    "currentBid" DECIMAL(10,2),
    "numberOfBids" INTEGER,
    "auctionEndsAt" TIMESTAMP(3),
    "shippingCost" DECIMAL(10,2),
    "handlingCost" DECIMAL(10,2),
    "shippingMethod" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_discordId_key" ON "users"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_discordId_idx" ON "users"("discordId");

-- CreateIndex
CREATE INDEX "saved_searches_userId_idx" ON "saved_searches"("userId");

-- CreateIndex
CREATE INDEX "saved_searches_isActive_idx" ON "saved_searches"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "saved_searches_userId_name_key" ON "saved_searches"("userId", "name");

-- CreateIndex
CREATE INDEX "wishlist_items_userId_idx" ON "wishlist_items"("userId");

-- CreateIndex
CREATE INDEX "wishlist_items_isActive_idx" ON "wishlist_items"("isActive");

-- CreateIndex
CREATE INDEX "wishlist_items_targetPrice_idx" ON "wishlist_items"("targetPrice");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_userId_ebayItemId_key" ON "wishlist_items"("userId", "ebayItemId");

-- CreateIndex
CREATE INDEX "item_histories_userId_idx" ON "item_histories"("userId");

-- CreateIndex
CREATE INDEX "item_histories_wishlistItemId_idx" ON "item_histories"("wishlistItemId");

-- CreateIndex
CREATE INDEX "item_histories_recordedAt_idx" ON "item_histories"("recordedAt");

-- CreateIndex
CREATE INDEX "item_histories_priceDropped_idx" ON "item_histories"("priceDropped");

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "saved_searches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_histories" ADD CONSTRAINT "item_histories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_histories" ADD CONSTRAINT "item_histories_wishlistItemId_fkey" FOREIGN KEY ("wishlistItemId") REFERENCES "wishlist_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
