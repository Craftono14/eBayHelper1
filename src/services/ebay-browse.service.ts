/**
 * eBay Browse API Service
 * Handles interactions with eBay's Browse API with retry logic and exponential backoff
 */

import axios, { AxiosError, AxiosInstance } from 'axios';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface EbayBrowseConfig {
  accessToken: string;
  sandbox: boolean;
}

export interface SearchItemsOptions {
  keywords: string;
  globalSiteId: string;
  limit?: number;
  offset?: number;
  filter?: string;
}

export interface EbayItem {
  itemId: string;
  title: string;
  price: {
    value: string;
    currency: string;
  };
  condition: string;
  conditionId: string;
  seller: {
    username: string;
    feedbackPercentage: string;
    feedbackScore: number;
  };
  itemLocation: {
    postalCode: string;
    country: string;
  };
  image: {
    imageUrl: string;
  };
  itemHref: string;
  buyingOptions: string[];
  shippingOptions?: Array<{
    shippingCost: {
      value: string;
      currency: string;
    };
  }>;
}

export interface SearchItemsResponse {
  itemSummaries: EbayItem[];
  total: number;
  offset: number;
  limit: number;
  href: string;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  retryableStatuses: number[];
}

// ============================================================================
// RETRY LOGIC & UTILITIES
// ============================================================================

/**
 * Calculate exponential backoff delay in milliseconds
 * Formula: initialDelay * (exponentialBase ^ attempt)
 * Capped at maxDelay
 */
function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig
): number {
  const delay = config.initialDelayMs * Math.pow(config.exponentialBase, attempt);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Check if error should trigger a retry
 * Retryable errors: 429 (rate limit), 500+, timeout
 */
function isRetryableError(error: unknown, config: RetryConfig): boolean {
  if (axios.isAxiosError(error)) {
    // Network timeout
    if (error.code === 'ECONNABORTED') {
      return true;
    }

    // Check HTTP status codes
    if (error.response && error.response.status) {
      return config.retryableStatuses.includes(error.response.status);
    }

    // Connection failures, DNS failures, etc.
    if (
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET'
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Extract rate limit info from response headers (if available)
 */
function getRateLimitInfo(error: AxiosError): {
  retryAfter?: number;
  remaining?: number;
  reset?: string;
} {
  const headers = error.response?.headers || {};
  const retryAfter = headers['retry-after'];
  const remaining = headers['x-ebay-api-quota-remaining'];
  const reset = headers['x-ebay-api-quota-reset'];

  return {
    retryAfter: retryAfter && typeof retryAfter === 'string'
      ? parseInt(retryAfter, 10)
      : undefined,
    remaining: remaining && typeof remaining === 'string'
      ? parseInt(remaining, 10)
      : undefined,
    reset: typeof reset === 'string' ? reset : undefined,
  };
}

// ============================================================================
// EBAY BROWSE SERVICE
// ============================================================================

export class EbayBrowseService {
  private client: AxiosInstance;
  private config: EbayBrowseConfig;
  private retryConfig: RetryConfig;
  private baseUrl: string;

  constructor(config: EbayBrowseConfig, retryConfig?: Partial<RetryConfig>) {
    this.config = config;

    // Initialize retry configuration with defaults
    this.retryConfig = {
      maxRetries: 5,
      initialDelayMs: 100,
      maxDelayMs: 30000,
      exponentialBase: 2,
      retryableStatuses: [429, 500, 502, 503, 504],
      ...retryConfig,
    };

    // Set base URL based on sandbox flag
    this.baseUrl = config.sandbox
      ? 'https://api.sandbox.ebay.com/buy/browse/v1'
      : 'https://api.ebay.com/buy/browse/v1';

    // Initialize axios client with Bearer token and timeout
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US', // Default, will be overridden per request
      },
      timeout: 10000, // 10-second request timeout
    });
  }

  /**
   * Execute a function with retry logic and exponential backoff
   * Handles:
   * - HTTP 429 (rate limits)
   * - HTTP 500+ (server errors)
   * - Network timeouts
   * - Connection errors
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    operationName: string = 'API call'
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (!isRetryableError(error, this.retryConfig)) {
          throw error;
        }

        // If this was the last attempt, throw the error
        if (attempt === this.retryConfig.maxRetries) {
          console.error(
            `[${operationName}] Max retries (${this.retryConfig.maxRetries}) exhausted`
          );
          throw error;
        }

        // Calculate backoff delay
        let delay = calculateBackoffDelay(attempt, this.retryConfig);

        // Check for Retry-After header (overrides calculated delay)
        if (axios.isAxiosError(error)) {
          const rateLimitInfo = getRateLimitInfo(error);
          if (rateLimitInfo.retryAfter) {
            delay = rateLimitInfo.retryAfter * 1000; // Convert seconds to ms
            console.warn(
              `[${operationName}] Rate limited (429). Respecting Retry-After header: ${rateLimitInfo.retryAfter}s`
            );
          } else if (error.response?.status === 429) {
            console.warn(
              `[${operationName}] Rate limited (429). Retrying in ${delay}ms`
            );
          } else {
            console.warn(
              `[${operationName}] ${error.response?.status || 'Network'} error. Attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}. Retrying in ${delay}ms`
            );
          }
        } else {
          console.warn(
            `[${operationName}] Error: ${(error as Error).message}. Attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}. Retrying in ${delay}ms`
          );
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error(`${operationName} failed after all retries`);
  }

  /**
   * Search for items on eBay using the Browse API
   * 
   * @param options - Search options including keywords and global site ID
   * @returns SearchItemsResponse with matching items
   * 
   * @example
   * const response = await ebayBrowseService.searchItems({
   *   keywords: 'laptop',
   *   globalSiteId: 'EBAY_US',
   *   limit: 50,
   *   filter: 'price:[100..500]'
   * });
   */
  async searchItems(options: SearchItemsOptions): Promise<SearchItemsResponse> {
    return this.withRetry(async () => {
      const params = new URLSearchParams();
      params.append('q', options.keywords);
      params.append('limit', (options.limit || 50).toString());

      if (options.offset) {
        params.append('offset', options.offset.toString());
      }

      if (options.filter) {
        params.append('filter', options.filter);
      }

      console.log(
        `[searchItems] Searching for "${options.keywords}" on ${options.globalSiteId}`
      );

      const response = await this.client.get<SearchItemsResponse>(
        `/item_summary/search?${params.toString()}`,
        {
          headers: {
            'X-EBAY-C-MARKETPLACE-ID': this.getMarketplaceId(options.globalSiteId),
          },
        }
      );

      console.log(
        `[searchItems] Found ${response.data.itemSummaries?.length || 0} items`
      );

      return response.data;
    }, `searchItems("${options.keywords}")`);
  }

  /**
   * Get details for a specific item
   * 
   * @param itemId - eBay item ID
   * @param globalSiteId - eBay global site ID
   * @returns Item details
   */
  async getItem(itemId: string, globalSiteId: string): Promise<EbayItem> {
    return this.withRetry(async () => {
      console.log(`[getItem] Fetching details for item ${itemId}`);

      const response = await this.client.get<EbayItem>(`/item/${itemId}`, {
        headers: {
          'X-EBAY-C-MARKETPLACE-ID': this.getMarketplaceId(globalSiteId),
        },
      });

      return response.data;
    }, `getItem("${itemId}")`);
  }

  /**
   * Search for items with specific price range
   * Convenience method that builds price filter
   * 
   * @param keywords - Search keywords
   * @param globalSiteId - eBay global site ID
   * @param minPrice - Minimum price (inclusive)
   * @param maxPrice - Maximum price (inclusive)
   * @param limit - Maximum results
   * @returns SearchItemsResponse with matching items
   */
  async searchItemsByPrice(
    keywords: string,
    globalSiteId: string,
    minPrice: number,
    maxPrice: number,
    limit: number = 50
  ): Promise<SearchItemsResponse> {
    const filter = `price:[${minPrice}..${maxPrice}]`;
    return this.searchItems({
      keywords,
      globalSiteId,
      limit,
      filter,
    });
  }

  /**
   * Search for items with multiple filters
   * Convenience method for complex searches
   * 
   * @param keywords - Search keywords
   * @param globalSiteId - eBay global site ID
   * @param filters - Object with filter criteria
   * @returns SearchItemsResponse with matching items
   */
  async searchItemsAdvanced(
    keywords: string,
    globalSiteId: string,
    filters: {
      minPrice?: number;
      maxPrice?: number;
      condition?: 'NEW' | 'REFURBISHED' | 'USED' | 'FOR_PARTS';
      freeShippingOnly?: boolean;
      newItemsOnly?: boolean;
    },
    limit: number = 50
  ): Promise<SearchItemsResponse> {
    const filterParts: string[] = [];

    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      const min = filters.minPrice || 0;
      const max = filters.maxPrice || 999999;
      filterParts.push(`price:[${min}..${max}]`);
    }

    if (filters.condition) {
      filterParts.push(`conditions:{${filters.condition}}`);
    }

    if (filters.freeShippingOnly) {
      filterParts.push('buyingOptions:{FREE_SHIPPING}');
    }

    if (filters.newItemsOnly) {
      filterParts.push('conditions:{NEW}');
    }

    const filter = filterParts.join(',');

    return this.searchItems({
      keywords,
      globalSiteId,
      limit,
      filter: filter || undefined,
    });
  }

  /**
   * Get retry configuration
   */
  getRetryConfig(): RetryConfig {
    return { ...this.retryConfig };
  }

  /**
   * Update retry configuration
   */
  setRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = {
      ...this.retryConfig,
      ...config,
    };
    console.log('[setRetryConfig] Retry configuration updated:', this.retryConfig);
  }

  /**
   * Update access token (for token refresh)
   */
  updateAccessToken(accessToken: string): void {
    this.config.accessToken = accessToken;
    this.client.defaults.headers.Authorization = `Bearer ${accessToken}`;
    console.log('[updateAccessToken] Access token updated');
  }

  /**
   * Map global site ID to eBay marketplace ID
   */
  private getMarketplaceId(globalSiteId: string): string {
    const marketplaceMap: Record<string, string> = {
      EBAY_US: 'EBAY_US',
      EBAY_GB: 'EBAY_GB',
      EBAY_DE: 'EBAY_DE',
      EBAY_FR: 'EBAY_FR',
      EBAY_IT: 'EBAY_IT',
      EBAY_ES: 'EBAY_ES',
      EBAY_AU: 'EBAY_AU',
      EBAY_CA: 'EBAY_CA',
      EBAY_IN: 'EBAY_IN',
      EBAY_JP: 'EBAY_JP',
    };

    return marketplaceMap[globalSiteId] || 'EBAY_US';
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new EbayBrowseService instance
 * 
 * @example
 * const service = createEbayBrowseService({
 *   accessToken: 'your-token',
 *   sandbox: true,
 * });
 * 
 * const results = await service.searchItems({
 *   keywords: 'iPhone 15',
 *   globalSiteId: 'EBAY_US',
 * });
 */
export function createEbayBrowseService(
  config: EbayBrowseConfig,
  retryConfig?: Partial<RetryConfig>
): EbayBrowseService {
  return new EbayBrowseService(config, retryConfig);
}

export default EbayBrowseService;
