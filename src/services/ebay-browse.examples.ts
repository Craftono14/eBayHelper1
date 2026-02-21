/**
 * eBay Browse API Service - Usage Examples
 * Demonstrates how to use the EbayBrowseService with retry logic
 */

import { createEbayBrowseService, EbayBrowseConfig } from './ebay-browse.service';

// ============================================================================
// EXAMPLE 1: Basic Search
// ============================================================================

/**
 * Simple search for items by keywords
 */
export async function exampleBasicSearch(): Promise<void> {
  const config: EbayBrowseConfig = {
    accessToken: process.env.EBAY_ACCESS_TOKEN || '',
    sandbox: process.env.EBAY_SANDBOX === 'true',
  };

  const service = createEbayBrowseService(config);

  try {
    const results = await service.searchItems({
      keywords: 'iPhone 15 pro',
      globalSiteId: 'EBAY_US',
      limit: 50,
    });

    console.log('\n=== Basic Search Results ===');
    console.log(`Total items found: ${results.total}`);
    console.log(`Items in this response: ${results.itemSummaries.length}`);

    // Display first 3 items
    results.itemSummaries.slice(0, 3).forEach((item) => {
      console.log(`\n  ${item.title}`);
      console.log(`    Price: ${item.price.currency} ${item.price.value}`);
      console.log(`    Seller: ${item.seller.username}`);
      console.log(`    Condition: ${item.condition}`);
    });
  } catch (error) {
    console.error('Search failed:', error);
  }
}

// ============================================================================
// EXAMPLE 2: Price Range Filter
// ============================================================================

/**
 * Search with price filter
 */
export async function examplePriceRangeSearch(): Promise<void> {
  const config: EbayBrowseConfig = {
    accessToken: process.env.EBAY_ACCESS_TOKEN || '',
    sandbox: process.env.EBAY_SANDBOX === 'true',
  };

  const service = createEbayBrowseService(config);

  try {
    // Find laptops between $500 and $1500
    const results = await service.searchItemsByPrice(
      'gaming laptop',
      'EBAY_US',
      500,
      1500,
      25
    );

    console.log('\n=== Price Range Search ($500-$1500) ===');
    console.log(`Total items found: ${results.total}`);

    results.itemSummaries.forEach((item) => {
      console.log(
        `${item.title} - ${item.price.currency} ${item.price.value}`
      );
    });
  } catch (error) {
    console.error('Price range search failed:', error);
  }
}

// ============================================================================
// EXAMPLE 3: Advanced Search with Multiple Filters
// ============================================================================

/**
 * Complex search with condition, shipping, and price filters
 */
export async function exampleAdvancedSearch(): Promise<void> {
  const config: EbayBrowseConfig = {
    accessToken: process.env.EBAY_ACCESS_TOKEN || '',
    sandbox: process.env.EBAY_SANDBOX === 'true',
  };

  const service = createEbayBrowseService(config);

  try {
    const results = await service.searchItemsAdvanced(
      'sony headphones',
      'EBAY_US',
      {
        minPrice: 50,
        maxPrice: 300,
        condition: 'NEW',
        freeShippingOnly: true,
        newItemsOnly: true,
      },
      30
    );

    console.log('\n=== Advanced Search Results ===');
    console.log(`Criteria: New Sony headphones, $50-$300, Free Shipping`);
    console.log(`Total items found: ${results.total}`);
    console.log(`\nFirst 5 results:`);

    results.itemSummaries.slice(0, 5).forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.title}`);
      console.log(`   Price: ${item.price.currency} ${item.price.value}`);
      console.log(`   Seller: ${item.seller.username}`);
      console.log(`   Rating: ${item.seller.feedbackScore} ⭐`);
      console.log(`   Location: ${item.itemLocation.country}`);

      if (item.shippingOptions && item.shippingOptions.length > 0) {
        console.log(
          `   Shipping: ${item.shippingOptions[0].shippingCost.value} ${item.shippingOptions[0].shippingCost.currency}`
        );
      }
    });
  } catch (error) {
    console.error('Advanced search failed:', error);
  }
}

// ============================================================================
// EXAMPLE 4: Custom Retry Configuration
// ============================================================================

/**
 * Demonstrate custom retry configuration for high-traffic scenarios
 */
export async function exampleCustomRetryConfig(): Promise<void> {
  const config: EbayBrowseConfig = {
    accessToken: process.env.EBAY_ACCESS_TOKEN || '',
    sandbox: process.env.EBAY_SANDBOX === 'true',
  };

  // Custom retry config: more retries, longer waits for rate limits
  const retryConfig = {
    maxRetries: 8, // Increased from default 5
    initialDelayMs: 200, // Start with 200ms instead of 100ms
    maxDelayMs: 60000, // Allow up to 60 seconds instead of 30
    exponentialBase: 2, // Still double each time
    retryableStatuses: [429, 500, 502, 503, 504], // Same statuses
  };

  const service = createEbayBrowseService(config, retryConfig);

  console.log('\n=== Custom Retry Configuration ===');
  console.log(`Max retries: ${service.getRetryConfig().maxRetries}`);
  console.log(`Initial delay: ${service.getRetryConfig().initialDelayMs}ms`);
  console.log(`Max delay: ${service.getRetryConfig().maxDelayMs}ms`);

  try {
    const results = await service.searchItems({
      keywords: 'test item',
      globalSiteId: 'EBAY_US',
      limit: 10,
    });

    console.log(`\nSearch completed successfully`);
    console.log(`Found ${results.total} items`);
  } catch (error) {
    console.error('Search failed with custom retry config:', error);
  }
}

// ============================================================================
// EXAMPLE 5: Retry Backoff Visualization
// ============================================================================

/**
 * Visualize the exponential backoff delays that would be used
 */
export function exampleBackoffVisualization(): void {
  const config: EbayBrowseConfig = {
    accessToken: 'dummy-token',
    sandbox: true,
  };

  const service = createEbayBrowseService(config);
  const retryConfig = service.getRetryConfig();

  console.log('\n=== Exponential Backoff Delays ===');
  console.log(`Configuration:`);
  console.log(`  Initial delay: ${retryConfig.initialDelayMs}ms`);
  console.log(`  Exponential base: ${retryConfig.exponentialBase}`);
  console.log(`  Max delay: ${retryConfig.maxDelayMs}ms`);
  console.log(`  Max retries: ${retryConfig.maxRetries}`);

  console.log(`\nBackoff schedule on failure:`);

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    const delay =
      retryConfig.initialDelayMs *
      Math.pow(retryConfig.exponentialBase, attempt);
    const cappedDelay = Math.min(delay, retryConfig.maxDelayMs);
    const seconds = (cappedDelay / 1000).toFixed(2);

    const bar = '█'.repeat(Math.ceil(cappedDelay / 1000));
    console.log(
      `  Attempt ${attempt + 1}: Wait ${seconds}s ${bar}`
    );
  }

  // Calculate total possible wait time
  let totalWait = 0;
  for (let attempt = 0; attempt < retryConfig.maxRetries; attempt++) {
    const delay =
      retryConfig.initialDelayMs *
      Math.pow(retryConfig.exponentialBase, attempt);
    totalWait += Math.min(delay, retryConfig.maxDelayMs);
  }

  console.log(
    `\nTotal possible wait time: ${(totalWait / 1000).toFixed(2)}s`
  );
}

// ============================================================================
// EXAMPLE 6: Token Refresh Handling
// ============================================================================

/**
 * Demonstrate updating access token (e.g., after token refresh)
 */
export async function exampleTokenRefresh(): Promise<void> {
  const config: EbayBrowseConfig = {
    accessToken: process.env.EBAY_ACCESS_TOKEN || '',
    sandbox: process.env.EBAY_SANDBOX === 'true',
  };

  const service = createEbayBrowseService(config);

  console.log('\n=== Token Refresh Handling ===');

  try {
    // First search with original token
    console.log('Searching with original token...');
    const results1 = await service.searchItems({
      keywords: 'first search',
      globalSiteId: 'EBAY_US',
      limit: 5,
    });

    console.log(`First search: ${results1.itemSummaries.length} items found`);

    // Simulate token refresh
    const newToken = 'new-access-token-from-refresh';
    console.log('\nToken expired. Refreshing...');
    service.updateAccessToken(newToken);
    console.log('Token updated successfully');

    // Second search with new token
    console.log('\nSearching with new token...');
    const results2 = await service.searchItems({
      keywords: 'second search',
      globalSiteId: 'EBAY_US',
      limit: 5,
    });

    console.log(`Second search: ${results2.itemSummaries.length} items found`);
  } catch (error) {
    console.error('Token refresh example failed:', error);
  }
}

// ============================================================================
// EXAMPLE 7: Multiple Market Search
// ============================================================================

/**
 * Compare results across different eBay markets
 */
export async function exampleMultipleMarkets(): Promise<void> {
  const config: EbayBrowseConfig = {
    accessToken: process.env.EBAY_ACCESS_TOKEN || '',
    sandbox: process.env.EBAY_SANDBOX === 'true',
  };

  const service = createEbayBrowseService(config);
  const markets = ['EBAY_US', 'EBAY_GB', 'EBAY_DE', 'EBAY_AU'];

  console.log('\n=== Multi-Market Search ===');
  console.log('Searching for "iPhone" across different markets...\n');

  for (const market of markets) {
    try {
      const results = await service.searchItems({
        keywords: 'iPhone',
        globalSiteId: market,
        limit: 5,
      });

      console.log(
        `${market}: Found ${results.total} items (${results.itemSummaries.length} shown)`
      );

      // Show price of first item in local currency
      if (results.itemSummaries.length > 0) {
        const item = results.itemSummaries[0];
        console.log(
          `  Sample: ${item.title.substring(0, 60)}... - ${item.price.currency} ${item.price.value}`
        );
      }
    } catch (error) {
      console.error(`  Error: ${(error as Error).message}`);
    }
  }
}

// ============================================================================
// EXAMPLE 8: Pagination Through Results
// ============================================================================

/**
 * Demonstrate pagination through search results
 */
export async function examplePagination(): Promise<void> {
  const config: EbayBrowseConfig = {
    accessToken: process.env.EBAY_ACCESS_TOKEN || '',
    sandbox: process.env.EBAY_SANDBOX === 'true',
  };

  const service = createEbayBrowseService(config);

  console.log('\n=== Pagination Example ===');
  console.log('Fetching first 3 pages of results (25 items each)...\n');

  const pageSize = 25;

  for (let page = 1; page <= 3; page++) {
    try {
      const offset = (page - 1) * pageSize;

      const results = await service.searchItems({
        keywords: 'laptop',
        globalSiteId: 'EBAY_US',
        limit: pageSize,
        offset: offset > 0 ? offset : undefined,
      });

      console.log(`\nPage ${page}:`);
      console.log(`  Offset: ${results.offset}`);
      console.log(`  Items in page: ${results.itemSummaries.length}`);
      console.log(`  Total available: ${results.total}`);

      if (results.itemSummaries.length > 0) {
        console.log(`  First item: ${results.itemSummaries[0].title.substring(0, 50)}...`);
      }
    } catch (error) {
      console.error(`Page ${page} failed:`, error);
      break;
    }
  }
}

// ============================================================================
// EXAMPLE 9: Rate Limit Handling
// ============================================================================

/**
 * Demonstrate what happens when rate limited
 * (Shows logging in action)
 */
export async function exampleRateLimitHandling(): Promise<void> {
  const config: EbayBrowseConfig = {
    accessToken: process.env.EBAY_ACCESS_TOKEN || '',
    sandbox: process.env.EBAY_SANDBOX === 'true',
  };

  // Aggressive retry config to retry on rate limits
  const retryConfig = {
    maxRetries: 3,
    initialDelayMs: 1000, // 1 second initial delay
    maxDelayMs: 10000,
    exponentialBase: 2,
    retryableStatuses: [429, 500, 502, 503, 504], // Include 429
  };

  const service = createEbayBrowseService(config, retryConfig);

  console.log('\n=== Rate Limit Handling ===');
  console.log('If API returns 429, the service will:');
  console.log('  1. Log a warning about rate limit');
  console.log('  2. Wait with exponential backoff');
  console.log('  3. Retry up to 3 times');
  console.log('  4. Throw error if all retries exhausted\n');

  try {
    const results = await service.searchItems({
      keywords: 'test',
      globalSiteId: 'EBAY_US',
      limit: 10,
    });

    console.log(`Success: Found ${results.total} items`);
  } catch (error) {
    console.error('Failed after retries:', (error as Error).message);
  }
}

// ============================================================================
// MAIN: Run Examples
// ============================================================================

async function runExamples(): Promise<void> {
  console.log('eBay Browse API Service Examples\n');

  // Run all examples (comment out as needed)
  // await exampleBasicSearch();
  // await examplePriceRangeSearch();
  // await exampleAdvancedSearch();
  // await exampleCustomRetryConfig();
  exampleBackoffVisualization();
  // await exampleTokenRefresh();
  // await exampleMultipleMarkets();
  // await examplePagination();
  // await exampleRateLimitHandling();
}

// Uncomment to run examples
// runExamples().catch(console.error);

export default {
  runExamples,
  exampleBasicSearch,
  examplePriceRangeSearch,
  exampleAdvancedSearch,
  exampleCustomRetryConfig,
  exampleBackoffVisualization,
  exampleTokenRefresh,
  exampleMultipleMarkets,
  examplePagination,
  exampleRateLimitHandling,
};
