/**
 * Search Worker Service
 * Orchestrates periodic eBay searches with rate limit handling
 */

import { PrismaClient } from '@prisma/client';
import { createEbayBrowseService, EbayBrowseService } from '../services/ebay-browse.service';
import {
  findNewItems,
  saveNewItems,
  getSearchStatistics,
  SearchComparisonResult,
} from './item-matcher';

export interface WorkerConfig {
  accessToken: string;
  sandbox?: boolean;
  maxConcurrentRequests?: number;
  delayBetweenRequestsMs?: number;
  maxSearchesPerRun?: number;
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
      const results = await this.processSearchesBatch(searches);

      this.stats.newItemsFound = results.reduce((sum, r) => sum + r.newItemsFound.length, 0);
      this.stats.totalItemsProcessed = results.reduce((sum, r) => sum + r.totalResultsFound, 0);

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
   * Process a single search: fetch results and find new items
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

      // Build search options from saved search criteria
      const searchOptions = this.buildSearchOptions(search);

      // Execute search with retry logic (built into service)
      console.log(
        `[searchWorker] Searching: "${search.searchKeywords}" in ${searchOptions.globalSiteId}`
      );
      const results = await this.service.searchItems(searchOptions);

      // Find new items by comparing with existing wishlist
      const newItems = await findNewItems(
        this.prisma,
        search.userId,
        search.id,
        results.itemSummaries,
        search.minPrice ? parseFloat(search.minPrice.toString()) : undefined,
        search.maxPrice ? parseFloat(search.maxPrice.toString()) : undefined
      );

      // Save new items to database
      if (newItems.length > 0) {
        await saveNewItems(this.prisma, search.userId, search.id, newItems);
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
        `[searchWorker] Search complete - Found: ${results.total} results, ${newItems.length} new items, ${stats.itemCount} total tracked (${processingTimeMs}ms)`
      );

      return {
        searchId: search.id,
        searchName: search.name,
        totalResultsFound: results.total,
        newItemsFound: newItems,
        itemsChecked: results.itemSummaries.length,
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
   * Build search options from SavedSearch database record
   */
  private buildSearchOptions(search: any): any {
    const options: any = {
      keywords: search.searchKeywords,
      globalSiteId: 'EBAY_US', // Default, could be stored in SavedSearch
      limit: 100,
    };

    // Add filters from saved search criteria
    if (search.condition) {
      options.filter = { condition: search.condition };
    }

    if (search.freeShipping) {
      options.filter = { ...options.filter, freeShippingOnly: true };
    }

    if (search.minPrice || search.maxPrice) {
      options.filter = {
        ...options.filter,
        priceRange: {
          min: search.minPrice ? parseFloat(search.minPrice.toString()) : undefined,
          max: search.maxPrice ? parseFloat(search.maxPrice.toString()) : undefined,
        },
      };
    }

    return options;
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
