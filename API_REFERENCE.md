# Price Monitoring API - Quick Reference

## All Endpoints

### 1. Manual Price Check (All Users)
```bash
curl -X POST http://localhost:3000/api/prices/check \
  -H "Content-Type: application/json" \
  -d '{"baseCurrency": "USD"}'
```

**Response**:
```json
{
  "success": true,
  "message": "Price monitoring cycle completed",
  "stats": {
    "itemsChecked": 152,
    "pricesUpdated": 45,
    "priceDropsDetected": 12,
    "alertsTriggered": 12,
    "conversionErrors": 0,
    "apiErrors": 2,
    "durationMs": 45230
  }
}
```

---

### 2. Check Prices (Specific User)
```bash
curl -X POST http://localhost:3000/api/prices/check/1 \
  -H "Content-Type: application/json" \
  -d '{"baseCurrency": "EUR"}'
```

**Response** (includes first 10 items):
```json
{
  "success": true,
  "userId": 1,
  "stats": { /* same as above */ },
  "results": [
    {
      "wishlistItemId": 42,
      "itemId": "123456789",
      "itemTitle": "Vintage Camera",
      "previousPrice": 150.00,
      "currentPrice": 125.00,
      "priceDropPercent": 16.67,
      "alertTriggered": true,
      "timestamp": "2024-01-15T14:30:00.000Z"
    }
  ]
}
```

---

### 3. Get User Summary
```bash
curl http://localhost:3000/api/prices/summary/1
```

**Response**:
```json
{
  "userId": 1,
  "summary": {
    "totalItems": 35,
    "pricesDropped": 8,
    "averagePrice": 125.50,
    "lowestPrice": 15.99,
    "highestPrice": 899.99,
    "itemsBelowTarget": 5
  }
}
```

---

### 4. List Wishlist Items
```bash
curl "http://localhost:3000/api/prices/items/1?limit=20&offset=0"
```

**Response**:
```json
{
  "userId": 1,
  "total": 127,
  "limit": 20,
  "offset": 0,
  "items": [
    {
      "id": 42,
      "ebayItemId": "123456789",
      "itemTitle": "Vintage Camera",
      "currentPrice": 125.00,
      "targetPrice": 100.00,
      "lowestPrice": 120.00,
      "highestPrice": 150.00,
      "lastCheckedAt": "2024-01-15T14:30:00.000Z"
    }
  ]
}
```

---

### 5. Get Price History
```bash
curl "http://localhost:3000/api/prices/history/42?limit=30"
```

**Response**:
```json
{
  "wishlistItemId": 42,
  "itemTitle": "Vintage Camera",
  "targetPrice": 100.00,
  "history": [
    {
      "id": 1001,
      "price": 125.00,
      "priceDropped": true,
      "priceDropAmount": 25.00,
      "recordedAt": "2024-01-15T14:30:00.000Z"
    },
    {
      "id": 1000,
      "price": 150.00,
      "priceDropped": false,
      "priceDropAmount": null,
      "recordedAt": "2024-01-15T12:00:00.000Z"
    }
  ]
}
```

---

### 6. Setup Notifications
```bash
curl -X POST http://localhost:3000/api/prices/notifications/setup/1 \
  -H "Content-Type: application/json" \
  -d '{
    "emailAddress": "user@example.com",
    "discordWebhook": "https://discordapp.com/api/webhooks/123/456"
  }'
```

**Response**:
```json
{
  "success": true,
  "userId": 1,
  "message": "Notification preferences configured"
}
```

---

### 7. Update Notification Preferences
```bash
curl -X PATCH http://localhost:3000/api/prices/notifications/1 \
  -H "Content-Type: application/json" \
  -d '{
    "priceDropThresholdPercent": 10,
    "channels": ["email", "discord"],
    "quietHours": {
      "enabled": true,
      "startHour": 22,
      "endHour": 8
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "userId": 1,
  "message": "Notification preferences updated"
}
```

---

### 8. Update Target Price
```bash
curl -X POST http://localhost:3000/api/prices/items/42/target \
  -H "Content-Type: application/json" \
  -d '{"targetPrice": 99.99}'
```

**Response**:
```json
{
  "success": true,
  "wishlistItemId": 42,
  "newTargetPrice": 99.99
}
```

---

## Error Responses

### 404 Not Found
```json
{
  "error": "User not found or no OAuth token"
}
```

### 400 Bad Request
```json
{
  "error": "targetPrice must be a positive number"
}
```

### 500 Server Error
```json
{
  "error": "Internal server error message"
}
```

---

## Common Parameters

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `baseCurrency` | string | "USD" | ISO 4217 code (USD, EUR, GBP, etc.) |
| `limit` | number | 50 | Max results per page |
| `offset` | number | 0 | Pagination offset |
| `userId` | number | - | User ID (required in path) |
| `wishlistItemId` | number | - | Item ID (required in path) |

---

## Notification Channel Options

Valid values for `channels` array:
```json
["email", "discord", "webhook", "sms", "push"]
```

---

## Quiet Hours Format

```json
{
  "quietHours": {
    "enabled": true,
    "startHour": 22,  // 10 PM (0-23)
    "endHour": 8      // 8 AM next day (0-23)
  }
}
```

**Examples**:
- `22, 8` = 10 PM - 8 AM (quiet at night)
- `9, 17` = 9 AM - 5 PM (quiet during work hours)
- `8, 8` = disabled (no quiet hours - alerts always sent)

---

## Bash Script Examples

### Check all prices (cron job)
```bash
#!/bin/bash
curl -X POST http://localhost:3000/api/prices/check \
  -H "Content-Type: application/json" \
  -d '{"baseCurrency": "USD"}' \
  | jq '.stats'
```

### Find bargains (items below target)
```bash
#!/bin/bash
USERID=1
curl http://localhost:3000/api/prices/items/$USERID?limit=100 \
  | jq '.items | map(select(.currentPrice < .targetPrice))'
```

### Export price history to CSV
```bash
#!/bin/bash
ITEMID=42
curl http://localhost:3000/api/prices/history/$ITEMID?limit=1000 \
  | jq -r '.history[] | [.recordedAt, .price, .priceDropped, .priceDropAmount] | @csv'
```

---

## JavaScript/TypeScript Client Example

```typescript
// Trigger price check
async function checkUserPrices(userId: number) {
  const response = await fetch(`/api/prices/check/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseCurrency: 'USD' })
  });
  const data = await response.json();
  return data.stats;
}

// Get price history
async function getPriceHistory(wishlistItemId: number) {
  const response = await fetch(
    `/api/prices/history/${wishlistItemId}?limit=50`
  );
  const data = await response.json();
  return data.history;
}

// Update notification prefs
async function updateNotifications(userId: number, prefs: any) {
  const response = await fetch(`/api/prices/notifications/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs)
  });
  return response.json();
}
```

---

## Rate Limiting

Current implementation: **No explicit rate limiting on REST API**

Implicit limits:
- Price check batch: 5 items concurrent, 500ms delay
- eBay API: Uses existing browse service rate limits
- Exchange rate: 5-min cache reduces API calls

**Recommended for production**:
- Add express-rate-limit middleware (e.g., 100 req/min per IP)
- Queue price checks with Bull/BullMQ for high volume

---

## Metrics & Monitoring

### Key Stats Available
After each price check, you get:
- `itemsChecked` - Total items processed
- `pricesUpdated` - Items with price changes
- `priceDropsDetected` - Items cheaper than before
- `alertsTriggered` - Notifications sent
- `conversionErrors` - Currency conversion failures
- `apiErrors` - eBay API failures
- `durationMs` - Total execution time

### Example: Monitor Dashboard Query
```bash
# Check every 5 minutes (typical production setup)
* */5 * * * * curl -s http://localhost:3000/api/prices/check \
  | jq '.stats | "Items: \(.itemsChecked), Alerts: \(.alertsTriggered), Errors: \(.apiErrors)"'

# Output: Items: 152, Alerts: 2, Errors: 0
```

---

## Troubleshooting

### Connection Refused
```
curl: (7) Failed to connect to localhost port 3000
```
→ Ensure server is running: `npm start`

### No results in history
```json
{ "error": "No price history found" }
```
→ Item hasn't been checked yet. Run `POST /api/prices/check/:userId` first.

### Currency conversion failed
```
"conversionErrors": 1
```
→ Check EXCHANGE_RATE_API_KEY is valid or rely on fallback rates.

### Notifications not sending
Check user preferences first:
```bash
curl http://localhost:3000/api/prices/summary/1
```

Then verify configuration:
- Email: SENDGRID_API_KEY or SMTP credentials set?
- Discord: Webhook URL valid? Still exists?
- SMS: TWILIO_ACCOUNT_SID configured?

---

## Version

API Version: **1.0.0**
Last Updated: 2024-01-15

---

## Support

- **Full Documentation**: See `docs/PRICE_MONITORING.md`
- **Implementation Details**: See `PRICE_MONITORING_IMPLEMENTATION.md`
- **Issues**: Enable DEBUG mode and check logs
