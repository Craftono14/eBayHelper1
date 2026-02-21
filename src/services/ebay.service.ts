/**
 * eBay OAuth Integration with Database & Search Services
 * Real-world examples of using OAuth tokens with search operations
 */

import { PrismaClient } from '@prisma/client';
import {
  EbayOAuthConfig,
  OAuthTokens,
  makeAuthenticatedRequest,
} from '../utils/ebayOAuth';

const prisma = new PrismaClient();

// OAuth Configuration
const ebayConfig: EbayOAuthConfig = {
  clientId: process.env.EBAY_CLIENT_ID || '',
  clientSecret: process.env.EBAY_CLIENT_SECRET || '',
  redirectUri: process.env.EBAY_REDIRECT_URI || '',
  sandbox: process.env.EBAY_SANDBOX === 'true',
};

// ============================================================================
// EXAMPLE 1: Fetch eBay Deals and Store in Database
// ============================================================================

/**
 * Fetch eBay deals using the user's authenticated OAuth token
 * Then save matching items to their wishlist if they match saved searches
 */
export async function fetchAndSaveEbayDealsForUser(userId: number): Promise<void> {
  try {
    console.log(`Fetching eBay deals for user ${userId}...`);

    // Get user with their saved searches
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        savedSearches: {
          where: { isActive: true },
        },
      },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    if (!user.ebayAccessToken) {
      throw new Error(`User ${userId} is not authenticated with eBay`);
    }

    // Fetch deals from eBay API
    const dealsResponse = await makeAuthenticatedRequest<{
      deals: Array<{
        itemId: string;
        title: string;
        currentPrice: number;
        seller: string;
        location: string;
        url: string;
      }>;
    }>(
      'https://api.ebay.com/buy/deal/v1/deal',
      'GET',
      user.ebayAccessToken,
      ebayConfig,
      undefined,
      user.ebayRefreshToken || undefined,
      async (newTokens: OAuthTokens) => {
        // Update tokens in database if refreshed
        await prisma.user.update({
          where: { id: userId },
          data: {
            ebayAccessToken: newTokens.accessToken,
            ebayRefreshToken: newTokens.refreshToken,
            ebayTokenExpiry: newTokens.expiresAt,
          },
        });
      }
    );

    // Process each deal
    for (const deal of dealsResponse.deals) {
      for (const search of user.savedSearches) {
        // Check if deal matches search criteria
        const matches = await doesDealMatchSearch(deal, search);

        if (matches) {
          // Add to wishlist
          await prisma.wishlistItem.upsert({
            where: {
              userId_ebayItemId: {
                userId,
                ebayItemId: deal.itemId,
              },
            },
            update: {
              currentPrice: deal.currentPrice,
              lastCheckedAt: new Date(),
              updatedAt: new Date(),
            },
            create: {
              userId,
              searchId: search.id,
              ebayItemId: deal.itemId,
              itemTitle: deal.title,
              itemUrl: deal.url,
              currentPrice: deal.currentPrice,
              targetPrice: search.maxPrice || 0,
              seller: deal.seller,
              lowestPriceRecorded: deal.currentPrice,
              highestPriceRecorded: deal.currentPrice,
            },
          });

          // Record first price snapshot
          await prisma.itemHistory.create({
            data: {
              userId,
              wishlistItemId: 1, // Would be actual item ID
              price: deal.currentPrice,
              priceDropped: false,
            },
          });

          console.log(`✓ Added deal: ${deal.title} ($${deal.currentPrice})`);
        }
      }
    }

    // Update last synced time
    await prisma.user.update({
      where: { id: userId },
      data: { lastSyncedAt: new Date() },
    });

    console.log('✓ Deal sync completed for user', userId);
  } catch (error) {
    console.error('Failed to fetch and save eBay deals:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 2: Check Prices and Record History
// ============================================================================

/**
 * Check current prices for all items in user's wishlist
 * Records price history and detects price drops
 */
export async function checkAndRecordPrices(userId: number): Promise<void> {
  try {
    console.log(`Checking prices for user ${userId}...`);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        wishlistItems: {
          where: { isActive: true },
        },
      },
    });

    if (!user?.ebayAccessToken) {
      throw new Error(`User ${userId} is not authenticated`);
    }

    for (const item of user.wishlistItems) {
      try {
        // Fetch item details from eBay
        const itemDetails = await makeAuthenticatedRequest<{
          itemId: string;
          price: number;
          quantityAvailable: number;
          seller: {
            sellerAccountStatus: string;
            feedbackScore: number;
          };
        }>(
          `https://api.ebay.com/buy/browse/v1/item/${item.ebayItemId}`,
          'GET',
          user.ebayAccessToken,
          ebayConfig,
          undefined,
          user.ebayRefreshToken || undefined,
          async (newTokens: OAuthTokens) => {
            await prisma.user.update({
              where: { id: userId },
              data: {
                ebayAccessToken: newTokens.accessToken,
                ebayRefreshToken: newTokens.refreshToken,
                ebayTokenExpiry: newTokens.expiresAt,
              },
            });
          }
        );

        // Get previous price to detect drops
        const previousHistory = await prisma.itemHistory.findFirst({
          where: { wishlistItemId: item.id },
          orderBy: { recordedAt: 'desc' },
        });

        const previousPrice = previousHistory ? Number(previousHistory.price) : null;
        const priceDropped = previousPrice && itemDetails.price < previousPrice;
        const priceDropAmount = previousPrice
          ? Math.max(0, previousPrice - itemDetails.price)
          : null;

        // Record new price
        await prisma.itemHistory.create({
          data: {
            userId,
            wishlistItemId: item.id,
            price: itemDetails.price,
            priceDropped: priceDropped || false,
            priceDropAmount: priceDropAmount,
            quantityAvailable: itemDetails.quantityAvailable,
          },
        });

        // Update item current price
        await prisma.wishlistItem.update({
          where: { id: item.id },
          data: {
            currentPrice: itemDetails.price,
            lastCheckedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Log results
        if (priceDropped) {
          console.log(
            `↓ PRICE DROP: ${item.itemTitle} - $${previousPrice} → $${itemDetails.price} (saved $${priceDropAmount})`
          );
        } else {
          console.log(
            `  ${item.itemTitle} - $${itemDetails.price} (no change)`
          );
        }
      } catch (error) {
        console.error(`Failed to check price for item ${item.ebayItemId}:`, error);
        // Continue with next item
      }
    }

    console.log('✓ Price check completed');
  } catch (error) {
    console.error('Failed to check prices:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 3: Execute Saved Searches
// ============================================================================

/**
 * Execute a saved search using the eBay API
 * Automatically adds matching items to wishlist
 */
export async function executeSavedSearch(
  userId: number,
  searchId: number
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    const search = await prisma.savedSearch.findUnique({
      where: { id: searchId },
    });

    if (!user?.ebayAccessToken || !search) {
      throw new Error('Invalid user or search');
    }

    // Build search query
    const searchParams = new URLSearchParams();
    searchParams.append('q', search.searchKeywords);

    if (search.minPrice) searchParams.append('min_price', search.minPrice.toString());
    if (search.maxPrice) searchParams.append('max_price', search.maxPrice.toString());
    if (search.condition) searchParams.append('condition', search.condition);
    if (search.buyingFormat) searchParams.append('buying_format', search.buyingFormat);

    // Execute search
    const searchResults = await makeAuthenticatedRequest<{
      itemSummaries: Array<{
        itemId: string;
        title: string;
        price: { value: string };
        seller: { username: string };
        condition: string;
      }>;
    }>(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?${searchParams.toString()}`,
      'GET',
      user.ebayAccessToken,
      ebayConfig,
      undefined,
      user.ebayRefreshToken || undefined,
      async (newTokens: OAuthTokens) => {
        await prisma.user.update({
          where: { id: userId },
          data: {
            ebayAccessToken: newTokens.accessToken,
            ebayRefreshToken: newTokens.refreshToken,
            ebayTokenExpiry: newTokens.expiresAt,
          },
        });
      }
    );

    // Add matching items to wishlist
    const addedItems = [];
    for (const item of searchResults.itemSummaries || []) {
      const currentPrice = parseFloat(item.price.value);
      const targetPrice = search.maxPrice ? Number(search.maxPrice) : Infinity;

      // Only add if price is within target
      if (currentPrice <= targetPrice) {
        await prisma.wishlistItem.upsert({
          where: {
            userId_ebayItemId: {
              userId,
              ebayItemId: item.itemId,
            },
          },
          update: {
            currentPrice,
            lastCheckedAt: new Date(),
          },
          create: {
            userId,
            searchId,
            ebayItemId: item.itemId,
            itemTitle: item.title,
            currentPrice,
            targetPrice,
            seller: item.seller.username,
          },
        });

        addedItems.push({
          title: item.title,
          price: currentPrice,
        });
      }
    }

    // Update search last run time
    await prisma.savedSearch.update({
      where: { id: searchId },
      data: { lastRunAt: new Date() },
    });

    console.log(`✓ Search executed: Found ${addedItems.length} matching items`);
    addedItems.forEach((item) => {
      console.log(`  - ${item.title}: $${item.price}`);
    });
  } catch (error) {
    console.error('Failed to execute saved search:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 4: Send Price Drop Notifications
// ============================================================================

/**
 * Find recently dropped prices and send notifications
 * (Integration point for Discord notifications)
 */
export async function notifyPriceDrops(userId: number): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        itemHistories: {
          where: {
            recordedAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
            priceDropped: true,
            priceDropAmount: {
              gte: 10, // Only drops >= $10
            },
          },
          include: {
            wishlistItem: {
              include: {
                search: true,
              },
            },
          },
          orderBy: { priceDropAmount: 'desc' },
        },
      },
    });

    if (!user || user.itemHistories.length === 0) {
      console.log('No price drops to notify');
      return;
    }

    console.log(
      `\n🔔 Price Drop Notifications for ${user.username || user.discordId}:`
    );

    for (const history of user.itemHistories) {
      const item = history.wishlistItem;
      const search = item.search;

      const message = `
✓ ${item.itemTitle}
  From: $${Number(history.price) + (history.priceDropAmount ? Number(history.priceDropAmount) : 0)}
  To: $${Number(history.price)}
  Saved: $${history.priceDropAmount ? Number(history.priceDropAmount) : 0}
  Search: ${search?.name}
  Link: ${item.itemUrl}
      `.trim();

      console.log(message);

      // TODO: Send Discord notification here
      // await sendDiscordNotification(user.discordId, message);
    }
  } catch (error) {
    console.error('Failed to notify price drops:', error);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a deal matches user's search criteria
 */
async function doesDealMatchSearch(
  deal: {
    currentPrice: number;
    location: string;
  },
  search: any
): Promise<boolean> {
  // Check price range
  if (search.minPrice && deal.currentPrice < Number(search.minPrice)) {
    return false;
  }
  if (search.maxPrice && deal.currentPrice > Number(search.maxPrice)) {
    return false;
  }

  // Check location (if specified)
  if (search.itemLocation && deal.location !== search.itemLocation) {
    return false;
  }

  return true;
}

// ============================================================================
// SCHEDULED TASKS
// ============================================================================

/**
 * Run periodic tasks for all active users
 * Should be called by a scheduler (e.g., node-cron)
 */
export async function runScheduledTasks(): Promise<void> {
  console.log('Running scheduled OAuth/search tasks...');

  const users = await prisma.user.findMany({
    where: {
      ebayAccessToken: { not: null },
    },
  });

  for (const user of users) {
    try {
      // Check prices for active items
      await checkAndRecordPrices(user.id);

      // Execute active searches
      const searches = await prisma.savedSearch.findMany({
        where: { userId: user.id, isActive: true },
      });

      for (const search of searches) {
        await executeSavedSearch(user.id, search.id);
      }

      // Send notifications for price drops
      await notifyPriceDrops(user.id);
    } catch (error) {
      console.error(`Task failed for user ${user.id}:`, error);
    }
  }

  console.log('Scheduled tasks completed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  fetchAndSaveEbayDealsForUser,
  checkAndRecordPrices,
  executeSavedSearch,
  notifyPriceDrops,
  runScheduledTasks,
};
