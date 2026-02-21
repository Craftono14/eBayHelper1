# Complete Integration Guide: OAuth + Search + Database

Step-by-step guide for setting up and using the complete eBay tracking system.

## Architecture Overview

```
┌─────────────┐
│   Frontend  │
│ (Discord    │
│  Bot)       │
└──────┬──────┘
       │
       │ x-user-id header
       ▼
┌─────────────────────────────────────────┐
│        Express.js API Server            │
├─────────────────────────────────────────┤
│ Routes:                                 │
│  • /api/oauth/* - Token management      │
│  • /api/search/* - Search & tracking    │
└──────┬──────────────────────────────────┘
       │
       ▼ Prisma ORM
┌─────────────────────────────────────────┐
│        PostgreSQL Database              │
├─────────────────────────────────────────┤
│ Tables:                                 │
│  • users - OAuth tokens                 │
│  • saved_searches - Search configs      │
│  • wishlist_items - Tracked items       │
│  • item_histories - Price history       │
└─────────────────────────────────────────┘
       ▲
       │ OAuth token refresh
       │
┌──────┴──────────────────────────────────┐
│        eBay OAuth 2.0 Endpoint          │
│   (API refresh token flow)              │
└─────────────────────────────────────────┘
```

## Setup Checklist

### 1. Initialize Database

```bash
# Create migration
npm run prisma:migrate

# This creates:
# - users table with OAuth fields
# - saved_searches table with 30+ filter fields
# - wishlist_items table with price tracking
# - item_histories table with price snapshots
```

### 2. Configure Environment

Create `.env` file:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/ebay_helper"

# eBay OAuth (get from developer.ebay.com)
EBAY_CLIENT_ID="your-client-id-from-ebay"
EBAY_CLIENT_SECRET="your-client-secret-from-ebay"
EBAY_REDIRECT_URI="http://localhost:3000/api/oauth/callback"
EBAY_SANDBOX=true

# Server
PORT=3000
NODE_ENV=development

# Optional: Discord integration
DISCORD_WEBHOOK_ID="optional-webhook-id"
DISCORD_WEBHOOK_TOKEN="optional-webhook-token"
```

### 3. Start Server

```bash
npm run dev

# Output:
# ✓ Server is running on http://localhost:3000
# ✓ OAuth routes available at http://localhost:3000/api/oauth
# ✓ Search routes available at http://localhost:3000/api/search
```

## Complete User Flow

### Step 1: User Authentication (OAuth)

```bash
# User initiates login with Discord ID
curl -X POST http://localhost:3000/api/oauth/login \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "123456789"
  }'

# Response:
# {
#   "userId": 1,
#   "authorizationUrl": "https://auth.ebay.com/oauth2/authorize?...",
#   "message": "Visit the URL to authorize"
# }
```

**What happens:**
1. Server creates/updates User record with Discord ID
2. Generates state parameter (CSRF protection)
3. Returns eBay authorization URL
4. User visits URL in browser
5. User grants permissions on eBay login page
6. eBay redirects to `/api/oauth/callback?code=...&state=...`

### Step 2: OAuth Callback (Token Exchange)

```bash
# eBay redirects user to callback with authorization code
GET http://localhost:3000/api/oauth/callback?code=abc123&state=xyz789

# Backend automatically:
# 1. Validates state parameter (CSRF check)
# 2. Exchanges code for tokens via eBay API
# 3. Stores tokens in User record:
#    - ebayOAuthToken (access token)
#    - ebayOAuthRefreshToken (refresh token)
#    - ebayOAuthExpiresAt (expiration date)
# 4. Returns to user with success message
```

### Step 3: Create Saved Searches

```bash
curl -X POST http://localhost:3000/api/search/saved \
  -H "Content-Type: application/json" \
  -H "x-user-id: 1" \
  -d '{
    "name": "Gaming Laptops",
    "searchKeywords": "gaming laptop RTX",
    "minPrice": 500,
    "maxPrice": 1500,
    "condition": "New",
    "buyingFormat": "FixedPrice",
    "freeShipping": true,
    "authorizedSeller": true,
    "buyingFormat": "FixedPrice"
  }'

# Response:
# {
#   "message": "Saved search created",
#   "search": {
#     "id": 1,
#     "userId": 1,
#     "name": "Gaming Laptops",
#     ...
#   }
# }
```

**Database state:**
```
users: { id: 1, discordId: "123456789", ebayOAuthToken: "...", ... }
saved_searches: { id: 1, userId: 1, name: "Gaming Laptops", ... }
```

### Step 4: Execute Searches (Add Items)

```bash
curl -X POST http://localhost:3000/api/search/execute/1 \
  -H "x-user-id: 1"

# Response (queued for processing):
# {
#   "message": "Search execution started",
#   "searchId": 1,
#   "status": "processing"
# }
```

**What happens internally:**

1. Service fetches User with OAuth token
2. Uses `makeAuthenticatedRequest` to call eBay API
3. If token expired: automatically refreshes + retries
4. eBay API returns matching items
5. For each item matching price filters:
   - Creates WishlistItem record
   - Creates first ItemHistory record (price snapshot)
   - Updates user's lastSyncedAt
6. Returns immediately (async operation completes in background)

**Database state after:**
```
wishlist_items: { 
  id: 1,
  userId: 1,
  searchId: 1,
  ebayItemId: "123456789",
  itemTitle: "ASUS ROG Gaming Laptop",
  currentPrice: 899.99,
  targetPrice: 1500.00,
  lowestPriceRecorded: 899.99,
  highestPriceRecorded: 899.99,
  ... 
}

item_histories: {
  id: 1,
  userId: 1,
  wishlistItemId: 1,
  price: 899.99,
  priceDropped: false,
  recordedAt: "2024-01-10T12:00:00Z",
  ...
}
```

### Step 5: Monitor Prices

```bash
curl -X POST http://localhost:3000/api/search/check-prices \
  -H "x-user-id: 1"

# Response:
# {
#   "message": "Price check started",
#   "status": "processing"
# }
```

**What happens:**

1. Fetches all active WishlistItems for user
2. For each item:
   - Uses `makeAuthenticatedRequest` to get current price
   - Automatically refreshes token if needed
   - Gets previous price from ItemHistory
   - Detects price drops: `priceDropped = currentPrice < previousPrice`
   - Calculates `priceDropAmount = previousPrice - currentPrice`
   - Creates new ItemHistory record
   - Updates WishlistItem with current price
   - Updates lowest/highest price records

**Example price drop scenario:**

```
Previous price: $1200
Current price:  $899.99
Price dropped:  true
Amount saved:   $300.01

ItemHistory created:
{
  userId: 1,
  wishlistItemId: 1,
  price: 899.99,
  priceDropped: true,
  priceDropAmount: 300.01,
  quantityAvailable: 5,
  recordedAt: "2024-01-10T13:00:00Z"
}
```

### Step 6: Get Notifications

```bash
curl http://localhost:3000/api/search/notifications?hours=24 \
  -H "x-user-id: 1"

# Response:
# {
#   "notifications": [
#     {
#       "id": 1,
#       "item": {
#         "itemTitle": "ASUS ROG Gaming Laptop",
#         "itemUrl": "https://ebay.com/itm/123456789"
#       },
#       "price": 899.99,
#       "priceDropAmount": 300.01,
#       "recordedAt": "2024-01-10T13:00:00Z"
#     }
#   ],
#   "total": 1
# }
```

### Step 7: View Wishlist

```bash
curl http://localhost:3000/api/search/wishlist \
  -H "x-user-id: 1"

# Response with full price history for each item:
# {
#   "items": [
#     {
#       "id": 1,
#       "ebayItemId": "123456789",
#       "title": "ASUS ROG Gaming Laptop",
#       "currentPrice": 899.99,
#       "targetPrice": 1500.00,
#       "lowestPrice": 799.99,
#       "highestPrice": 1299.99,
#       "priceHistory": [
#         {
#           "price": 899.99,
#           "priceDropped": true,
#           "recordedAt": "2024-01-10T13:00:00Z"
#         },
#         {
#           "price": 1200.00,
#           "priceDropped": false,
#           "recordedAt": "2024-01-10T12:00:00Z"
#         }
#       ]
#     }
#   ],
#   "total": 1
# }
```

## Token Refresh Flow (Automatic)

When API call returns 401 Unauthorized:

```
User calls /api/search/check-prices
    ↓
checkAndRecordPrices() → makeAuthenticatedRequest()
    ↓
Calls eBay API with Bearer Token: "xyz123"
    ↓
eBay returns 401 (token expired)
    ↓
Catch 401 error
    ↓
Call refreshAccessToken(refreshToken)
    ↓
POST to eBay token endpoint with refresh_token grant
    ↓
Get new accessToken, refreshToken, expiresAt
    ↓
Call onTokenRefresh callback
    ↓
Update User record in database:
  - ebayOAuthToken: newAccessToken
  - ebayOAuthRefreshToken: newRefreshToken
  - ebayOAuthExpiresAt: newExpiresAt
    ↓
Retry original request with new token
    ↓
eBay returns 200 with data
    ↓
Create/update database records
```

## Scheduling (Recurring Tasks)

### Option 1: Using node-cron

```bash
npm install node-cron
npm install -D @types/node-cron
```

Create `src/jobs/scheduler.ts`:

```typescript
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import {
  checkAndRecordPrices,
  executeSavedSearch,
  notifyPriceDrops,
} from '../services/ebay.service';

const prisma = new PrismaClient();

// Every 6 hours: Check prices for all users
cron.schedule('0 */6 * * *', async () => {
  console.log('Starting scheduled price checks...');
  
  const users = await prisma.user.findMany({
    where: { ebayOAuthToken: { not: null } }
  });
  
  for (const user of users) {
    try {
      await checkAndRecordPrices(user.id);
    } catch (error) {
      console.error(`Price check failed for user ${user.id}:`, error);
    }
  }
});

// Every day at 9 AM: Execute all active searches
cron.schedule('0 9 * * *', async () => {
  console.log('Executing daily searches...');
  
  const searches = await prisma.savedSearch.findMany({
    where: { isActive: true }
  });
  
  for (const search of searches) {
    try {
      await executeSavedSearch(search.userId, search.id);
    } catch (error) {
      console.error(`Search failed for search ${search.id}:`, error);
    }
  }
});

// Every hour: Send pending notifications
cron.schedule('0 * * * *', async () => {
  const users = await prisma.user.findMany({
    where: { ebayOAuthToken: { not: null } }
  });
  
  for (const user of users) {
    await notifyPriceDrops(user.id);
  }
});
```

Update `src/index.ts` to import scheduler:

```typescript
import './jobs/scheduler'; // Import after Express setup
```

### Option 2: External Cron Service

Use services like:
- **AWS EventBridge**: Invoke Lambda on schedule
- **Google Cloud Scheduler**: HTTP POST to endpoint
- **Heroku Scheduler**: Run dyno tasks
- **GitHub Actions**: Scheduled workflows

Create scheduled endpoint:

```typescript
// In src/routes/admin.routes.ts
router.post('/tasks/run-all', async (req, res) => {
  // Verify secret token
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  await runScheduledTasks();
  res.json({ message: 'Tasks completed' });
});
```

Call periodically:
```bash
# From external service every 6 hours
curl -X POST http://localhost:3000/api/admin/tasks/run-all \
  -H "x-admin-token: secret-token"
```

## Error Handling Examples

### Scenario 1: Token Expired During Search Execution

```
User runs: POST /api/search/execute/1
    ↓
API token check: isTokenExpired() = true (3 minutes left)
    ↓
Proceed with API call (has 5-minute buffer before actual expiry)
    ↓
eBay API returns 200 ✓
```

### Scenario 2: Token Completely Expired

```
User runs: POST /api/search/check-prices
    ↓
API token check: isTokenExpired() = true (expired 10 minutes ago)
    ↓
Attempt to refresh: refreshAccessToken()
    ↓
eBay returns new tokens
    ↓
Update User record
    ↓
Proceed with price check ✓
```

### Scenario 3: Refresh Token Invalid/Expired

```
User runs: POST /api/search/check-prices
    ↓
API token check: token expired
    ↓
Attempt to refresh: refreshAccessToken()
    ↓
eBay returns 400 (Invalid refresh token)
    ↓
Catch error, throw: "Token refresh failed and request was unauthorized"
    ↓
Return 401 to client: "Not authenticated with eBay"
    ↓
Client must re-authenticate via /api/oauth/login
```

### Scenario 4: eBay API Rate Limit

```
Too many concurrent requests
    ↓
eBay returns 429 (Too Many Requests)
    ↓
Error thrown to service
    ↓
Service catches and logs error
    ↓
Return status but continue with next item
```

## Testing Workflow

### Manual API Testing

```bash
# 1. Start server
npm run dev

# 2. Authenticate user
curl -X POST http://localhost:3000/api/oauth/login \
  -H "Content-Type: application/json" \
  -d '{"discordId": "test-user-123"}'

# Save userId and copy authorizationUrl to browser
# Complete eBay authorization flow

# 3. Create search
curl -X POST http://localhost:3000/api/search/saved \
  -H "Content-Type: application/json" \
  -H "x-user-id: 1" \
  -d '{
    "name": "Test Search",
    "searchKeywords": "iPhone 15",
    "maxPrice": 1200,
    "freeShipping": true
  }'

# Save search id

# 4. Execute search
curl -X POST http://localhost:3000/api/search/execute/1 \
  -H "x-user-id: 1"

# Wait 5-10 seconds for async completion

# 5. View wishlist
curl http://localhost:3000/api/search/wishlist \
  -H "x-user-id: 1"

# 6. Check prices
curl -X POST http://localhost:3000/api/search/check-prices \
  -H "x-user-id: 1"

# Wait 5-10 seconds

# 7. View notifications
curl http://localhost:3000/api/search/notifications?hours=1 \
  -H "x-user-id: 1"

# 8. View dashboard
curl http://localhost:3000/api/search/stats \
  -H "x-user-id: 1"
```

### Database Inspection

```bash
# Open Prisma Studio
npm run prisma:studio

# Browse all tables:
# - users (see OAuth tokens)
# - saved_searches (see all filters)
# - wishlist_items (see tracked items)
# - item_histories (see price snapshots)
```

## Production Checklist

- [ ] Set `EBAY_SANDBOX=false` to use production eBay API
- [ ] Configure PostgreSQL with proper backups
- [ ] Set up monitoring/alerting for failed price checks
- [ ] Implement rate limiting for API endpoints
- [ ] Add request logging and analytics
- [ ] Set up Discord webhook for notifications
- [ ] Test token refresh workflow end-to-end
- [ ] Configure CORS for your frontend domain
- [ ] Set secure HTTPS with valid SSL certificates
- [ ] Implement user authentication (JWT or session)
- [ ] Add error tracking (Sentry, Rollbar)
- [ ] Set up automated backups for PostgreSQL
- [ ] Test failover for refresh token failure
- [ ] Document recovery procedures
- [ ] Load test with expected user count
- [ ] Monitor eBay API rate limits

## Related Documentation

- [OAuth Implementation Guide](./OAUTH_IMPLEMENTATION.md)
- [Search API Reference](./SEARCH_INTEGRATION.md)
- [Database Schema Documentation](./PRISMA_SCHEMA.md)
- [Service Layer Examples](./SERVICES_EXAMPLES.md)

## Support

For issues:
1. Check server logs: `npm run dev`
2. Inspect database: `npm run prisma:studio`
3. Verify .env configuration
4. Check eBay API documentation: https://developer.ebay.com
5. Review error messages in response body

