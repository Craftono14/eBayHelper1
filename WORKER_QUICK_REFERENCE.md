# Worker System - Quick Reference

**Status:** ✅ Ready to use

---

## 🚀 30-Second Setup

### Environment Variables (.env)
```env
EBAY_ACCESS_TOKEN=your_token
USE_BULLMQ=false          # true for scaling with Redis
WORKER_SCHEDULE="*/5 * * * *"
```

### Start Server
```bash
npm run dev
```

### Test It
```bash
curl -X POST http://localhost:3000/api/workers/trigger
curl http://localhost:3000/api/workers/status
```

---

## 📡 API Cheat Sheet

### Check Status
```bash
GET /api/workers/status
# Returns: type, enabled, schedule, last run time
```

### Run Now
```bash
POST /api/workers/trigger
# Runs immediately (doesn't affect schedule)
```

### View Presets
```bash
GET /api/workers/schedules
# Lists available cron patterns
```

### Update Schedule
```bash
PATCH /api/workers/schedule
Body: {"cronSchedule": "*/15 * * * *"}
# (node-cron only)
```

### Start/Stop
```bash
POST /api/workers/start
POST /api/workers/stop
# (node-cron only)
```

---

## ⏰ Common Schedules

| Every... | Pattern |
|----------|---------|
| 5 minutes | `*/5 * * * *` |
| 15 minutes | `*/15 * * * *` |
| 30 minutes | `*/30 * * * *` |
| 1 hour | `0 * * * *` |
| 6 hours | `0 */6 * * *` |
| Daily @ midnight | `0 0 * * *` |
| Daily @ 6am | `0 6 * * *` |
| Business hours | `*/15 9-17 * * 1-5` |

---

## 🔄 How It Works (Simple)

```
1. Schedule triggers (every 5 min default)
   ↓
2. Worker fetches all user's SavedSearch records
   ↓
3. For each search: call eBay API (batched, max 3 at once)
   ↓
4. Compare results → find items NOT already in wishlist
   ↓
5. Save new items to database + price history
   ↓
6. Return stats (how many found, failed, etc)
```

---

## 📊 Key Metrics

| Metric | Where to Check |
|--------|----------------|
| Is it running? | `GET /api/workers/status` |
| When did it last run? | `status.lastRunTime` |
| How long did it take? | `status.lastDurationMs` |
| New items found today? | Check WishlistItem table |
| Rate limited? | Check server logs |

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| Workers not running | Check `EBAY_ACCESS_TOKEN` is set |
| Token expired | OAuth auto-refreshes, or manually call `POST /api/oauth/refresh` |
| Rate limited | Reduce from 3 to 1 concurrent requests in search-worker.ts |
| No new items found | Verify SavedSearch records exist with `isActive: true` |
| BullMQ fails to start | Ensure Redis is running: `redis-cli ping` |

---

## 🎯 Two Approaches

### Node-Cron (Simple)
- ✅ No Redis needed
- ✅ Easy setup
- ✅ Single server
- ❌ Jobs lost on restart

**Use when:** Small deployments, MVP

### BullMQ (Production)
- ✅ Distributed
- ✅ Job persistence
- ✅ Scales to many servers
- ❌ Requires Redis

**Use when:** Production, high volume

---

## 💾 Database Impact

**Creates/Updates:**
- `WishlistItem` - new tracked items
- `ItemHistory` - price tracking records

**Reads:**
- `SavedSearch` - what to search for
- `User` - OAuth tokens
- `WishlistItem` - to detect new items

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `src/workers/search-worker.ts` | Main orchestration |
| `src/workers/item-matcher.ts` | New item detection |
| `src/workers/cron-worker.ts` | Simple scheduler |
| `src/workers/bullmq-worker.ts` | Advanced scheduler |
| `src/index.ts` | Initialization on startup |

---

## 🔐 Security Notes

✅ Uses user's own OAuth token (per user)  
✅ Auto-refreshes on 401  
✅ Respects rate limits (no bot spam)  
✅ Batches requests (3 max concurrent)  
✅ Uses Prisma ORM (SQL injection safe)  

---

## 📈 Performance Tips

**Speed up searches:**
- Reduce `delayBetweenRequestsMs` from 500 to 250
- Increase `maxConcurrentRequests` from 3 to 5
- Set schedule to every 10 minutes: `*/10 * * * *`

**Avoid rate limiting:**
- Reduce concurrent requests to 1
- Increase delay to 2000ms
- Set schedule to hourly: `0 * * * *`
- Reduce max searches to 20

---

## 💡 Example Flows

### Adding a new saved search

```
1. Admin creates SavedSearch via API
   - keywords: "iPhone 15"
   - minPrice: $800
   - maxPrice: $1500
   - isActive: true

2. Next scheduled cycle (5 min)
   - Worker processes this search
   - Finds matching items on eBay
   - Saves new matches to WishlistItem

3. User sees new items in dashboard
```

### User wants to update schedule

```bash
# Current: every 5 minutes
# Want: every 15 minutes

curl -X PATCH http://localhost:3000/api/workers/schedule \
  -H "Content-Type: application/json" \
  -d '{"cronSchedule": "*/15 * * * *"}'

# Restart happens automatically
# Next run: 15 minutes from now
```

### Handling rate limits

```
1. Worker tries 3 concurrent searches
2. Gets 429 (rate limited)
3. Automatically retries with backoff:
   - Wait 100ms, retry
   - Wait 200ms, retry
   - Wait 400ms, retry
   - ... up to 30s max
4. If still fails: marks search as failed
5. Next cycle (5 min later): tries again
```

---

## 🎓 Learning Path

1. **Start:** Run `npm run dev` and check `/api/workers/status`
2. **Explore:** Call `POST /api/workers/trigger` to run manually
3. **Monitor:** Watch server logs as search runs
4. **Customize:** Update schedule via `PATCH /api/workers/schedule`
5. **Scale:** Switch to BullMQ with Redis for production
6. **Optimize:** Tune batching based on rate limit patterns

---

## 📞 Support Articles

| Topic | Link |
|-------|------|
| Full Setup Guide | [WORKER_SETUP.md](./WORKER_SETUP.md) |
| Implementation Details | [WORKER_IMPLEMENTATION.md](./WORKER_IMPLEMENTATION.md) |
| eBay Browse API | [EBAY_BROWSE_API.md](./EBAY_BROWSE_API.md) |
| Saved Searches | [SEARCH_INTEGRATION.md](./SEARCH_INTEGRATION.md) |

---

## ✨ That's It!

The worker system is:
- ✅ Installed
- ✅ Configured
- ✅ Ready to use
- ✅ Fully documented

**Next steps:**
1. Set `EBAY_ACCESS_TOKEN` in .env
2. Create SavedSearch records in database
3. Run `npm run dev`
4. Test with `curl -X POST http://localhost:3000/api/workers/trigger`

**It just works!**
