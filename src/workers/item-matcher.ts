/**
 * Item Matcher Service
 * Compares search results against existing items to detect new matches
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { EbayItem } from '../services/ebay-browse.service';

export interface MatchResult {
  isNew: boolean;
  itemId: string;
  title: string;
  price: number;
  reason?: string; // Why this item is considered "new"
}

export interface SearchComparisonResult {
  searchId: number;
  searchName: string;
  totalResultsFound: number;
  newItemsFound: MatchResult[];
  itemsChecked: number;
  processingTimeMs: number;
}

/**
 * Find items that are new (not in wishlist) from search results
 */
export async function findNewItems(
  prisma: PrismaClient,
  userId: number,
  _searchId: number,
  items: EbayItem[],
  priceMinimum?: number,
  priceMaximum?: number
): Promise<MatchResult[]> {
  const startTime = Date.now();
  const newItems: MatchResult[] = [];

  // Get existing wishlist items for this user to check against
  const existingItems = await prisma.wishlistItem.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: {
      ebayItemId: true,
      itemTitle: true,
      currentPrice: true,
    },
  });

  // Create a set for O(1) lookup
  const existingItemIds = new Set(existingItems.map((item: any) => item.ebayItemId));

  // Check each result item
  for (const item of items) {
    // Skip if already in wishlist
    if (existingItemIds.has(item.itemId)) {
      continue;
    }

    const price = parseFloat(item.price.value);

    // Apply price filters if specified
    if (priceMinimum !== undefined && price < priceMinimum) {
      continue;
    }
    if (priceMaximum !== undefined && price > priceMaximum) {
      continue;
    }

    // This is a new item matching the search criteria
    newItems.push({
      isNew: true,
      itemId: item.itemId,
      title: item.title,
      price,
      reason: 'Item not in user wishlist',
    });
  }

  const processingTimeMs = Date.now() - startTime;

  console.log(
    `[itemMatcher] Found ${newItems.length} new items from ${items.length} results (${processingTimeMs}ms)`
  );

  return newItems;
}

/**
 * Save new items to wishlist and create price history
 */
export async function saveNewItems(
  prisma: PrismaClient,
  userId: number,
  searchId: number,
  newItems: MatchResult[]
): Promise<{ created: number; failed: number }> {
  let created = 0;
  let failed = 0;

  for (const item of newItems) {
    try {
      // Create wishlist item
      await prisma.wishlistItem.upsert({
        where: {
          userId_ebayItemId: {
            userId,
            ebayItemId: item.itemId,
          },
        },
        update: {
          // If it somehow exists, update the price and check time
          currentPrice: item.price,
          lastCheckedAt: new Date(),
        },
        create: {
          userId,
          searchId,
          ebayItemId: item.itemId,
          itemTitle: item.title,
          currentPrice: item.price,
          targetPrice: item.price,
          lastCheckedAt: new Date(),
        },
      });

      created++;
    } catch (error) {
      console.error(
        `[itemMatcher] Failed to save item ${item.itemId}:`,
        error
      );
      failed++;
    }
  }

  console.log(
    `[itemMatcher] Saved new items - Created: ${created}, Failed: ${failed}`
  );

  return { created, failed };
}

/**
 * Update price history for checked items
 */
export async function recordPriceHistory(
  prisma: PrismaClient,
  userId: number,
  wishlistItemId: number,
  items: EbayItem[]
): Promise<void> {
  for (const item of items) {
    const price = parseFloat(item.price.value);

    // Get the previous price to detect drops
    const previousHistory = await prisma.itemHistory.findFirst({
      where: {
        wishlistItemId,
      },
      orderBy: {
        recordedAt: 'desc',
      },
      take: 1,
      select: {
        price: true,
      },
    });

    const previousPrice = previousHistory?.price
      ? parseFloat(previousHistory.price.toString())
      : price;
    const priceDropped = price < previousPrice;
    const dropAmount = priceDropped ? previousPrice - price : undefined;

    try {
      await prisma.itemHistory.create({
        data: {
          userId,
          wishlistItemId,
          price: new Decimal(price),
          priceDropped,
          priceDropAmount: dropAmount ? new Decimal(dropAmount) : null,
          quantityAvailable: parseInt(item.buyingOptions?.[0] || '0'),
        },
      });
    } catch (error) {
      console.error(`[itemMatcher] Failed to record price history:`, error);
    }
  }
}

/**
 * Get statistics for a search run
 */
export async function getSearchStatistics(
  prisma: PrismaClient,
  searchId: number
): Promise<{
  itemCount: number;
  newItemsThisMonth: number;
  averagePrice: number;
  priceRange: { min: number; max: number };
}> {
  const wishlistItems = await prisma.wishlistItem.findMany({
    where: {
      searchId,
      isActive: true,
    },
    select: {
      currentPrice: true,
      createdAt: true,
    },
  });

  const prices = wishlistItems
    .map((item: any) => parseFloat(item.currentPrice?.toString() || '0'))
    .filter((price: number) => price > 0);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const newItemsThisMonth = wishlistItems.filter(
    (item: any) => item.createdAt > thirtyDaysAgo
  ).length;

  return {
    itemCount: wishlistItems.length,
    newItemsThisMonth,
    averagePrice: prices.length > 0 ? prices.reduce((a: number, b: number) => a + b) / prices.length : 0,
    priceRange: {
      min: prices.length > 0 ? Math.min(...prices) : 0,
      max: prices.length > 0 ? Math.max(...prices) : 0,
    },
  };
}
