/**
 * Search Worker Service
 * Orchestrates periodic eBay searches with rate limit handling
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
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
  previousScanItemIdsBySearch?: Map<number, Set<string>>;
}

export interface WorkerStats {
  totalSearches: number;
  completedSearches: number;
  failedSearches: number;
  newItemsFound: number;
  totalItemsProcessed: number;
  rateLimitHits: number;
  durationMs: number;
  scannedPreviewTitles: string[];
  searchDebug: WorkerSearchDebug[];
}

export interface WorkerSearchDebug {
  searchId: number;
  searchName: string;
  notifyOnNewItems: boolean;
  status: 'success' | 'failed';
  totalResultsFound: number;
  itemsChecked: number;
  newItemsFound: number;
  missingPriceCount: number;
  previewTitles: string[];
  error?: string;
}

/**
 * Manages batch processing of searches with rate limit awareness
 */
export class SearchWorker {
  private prisma: PrismaClient;
  private service: EbayBrowseService;
  private config: WorkerConfig;
  private appAccessTokenCache: { token: string; expiresAt: number } | null = null;
  private stats: WorkerStats = {
    totalSearches: 0,
    completedSearches: 0,
    failedSearches: 0,
    newItemsFound: 0,
    totalItemsProcessed: 0,
    rateLimitHits: 0,
    durationMs: 0,
    scannedPreviewTitles: [],
    searchDebug: [],
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
        where: { isActive: true },
        include: { user: true },
        take: this.config.maxSearchesPerRun,
      });

      this.stats.totalSearches = searches.length;
      console.log(`[searchWorker] Found ${searches.length} active searches`);

      // Process searches with batching and rate limit awareness
      const { results, debug } = await this.processSearchesBatch(searches);

      this.stats.newItemsFound = results.reduce((sum, r) => sum + r.newItemsFound.length, 0);
      this.stats.totalItemsProcessed = results.reduce((sum, r) => sum + r.totalResultsFound, 0);
      this.stats.scannedPreviewTitles = results
        .flatMap((r) => r.scannedPreviewTitles)
        .filter((title) => title.trim().length > 0)
        .slice(0, 5);
      this.stats.searchDebug = debug;

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
  ): Promise<{ results: SearchComparisonResult[]; debug: WorkerSearchDebug[] }> {
    const results: SearchComparisonResult[] = [];
    const debug: WorkerSearchDebug[] = [];
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
        const search = batch[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
          this.stats.completedSearches++;
          debug.push({
            searchId: result.value.searchId,
            searchName: result.value.searchName,
            notifyOnNewItems: Boolean(search?.notifyOnNewItems),
            status: 'success',
            totalResultsFound: result.value.totalResultsFound,
            itemsChecked: result.value.itemsChecked,
            newItemsFound: result.value.newItemsFound.length,
            missingPriceCount: result.value.missingPriceCount,
            previewTitles: result.value.scannedPreviewTitles.slice(0, 5),
          });
        } else {
          this.stats.failedSearches++;
          const errorMessage =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason || 'Unknown error');

          debug.push({
            searchId: Number(search?.id || 0),
            searchName: search?.name || 'Unknown search',
            notifyOnNewItems: Boolean(search?.notifyOnNewItems),
            status: 'failed',
            totalResultsFound: 0,
            itemsChecked: 0,
            newItemsFound: 0,
            missingPriceCount: 0,
            previewTitles: [],
            error: errorMessage,
          });

          console.error(
            `[searchWorker] Search failed: ${errorMessage}`
          );
        }
      }

      // Delay between batches to respect rate limits
      if (i + batchSize < searches.length) {
        const delayMs = this.config.delayBetweenRequestsMs || 500;
        await this.sleep(delayMs);
      }
    }

    return { results, debug };
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
      // Use app token for saved-search scanning to match View Items auth behavior exactly.
      const accessToken = await this.getAppAccessToken();
      this.service.updateAccessToken(accessToken);

      // Build filter string (matches frontend SearchResults.buildFilterString exactly)
      const filterString = this.buildFilterString(search);

      // Parse category IDs from DB. Supports JSON arrays and plain comma-delimited strings.
      let categoryIds: string | undefined;
      if (search.categories) {
        try {
          const parsed = JSON.parse(search.categories);
          if (Array.isArray(parsed)) {
            const cats = parsed.map((c) => String(c).trim()).filter(Boolean);
            if (cats.length > 0) {
              categoryIds = cats.join(',');
            }
          }
        } catch {
          const fallback = String(search.categories)
            .split(',')
            .map((c: string) => c.trim())
            .filter(Boolean);
          if (fallback.length > 0) {
            categoryIds = fallback.join(',');
          }
        }
      }

      // Always sort by newly listed so the worker detects freshly posted items
      const sort: string = 'newlyListed';

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
        const fallbackOrder = new Map<string, { rank: number; categoryOrder: number }>();
        allItems = [];
        totalFound = 0;

        for (let categoryOrder = 0; categoryOrder < catList.length; categoryOrder++) {
          const catId = catList[categoryOrder];
          const result = await this.service.searchItems({ ...baseOptions, categoryIds: catId });
          totalFound += result.total || 0;
          (result.itemSummaries || []).forEach((item, rank) => {
            if (!fallbackOrder.has(item.itemId)) {
              fallbackOrder.set(item.itemId, { rank, categoryOrder });
            }
          });

          for (const item of result.itemSummaries || []) {
            if (!seenIds.has(item.itemId)) {
              seenIds.add(item.itemId);
              allItems.push(item);
            }
          }
        }

        // After combining multi-category results, enforce a global sort order.
        if (sort === 'endingSoonest') {
          allItems.sort((a, b) => {
            const tsDiff = this.getEndingTimestamp(a) - this.getEndingTimestamp(b);
            if (tsDiff !== 0) return tsDiff;

            const aOrder = fallbackOrder.get(a.itemId);
            const bOrder = fallbackOrder.get(b.itemId);
            const rankDiff = (aOrder?.rank ?? Number.MAX_SAFE_INTEGER) - (bOrder?.rank ?? Number.MAX_SAFE_INTEGER);
            if (rankDiff !== 0) return rankDiff;

            return (aOrder?.categoryOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder?.categoryOrder ?? Number.MAX_SAFE_INTEGER);
          });
        } else {
          // Default path: newest first.
          allItems.sort((a, b) => {
            const tsDiff = this.getListingTimestamp(b) - this.getListingTimestamp(a);
            if (tsDiff !== 0) return tsDiff;

            const aOrder = fallbackOrder.get(a.itemId);
            const bOrder = fallbackOrder.get(b.itemId);
            const rankDiff = (aOrder?.rank ?? Number.MAX_SAFE_INTEGER) - (bOrder?.rank ?? Number.MAX_SAFE_INTEGER);
            if (rankDiff !== 0) return rankDiff;

            return (aOrder?.categoryOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder?.categoryOrder ?? Number.MAX_SAFE_INTEGER);
          });
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

      // Find items not already in wishlist (used for optional auto-add behavior).
      const wishlistNewItems = await findNewItems(
        this.prisma,
        search.userId,
        search.id,
        allItems,
        search.minPrice ? parseFloat(search.minPrice.toString()) : undefined,
        search.maxPrice ? parseFloat(search.maxPrice.toString()) : undefined
      );

      // Detect newly seen items by comparing this scan with the previous scan snapshot.
      // This prevents sending repeated notifications for unchanged result sets.
      const currentScanItemIds = new Set(allItems.map((item) => item.itemId));
      const previousScanItemIds = this.config.previousScanItemIdsBySearch?.get(search.id);

      let newItems: MatchResult[] = [];
      if (previousScanItemIds) {
        const unseenItems = allItems.filter((item) => !previousScanItemIds.has(item.itemId));
        newItems = this.mapItemsToMatchResults(
          unseenItems,
          search.minPrice ? parseFloat(search.minPrice.toString()) : undefined,
          search.maxPrice ? parseFloat(search.maxPrice.toString()) : undefined
        );
      } else {
        console.log(`[searchWorker] First scan baseline for search ${search.id}; notifications suppressed until next run`);
      }

      if (this.config.previousScanItemIdsBySearch) {
        this.config.previousScanItemIdsBySearch.set(search.id, currentScanItemIds);
      }

      // Optional behavior: only auto-add search results if explicitly enabled.
      // Default is false to prevent feed/discovery results from flooding wishlist.
      if (this.config.autoAddSearchResultsToWishlist && wishlistNewItems.length > 0) {
        await saveNewItems(this.prisma, search.userId, search.id, wishlistNewItems);
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
        scannedPreviewTitles: search.notifyOnNewItems
          ? allItems.slice(0, 5).map((item) => item.title)
          : [],
        missingPriceCount: allItems.filter((item) => !item.price?.value && !item.currentBidPrice?.value).length,
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
   * Get (and cache) an eBay app token via client-credentials flow.
   */
  private async getAppAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.appAccessTokenCache && this.appAccessTokenCache.expiresAt > now + 60_000) {
      return this.appAccessTokenCache.token;
    }

    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET for app-token fallback');
    }

    const tokenUrl = this.config.sandbox
      ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
      : 'https://api.ebay.com/identity/v1/oauth2/token';

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    });

    const response = await axios.post(tokenUrl, body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
    });

    const token: string = response.data.access_token;
    const expiresIn: number = Number(response.data.expires_in || 7200);

    this.appAccessTokenCache = {
      token,
      expiresAt: now + expiresIn * 1000,
    };

    return token;
  }

  /**
   * Build a Browse API filter string from a SavedSearch record.
   * Logic mirrors the frontend SearchResults.buildFilterString() exactly.
   */
  private buildFilterString(search: any): string {
    const filters: string[] = [];

    // Price filters
    const minPrice = search.minPrice !== null && search.minPrice !== undefined
      ? parseFloat(search.minPrice.toString())
      : null;
    const maxPrice = search.maxPrice !== null && search.maxPrice !== undefined
      ? parseFloat(search.maxPrice.toString())
      : null;
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

    // Keep parity with SearchResults page behavior for price+shipping sort variants.
    if (
      search.sortBy === 'PricePlusShipping' ||
      search.sortBy === 'PricePlusShippingLowest' ||
      search.sortBy === 'PricePlusShippingHighest'
    ) {
      filters.push('deliveryPostalCode:80011');
    }

    return filters.join(',');
  }

  /**
   * Convert raw Browse API items into MatchResult objects and apply optional price filters.
   */
  private mapItemsToMatchResults(
    items: EbayItem[],
    minPrice?: number,
    maxPrice?: number
  ): MatchResult[] {
    const mapped: MatchResult[] = [];

    for (const item of items) {
      const price = parseFloat(item.price?.value || '0');
      if (Number.isNaN(price) || price <= 0) {
        continue;
      }

      if (minPrice !== undefined && price < minPrice) {
        continue;
      }

      if (maxPrice !== undefined && price > maxPrice) {
        continue;
      }

      mapped.push({
        isNew: true,
        itemId: item.itemId,
        title: item.title,
        price,
        itemWebUrl: item.itemWebUrl,
        imageUrl: item.image?.imageUrl,
        reason: 'Item not present in previous scan snapshot',
      });
    }

    return mapped;
  }

  /**
   * Safely parse listing timestamp for newest-first sorting.
   */
  private getListingTimestamp(item: EbayItem): number {
    const dateValue = item.itemOriginDate || item.itemCreationDate || '';
    if (!dateValue) {
      return 0;
    }

    const ts = Date.parse(String(dateValue));
    return Number.isNaN(ts) ? 0 : ts;
  }

  /**
   * Safely parse listing end timestamp for ending-soonest sorting.
   */
  private getEndingTimestamp(item: EbayItem): number {
    const dateValue = item.itemEndDate || '';
    if (!dateValue) {
      return Number.MAX_SAFE_INTEGER;
    }

    const ts = Date.parse(String(dateValue));
    return Number.isNaN(ts) ? Number.MAX_SAFE_INTEGER : ts;
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
   * Get up to five titles from the newest-listed items scanned in the most recent cycle.
   */
  getScannedPreviewTitles(): string[] {
    return [...this.stats.scannedPreviewTitles];
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
      scannedPreviewTitles: [],
      searchDebug: [],
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
