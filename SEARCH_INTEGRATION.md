# eBay Search Integration Guide

Complete guide for using the OAuth-integrated search functionality.

## Overview

The search service integrates eBay's OAuth2 tokens with powerful search, price tracking, and notification features:

- **Saved Searches**: Create reusable search configurations
- **Price Tracking**: Monitor item prices and detect drops
- **Wishlist Management**: Organize tracked items
- **Notifications**: Alert users on price changes
- **OAuth Integration**: Automatic token refresh on API calls

## API Endpoints

### Saved Searches

#### Get All Saved Searches
```bash
curl http://localhost:3000/api/search/saved \
  -H "x-user-id: 1"
```

Response:
```json
{
  "searches": [
    {
      "id": 1,
      "name": "Gaming Laptops Under $1000",
      "searchKeywords": "gaming laptop",
      "minPrice": 500,
      "maxPrice": 1000,
      "condition": "New",
      "buyingFormat": "FixedPrice",
      "isActive": true,
      "itemCount": 15,
      "lastRunAt": "2024-01-10T12:30:00Z",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### Create Saved Search
```bash
curl -X POST http://localhost:3000/api/search/saved \
  -H "Content-Type: application/json" \
  -H "x-user-id: 1" \
  -d '{
    "name": "iPhone 15 Pro Deals",
    "searchKeywords": "iPhone 15 Pro",
    "minPrice": 800,
    "maxPrice": 1200,
    "condition": "New",
    "buyingFormat": "FixedPrice",
    "freeShipping": true,
    "authorizedSeller": true
  }'
```

Response:
```json
{
  "message": "Saved search created",
  "search": {
    "id": 1,
    "userId": 1,
    "name": "iPhone 15 Pro Deals",
    "searchKeywords": "iPhone 15 Pro",
    "minPrice": 800.00,
    "maxPrice": 1200.00,
    "condition": "New",
    "buyingFormat": "FixedPrice",
    "freeShipping": true,
    "isActive": true,
    "createdAt": "2024-01-10T12:00:00Z"
  }
}
```

#### Delete Saved Search
```bash
curl -X DELETE http://localhost:3000/api/search/saved/1 \
  -H "x-user-id: 1"
```

### Execute Searches

#### Run Search and Add Items to Wishlist
```bash
curl -X POST http://localhost:3000/api/search/execute/1 \
  -H "x-user-id: 1"
```

**Requirements:**
- User must be authenticated with eBay OAuth
- Status code 401 if not authenticated

Response (starts async execution):
```json
{
  "message": "Search execution started",
  "searchId": 1,
  "status": "processing",
  "checkStatusAt": "/api/search/saved/1"
}
```

### Wishlist Management

#### Get Wishlist Items
```bash
# All active items
curl http://localhost:3000/api/search/wishlist \
  -H "x-user-id: 1"

# Filter options: active, won, purchased, all
curl http://localhost:3000/api/search/wishlist?filter=all \
  -H "x-user-id: 1"
```

Response:
```json
{
  "items": [
    {
      "id": 1,
      "ebayItemId": "123456789",
      "title": "iPhone 15 Pro 256GB",
      "currentPrice": 999.99,
      "targetPrice": 1200.00,
      "seller": "electronics-seller",
      "sellerRating": 4.8,
      "isActive": true,
      "isWon": false,
      "isPurchased": false,
      "lowestPrice": 899.99,
      "highestPrice": 1299.99,
      "search": "iPhone 15 Pro Deals",
      "lastChecked": "2024-01-10T12:45:00Z",
      "addedAt": "2024-01-01T00:00:00Z",
      "priceHistory": [
        {
          "price": 999.99,
          "priceDropped": false,
          "recordedAt": "2024-01-10T12:45:00Z"
        }
      ]
    }
  ],
  "total": 1
}
```

#### Add Item to Wishlist
```bash
curl -X POST http://localhost:3000/api/search/wishlist \
  -H "Content-Type: application/json" \
  -H "x-user-id: 1" \
  -d '{
    "ebayItemId": "987654321",
    "itemTitle": "Sony WH-1000XM5 Headphones",
    "itemUrl": "https://ebay.com/itm/987654321",
    "targetPrice": 300.00
  }'
```

#### Remove Item from Wishlist
```bash
curl -X DELETE http://localhost:3000/api/search/wishlist/1 \
  -H "x-user-id: 1"
```

### Price Checking

#### Check Prices for All Items
```bash
curl -X POST http://localhost:3000/api/search/check-prices \
  -H "x-user-id: 1"
```

**Requirements:**
- User must have OAuth token (starts async execution)

Response:
```json
{
  "message": "Price check started",
  "status": "processing"
}
```

**What happens:**
1. Fetches current price for each active wishlist item via eBay API
2. Records price in item history
3. Automatically refreshes OAuth token if it expires during calls
4. Detects price drops using previous price
5. Updates lowest/highest price records

### Notifications

#### Get Price Drop Notifications
```bash
# Last 24 hours
curl http://localhost:3000/api/search/notifications \
  -H "x-user-id: 1"

# Last 7 days
curl http://localhost:3000/api/search/notifications?hours=168 \
  -H "x-user-id: 1"
```

Response:
```json
{
  "notifications": [
    {
      "id": 1,
      "item": {
        "itemTitle": "iPhone 15 Pro 256GB",
        "itemUrl": "https://ebay.com/itm/123456789"
      },
      "price": 899.99,
      "priceDropAmount": 100.00,
      "recordedAt": "2024-01-10T12:00:00Z"
    }
  ],
  "total": 1
}
```

#### Send Notifications
```bash
curl -X POST http://localhost:3000/api/search/send-notifications \
  -H "x-user-id: 1"
```

**Note:** Currently queues for processing. Extend with Discord webhook integration:

```typescript
// In ebay.service.ts, add Discord integration:
async function sendDiscordNotification(discordId: string, message: string) {
  const webhookUrl = `https://discord.com/api/webhooks/${process.env.DISCORD_WEBHOOK_ID}/${process.env.DISCORD_WEBHOOK_TOKEN}`;
  
  await axios.post(webhookUrl, {
    content: `<@${discordId}> ${message}`
  });
}
```

### Dashboard

#### Get Statistics
```bash
curl http://localhost:3000/api/search/stats \
  -H "x-user-id: 1"
```

Response:
```json
{
  "watchlistItems": 15,
  "savedSearches": 3,
  "priceDropsLastWeek": 12,
  "avgPriceDrop": 45.50,
  "lastSync": null
}
```

## Integration Examples

### Example 1: Monitor Specific Product

```bash
# 1. Create search for specific product
curl -X POST http://localhost:3000/api/search/saved \
  -H "Content-Type: application/json" \
  -H "x-user-id: 1" \
  -d '{
    "name": "PS5 Console Deals",
    "searchKeywords": "PlayStation 5",
    "maxPrice": 550,
    "buyingFormat": "FixedPrice",
    "freeShipping": true
  }'

# 2. Execute search (adds items to wishlist)
curl -X POST http://localhost:3000/api/search/execute/1 \
  -H "x-user-id: 1"

# 3. Check current prices
curl -X POST http://localhost:3000/api/search/check-prices \
  -H "x-user-id: 1"

# 4. Get notifications if prices dropped
curl http://localhost:3000/api/search/notifications \
  -H "x-user-id: 1"
```

### Example 2: Schedule Automated Monitoring

```typescript
// src/jobs/scheduler.ts
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { runScheduledTasks } from '../services/ebay.service';

const prisma = new PrismaClient();

// Run every 6 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('Starting scheduled eBay tasks...');
  await runScheduledTasks();
});

// Alternative: Every hour during business hours
cron.schedule('0 9-18 * * MON-FRI', async () => {
  console.log('Running hourly eBay check...');
  
  const users = await prisma.user.findMany({
    where: { ebayOAuthToken: { not: null } }
  });
  
  for (const user of users) {
    await checkAndRecordPrices(user.id);
  }
});
```

### Example 3: Frontend Integration (React)

```typescript
// Frontend: Hook for search management
const useEbaySearch = (userId: number) => {
  const [searches, setSearches] = useState([]);
  const [loading, setLoading] = useState(false);

  const getSearches = async () => {
    const res = await fetch('/api/search/saved', {
      headers: { 'x-user-id': userId.toString() }
    });
    setSearches(await res.json());
  };

  const createSearch = async (searchData: any) => {
    const res = await fetch('/api/search/saved', {
      method: 'POST',
      headers: {
        'x-user-id': userId.toString(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(searchData)
    });
    return res.json();
  };

  const executeSearch = async (searchId: number) => {
    setLoading(true);
    const res = await fetch(`/api/search/execute/${searchId}`, {
      method: 'POST',
      headers: { 'x-user-id': userId.toString() }
    });
    setLoading(false);
    return res.json();
  };

  return { searches, getSearches, createSearch, executeSearch, loading };
};
```

## OAuth Token Management

The search service automatically manages OAuth tokens:

### Automatic Refresh On API Call
```typescript
// makeAuthenticatedRequest in ebayOAuth.ts handles:
// 1. Checks if token is expired
// 2. Makes API call with Bearer token
// 3. If receives 401 Unauthorized:
//    - Calls refreshAccessToken()
//    - Updates database via callback
//    - Retries request with new token
```

### Manual Token Refresh
```bash
curl -X POST http://localhost:3000/api/oauth/refresh \
  -H "Content-Type: application/json" \
  -H "x-user-id: 1"
```

### Check Token Status
```bash
curl http://localhost:3000/api/oauth/status \
  -H "x-user-id: 1"
```

## Error Handling

### Common Errors

#### 401 Unauthorized
```json
{
  "error": "Not authenticated with eBay. Please authenticate first via /api/oauth/callback"
}
```
**Solution:** User needs to complete OAuth flow via `/api/oauth/callback`

#### 400 Bad Request
```json
{
  "error": "Missing or invalid x-user-id header"
}
```
**Solution:** Include valid `x-user-id` header in all requests

#### 404 Not Found
```json
{
  "error": "Search not found"
}
```
**Solution:** Verify search exists and belongs to user

#### 500 Server Error
```json
{
  "error": "Failed to execute search"
}
```
**Solution:** Check server logs and verify eBay API credentials

## Performance Tips

1. **Rate Limiting**: eBay API has rate limits (typically 50 concurrent calls)
   - Space out price checks across users
   - Use scheduler to spread load

2. **Batch Operations**: Check prices for multiple users together
   ```typescript
   // Run for all users at once (parallel with concurrency control)
   await Promise.all(
     users.map(user => checkAndRecordPrices(user.id))
   );
   ```

3. **Cache Search Results**: Store results temporarily to avoid duplicate API calls
   ```typescript
   const searchCache = new Map<number, any>();
   
   // Check cache first
   if (searchCache.has(searchId)) {
     return searchCache.get(searchId);
   }
   ```

4. **Database Indexes**: Schema includes indexes on:
   - `userId` (for fast user lookups)
   - `wishlistItemId` (for price history)
   - `recordedAt` (for date range queries)
   - `priceDropped` (for notification queries)

## Next Steps

1. **Database Migration**
   ```bash
   npm run prisma:migrate
   ```

2. **Test OAuth Flow**
   - Visit `/api/oauth/login` with Discord ID
   - Complete eBay authorization
   - Verify token stored in database

3. **Run First Search**
   - Create saved search via POST `/api/search/saved`
   - Execute search via POST `/api/search/execute/{id}`
   - Monitor price via GET `/api/search/wishlist`

4. **Add Discord Integration**
   - Set `DISCORD_WEBHOOK_ID` and `DISCORD_WEBHOOK_TOKEN` in `.env`
   - Uncomment Discord notification call in `notifyPriceDrops()`

5. **Deploy Scheduler**
   - Install `node-cron` package
   - Create `src/jobs/scheduler.ts` with cron jobs
   - Integrate with your deployment platform

## Related Documentation

- [OAuth Implementation Guide](./OAUTH_IMPLEMENTATION.md) - Token management and security
- [Database Schema Documentation](./PRISMA_SCHEMA.md) - Data models and relationships
- [Service Layer Examples](./SERVICES_EXAMPLES.md) - Additional CRUD operations
