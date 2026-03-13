/**
 * Search Worker Service
 * Orchestrates periodic eBay searches with rate limit handling
 */

import { PrismaClient } from '@prisma/client';
import { createEbayBrowseService, EbayBrowseService, EbayItem } from '../services/ebay-browse.service';
import { ebaySyncService } from '../services/ebaySync.service';
import { sendNewItemNotificationPushover } from '../services/pushover-notification';
import {
  findNewItems,
  saveNewItems,
  getSearchStatistics,
  MatchResult,
  SearchComparisonResult,
} from './item-matcher';

export interface WorkerConfig {
  accessToken: string;
  sandbox?: boolean;
  maxConcurrentRequests?: number;
  delayBetweenRequestsMs?: number;
  maxSearchesPerRun?: number;
  autoAddSearchResultsToWishlist?: boolean;
}

export interface WorkerStats {
  totalSearches: number;
  completedSearches: number;
  failedSearches: number;
  newItemsFound: number;
  totalItemsProcessed: number;
  rateLimitHits: number;
  durationMs: number;
}

/**
 * Manages batch processing of searches with rate limit awareness
 */
export class SearchWorker {
  private prisma: PrismaClient;
  private service: EbayBrowseService;
  private config: WorkerConfig;
  private stats: WorkerStats = {
    totalSearches: 0,
    completedSearches: 0,
    failedSearches: 0,
    newItemsFound: 0,
    totalItemsProcessed: 0,
    rateLimitHits: 0,
    durationMs: 0,
  };

  constructor(prisma: PrismaClient, config: WorkerConfig) {
    this.prisma = prisma;
    this.config = {
      maxConcurrentRequests: 3,
      delayBetweenRequestsMs: 500,
      maxSearchesPerRun: 50,
      autoAddSearchResultsToWishlist: false,
      ...config,
    };

    this.service = createEbayBrowseService({
      accessToken: config.accessToken,
      sandbox: config.sandbox || false,
    });
  }

  /**
   * Run a complete search cycle for all active saved searches
   */
  async runSearchCycle(): Promise<WorkerStats> {
    const startTime = Date.now();
    console.log('[searchWorker] Starting search cycle...');

    try {
      // Fetch all active searches
      const searches = await this.prisma.savedSearch.findMany({
        where: { isActive: true, notifyOnNewItems: true },
        include: { user: true },
        take: this.config.maxSearchesPerRun,
      });

      this.stats.totalSearches = searches.length;
      console.log(`[searchWorker] Found ${searches.length} active searches`);

      // Process searches with batching and rate limit awareness
      const results = await this.processSearchesBatch(searches);

      this.stats.newItemsFound = results.reduce((sum, r) => sum + r.newItemsFound.length, 0);
      this.stats.totalItemsProcessed = results.reduce((sum, r) => sum + r.totalResultsFound, 0);

      await this.syncWatchlistsForPriceAlerts();

      console.log(
        `[searchWorker] Cycle complete - Completed: ${this.stats.completedSearches}/${this.stats.totalSearches}, New items: ${this.stats.newItemsFound}`
      );
    } catch (error) {
      console.error('[searchWorker] Error during search cycle:', error);
    }

    this.stats.durationMs = Date.now() - startTime;
    return this.stats;
  }

  /**
   * Process searches in batches with rate limit handling
   */
  private async processSearchesBatch(
    searches: any[]
  ): Promise<SearchComparisonResult[]> {
    const results: SearchComparisonResult[] = [];
    const batchSize = this.config.maxConcurrentRequests || 3;

    for (let i = 0; i < searches.length; i += batchSize) {
      const batch = searches.slice(i, i + batchSize);
      console.log(
        `[searchWorker] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(searches.length / batchSize)}`
      );

      // Process searches concurrently but within batch limits
      const batchResults = await Promise.allSettled(
        batch.map((search) => this.processSearch(search))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
          this.stats.completedSearches++;
        } else {
          this.stats.failedSearches++;
          console.error(
            `[searchWorker] Search failed: ${result.reason?.message || result.reason}`
          );
        }
      }

      // Delay between batches to respect rate limits
      if (i + batchSize < searches.length) {
        const delayMs = this.config.delayBetweenRequestsMs || 500;
        await this.sleep(delayMs);
      }
    }

    return results;
  }

  /**
   * Re-sync watchlists for users with active price monitoring so scheduled runs can trigger alerts.
   */
  private async syncWatchlistsForPriceAlerts(): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: {
        ebayAccessToken: { not: null },
        OR: [
          {
            globalPriceDropPercentage: { not: null },
          },
          {
            wishlistItems: {
              some: {
                isEbayImported: true,
                isActive: true,
                targetPrice: { not: null },
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    if (users.length === 0) {
      console.log('[searchWorker] No users require watchlist re-sync for price alerts');
      return;
    }

    console.log(`[searchWorker] Re-syncing watchlists for ${users.length} users to evaluate price alerts`);

    for (const user of users) {
      try {
        const result = await ebaySyncService.syncUserData(user.id, {
          includeSavedSearches: false,
        });

        if (result.alertsTriggered.length > 0) {
          console.log(
            `[searchWorker] User ${user.id} triggered ${result.alertsTriggered.length} price alerts during scheduled watchlist sync`
          );
        }
      } catch (error) {
        console.error(
          `[searchWorker] Watchlist re-sync failed for user ${user.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  /**
   * Process a single search: fetch results and find new items.
   * Uses the same filter/sort/category logic as the frontend SearchResults page,
   * always overriding sort to "newlyListed" so the worker catches genuinely new listings.
   */
  private async processSearch(search: any): Promise<SearchComparisonResult> {
    const startTime = Date.now();
    console.log(`[searchWorker] Processing search: "${search.name}" (ID: ${search.id})`);

    try {
      // Verify user has valid OAuth token
      if (!search.user?.ebayAccessToken) {
        throw new Error(`User ${search.userId} has no eBay OAuth token`);
      }

      // Update service token for this user
      this.service.updateAccessToken(search.user.ebayAccessToken);

      // Build filter string (matches frontend SearchResults.buildFilterString exactly)
      const filterString = this.buildFilterString(search);

      // Parse category IDs from JSON array stored in DB (e.g. '["11450","625"]')
      let categoryIds: string | undefined;
      if (search.categories) {
        try {
          const cats: string[] = JSON.parse(search.categories);
          if (Array.isArray(cats) && cats.length > 0) {
            categoryIds = cats.join(',');
          }
        } catch {
          // ignore malformed category JSON
        }
      }

      // Always sort by newly listed so the worker detects freshly posted items
      const sort = 'newlyListed';

      const baseOptions = {
        keywords: search.searchKeywords,
        globalSiteId: 'EBAY_US',
        limit: 100,
        filter: filterString || undefined,
        sort,
      };

      let allItems: EbayItem[];
      let totalFound: number;

      if (categoryIds && categoryIds.includes(',')) {
        // Multi-category: search each category separately, then deduplicate
        const catList = categoryIds.split(',').map((c: string) => c.trim()).filter(Boolean);
        const seenIds = new Set<string>();
        allItems = [];
        totalFound = 0;

        for (const catId of catList) {
          const result = await this.service.searchItems({ ...baseOptions, categoryIds: catId });
          totalFound += result.total || 0;
          for (const item of result.itemSummaries || []) {
            if (!seenIds.has(item.itemId)) {
              seenIds.add(item.itemId);
              allItems.push(item);
            }
          }
        }
      } else {
        // Single category or no category
        const result = await this.service.searchItems({
          ...baseOptions,
          categoryIds: categoryIds || undefined,
        });
        allItems = result.itemSummaries || [];
        totalFound = result.total || 0;
      }

      console.log(
        `[searchWorker] Searching: "${search.searchKeywords}" — filter: "${filterString || 'none'}", categories: "${categoryIds || 'any'}", sort: ${sort}`
      );

      // Find new items by comparing with existing wishlist
      const newItems = await findNewItems(
        this.prisma,
        search.userId,
        search.id,
        allItems,
        search.minPrice ? parseFloat(search.minPrice.toString()) : undefined,
        search.maxPrice ? parseFloat(search.maxPrice.toString()) : undefined
      );

      // Optional behavior: only auto-add search results if explicitly enabled.
      // Default is false to prevent feed/discovery results from flooding wishlist.
      if (this.config.autoAddSearchResultsToWishlist && newItems.length > 0) {
        await saveNewItems(this.prisma, search.userId, search.id, newItems);
      }

      // Send Pushover notification if the search has notifications enabled and new items were found.
      if (search.notifyOnNewItems && newItems.length > 0) {
        await this.sendNewItemsNotification(search, newItems);
      }

      // Update search run time
      await this.prisma.savedSearch.update({
        where: { id: search.id },
        data: { lastRunAt: new Date() },
      });

      // Get search statistics
      const stats = await getSearchStatistics(this.prisma, search.id);

      const processingTimeMs = Date.now() - startTime;
      console.log(
        `[searchWorker] Search complete - Found: ${totalFound} results, ${newItems.length} new items, ${stats.itemCount} total tracked (${processingTimeMs}ms)`
      );

      return {
        searchId: search.id,
        searchName: search.name,
        totalResultsFound: totalFound,
        newItemsFound: newItems,
        itemsChecked: allItems.length,
        processingTimeMs,
      };
    } catch (error) {
      console.error(
        `[searchWorker] Error processing search "${search.name}":`,
        error instanceof Error ? error.message : error
      );

      // Check if it's a rate limit error
      if (
        error instanceof Error &&
        (error.message.includes('429') || error.message.includes('rate limit'))
      ) {
        this.stats.rateLimitHits++;
      }

      throw error;
    }
  }

  /**
   * Build a Browse API filter string from a SavedSearch record.
   * Logic mirrors the frontend SearchResults.buildFilterString() exactly.
   */
  private buildFilterString(search: any): string {
    const filters: string[] = [];

    // Price filters
    const minPrice = search.minPrice ? parseFloat(search.minPrice.toString()) : null;
    const maxPrice = search.maxPrice ? parseFloat(search.maxPrice.toString()) : null;
    const hasPriceFilter = minPrice !== null || maxPrice !== null;

    if (minPrice !== null && maxPrice !== null) {
      filters.push(`price:[${minPrice}..${maxPrice}]`);
    } else if (minPrice !== null) {
      filters.push(`price:[${minPrice}..]`);
    } else if (maxPrice !== null) {
      filters.push(`price:[..${maxPrice}]`);
    }

    // Currency (required alongside a price filter)
    if (hasPriceFilter && search.currency) {
      filters.push(`priceCurrency:${search.currency}`);
    }

    // Condition
    if (search.condition) {
      const conditionMap: Record<string, string> = {
        'New': 'NEW',
        'Used': 'USED',
        'Refurbished': 'REFURBISHED',
        'For parts or not working': 'FOR_PARTS_OR_NOT_WORKING',
      };
      const browseCondition = conditionMap[search.condition] || search.condition.toUpperCase().replace(/ /g, '_');
      filters.push(`conditions:{${browseCondition}}`);
    }

    // Buying format
    if (search.buyingFormat) {
      const formatMap: Record<string, string> = {
        'Auction': 'AUCTION',
        'Buy It Now': 'FIXED_PRICE',
        'FixItPrice': 'FIXED_PRICE',
        'AuctionWithBIN': 'AUCTION|FIXED_PRICE',
        'Both': 'AUCTION|FIXED_PRICE',
      };
      const browseFormat = formatMap[search.buyingFormat] || 'FIXED_PRICE';
      filters.push(`buyingOptions:{${browseFormat}}`);
    }

    // Shipping/returns
    if (search.freeShipping) {
      filters.push('maxDeliveryCost:0');
    }
    if (search.returnsAccepted) {
      filters.push('returnsAccepted:true');
    }
    if (search.freeReturns) {
      filters.push('freeReturns:true');
    }

    // Search in description
    if (search.searchInDescription) {
      filters.push('searchInDescription:true');
    }

    // Item location
    if (search.itemLocation && search.itemLocation !== 'Default') {
      if (search.itemLocation === 'US Only') {
        filters.push('itemLocationCountry:US');
      } else if (search.itemLocation === 'North America') {
        filters.push('itemLocationRegion:NORTH_AMERICA');
      } else if (search.itemLocation === 'Worldwide') {
        filters.push('itemLocationRegion:WORLDWIDE');
      }
    }

    return filters.join(',');
  }

  /**
   * Send a Pushover notification when new items are found for a saved search.
   * Single item: specific title/price/link. Multiple items: summary + eBay search link.
   */
  private async sendNewItemsNotification(
    search: any,
    newItems: MatchResult[]
  ): Promise<void> {
    const user = search.user;
    const preference: string = user.notificationPreference || 'DISCORD';

    if (preference !== 'PUSHOVER' || !user.pushoverUserKey) {
      return;
    }

    const firstItem = newItems[0];
    let title: string;
    let message: string;
    let url: string;
    let urlTitle: string;
    let imageUrl: string | undefined;

    if (newItems.length === 1) {
      const priceStr = `$${firstItem.price.toFixed(2)}`;
      title = `New result for ${search.name}`;
      message = `${priceStr} for ${firstItem.title}`;
      url = firstItem.itemWebUrl || `https://www.ebay.com/itm/${firstItem.itemId}`;
      urlTitle = 'Open eBay Item';
      imageUrl = firstItem.imageUrl;
    } else {
      title = `New results for ${search.name}`;
      message = `${newItems.length} new results found`;
      url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(search.searchKeywords)}`;
      urlTitle = 'View results on eBay';
      imageUrl = firstItem.imageUrl;
    }

    const result = await sendNewItemNotificationPushover({
      userKey: user.pushoverUserKey,
      title,
      message,
      url,
      urlTitle,
      imageUrl: imageUrl || null,
      device: user.pushoverDevice || null,
    });

    if (!result.success) {
      console.warn(
        `[searchWorker] Pushover notification failed for user ${user.id} / search "${search.name}": ${result.error}`
      );
    } else {
      console.log(
        `[searchWorker] Pushover notification sent for user ${user.id} / search "${search.name}" (${newItems.length} new item(s))`
      );
    }
  }

  /**
   * Utility: sleep for given milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current worker statistics
   */
  getStats(): WorkerStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics for next run
   */
  resetStats(): void {
    this.stats = {
      totalSearches: 0,
      completedSearches: 0,
      failedSearches: 0,
      newItemsFound: 0,
      totalItemsProcessed: 0,
      rateLimitHits: 0,
      durationMs: 0,
    };
  }
}

/**
 * Create a new search worker instance
 */
export function createSearchWorker(
  prisma: PrismaClient,
  config: WorkerConfig
): SearchWorker {
  return new SearchWorker(prisma, config);
}
