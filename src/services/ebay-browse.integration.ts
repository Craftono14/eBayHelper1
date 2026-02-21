/**
 * eBay Browse API Integration Examples
 * Real-world patterns for using EbayBrowseService in production
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { createEbayBrowseService } from './ebay-browse.service';
import { makeAuthenticatedRequest, OAuthTokens } from '../utils/ebayOAuth';

const prisma = new PrismaClient();

// ============================================================================
// EXAMPLE 1: Search & Save to Database
// ============================================================================

/**
 * Search for items and save results to database
 * Useful for periodic searches for tracking
 */
export async function searchAndSaveResults(
  userId: number,
  searchId: number,
  keywords: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user?.ebayAccessToken) {
    throw new Error('User not authenticated with eBay');
  }

  const service = createEbayBrowseService({
    accessToken: user.ebayAccessToken,
    sandbox: process.env.EBAY_SANDBOX === 'true',
  });

  console.log(`[searchAndSaveResults] Starting search for user ${userId}`);

  try {
    const results = await service.searchItems({
      keywords,
      globalSiteId: 'EBAY_US',
      limit: 100,
    });

    console.log(
      `[searchAndSaveResults] Found ${results.itemSummaries.length} items`
    );

    // Save each result to wishlist
    for (const item of results.itemSummaries) {
      await prisma.wishlistItem.upsert({
        where: {
          userId_ebayItemId: {
            userId,
            ebayItemId: item.itemId,
          },
        },
        update: {
          currentPrice: item.price?.value ? parseFloat(item.price.value) : undefined,
          lastCheckedAt: new Date(),
        },
        create: {
          userId,
          searchId,
          ebayItemId: item.itemId,
          itemTitle: item.title,
          currentPrice: item.price?.value ? parseFloat(item.price.value) : undefined,
          targetPrice: item.price?.value ? parseFloat(item.price.value) : 0,
          seller: item.seller?.username,
          itemUrl: item.itemHref || '',
          lastCheckedAt: new Date(),
        },
      });
    }

    // Update search metadata
    await prisma.savedSearch.update({
      where: { id: searchId },
      data: {
        lastRunAt: new Date(),
      },
    });

    console.log(`[searchAndSaveResults] Saved ${results.itemSummaries.length} items`);
  } catch (error) {
    console.error('[searchAndSaveResults] Error:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 2: Find Items in Price Range
// ============================================================================

/**
 * Find items within user's budget and save to wishlist
 */
export async function findItemsInBudget(
  userId: number,
  keywords: string,
  minPrice: number,
  maxPrice: number
): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user?.ebayAccessToken) {
    throw new Error('User not authenticated');
  }

  const service = createEbayBrowseService({
    accessToken: user.ebayAccessToken,
    sandbox: process.env.EBAY_SANDBOX === 'true',
  });

  console.log(
    `[findItemsInBudget] Searching for "${keywords}" in range $${minPrice}-$${maxPrice}`
  );

  try {
    const results = await service.searchItemsByPrice(
      keywords,
      'EBAY_US',
      minPrice,
      maxPrice,
      100
    );

    let addedCount = 0;

    for (const item of results.itemSummaries) {
      const itemPrice = parseFloat(item.price.value);

      // Add to wishlist if not already there
      const wishlistItem = await prisma.wishlistItem.upsert({
        where: {
          userId_ebayItemId: {
            userId,
            ebayItemId: item.itemId,
          },
        },
        update: {
          currentPrice: itemPrice,
          lastCheckedAt: new Date(),
        },
        create: {
          userId,
          ebayItemId: item.itemId,
          itemTitle: item.title,
          itemUrl: item.itemHref,
          currentPrice: itemPrice,
          targetPrice: maxPrice,
          lowestPriceRecorded: itemPrice,
          highestPriceRecorded: itemPrice,
          seller: item.seller.username,
          sellerRating: item.seller.feedbackScore,
        },
      });

      if (wishlistItem.createdAt === wishlistItem.updatedAt) {
        addedCount++;
      }
    }

    console.log(`[findItemsInBudget] Added ${addedCount} new items to wishlist`);
    return addedCount;
  } catch (error) {
    console.error('[findItemsInBudget] Error:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 3: Compare Prices Across Markets
// ============================================================================

/**
 * Search the same item on different eBay markets and show price comparison
 */
export async function comparePricesAcrossMarkets(
  userId: number,
  keywords: string
): Promise<Record<string, any>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user?.ebayAccessToken) {
    throw new Error('User not authenticated');
  }

  const service = createEbayBrowseService({
    accessToken: user.ebayAccessToken,
    sandbox: process.env.EBAY_SANDBOX === 'true',
  });

  const markets = ['EBAY_US', 'EBAY_GB', 'EBAY_DE', 'EBAY_AU'];
  const comparison: Record<string, any> = {
    keywords,
    markets: {},
  };

  console.log(`[comparePricesAcrossMarkets] Comparing "${keywords}" on ${markets.join(', ')}`);

  for (const market of markets) {
    try {
      const results = await service.searchItems({
        keywords,
        globalSiteId: market,
        limit: 5,
      });

      if (results.itemSummaries.length > 0) {
        const item = results.itemSummaries[0];
        comparison.markets[market] = {
          price: item.price.value,
          currency: item.price.currency,
          title: item.title,
          seller: item.seller.username,
          condition: item.condition,
          url: item.itemHref,
        };
      }
    } catch (error) {
      console.error(`[comparePricesAcrossMarkets] Error for ${market}:`, error);
      comparison.markets[market] = { error: (error as Error).message };
    }
  }

  return comparison;
}

// ============================================================================
// EXAMPLE 4: Track Price Changes for Wishlist Items
// ============================================================================

/**
 * Check current prices for all items in user's wishlist
 * Detect price drops and record history
 */
export async function trackWishlistPriceChanges(userId: number): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      wishlistItems: {
        where: { isActive: true },
        take: 100, // Limit to prevent too many API calls
      },
    },
  });

  if (!user?.ebayAccessToken) {
    console.log(`[trackWishlistPriceChanges] User ${userId} not authenticated`);
    return;
  }

  const service = createEbayBrowseService({
    accessToken: user.ebayAccessToken,
    sandbox: process.env.EBAY_SANDBOX === 'true',
  });

  console.log(
    `[trackWishlistPriceChanges] Checking ${user.wishlistItems.length} items for user ${userId}`
  );

  let priceDropCount = 0;
  let errorCount = 0;

  for (const item of user.wishlistItems) {
    try {
      // Skip items without eBay item IDs (local-only items)
      if (!item.ebayItemId) {
        continue;
      }
      
      const details = await service.getItem(item.ebayItemId, 'EBAY_US');
      const newPrice = parseFloat(details.price.value);
      const oldPrice = item.currentPrice ? parseFloat(item.currentPrice.toString()) : null;

      // Detect price drop
      const priceDropped = oldPrice && newPrice < oldPrice;
      const priceDropAmount = priceDropped
        ? parseFloat((oldPrice! - newPrice).toFixed(2))
        : null;

      // Update item
      await prisma.wishlistItem.update({
        where: { id: item.id },
        data: {
          currentPrice: newPrice,
          lowestPriceRecorded:
            item.lowestPriceRecorded && newPrice < parseFloat(item.lowestPriceRecorded.toString())
              ? newPrice
              : item.lowestPriceRecorded,
          highestPriceRecorded:
            item.highestPriceRecorded && newPrice > parseFloat(item.highestPriceRecorded.toString())
              ? newPrice
              : item.highestPriceRecorded,
          lastCheckedAt: new Date(),
        },
      });

      // Record history
      await prisma.itemHistory.create({
        data: {
          userId,
          wishlistItemId: item.id,
          price: newPrice,
          priceDropped: priceDropped || false,
          priceDropAmount: priceDropAmount,
          quantityAvailable: 0, // Would parse from API if available
        },
      });

      if (priceDropped) {
        console.log(
          `  ↓ ${item.itemTitle}: $${oldPrice} → $${newPrice} (saved $${priceDropAmount})`
        );
        priceDropCount++;
      }
    } catch (error) {
      console.error(
        `[trackWishlistPriceChanges] Error checking item ${item.ebayItemId}:`,
        error
      );
      errorCount++;
    }
  }

  console.log(
    `[trackWishlistPriceChanges] Complete: ${priceDropCount} drops detected, ${errorCount} errors`
  );
}

// ============================================================================
// EXAMPLE 5: Token Refresh During API Call
// ============================================================================

/**
 * Demonstrate automatic token refresh on 401 error
 */
export async function searchWithTokenRefresh(
  userId: number,
  keywords: string
): Promise<any> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user?.ebayAccessToken) {
    throw new Error('User not authenticated');
  }

  const service = createEbayBrowseService({
    accessToken: user.ebayAccessToken,
    sandbox: process.env.EBAY_SANDBOX === 'true',
  });

  try {
    console.log(`[searchWithTokenRefresh] Searching for "${keywords}"`);
    return await service.searchItems({
      keywords,
      globalSiteId: 'EBAY_US',
      limit: 50,
    });
  } catch (error) {
    // Check if it's a 401 Unauthorized (token expired)
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      console.log('[searchWithTokenRefresh] Token expired, refreshing...');

      if (!user.ebayRefreshToken) {
        throw new Error('No refresh token available, user must re-authenticate');
      }

      // Use existing OAuth utilities to refresh
      const ebayConfig = {
        clientId: process.env.EBAY_CLIENT_ID || '',
        clientSecret: process.env.EBAY_CLIENT_SECRET || '',
        redirectUri: process.env.EBAY_REDIRECT_URI || '',
        sandbox: process.env.EBAY_SANDBOX === 'true',
      };

      try {
        // Refresh token
        const newTokens = await makeAuthenticatedRequest<OAuthTokens>(
          'https://api.ebay.com/identity/v1/oauth2/token',
          'POST',
          user.ebayAccessToken,
          ebayConfig,
          {
            grant_type: 'refresh_token',
            refresh_token: user.ebayRefreshToken || '',
          }
        );

        // Update database
        await prisma.user.update({
          where: { id: userId },
          data: {
            ebayAccessToken: newTokens.accessToken,
            ebayRefreshToken: newTokens.refreshToken,
            ebayTokenExpiry: newTokens.expiresAt,
          },
        });

        console.log('[searchWithTokenRefresh] Token refreshed successfully');

        // Update service with new token
        service.updateAccessToken(newTokens.accessToken);

        // Retry the search
        return await service.searchItems({
          keywords,
          globalSiteId: 'EBAY_US',
          limit: 50,
        });
      } catch (refreshError) {
        console.error('[searchWithTokenRefresh] Token refresh failed:', refreshError);
        throw new Error('Token refresh failed, user must re-authenticate');
      }
    }

    throw error;
  }
}

// ============================================================================
// EXAMPLE 6: Batch Search Multiple Keywords
// ============================================================================

/**
 * Search for multiple keywords and save all results
 */
export async function batchSearchKeywords(
  userId: number,
  keywords: string[]
): Promise<Map<string, number>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user?.ebayAccessToken) {
    throw new Error('User not authenticated');
  }

  const service = createEbayBrowseService({
    accessToken: user.ebayAccessToken,
    sandbox: process.env.EBAY_SANDBOX === 'true',
  });

  const results = new Map<string, number>();

  console.log(
    `[batchSearchKeywords] Starting batch search for ${keywords.length} keywords`
  );

  for (const keyword of keywords) {
    try {
      const searchResults = await service.searchItems({
        keywords: keyword,
        globalSiteId: 'EBAY_US',
        limit: 50,
      });

      results.set(keyword, searchResults.total);

      console.log(
        `  "${keyword}": Found ${searchResults.itemSummaries.length} items (${searchResults.total} total)`
      );

      // Small delay between requests (be nice to the API)
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`  "${keyword}": Error -`, (error as Error).message);
      results.set(keyword, 0);
    }
  }

  console.log('[batchSearchKeywords] Batch search complete');
  return results;
}

// ============================================================================
// EXAMPLE 7: Search & Generate Price Analytics
// ============================================================================

/**
 * Search for items and analyze price distribution
 */
export async function analyzePriceDistribution(
  userId: number,
  keywords: string
): Promise<{
  average: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user?.ebayAccessToken) {
    throw new Error('User not authenticated');
  }

  const service = createEbayBrowseService({
    accessToken: user.ebayAccessToken,
    sandbox: process.env.EBAY_SANDBOX === 'true',
  });

  console.log(`[analyzePriceDistribution] Analyzing prices for "${keywords}"`);

  const results = await service.searchItems({
    keywords,
    globalSiteId: 'EBAY_US',
    limit: 100,
  });

  const prices = results.itemSummaries
    .map((item) => parseFloat(item.price.value))
    .sort((a, b) => a - b);

  const average = prices.reduce((a, b) => a + b, 0) / prices.length;
  const median = prices[Math.floor(prices.length / 2)];
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  // Calculate standard deviation
  const squaredDiffs = prices.map((price) => Math.pow(price - average, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / prices.length;
  const stdDev = Math.sqrt(avgSquaredDiff);

  console.log(`[analyzePriceDistribution] Results:
    Average: $${average.toFixed(2)}
    Median: $${median.toFixed(2)}
    Range: $${min.toFixed(2)} - $${max.toFixed(2)}
    Std Dev: $${stdDev.toFixed(2)}`);

  return {
    average,
    median,
    min,
    max,
    stdDev,
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  searchAndSaveResults,
  findItemsInBudget,
  comparePricesAcrossMarkets,
  trackWishlistPriceChanges,
  searchWithTokenRefresh,
  batchSearchKeywords,
  analyzePriceDistribution,
};
