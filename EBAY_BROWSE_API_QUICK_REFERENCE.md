# eBay Browse API Service - Quick Reference

## Import & Create Service

```typescript
import { createEbayBrowseService } from '@/services/ebay-browse.service';

const service = createEbayBrowseService({
  accessToken: 'your-token',
  sandbox: true,
});
```

## Core Methods (With Built-in Retry)

### 1. Basic Search
```typescript
const results = await service.searchItems({
  keywords: 'iPhone 15',
  globalSiteId: 'EBAY_US',
  limit: 50,
});
```

### 2. Price Range Search
```typescript
const results = await service.searchItemsByPrice(
  'laptop',      // keywords
  'EBAY_US',     // globalSiteId
  500,           // minPrice
  1500,          // maxPrice
  50             // limit
);
```

### 3. Advanced Search (Multiple Filters)
```typescript
const results = await service.searchItemsAdvanced(
  'headphones',
  'EBAY_US',
  {
    minPrice: 50,
    maxPrice: 300,
    condition: 'NEW',           // NEW | REFURBISHED | USED | FOR_PARTS
    freeShippingOnly: true,
    newItemsOnly: true,
  },
  50
);
```

### 4. Get Item Details
```typescript
const item = await service.getItem('123456789', 'EBAY_US');
```

## Retry Configuration

### Default (Recommended for Most Uses)
```typescript
{
  maxRetries: 5,
  initialDelayMs: 100,
  maxDelayMs: 30000,
  exponentialBase: 2,
  retryableStatuses: [429, 500, 502, 503, 504],
}
```

### Custom Configuration
```typescript
const service = createEbayBrowseService(
  { accessToken: 'token', sandbox: true },
  {
    maxRetries: 8,           // More retries
    initialDelayMs: 200,     // Longer initial delay
    maxDelayMs: 60000,       // Allow up to 60 seconds
  }
);
```

## Retry Behavior

**Automatic retry on:**
- 429 (Rate Limited)
- 500, 502, 503, 504 (Server errors)
- ECONNABORTED (Timeout)
- ECONNREFUSED, ECONNRESET (Connection issues)
- ENOTFOUND (DNS failure)

**Throws immediately on:**
- 400, 401, 403, 404 (Client errors)
- Other 4xx errors

**Backoff formula:**
```
delay = min(initialDelay × baseⁿ, maxDelay)
```

**Example with defaults:**
```
Attempt 1: 100ms
Attempt 2: 200ms
Attempt 3: 400ms
Attempt 4: 800ms
Attempt 5: 1,600ms
Attempt 6: 3,200ms (capped at 30,000ms max)
```

## Response Types

### SearchItemsResponse
```typescript
interface SearchItemsResponse {
  itemSummaries: EbayItem[];
  total: number;        // Total results available
  offset: number;       // Current offset
  limit: number;        // Items per page
  href: string;         // API endpoint URL
}
```

### EbayItem
```typescript
interface EbayItem {
  itemId: string;
  title: string;
  price: {
    value: string;      // "999.99"
    currency: string;   // "USD"
  };
  condition: string;    // "NEW", "USED", etc.
  conditionId: string;
  seller: {
    username: string;
    feedbackPercentage: string;     // "98.5"
    feedbackScore: number;          // 1000
  };
  itemLocation: {
    postalCode: string;
    country: string;
  };
  image: {
    imageUrl: string;
  };
  itemHref: string;     // Link to listing
  buyingOptions: string[]; // ["FIXED_PRICE", "AUCTION"]
  shippingOptions?: Array<{
    shippingCost: {
      value: string;
      currency: string;
    };
  }>;
}
```

## Pagination

```typescript
// Fetch all results (with automatic pagination)
const allItems = [];
let offset = 0;
const pageSize = 50;

while (true) {
  const results = await service.searchItems({
    keywords: 'laptop',
    globalSiteId: 'EBAY_US',
    limit: pageSize,
    offset: offset > 0 ? offset : undefined,
  });

  allItems.push(...results.itemSummaries);

  if (allItems.length >= results.total) break;
  offset += pageSize;
}
```

## Token Refresh

```typescript
// After OAuth token refresh
service.updateAccessToken('new-access-token');

// Or within error handler
if (error.response?.status === 401) {
  // Refresh token via OAuth
  const newToken = await refreshOAuthToken();
  service.updateAccessToken(newToken);
  
  // Retry the search
  const results = await service.searchItems({...});
}
```

## Error Handling

```typescript
try {
  const results = await service.searchItems({
    keywords: 'test',
    globalSiteId: 'EBAY_US',
  });
} catch (error) {
  if (axios.isAxiosError(error)) {
    switch (error.response?.status) {
      case 401:
        console.log('Token expired');
        break;
      case 429:
        console.log('Rate limited - exhausted all retries');
        break;
      case 500:
        console.log('Server error - exhausted all retries');
        break;
      default:
        console.log('API error:', error.message);
    }
  } else {
    console.log('Network error:', error.message);
  }
}
```

## Global Sites Supported

| Code | Market |
|------|--------|
| EBAY_US | United States |
| EBAY_GB | United Kingdom |
| EBAY_DE | Germany |
| EBAY_FR | France |
| EBAY_IT | Italy |
| EBAY_ES | Spain |
| EBAY_AU | Australia |
| EBAY_CA | Canada |
| EBAY_IN | India |
| EBAY_JP | Japan |

## Conditions Supported

- `NEW` - Brand new
- `REFURBISHED` - Refurbished item
- `USED` - Used item
- `FOR_PARTS` - For parts or not working

## Buying Options

- `FIXED_PRICE` - Fixed price sale
- `AUCTION` - Auction
- `FREE_SHIPPING` - Free shipping available

## Search Filters (Advanced)

```typescript
// Price filter
filter: 'price:[100..500]'

// Condition filter
filter: 'conditions:{NEW}'

// Free shipping
filter: 'buyingOptions:{FREE_SHIPPING}'

// Multiple filters (comma-separated)
filter: 'price:[100..500],conditions:{NEW},buyingOptions:{FREE_SHIPPING}'
```

## Performance Tips

1. **Respect rate limits** - Don't lower delays too much
2. **Use pagination** - Fetch in batches, not all at once
3. **Cache results** - Don't re-search same keywords
4. **Set appropriate limits** - Balance between API calls and completeness
5. **Monitor 429s** - They indicate API usage near limit

## Integration with OAuth

```typescript
import { PrismaClient } from '@prisma/client';
import { createEbayBrowseService } from '@/services/ebay-browse.service';

const prisma = new PrismaClient();

export async function searchWithOAuth(userId: number, keywords: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  const service = createEbayBrowseService({
    accessToken: user.ebayOAuthToken,
    sandbox: process.env.EBAY_SANDBOX === 'true',
  });

  return await service.searchItems({
    keywords,
    globalSiteId: 'EBAY_US',
    limit: 50,
  });
}
```

## Logging Output

```typescript
// Search starts
[searchItems] Searching for "iPhone 15" on EBAY_US

// Search succeeds
[searchItems] Found 1500 items

// Rate limit retry
[searchItems("iPhone")] Rate limited (429). Respecting Retry-After header: 5s

// Server error retry
[searchItems("test")] 503 error. Attempt 1/6. Retrying in 100ms

// Token update
[updateAccessToken] Access token updated

// Config update
[setRetryConfig] Retry configuration updated: {...}
```

## Common Patterns

### Pattern 1: Search & Filter
```typescript
const results = await service.searchItems({
  keywords: 'laptop',
  globalSiteId: 'EBAY_US',
});

const newItems = results.itemSummaries.filter(
  item => item.condition === 'NEW'
);

const sortedByPrice = newItems.sort(
  (a, b) => parseFloat(a.price.value) - parseFloat(b.price.value)
);
```

### Pattern 2: Multi-Market Compare
```typescript
const markets = ['EBAY_US', 'EBAY_GB', 'EBAY_DE'];
const results = {};

for (const market of markets) {
  results[market] = await service.searchItems({
    keywords: 'laptop',
    globalSiteId: market,
    limit: 10,
  });
}
```

### Pattern 3: Find Best Deal
```typescript
const results = await service.searchItemsByPrice(
  'laptop',
  'EBAY_US',
  500,
  1500
);

const bestDeal = results.itemSummaries.reduce((best, current) => {
  const currentPrice = parseFloat(current.price.value);
  const bestPrice = parseFloat(best.price.value);
  return currentPrice < bestPrice ? current : best;
});
```

### Pattern 4: Store Results
```typescript
const results = await service.searchItems({...});

// Save to database
for (const item of results.itemSummaries) {
  await prisma.searchResult.upsert({
    where: { ebayItemId: item.itemId },
    update: { price: parseFloat(item.price.value) },
    create: {
      ebayItemId: item.itemId,
      title: item.title,
      price: parseFloat(item.price.value),
      seller: item.seller.username,
      url: item.itemHref,
    },
  });
}
```

## Debugging

```typescript
// Get current retry config
const config = service.getRetryConfig();
console.log(config);

// Update retry config
service.setRetryConfig({
  maxRetries: 8,
  initialDelayMs: 200,
});

// Check service is working
const testResults = await service.searchItems({
  keywords: 'test',
  globalSiteId: 'EBAY_US',
  limit: 5,
});
console.log(`Service OK: Found ${testResults.total} items`);
```

## Files

- **[src/services/ebay-browse.service.ts](src/services/ebay-browse.service.ts)** - Main service class (400+ lines)
- **[src/services/ebay-browse.examples.ts](src/services/ebay-browse.examples.ts)** - 9 usage examples
- **[EBAY_BROWSE_API.md](EBAY_BROWSE_API.md)** - Complete documentation (400+ lines)

## Related

- [OAuth Implementation](./OAUTH_IMPLEMENTATION.md)
- [Search Integration](./SEARCH_INTEGRATION.md)
- [eBay API Docs](https://developer.ebay.com/docs/buy/)
