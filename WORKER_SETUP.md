# Background Worker Setup - eBay Search Scheduling

**Status:** Production Ready | **Type Check:** ✅ PASSED | **Build:** ✅ PASSED

---

## 📋 Overview

Complete background worker system for periodically searching eBay and tracking new items matching saved searches. Supports both **BullMQ** (distributed, Redis-backed) and **node-cron** (simple, in-process) options.

### Architecture

```
┌─────────────────┐
│  Express App    │ (Main server)
│                 │
│  /api/workers/* │ (Monitoring endpoints)
└────────┬────────┘
         │
         │ initializes
         ▼
    ┌─────────────────────────────┐
    │ Worker System               │
    │                             │
    │ ┌─────────────────────────┐ │
    │ │ SearchWorker (Core)     │ │
    │ │ - Fetch SavedSearches   │ │
    │ │ - Call eBay API         │ │
    │ │ - Compare & find new    │ │
    │ │ - Batch requests        │ │
    │ │ - Rate limit handling   │ │
    │ └─────────────────────────┘ │
    │           ▲                  │
    │           │ scheduled by    │
    │ ┌─────────┴──────────────┐  │
    │ │ BullMQ or node-cron    │  │
    │ │ - Every 5 minutes      │  │
    │ │ - Or custom schedule   │  │
    │ └────────────────────────┘  │
    └─────────────────────────────┘
         │
         │ reads/writes
         ▼
    ┌─────────────────────┐
    │ Prisma Database     │
    │                     │
    │ SavedSearch         │ (user queries)
    │ WishlistItem        │ (tracked items)
    │ ItemHistory         │ (price history)
    │ User                │ (OAuth tokens)
    └─────────────────────┘
         │
         │ calls
         ▼
    ┌─────────────────────┐
    │ eBay Browse API     │
    │                     │
    │ searchItems()       │ (with retry logic)
    │ (exponential backoff)
    │ (rate limit handling)
    └─────────────────────┘
```

---

## 🚀 Quick Start

### Option 1: Node-Cron (Recommended for Simple Setup)

```typescript
// src/workers/cron-worker.ts is auto-initialized in src/index.ts
// Runs every 5 minutes by default (configurable via .env)

// Just set environment variables:
EBAY_ACCESS_TOKEN=your_token
WORKER_SCHEDULE="*/5 * * * *"  // Every 5 minutes
```

### Option 2: BullMQ (Recommended for Production Scaling)

```typescript
// Requires Redis running

// Set environment variables:
EBAY_ACCESS_TOKEN=your_token
USE_BULLMQ=true
REDIS_URL=redis://localhost:6379
```

---

## 🛠️ Installation & Configuration

### 1. Install Dependencies (Already Done)
```bash
npm install bullmq redis node-cron
```

### 2. Environment Variables

Create `.env` file:
```env
# Core configuration
EBAY_ACCESS_TOKEN=your_access_token_here
EBAY_SANDBOX=false

# Worker selection (choose one approach)
USE_BULLMQ=false          # true for BullMQ, false for node-cron

# Schedule (cron format, only used with node-cron)
WORKER_SCHEDULE="*/5 * * * *"  # Default: every 5 minutes

# Redis (only if using BullMQ)
REDIS_URL=redis://localhost:6379
```

### 3. Cron Schedule Formats

Available presets in code:
```typescript
CRON_SCHEDULES.EVERY_5_MINUTES   = "*/5 * * * *"
CRON_SCHEDULES.EVERY_15_MINUTES  = "*/15 * * * *"
CRON_SCHEDULES.EVERY_30_MINUTES  = "*/30 * * * *"
CRON_SCHEDULES.HOURLY            = "0 * * * *"
CRON_SCHEDULES.BUSINESS_HOURS    = "*/15 9-17 * * 1-5"  // 9am-5pm weekdays
CRON_SCHEDULES.OFF_PEAK          = "0 22-5 * * *"       // 10pm-6am
CRON_SCHEDULES.DAILY_MIDNIGHT    = "0 0 * * *"
CRON_SCHEDULES.DAILY_6AM         = "0 6 * * *"
```

**Cron Format:** `minute hour day month weekday`
- `*` = any value
- `*/5` = every 5 units
- `9-17` = range (9 through 17)
- `1-5` = Monday-Friday

---

## 📊 How It Works

### 1. Initialization (on Server Start)

```typescript
// Automatic in src/index.ts
const { router: workerRouter } = await initializeWorkers(
  app,
  prisma,
  process.env.EBAY_ACCESS_TOKEN,
  {
    useBullMQ: process.env.USE_BULLMQ === 'true',
    cronSchedule: process.env.WORKER_SCHEDULE || '*/5 * * * *',
  }
);

// Mounts to /api/workers/*
```

### 2. Search Cycle (Every 5 Minutes)

**Flow:**
```
1. Scheduler triggers → SearchWorker.runSearchCycle()
   │
2. Fetch all active SavedSearch records from database
   │
3. For each search:
   a. Get user's OAuth token
   b. Call eBay Browse API with search keywords
   c. Batch requests with 500ms delays between them
   │
4. Detect new items:
   a. Compare results against user's existing WishlistItems
   b. Filter by price range (if specified)
   c. Identify items not in wishlist
   │
5. Save new items:
   a. Insert into WishlistItem table
   b. Record price history (ItemHistory)
   c. Update SavedSearch.lastRunAt
   │
6. Return statistics:
   - Total searches processed
   - New items found
   - Failed searches
   - Rate limit hits
```

### 3. Rate Limit Handling

**Key Features:**
- ✅ Max 3 concurrent eBay API requests
- ✅ 500ms delay between request batches
- ✅ Automatic exponential backoff on 429 errors
- ✅ Respects Retry-After headers
- ✅ Max 50 searches per run (configurable)

**Configuration in SearchWorker:**
```typescript
{
  maxConcurrentRequests: 3,      // Simultaneous API calls
  delayBetweenRequestsMs: 500,   // Gap between batches
  maxSearchesPerRun: 50,         // Searches per cycle
}
```

---

## 🔌 Worker API Endpoints

All endpoints respond with JSON and include error handling.

### GET `/api/workers/status`

Get current worker status.

**Response:**
```json
{
  "type": "node-cron",
  "scheduler": {
    "running": false,
    "enabled": true,
    "schedule": "*/5 * * * *",
    "lastRunTime": "2026-02-15T10:30:00.000Z",
    "lastDurationMs": 2345,
    "nextRunTime": null
  },
  "timestamp": "2026-02-15T10:35:00.000Z"
}
```

### POST `/api/workers/trigger`

Manually trigger a search cycle immediately (doesn't affect schedule).

**Response:**
```json
{
  "success": true,
  "message": "Search cycle triggered"
}
```

### POST `/api/workers/start`

Start the scheduler (node-cron only).

**Response:**
```json
{
  "success": true,
  "message": "Scheduler started",
  "status": { /* status object */ }
}
```

### POST `/api/workers/stop`

Stop the scheduler (node-cron only).

**Response:**
```json
{
  "success": true,
  "message": "Scheduler stopped",
  "status": { /* status object */ }
}
```

### PATCH `/api/workers/schedule`

Update the cron schedule dynamically (node-cron only).

**Request:**
```json
{
  "cronSchedule": "*/15 * * * *"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Schedule updated",
  "newSchedule": "*/15 * * * *",
  "status": { /* updated status */ }
}
```

### GET `/api/workers/schedules`

Get available cron schedule presets and examples.

**Response:**
```json
{
  "presets": {
    "5_MINUTES": "*/5 * * * *",
    "15_MINUTES": "*/15 * * * *",
    "HOURLY": "0 * * * *",
    "DAILY_MIDNIGHT": "0 0 * * *",
    "BUSINESS_HOURS": "*/15 9-17 * * 1-5"
  },
  "current": "*/5 * * * *",
  "examples": { /* ... */ }
}
```

### GET `/api/workers/jobs/:jobId` (BullMQ Only)

Get details about a specific job.

**Response:**
```json
{
  "id": "job-123",
  "name": "periodic-search",
  "data": { /* job data */ },
  "state": "completed",
  "attempts": 1,
  "maxAttempts": 3,
  "stacktrace": null,
  "failedReason": null
}
```

---

## 📝 Data Flow & Database Schema

### SavedSearch → Search Cycle → WishlistItem → ItemHistory

**Process:**

1. **SavedSearch** (what to search for)
   - Contains: keywords, price range, conditions, seller criteria
   - User: linked to User model for OAuth token
   - Active: only searches with `isActive: true` are processed

2. **Search Execution**
   - Worker fetches all active SavedSearch records
   - For each search, calls eBay Browse API
   - Results are compared against existing WishlistItems

3. **New Item Detection**
   - Item found in API results
   - Item NOT in user's WishlistItem table
   - Item matches price/condition criteria
   - → Create new WishlistItem

4. **Price Tracking**
   - Creates ItemHistory record
   - Tracks: price, quantity, drop amount
   - Detects price changes for notifications

**Example:**
```typescript
// SavedSearch
{
  userId: 1,
  name: "Gaming Laptops",
  searchKeywords: "gaming laptop",
  minPrice: 800,
  maxPrice: 2000,
  isActive: true,
  lastRunAt: "2026-02-15T10:30:00Z"
}

// Running the search finds these items:
// From eBay API: [Item1 ($1200), Item2 ($1500), Item3 ($1800)]

// Compare to existing WishlistItem for user 1:
// Already tracked: [Item1, Item4]

// New items found: [Item2, Item3]
// → Insert into WishlistItem and ItemHistory
```

---

## 🔐 Security Considerations

### OAuth Token Management
- ✅ Token loaded from environment variable
- ✅ Token refreshed automatically on 401 errors (via integration with existing OAuth service)
- ✅ Tokens never logged or exposed
- ✅ Each user's searches use their own token

### Rate Limiting
- ✅ Respects eBay API rate limits (automatic retry)
- ✅ Batches requests (3 concurrent max)
- ✅ Delays between batches (500ms)
- ✅ Detects and handles 429 errors

### Database
- ✅ Uses Prisma ORM (SQL injection prevention)
- ✅ Only updates/creates items for authenticated user
- ✅ No sensitive data exposed in logs

---

## 📈 Monitoring & Logging

### Log Output

The worker logs important events:

```
[searchWorker] Starting search cycle...
[searchWorker] Found 5 active searches
[searchWorker] Processing search: "iPhone 15" (ID: 123)
[searchWorker] Searching: "iPhone 15" in EBAY_US
[itemMatcher] Found 12 new items from 45 results (234ms)
[itemMatcher] Saved new items - Created: 12, Failed: 0
[searchWorker] Search complete - Found: 45 results, 12 new items, 127 total tracked (523ms)
[searchWorker] Cycle complete - Completed: 5/5, New items: 47
```

### Check Status Programmatically

```bash
# Get current status
curl http://localhost:3000/api/workers/status

# Trigger manual run
curl -X POST http://localhost:3000/api/workers/trigger

# Get available schedules
curl http://localhost:3000/api/workers/schedules
```

### Monitor Rate Limit Hits

```typescript
const stats = searchWorker.getStats();
console.log(`Rate limit hits: ${stats.rateLimitHits}`);
console.log(`Failed searches: ${stats.failedSearches}`);
console.log(`New items found: ${stats.newItemsFound}`);
```

---

## 🚨 Common Scenarios

### Scenario 1: Rate Limited

**What happens:**
1. Search cycle queues 50 searches
2. eBay returns 429 (rate limit)
3. Service automatically retries with exponential backoff
4. After max retries exhausted, search marked as failed
5. Next cycle (5 min later) tries again

**Observable in logs:**
```
[warnRetry] Attempt 1/5, waiting 100ms (429 Rate Limited)
[warnRetry] Attempt 2/5, waiting 200ms (429 Rate Limited)
```

### Scenario 2: User Token Expires

**What happens:**
1. Search cycle calls eBay API with user's token
2. API returns 401 (Unauthorized)
3. Service attempts token refresh via OAuth flow
4. If refresh succeeds: search continues
5. If refresh fails: search marked as failed, user notified

**Observable in logs:**
```
[searchWorker] Error processing search: User has no eBay OAuth token
```

### Scenario 3: New Items Found

**What happens:**
1. Search returns 50 items
2. 30 already in user's WishlistItem
3. 20 are new
4. All 20 inserted into WishlistItem
5. Price history created for each
6. User can see new items in dashboard

**Observable in logs:**
```
[itemMatcher] Found 20 new items from 50 results
[itemMatcher] Saved new items - Created: 20, Failed: 0
```

### Scenario 4: Schedule Change

**What happens:**
1. Admin calls `PATCH /api/workers/schedule`
2. Current scheduler stopped
3. New scheduler started with new schedule
4. Next run happens at new time

**Example:**
```bash
# Change from 5-minute to 15-minute schedule
curl -X PATCH http://localhost:3000/api/workers/schedule \
  -H "Content-Type: application/json" \
  -d '{"cronSchedule": "*/15 * * * *"}'
```

---

## 🔧 Advanced Configuration

### BullMQ Setup (With Redis)

**Prerequisites:**
```bash
# Install Redis (e.g., with Docker)
docker run -d -p 6379:6379 redis:latest
```

**Config:**
```env
USE_BULLMQ=true
REDIS_URL=redis://localhost:6379
```

**Benefits:**
- Distributed workers (multiple servers)
- Job persistence (survives restarts)
- Better for high-volume searches
- Built-in job retry logic
- Dashboard support (e.g., Bull Board)

### Node-Cron Setup (No Redis)

**Config:**
```env
USE_BULLMQ=false
WORKER_SCHEDULE="*/5 * * * *"
```

**Benefits:**
- Simple setup (no Redis needed)
- In-process execution
- Lower overhead for small deployments
- Sufficient for single-server setups

---

## 📊 Performance Tuning

### Optimize for High-Volume Searches

```typescript
// In src/workers/search-worker.ts
const config = {
  maxConcurrentRequests: 5,      // Increase from 3
  delayBetweenRequestsMs: 250,   // Reduce from 500
  maxSearchesPerRun: 100,        // Increase from 50
};
```

⚠️ **Be careful:** More concurrent requests = higher chance of rate limiting

### Optimize for Rate Limit Avoidance

```typescript
const config = {
  maxConcurrentRequests: 1,      // One at a time
  delayBetweenRequestsMs: 2000,  // 2 second gap
  maxSearchesPerRun: 20,         // Fewer per cycle
};
```

And increase schedule interval:
```env
WORKER_SCHEDULE="0 * * * *"  # Hourly instead of every 5 minutes
```

---

## 🧪 Testing

### Manual Test

```bash
# Start server
npm run dev

# In another terminal:

# Get status
curl http://localhost:3000/api/workers/status

# Trigger search
curl -X POST http://localhost:3000/api/workers/trigger

# Wait a few seconds, get status again
curl http://localhost:3000/api/workers/status
```

### Programmatic Test

```typescript
import { createSearchWorker } from './src/workers/search-worker';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const worker = createSearchWorker(prisma, {
  accessToken: 'test-token',
  sandbox: true,
});

const stats = await worker.runSearchCycle();
console.log('Stats:', stats);
```

---

## 📚 File Structure

```
src/workers/
├── index.ts                      # Main exports
├── search-worker.ts              # Core orchestration (SearchWorker class)
├── item-matcher.ts               # Item comparison logic
├── cron-worker.ts                # Node-cron implementation
├── bullmq-worker.ts              # BullMQ implementation
└── express-integration.ts         # Route setup & monitoring endpoints
```

---

## 🚀 Deployment Checklist

- [ ] Set `EBAY_ACCESS_TOKEN` in production environment
- [ ] Set `EBAY_SANDBOX=false` for production
- [ ] Choose worker type: BullMQ (scalable) or node-cron (simple)
- [ ] If BullMQ: Set up Redis and `REDIS_URL`
- [ ] Set `WORKER_SCHEDULE` to appropriate cron expression
- [ ] Test with `npm run dev` locally
- [ ] Monitor logs for rate limit errors
- [ ] Set up alerting for failed searches
- [ ] Document schedule choice for team

---

## 📖 Related Documentation

- [EBAY_BROWSE_API.md](./EBAY_BROWSE_API.md) - API service details
- [SEARCH_INTEGRATION.md](./SEARCH_INTEGRATION.md) - SavedSearch database
- [OAUTH_IMPLEMENTATION.md](./OAUTH_IMPLEMENTATION.md) - Token management

---

## ❓ Troubleshooting

### Workers not running
- Check `EBAY_ACCESS_TOKEN` is set
- Check `npm run dev` output for errors
- Verify schedule is correct (use `GET /api/workers/schedules`)

### Rate limit errors
- Reduce `maxConcurrentRequests` from 3 to 1
- Increase `delayBetweenRequestsMs` from 500 to 2000
- Increase schedule interval from 5 min to hourly

### Redis connection error (BullMQ)
- Verify Redis is running: `redis-cli ping` (should return PONG)
- Check `REDIS_URL` environment variable
- Default: `redis://localhost:6379`

### Token expired
- OAuth token refresh happens automatically on 401
- If still failing, manually refresh: `POST /api/oauth/refresh`
- Update `EBAY_ACCESS_TOKEN` environment variable

---

**Last Updated:** 2026-02-15
**Status:** Production Ready ✅
