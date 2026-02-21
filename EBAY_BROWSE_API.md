# eBay Browse API Service with Retry & Exponential Backoff

Complete TypeScript service class for interacting with the eBay Browse API with sophisticated retry logic, exponential backoff, and rate limit handling.

## Overview

The `EbayBrowseService` provides:

- ✅ Type-safe eBay Browse API integration (TypeScript)
- ✅ Automatic retry with exponential backoff
- ✅ HTTP 429 (rate limit) handling
- ✅ Network timeout handling (configurable)
- ✅ Server error recovery (5xx responses)
- ✅ Connection failure detection
- ✅ Retry-After header support
- ✅ Configurable retry parameters
- ✅ Token refresh capability
- ✅ Multiple marketplace support

## Features

### Retry Mechanism

Automatically retries failed requests with exponential backoff:

```
Attempt 1: Fail immediately
Attempt 2: Wait 100ms, retry
Attempt 3: Wait 200ms, retry
Attempt 4: Wait 400ms, retry
Attempt 5: Wait 800ms, retry
Attempt 6: Wait 1600ms, retry
(continues with max delay cap)
```

### Retryable Errors

The service automatically retries on:

| Error Type | Status | Reason |
|-----------|--------|--------|
| Rate Limited | 429 | Too many requests |
| Server Error | 500 | Internal server error |
| Bad Gateway | 502 | Invalid gateway |
| Service Unavailable | 503 | Service temporarily down |
| Gateway Timeout | 504 | Gateway timeout |
| Connection Timeout | ECONNABORTED | Network timeout |
| Connection Refused | ECONNREFUSED | Server not accepting connections |
| Connection Reset | ECONNRESET | Server closed connection |
| DNS Failed | ENOTFOUND | Domain not found |

### Non-Retryable Errors (Throw Immediately)

- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- Other 4xx client errors

## Installation

The service uses `axios` which is already installed:

```bash
npm list axios
# axios@1.6.7
```

## Configuration

### Basic Setup

```typescript
import { createEbayBrowseService } from '@/services/ebay-browse.service';

const service = createEbayBrowseService({
  accessToken: 'your-ebay-oauth-token',
  sandbox: true, // Use sandbox for testing
});
```

### Custom Retry Configuration

```typescript
const service = createEbayBrowseService(
  {
    accessToken: 'your-token',
    sandbox: false,
  },
  {
    maxRetries: 5,           // Maximum retry attempts
    initialDelayMs: 100,     // Initial backoff delay
    maxDelayMs: 30000,       // Cap on backoff (30 seconds)
    exponentialBase: 2,      // Double delay each attempt
    retryableStatuses: [429, 500, 502, 503, 504],
  }
);
```

## API Methods

### searchItems

Basic search with keywords and global site ID:

```typescript
const results = await service.searchItems({
  keywords: 'iPhone 15 pro',
  globalSiteId: 'EBAY_US',
  limit: 50,
  offset: 0,
  filter: 'price:[500..1200]', // Optional
});

// Response
{
  itemSummaries: [
    {
      itemId: '123456789',
      title: 'iPhone 15 Pro - New',
      price: { value: '999.99', currency: 'USD' },
      condition: 'NEW',
      seller: { username: 'seller-name', feedbackScore: 1000 },
      // ... more fields
    }
  ],
  total: 1500,
  offset: 0,
  limit: 50
}
```

**Parameters:**
- `keywords` (required) - Search terms
- `globalSiteId` (required) - eBay market (EBAY_US, EBAY_GB, EBAY_DE, etc.)
- `limit` (optional) - Results per page (default: 50)
- `offset` (optional) - Pagination offset
- `filter` (optional) - eBay filter string

**Features:**
- Fully typed response with TypeScript
- Automatic retry on 429/5xx/timeout
- Respects Retry-After headers
- Logs search progress

### searchItemsByPrice

Convenience method for price range filtering:

```typescript
const results = await service.searchItemsByPrice(
  'gaming laptop',  // keywords
  'EBAY_US',       // globalSiteId
  500,             // minPrice
  1500,            // maxPrice
  25               // limit (optional)
);
```

### searchItemsAdvanced

Complex search with multiple filter options:

```typescript
const results = await service.searchItemsAdvanced(
  'sony headphones',
  'EBAY_US',
  {
    minPrice: 50,
    maxPrice: 300,
    condition: 'NEW',           // NEW | REFURBISHED | USED | FOR_PARTS
    freeShippingOnly: true,
    newItemsOnly: true,
  },
  50 // limit
);
```

**Supported Filters:**
- Price range (min/max)
- Item condition
- Free shipping only
- New items only

### getItem

Get details for a specific item:

```typescript
const item = await service.getItem('123456789', 'EBAY_US');
```

### updateAccessToken

Update token after OAuth refresh:

```typescript
service.updateAccessToken('new-access-token-from-refresh');
```

### getRetryConfig & setRetryConfig

Get or update retry settings:

```typescript
// Get current config
const current = service.getRetryConfig();

// Update config
service.setRetryConfig({
  maxRetries: 8,
  initialDelayMs: 200,
});
```

## Examples

### Example 1: Basic Search

```typescript
import { createEbayBrowseService } from '@/services/ebay-browse.service';

async function searchProducts() {
  const service = createEbayBrowseService({
    accessToken: process.env.EBAY_ACCESS_TOKEN,
    sandbox: true,
  });

  const results = await service.searchItems({
    keywords: 'laptop',
    globalSiteId: 'EBAY_US',
    limit: 50,
  });

  console.log(`Found ${results.total} items`);
  results.itemSummaries.forEach(item => {
    console.log(`${item.title} - $${item.price.value}`);
  });
}
```

### Example 2: Price Range Search

```typescript
async function findAffordableLaptops() {
  const service = createEbayBrowseService({
    accessToken: process.env.EBAY_ACCESS_TOKEN,
    sandbox: true,
  });

  // Find laptops $500-$1500
  const results = await service.searchItemsByPrice(
    'laptop',
    'EBAY_US',
    500,
    1500,
    50
  );

  return results.itemSummaries;
}
```

### Example 3: Advanced Search with Filters

```typescript
async function findNewWithFreeShipping() {
  const service = createEbayBrowseService({
    accessToken: process.env.EBAY_ACCESS_TOKEN,
    sandbox: true,
  });

  const results = await service.searchItemsAdvanced(
    'electronics',
    'EBAY_US',
    {
      minPrice: 20,
      maxPrice: 200,
      condition: 'NEW',
      freeShippingOnly: true,
    },
    100
  );

  return results;
}
```

### Example 4: Custom Retry Configuration

```typescript
async function searchWithCustomRetry() {
  const service = createEbayBrowseService(
    {
      accessToken: process.env.EBAY_ACCESS_TOKEN,
      sandbox: false,
    },
    {
      maxRetries: 8,        // More retries for production
      initialDelayMs: 200,  // Longer initial wait
      maxDelayMs: 60000,    // Allow up to 60 seconds
      exponentialBase: 2,
      retryableStatuses: [429, 500, 502, 503, 504],
    }
  );

  const results = await service.searchItems({
    keywords: 'popular-item',
    globalSiteId: 'EBAY_US',
  });

  return results;
}
```

### Example 5: Token Refresh Workflow

```typescript
import { makeAuthenticatedRequest, OAuthTokens } from '@/utils/ebayOAuth';
import { createEbayBrowseService } from '@/services/ebay-browse.service';

async function searchWithTokenRefresh(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  const service = createEbayBrowseService({
    accessToken: user.ebayOAuthToken,
    sandbox: true,
  });

  try {
    // Search will automatically retry on 401
    const results = await service.searchItems({
      keywords: 'test',
      globalSiteId: 'EBAY_US',
    });

    return results;
  } catch (error) {
    // If 401 still occurs, refresh token manually
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const newTokens = await refreshAccessToken(
        user.ebayOAuthRefreshToken
      );

      // Update service with new token
      service.updateAccessToken(newTokens.accessToken);

      // Retry search
      const results = await service.searchItems({
        keywords: 'test',
        globalSiteId: 'EBAY_US',
      });

      // Update database
      await prisma.user.update({
        where: { id: userId },
        data: {
          ebayOAuthToken: newTokens.accessToken,
          ebayOAuthRefreshToken: newTokens.refreshToken,
          ebayOAuthExpiresAt: newTokens.expiresAt,
        },
      });

      return results;
    }

    throw error;
  }
}
```

### Example 6: Pagination

```typescript
async function getAllResults(keywords: string) {
  const service = createEbayBrowseService({
    accessToken: process.env.EBAY_ACCESS_TOKEN,
    sandbox: true,
  });

  const allItems = [];
  const pageSize = 50;
  let offset = 0;

  while (true) {
    const results = await service.searchItems({
      keywords,
      globalSiteId: 'EBAY_US',
      limit: pageSize,
      offset: offset > 0 ? offset : undefined,
    });

    allItems.push(...results.itemSummaries);

    // Stop if we have all items or reached the limit
    if (
      allItems.length >= results.total ||
      allItems.length >= 1000 // Safety limit
    ) {
      break;
    }

    offset += pageSize;
  }

  return allItems;
}
```

### Example 7: Multi-Market Search

```typescript
async function searchAllMarkets(keywords: string) {
  const markets = [
    'EBAY_US',
    'EBAY_GB',
    'EBAY_DE',
    'EBAY_FR',
    'EBAY_AU',
  ];

  const service = createEbayBrowseService({
    accessToken: process.env.EBAY_ACCESS_TOKEN,
    sandbox: true,
  });

  const results = {};

  for (const market of markets) {
    try {
      results[market] = await service.searchItems({
        keywords,
        globalSiteId: market,
        limit: 25,
      });
    } catch (error) {
      console.error(`Search failed for ${market}:`, error);
      results[market] = null;
    }
  }

  return results;
}
```

## Retry Backoff Examples

### Default Configuration

```
maxRetries: 5
initialDelayMs: 100
maxDelayMs: 30000
exponentialBase: 2

Backoff sequence:
  Attempt 1: 100ms
  Attempt 2: 200ms
  Attempt 3: 400ms
  Attempt 4: 800ms
  Attempt 5: 1600ms
  Attempt 6: 3200ms (capped at 30000ms)
  
Total possible wait: ~6.1 seconds
```

### Conservative Configuration (Low Rate Limit Risk)

```typescript
{
  maxRetries: 3,
  initialDelayMs: 500,  // Start with longer delay
  maxDelayMs: 10000,
  exponentialBase: 2,
}

Backoff sequence:
  Attempt 1: 500ms
  Attempt 2: 1000ms
  Attempt 3: 2000ms
  Attempt 4: 4000ms
  
Total possible wait: ~7.5 seconds
```

### Aggressive Configuration (High-Volume Queries)

```typescript
{
  maxRetries: 8,
  initialDelayMs: 50,   // Start quick
  maxDelayMs: 60000,    // Allow longer max wait
  exponentialBase: 2,
}

Backoff sequence:
  Attempt 1: 50ms
  Attempt 2: 100ms
  Attempt 3: 200ms
  Attempt 4: 400ms
  Attempt 5: 800ms
  Attempt 6: 1600ms
  Attempt 7: 3200ms
  Attempt 8: 6400ms
  Attempt 9: 12800ms (capped at 60000ms)
  
Total possible wait: ~25.5 seconds
```

## Error Handling

### Handling Rate Limits

```typescript
try {
  const results = await service.searchItems({
    keywords: 'popular-item',
    globalSiteId: 'EBAY_US',
  });
} catch (error) {
  if (axios.isAxiosError(error) && error.response?.status === 429) {
    console.log('Rate limited - exhausted all retries');
    console.log('Wait before next request');
  }
}
```

### Handling Network Timeouts

```typescript
try {
  const results = await service.searchItems({
    keywords: 'test',
    globalSiteId: 'EBAY_US',
  });
} catch (error) {
  if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
    console.log('Network timeout - exhausted all retries');
  }
}
```

### Handling Unauthorized (Token Expired)

```typescript
try {
  const results = await service.searchItems({
    keywords: 'test',
    globalSiteId: 'EBAY_US',
  });
} catch (error) {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    // Token is invalid, must refresh
    console.log('Token expired - user must re-authenticate');
  }
}
```

## Logging

The service logs at key points:

```typescript
// Search start
[searchItems] Searching for "iPhone 15" on EBAY_US

// Successful search
[searchItems] Found 150 items

// Retry due to rate limit
[searchItems("laptop")] Rate limited (429). Respecting Retry-After header: 5s

// Retry due to server error
[searchItems("test")] 503 error. Attempt 1/6. Retrying in 100ms

// Token update
[updateAccessToken] Access token updated

// Retry config update
[setRetryConfig] Retry configuration updated: {...}
```

## Integration with eBay Service

Connect with existing OAuth and service infrastructure:

```typescript
// src/services/ebay-browse.integration.ts
import { PrismaClient } from '@prisma/client';
import { createEbayBrowseService } from './ebay-browse.service';
import { makeAuthenticatedRequest, OAuthTokens } from '@/utils/ebayOAuth';

const prisma = new PrismaClient();

export async function searchWithBrowseAPI(userId: number, keywords: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user?.ebayOAuthToken) {
    throw new Error('User not authenticated with eBay');
  }

  const service = createEbayBrowseService({
    accessToken: user.ebayOAuthToken,
    sandbox: process.env.EBAY_SANDBOX === 'true',
  });

  try {
    return await service.searchItems({
      keywords,
      globalSiteId: 'EBAY_US',
      limit: 50,
    });
  } catch (error) {
    // Handle 401 by refreshing token
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Use existing OAuth refresh logic
      const newTokens = await makeAuthenticatedRequest<OAuthTokens>(
        'https://api.ebay.com/identity/v1/oauth2/token',
        'POST',
        user.ebayOAuthToken,
        ebayConfig,
        { grant_type: 'refresh_token', refresh_token: user.ebayOAuthRefreshToken || '' }
      );

      // Update user tokens
      await prisma.user.update({
        where: { id: userId },
        data: {
          ebayOAuthToken: newTokens.accessToken,
          ebayOAuthRefreshToken: newTokens.refreshToken,
          ebayOAuthExpiresAt: newTokens.expiresAt,
        },
      });

      // Update service and retry
      service.updateAccessToken(newTokens.accessToken);
      return await service.searchItems({
        keywords,
        globalSiteId: 'EBAY_US',
        limit: 50,
      });
    }

    throw error;
  }
}
```

## TypeScript Types

Full type definitions included:

```typescript
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
  price: { value: string; currency: string };
  condition: string;
  seller: { username: string; feedbackScore: number };
  // ... 10+ more fields
}

export interface SearchItemsResponse {
  itemSummaries: EbayItem[];
  total: number;
  offset: number;
  limit: number;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  retryableStatuses: number[];
}
```

## Performance Considerations

### Rate Limiting Strategy

eBay Browse API has rate limits. The exponential backoff helps:

1. **First few requests**: Quick retries (100-400ms)
2. **Rate limited**: Longer waits (800ms-30s)
3. **Server issues**: Graceful degradation

### Timeout Settings

```typescript
// 10-second request timeout (adjustable per need)
timeout: 10000

// Network failures detected and retried
ECONNABORTED, ECONNREFUSED, ECONNRESET, ENOTFOUND
```

### Best Practices

1. **Respect rate limits**: Don't adjust retry config too aggressively
2. **Monitor 429 responses**: They indicate near-limit API usage
3. **Implement queuing**: For bulk operations, queue requests
4. **Cache results**: Don't re-search same keywords frequently
5. **Use pagination**: Fetch in batches rather than all at once

## Testing

The service is testable with different error conditions:

```typescript
// Mock axios to test retry logic
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

test('retries on 429 rate limit', async () => {
  const service = createEbayBrowseService(config);

  // Simulate rate limit on first call, success on second
  mockAxios.create().get
    .mockRejectedValueOnce(new AxiosError('Rate limited', '429'))
    .mockResolvedValueOnce({ data: expectedResponse });

  const result = await service.searchItems({
    keywords: 'test',
    globalSiteId: 'EBAY_US',
  });

  expect(result).toEqual(expectedResponse);
  expect(mockAxios.create().get).toHaveBeenCalledTimes(2);
});
```

## Files

- [src/services/ebay-browse.service.ts](src/services/ebay-browse.service.ts) - Main service class
- [src/services/ebay-browse.examples.ts](src/services/ebay-browse.examples.ts) - Usage examples
- [EBAY_BROWSE_API.md](EBAY_BROWSE_API.md) - This documentation

## Related Documentation

- [OAUTH_IMPLEMENTATION.md](./OAUTH_IMPLEMENTATION.md) - Token management
- [SEARCH_INTEGRATION.md](./SEARCH_INTEGRATION.md) - Search API overview
- eBay API Docs: https://developer.ebay.com/docs/buy/

