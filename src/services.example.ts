// Example service layer functions for the eBay Tracker app
// This file demonstrates practical usage of the Prisma schema
// Note: This is example code - adapt types and implementations as needed for your project

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

// Type aliases for clarity (replace with proper Prisma-generated types in production)
type User = any;
type SavedSearch = any;
type WishlistItem = any;
type ItemHistory = any;

// Input data types
interface WishlistItemData {
  ebayItemId: string;
  itemTitle?: string;
  itemUrl?: string;
  currentPrice?: number;
  targetPrice: number;
  seller?: string;
  sellerRating?: number;
}

// ============================================================================
// USER SERVICES
// ============================================================================

/**
 * Find or create a user by Discord ID
 */
export async function findOrCreateUser(
  discordId: string,
  username?: string
): Promise<User> {
  return prisma.user.upsert({
    where: { discordId },
    update: { username },
    create: {
      discordId,
      username: username || discordId,
    },
  });
}

/**
 * Update user's eBay OAuth tokens
 */
export async function updateEbayTokens(
  userId: number,
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number
): Promise<User> {
  return prisma.user.update({
    where: { id: userId },
    data: {
      ebayAccessToken: accessToken,
      ebayRefreshToken: refreshToken,
      ebayTokenExpiry: new Date(Date.now() + expiresInSeconds * 1000),
      updatedAt: new Date(),
    },
  });
}

/**
 * Get user with all their saved searches and wishlist items
 */
export async function getUserWithData(userId: number): Promise<any> {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      savedSearches: {
        where: { isActive: true },
        include: {
          wishlistItems: {
            where: { isActive: true },
          },
        },
      },
      wishlistItems: {
        where: { isActive: true },
        include: {
          priceHistory: {
            take: 5,
            orderBy: { recordedAt: 'desc' },
          },
        },
      },
    },
  });
}

// ============================================================================
// SAVED SEARCH SERVICES
// ============================================================================

/**
 * Create a new saved search with filters
 */
export async function createSavedSearch(
  userId: number,
  data: {
    name: string;
    searchKeywords: string;
    minPrice?: number;
    maxPrice?: number;
    condition?: string;
    buyingFormat?: string;
    freeShipping?: boolean;
    authorizedSeller?: boolean;
    categories?: string[];
    targetGlobalSites?: string[];
  }
): Promise<SavedSearch> {
  return prisma.savedSearch.create({
    data: {
      userId,
      name: data.name,
      searchKeywords: data.searchKeywords,
      minPrice: data.minPrice,
      maxPrice: data.maxPrice,
      condition: data.condition,
      buyingFormat: data.buyingFormat,
      freeShipping: data.freeShipping || false,
      authorizedSeller: data.authorizedSeller || false,
      categories: data.categories ? JSON.stringify(data.categories) : null,
      targetGlobalSites: data.targetGlobalSites
        ? JSON.stringify(data.targetGlobalSites)
        : JSON.stringify(['EBAY-US']),
      notifyOnNewItems: true,
      notifyOnPriceDrop: true,
    },
  });
}

/**
 * Get all active searches for a user
 */
export async function getUserActiveSearches(userId: number): Promise<any> {
  return prisma.savedSearch.findMany({
    where: {
      userId,
      isActive: true,
    },
    include: {
      wishlistItems: {
        where: { isActive: true },
      },
    },
    orderBy: { lastRunAt: { sort: 'desc', nulls: 'last' } },
  });
}

/**
 * Update search and mark as last run
 */
export async function updateSearchLastRun(searchId: number): Promise<SavedSearch> {
  return prisma.savedSearch.update({
    where: { id: searchId },
    data: {
      lastRunAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

/**
 * Deactivate a saved search
 */
export async function deactivateSavedSearch(searchId: number): Promise<SavedSearch> {
  return prisma.savedSearch.update({
    where: { id: searchId },
    data: {
      isActive: false,
      updatedAt: new Date(),
    },
  });
}

// ============================================================================
// WISHLIST ITEM SERVICES
// ============================================================================

interface WishlistItemData {
  ebayItemId: string;
  searchId?: number;
  itemTitle?: string;
  itemUrl?: string;
  currentPrice?: number;
  targetPrice: number;
  seller?: string;
  sellerRating?: number;
}

/**
 * Add or update a wishlist item
 */
export async function upsertWishlistItem(userId: number, data: WishlistItemData): Promise<WishlistItem> {
  return prisma.wishlistItem.upsert({
    where: {
      userId_ebayItemId: {
        userId,
        ebayItemId: data.ebayItemId,
      },
    },
    update: {
      currentPrice: data.currentPrice || null,
      itemTitle: data.itemTitle,
      itemUrl: data.itemUrl,
      seller: data.seller,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    },
    create: {
      userId,
      ebayItemId: data.ebayItemId,
      searchId: data.searchId,
      itemTitle: data.itemTitle,
      itemUrl: data.itemUrl,
      currentPrice: data.currentPrice || null,
      targetPrice: data.targetPrice,
      seller: data.seller,
      sellerRating: data.sellerRating,
      lowestPriceRecorded: data.currentPrice || null,
      highestPriceRecorded: data.currentPrice || null,
    },
  });
}

/**
 * Get all items where current price is below target price
 */
export async function findBargainItems(userId: number): Promise<WishlistItem[]> {
  return prisma.wishlistItem.findMany({
    where: {
      userId,
      isActive: true,
      currentPrice: {
        lte: 99999, // Note: for real implementation, use raw query
      },
    },
    orderBy: {
      currentPrice: 'asc',
    },
  });
}

/**
 * Get items sorted by price drop potential
 */
export async function findItemsWithPriceDropTrend(userId: number, daysToAnalyze: number = 7): Promise<any> {
  const startDate = new Date(Date.now() - daysToAnalyze * 24 * 60 * 60 * 1000);

  return prisma.wishlistItem.findMany({
    where: {
      userId,
      isActive: true,
      priceHistory: {
        some: {
          recordedAt: { gte: startDate },
          priceDropped: true,
        },
      },
    },
    include: {
      priceHistory: {
        where: { recordedAt: { gte: startDate } },
        orderBy: { recordedAt: 'desc' },
      },
    },
  });
}

/**
 * Mark item as purchased
 */
export async function markItemAsPurchased(itemId: number): Promise<WishlistItem> {
  return prisma.wishlistItem.update({
    where: { id: itemId },
    data: {
      isPurchased: true,
      isActive: false,
      updatedAt: new Date(),
    },
  });
}

/**
 * Mark item as won (for auctions)
 */
export async function markItemAsWon(itemId: number): Promise<WishlistItem> {
  return prisma.wishlistItem.update({
    where: { id: itemId },
    data: {
      isWon: true,
      updatedAt: new Date(),
    },
  });
}

// ============================================================================
// ITEM HISTORY SERVICES
// ============================================================================

interface PriceHistoryData {
  price: number;
  currentBid?: number;
  numberOfBids?: number;
  quantityAvailable?: number;
  shippingCost?: number;
  shippingMethod?: string;
}

/**
 * Record a price snapshot for an item
 */
export async function recordPriceHistory(
  userId: number,
  wishlistItemId: number,
  data: PriceHistoryData
): Promise<ItemHistory> {
  // Get the previous price to detect drops
  const previousHistory = await prisma.itemHistory.findFirst({
    where: { wishlistItemId },
    orderBy: { recordedAt: 'desc' },
  });

  const newPrice = new Decimal(data.price);
  const previousPrice = previousHistory ? new Decimal(previousHistory.price.toString()) : null;

  const priceDropped = previousPrice ? newPrice.lessThan(previousPrice) : false;
  const priceDropAmount = previousPrice ? previousPrice.minus(newPrice) : null;

  // Create history record
  const history = await prisma.itemHistory.create({
    data: {
      userId,
      wishlistItemId,
      price: data.price,
      priceDropped,
      priceDropAmount: priceDropAmount ? parseFloat(priceDropAmount.toString()) : null,
      currentBid: data.currentBid || null,
      numberOfBids: data.numberOfBids,
      quantityAvailable: data.quantityAvailable,
      shippingCost: data.shippingCost || null,
      shippingMethod: data.shippingMethod,
    },
  });

  // Update wishlist item's current price and tracking data
  const updateData: any = {
    currentPrice: data.price,
    lastCheckedAt: new Date(),
    updatedAt: new Date(),
  };

  // Update lowest/highest price records
  if (previousPrice) {
    if (newPrice.lessThan(previousPrice)) {
      updateData.lowestPriceRecorded = data.price;
    }
    if (newPrice.greaterThan(previousPrice)) {
      updateData.highestPriceRecorded = data.price;
    }
  }

  await prisma.wishlistItem.update({
    where: { id: wishlistItemId },
    data: updateData,
  });

  return history;
}

/**
 * Get price history for an item
 */
export async function getItemPriceHistory(itemId: number, limit: number = 30): Promise<ItemHistory[]> {
  return prisma.itemHistory.findMany({
    where: { wishlistItemId: itemId },
    orderBy: { recordedAt: 'desc' },
    take: limit,
  });
}

/**
 * Get price statistics for an item
 */
export async function getItemPriceStats(itemId: number): Promise<any> {
  const stats = await prisma.itemHistory.aggregate({
    where: { wishlistItemId: itemId },
    _avg: { price: true },
    _min: { price: true },
    _max: { price: true },
    _count: true,
  });

  const history = await prisma.itemHistory.findMany({
    where: { wishlistItemId: itemId },
    orderBy: { recordedAt: 'desc' },
    take: 1,
  });

  return {
    averagePrice: stats._avg.price,
    lowestPrice: stats._min.price,
    highestPrice: stats._max.price,
    recordCount: stats._count,
    currentPrice: history[0]?.price || null,
    lastUpdated: history[0]?.recordedAt || null,
  };
}

/**
 * Find recent price drops across all user's items
 */
export async function findRecentPriceDrops(
  userId: number,
  hoursBack: number = 24,
  minimumDropAmount: number = 10
): Promise<any> {
  const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  return prisma.itemHistory.findMany({
    where: {
      userId,
      recordedAt: { gte: startTime },
      priceDropped: true,
      priceDropAmount: {
        gte: minimumDropAmount,
      },
    },
    include: {
      wishlistItem: true,
    },
    orderBy: { priceDropAmount: 'desc' },
  });
}

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

/**
 * Get user statistics
 */
export async function getUserStats(userId: number): Promise<{ savedSearchesCount: number; wishlistItemsCount: number; priceHistoryRecordsCount: number }> {
  const [searches, items, history] = await Promise.all([
    prisma.savedSearch.count({
      where: { userId, isActive: true },
    }),
    prisma.wishlistItem.count({
      where: { userId, isActive: true },
    }),
    prisma.itemHistory.count({
      where: { userId },
    }),
  ]);

  return {
    savedSearchesCount: searches,
    wishlistItemsCount: items,
    priceHistoryRecordsCount: history,
  };
}

/**
 * Get dashboard summary for user
 */
export async function getDashboardSummary(userId: number): Promise<any> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  const bargains = await prisma.wishlistItem.count({
    where: {
      userId,
      isActive: true,
    },
  });

  const recentDrops = await prisma.itemHistory.count({
    where: {
      userId,
      recordedAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
      priceDropped: true,
    },
  });

  const stats = await getUserStats(userId);

  return {
    user: {
      username: user?.username,
      discordId: user?.discordId,
      lastSynced: user?.lastSyncedAt,
    },
    stats,
    bargainsAvailable: bargains,
    recentPriceDrops: recentDrops,
  };
}

// ============================================================================
// CLEANUP & MAINTENANCE
// ============================================================================

/**
 * Remove old price history records (older than X days)
 */
export async function cleanupOldHistory(daysToKeep: number = 90): Promise<{ count: number }> {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

  return prisma.itemHistory.deleteMany({
    where: {
      recordedAt: { lt: cutoffDate },
    },
  });
}

/**
 * Deactivate inactive items (not checked in X days)
 */
export async function deactivateStaleItems(daysInactive: number = 30): Promise<{ count: number }> {
  const cutoffDate = new Date(Date.now() - daysInactive * 24 * 60 * 60 * 1000);

  return prisma.wishlistItem.updateMany({
    where: {
      lastCheckedAt: { lt: cutoffDate },
      isActive: true,
    },
    data: {
      isActive: false,
      updatedAt: new Date(),
    },
  });
}

// ============================================================================
// EXPORT ALL SERVICES
// ============================================================================

export default {
  // User
  findOrCreateUser,
  updateEbayTokens,
  getUserWithData,
  // Search
  createSavedSearch,
  getUserActiveSearches,
  updateSearchLastRun,
  deactivateSavedSearch,
  // Wishlist
  upsertWishlistItem,
  findBargainItems,
  findItemsWithPriceDropTrend,
  markItemAsPurchased,
  markItemAsWon,
  // History
  recordPriceHistory,
  getItemPriceHistory,
  getItemPriceStats,
  findRecentPriceDrops,
  // Analytics
  getUserStats,
  getDashboardSummary,
  // Maintenance
  cleanupOldHistory,
  deactivateStaleItems,
};
