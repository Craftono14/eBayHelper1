# Price Monitoring & Notifications System

Complete guide to the eBay Helper price monitoring feature with multi-currency support and flexible notification channels.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Currency Support](#currency-support)
4. [Notification Channels](#notification-channels)
5. [API Endpoints](#api-endpoints)
6. [Configuration](#configuration)
7. [Usage Examples](#usage-examples)
8. [Error Handling](#error-handling)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The Price Monitoring & Notifications System automatically tracks eBay item prices from your wishlist and sends alerts when prices drop below your target threshold.

### Key Features

- **Automatic Price Checks**: Batch processing of up to 5 items concurrently with intelligent rate limiting
- **Multi-Currency**: Automatic conversion between 12+ eBay sites' currencies with smart fallback rates
- **Flexible Notifications**: 5 notification channels (Email, Discord, Webhooks, SMS, Push)
- **User Preferences**: Per-user settings for alert thresholds, notification channels, and quiet hours
- **Price History**: Complete audit trail of all price changes
- **Multi-User Support**: Handles hundreds of users with isolated price monitoring cycles

### Technical Stack

```typescript
// Core Components
- PriceMonitor: Batch price checking with currency conversion
- NotificationManager: Event-driven multi-channel notification system
- ExchangeRateCache: 5-minute TTL cache for exchange rates with fallback
- PriceMonitoringWorker: Background job runner for multi-user cycles
- PriceMonitoringRouter: REST API endpoints for control and querying
```

---

## Architecture

### Data Flow Diagram

```
┌─────────────────────┐
│  eBay Browse API    │  ← getItem(itemId, globalSiteId)
└──────────┬──────────┘
           │ Item with price in native currency
           ▼
┌─────────────────────────────────────────┐
│  PriceMonitor.checkUserWishlistPrices() │
│  - Batch 5 items concurrently           │
│  - 500ms delay between batches          │
│  - Decimal precision for accuracy       │
└──────────┬──────────────────────────────┘
           │
           ├─→ ExchangeRateCache.convertCurrency()
           │   ├─ Try: exchangerate-api.com
           │   ├─ Cache: 5 minutes
           │   └─ Fallback: Hardcoded rates
           │
           ├─→ Prisma: Update WishlistItem
           │   ├─ currentPrice
           │   ├─ lowestPriceRecorded
           │   ├─ highestPriceRecorded
           │   └─ lastCheckedAt
           │
           ├─→ Prisma: Create ItemHistory
           │   ├─ price
           │   ├─ priceDropped flag
           │   └─ priceDropAmount
           │
           └─→ PriceDropAlert
               │
               └─→ NotificationManager.emitPriceDropAlert()
                   ├─ Validate user preferences
                   ├─ Check quiet hours
                   ├─ Check drop threshold %
                   │
                   └─→ Send to enabled channels:
                       ├─ Email (SMTP/SendGrid)
                       ├─ Discord (Webhooks)
                       ├─ Generic HTTP (Webhooks)
                       ├─ SMS (Twilio/AWS SNS)
                       └─ Push (FCM/OneSignal)
```

### Class Diagram

```typescript
PriceMonitor {
  - prisma: PrismaClient
  - ebayService: EbayBrowseService
  - notificationManager: NotificationManager
  - stats: PriceMonitoringStats
  + checkUserWishlistPrices(userId, baseCurrency): Promise<PriceCheckResult[]>
  + checkWishlistItems(ids, baseCurrency): Promise<PriceCheckResult[]>
  + getStats(): PriceMonitoringStats
}

NotificationManager extends EventEmitter {
  - userPreferences: Map<userId, UserNotificationPreferences>
  + registerUserPreferences(prefs): void
  + emitPriceDropAlert(alert): void
  + updatePreferences(userId, updates): void
}

ExchangeRateCache {
  - cache: Map<currency_pair, {rate, timestamp}>
  - TTL: 5 minutes
  + getExchangeRate(from, to): Promise<number>
  + convertCurrency(amount, from, to): Promise<number>
}
```

---

## Currency Support

### Supported eBay Sites

| Site Code | Currency | Country | Sample Rate (to USD) |
|-----------|----------|---------|----------------------|
| EBAY_US | USD | United States | 1.00 (base) |
| EBAY_GB | GBP | United Kingdom | 0.79 |
| EBAY_DE | EUR | Germany | 0.92 |
| EBAY_FR | EUR | France | 0.92 |
| EBAY_IT | EUR | Italy | 0.92 |
| EBAY_ES | EUR | Spain | 0.92 |
| EBAY_CA | CAD | Canada | 1.35 |
| EBAY_AU | AUD | Australia | 1.52 |
| EBAY_JP | JPY | Japan | 149.50 |
| EBAY_CH | CHF | Switzerland | 0.88 |
| EBAY_SE | SEK | Sweden | 10.75 |
| EBAY_HK | HKD | Hong Kong | 7.85 |

### Exchange Rate Sources

**Primary**: exchangerate-api.com (when API key configured)
```bash
# Set API key in .env
EXCHANGE_RATE_API_KEY=your_key_here
```

**Fallback**: Hardcoded bidirectional matrix
- Works without API key
- Updates require code change (can extend with database)
- Covers 10+ major currencies

### Conversion Example

```typescript
// Item listed in GBP on eBay_GB
const itemPrice = 50.00;  // £50
const itemCurrency = 'GBP';
const baseCurrency = 'USD';

// Convert to USD
const convertedPrice = await convertCurrency(50.00, 'GBP', 'USD');
// Result: ~$63.29 (using fallback rate 0.79)

// All comparisons done in baseCurrency
if (convertedPrice < targetPrice) {
  // Trigger alert
}
```

---

## Notification Channels

### 1. Email Notifications

**Configuration**:
```typescript
{
  type: 'email',
  enabled: true,
  config: {
    emailAddress: 'user@example.com',
    provider: 'sendgrid' // or 'smtp', 'ses'
  }
}
```

**Environment Variables**:
```bash
# SendGrid
SENDGRID_API_KEY=sg_...

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# AWS SES
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

**Template**:
```
Subject: Price Drop Alert! - [Item Title]

Your watchlist item [Item Title] has dropped in price!

Previous Price: $XX.XX
Current Price: $YY.YY
Drop Amount: $ZZ.ZZ (XX%)
Target Price: $AA.AA

View Item: [URL]
```

---

### 2. Discord Notifications

**Configuration**:
```typescript
{
  type: 'discord',
  enabled: true,
  config: {
    webhookUrl: 'https://discordapp.com/api/webhooks/...'
  }
}
```

**Setup Steps**:
1. Go to Discord Server → Server Settings → Webhooks
2. Create New Webhook
3. Name it something like "eBay Price Alerts"
4. Copy the Webhook URL
5. Save in user preferences

**Discord Embed Format**:
```
╔════════════════════════════╗
║ 💰 Price Drop Alert!       ║
║ [Item Title]               ║
├────────────────────────────┤
│ Price:                     │
│ $50.00 → $42.50            │
│                            │
│ Drop:                      │
│ $7.50 (15%)                │
│                            │
│ Target Price:              │
│ $40.00                     │
├────────────────────────────┤
│ 🔗 [View on eBay]          │
│ ⏰ 2024-01-15 14:30:00 UTC │
╚════════════════════════════╝
```

---

### 3. Generic Webhooks

**Configuration**:
```typescript
{
  type: 'webhook',
  enabled: true,
  config: {
    url: 'https://your-api.example.com/alerts',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer token123'
    }
  }
}
```

**Payload Format**:
```json
{
  "type": "priceDropAlert",
  "userId": 12345,
  "item": {
    "id": "123456789",
    "title": "Rare Vintage Item",
    "url": "https://ebay.com/itm/123456789"
  },
  "price": {
    "previous": 50.00,
    "current": 42.50,
    "target": 40.00,
    "currency": "USD",
    "dropAmount": 7.50,
    "dropPercent": 15.0
  },
  "timestamp": "2024-01-15T14:30:00Z"
}
```

---

### 4. SMS Notifications

**Configuration**:
```typescript
{
  type: 'sms',
  enabled: true,
  config: {
    phoneNumber: '+1234567890',
    provider: 'twilio' // or 'aws-sns'
  }
}
```

**Environment Variables**:
```bash
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1234567890

# AWS SNS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

**Message Format**:
```
🏷️ Rare Vintage Item
💰 Was: $50.00 Now: $42.50
📉 Drop: $7.50 (15%)
🔗 ebay.com/itm/123456789
```

---

### 5. Push Notifications

**Configuration**:
```typescript
{
  type: 'push',
  enabled: true,
  config: {
    deviceToken: 'device_token_here',
    provider: 'fcm' // or 'onesignal'
  }
}
```

**Environment Variables**:
```bash
# Firebase Cloud Messaging
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...iam.gserviceaccount.com

# OneSignal
ONESIGNAL_APP_ID=xxxxx
ONESIGNAL_API_KEY=xxxxx
```

**Notification Payload**:
```json
{
  "title": "Price Drop! Rare Vintage Item",
  "body": "$50.00 → $42.50 (15% drop)",
  "data": {
    "item_id": "123456789",
    "drop_amount": "7.50",
    "target_url": "https://ebay.com/itm/123456789"
  }
}
```

---

## API Endpoints

### 1. Check Prices for All Users

**Request**:
```http
POST /api/prices/check
Content-Type: application/json

{
  "baseCurrency": "USD"
}
```

**Response** (200 OK):
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

### 2. Check Prices for Specific User

**Request**:
```http
POST /api/prices/check/:userId
Content-Type: application/json

{
  "baseCurrency": "EUR"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "userId": 1,
  "stats": {
    "itemsChecked": 15,
    "pricesUpdated": 8,
    "priceDropsDetected": 2,
    "alertsTriggered": 2,
    "conversionErrors": 0,
    "apiErrors": 0,
    "durationMs": 3420
  },
  "results": [
    {
      "wishlistItemId": 42,
      "itemId": "123456789",
      "itemTitle": "Vintage Camera",
      "previousPrice": 150.00,
      "currentPrice": 125.00,
      "priceChanged": true,
      "priceDropped": true,
      "priceDropAmount": 25.00,
      "priceDropPercent": 16.67,
      "currency": "EUR",
      "alertTriggered": true,
      "timestamp": "2024-01-15T14:30:00.000Z"
    }
  ]
}
```

---

### 3. Get User Price Summary

**Request**:
```http
GET /api/prices/summary/:userId
```

**Response** (200 OK):
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

### 4. Get Wishlist Items with Prices

**Request**:
```http
GET /api/prices/items/:userId?limit=50&offset=0
```

**Response** (200 OK):
```json
{
  "userId": 1,
  "total": 127,
  "limit": 50,
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

### 5. Get Item Price History

**Request**:
```http
GET /api/prices/history/:wishlistItemId?limit=30
```

**Response** (200 OK):
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

### 6. Setup User Notifications

**Request**:
```http
POST /api/prices/notifications/setup/:userId
Content-Type: application/json

{
  "emailAddress": "user@example.com",
  "discordWebhook": "https://discordapp.com/api/webhooks/..."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "userId": 1,
  "message": "Notification preferences configured"
}
```

---

### 7. Update Notification Preferences

**Request**:
```http
PATCH /api/prices/notifications/:userId
Content-Type: application/json

{
  "priceDropThresholdPercent": 10,
  "channels": ["email", "discord"],
  "quietHours": {
    "enabled": true,
    "startHour": 22,
    "endHour": 8
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "userId": 1,
  "message": "Notification preferences updated"
}
```

---

### 8. Update Item Target Price

**Request**:
```http
POST /api/prices/items/:wishlistItemId/target
Content-Type: application/json

{
  "targetPrice": 99.99
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "wishlistItemId": 42,
  "newTargetPrice": 99.99
}
```

---

## Configuration

### Environment Variables

```bash
# eBay API
EBAY_CLIENT_ID=your_client_id
EBAY_CLIENT_SECRET=your_client_secret
EBAY_SANDBOX=false

# Currency Conversion
EXCHANGE_RATE_API_KEY=your_exchange_rate_api_key_optional

# Email (SendGrid example)
SENDGRID_API_KEY=sg_...
SENDGRID_FROM_ADDRESS=alerts@ebayhelper.example.com

# Discord (optional)
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_GUILD_ID=your_guild_id

# SMS (Twilio example)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1234567890

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ebay_helper

# Server
PORT=3000
NODE_ENV=production
```

### User Notification Preferences Schema

```typescript
interface UserNotificationPreferences {
  userId: number;
  priceDropThresholdPercent: number;        // Default: 5%
  channels: NotificationChannel[];           // email, discord, webhook, sms, push
  quietHours?: {
    enabled: boolean;
    startHour: number;                       // 0-23 (e.g., 22 for 10 PM)
    endHour: number;                         // 0-23 (e.g., 8 for 8 AM)
  };
}

// Both enable/disable times can be the same to disable quiet hours
// Example: startHour=22, endHour=8 = quiet from 10 PM to 8 AM (next day)
// Example: startHour=8, endHour=8 = quiet hours disabled
```

---

## Usage Examples

### Example 1: Basic Setup

```typescript
import { notificationManager } from './services/notification-service';
import { createPriceMonitor } from './services/price-monitor';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 1. Register user notifications
notificationManager.registerUserPreferences({
  userId: 1,
  priceDropThresholdPercent: 5,
  channels: ['email', 'discord'],
  quietHours: {
    enabled: true,
    startHour: 22,
    endHour: 8,
  },
});

// 2. Create price monitor
const monitor = createPriceMonitor(
  prisma,
  'your_ebay_oauth_token',
  false // not sandbox
);

// 3. Check prices
const results = await monitor.checkUserWishlistPrices(1, 'USD');

// Results include:
// - Current prices (converted to baseCurrency)
// - Price changes detected
// - Alerts triggered
// - Any errors encountered
```

---

### Example 2: Monitoring International Items

```typescript
// User has items from multiple eBay sites
const monitor = createPriceMonitor(prisma, token, false);

// Check prices with EUR as base currency
const results = await monitor.checkUserWishlistPrices(1, 'EUR');

// Results:
// - JPY item (¥2900) auto-converted to EUR (~€18.50)
// - GBP item (£45) auto-converted to EUR (~€52.20)
// - EUR item (€60) used as-is
// - All compared against EUR targets
```

---

### Example 3: Scheduled Background Job

```typescript
import cron from 'node-cron';
import { runPriceMonitoringCycle } from './workers/price-monitor-worker';

// Run every 5 minutes during business hours (8 AM - 6 PM)
cron.schedule('*/5 8-18 * * *', async () => {
  try {
    const stats = await runPriceMonitoringCycle(prisma, {
      accessToken: process.env.EBAY_ACCESS_TOKEN,
      sandbox: false,
      baseCurrency: 'USD',
    });

    console.log(`✅ Price check completed:`, stats);
  } catch (error) {
    console.error('❌ Price check failed:', error);
  }
});
```

---

### Example 4: Smart Notifications with Quiet Hours

```typescript
// User wants aggressive alerts but not at night
notificationManager.registerUserPreferences({
  userId: 15,
  priceDropThresholdPercent: 1,  // Alert even on 1% drops
  channels: ['email', 'sms', 'push'],
  quietHours: {
    enabled: true,
    startHour: 22,  // 10 PM
    endHour: 8,     // 8 AM next day
  },
});

// Price drops at 11 PM:
// - NotificationManager checks quiet hours
// - 11 PM is between 22:00 and 08:00
// - Alert skipped (no notifications sent)

// Same price drop at 9 AM:
// - Outside quiet hours
// - All notifications sent (email + SMS + push)
```

---

### Example 5: REST API Integration

```bash
# Manually trigger price check for user
curl -X POST http://localhost:3000/api/prices/check/1 \
  -H "Content-Type: application/json" \
  -d '{"baseCurrency": "USD"}'

# Update notification preferences
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

# View item price history
curl http://localhost:3000/api/prices/history/42?limit=10

# Get user summary
curl http://localhost:3000/api/prices/summary/1
```

---

## Error Handling

### Common Errors and Solutions

#### 1. **eBay API Error - Item Not Found**

```json
{
  "errorMessage": "Item not found on eBay",
  "wishlistItemId": 42
}
```

**Solution**: Item was delisted. Manually review or mark inactive.

---

#### 2. **Currency Conversion Error**

```json
{
  "conversionErrors": 1,
  "apiErrors": 0
}
```

**Solution**: 
- Check API key if configured: `echo $EXCHANGE_RATE_API_KEY`
- System automatically falls back to hardcoded rates
- Monitor stat shows count for alerting

---

#### 3. **Missing OAuth Token**

```json
{
  "error": "User not found or no OAuth token",
  "status": 404
}
```

**Solution**: User needs to re-authenticate with eBay OAuth.

---

#### 4. **Quiet Hours Not Working**

```typescript
// Issue: quiet hours disabled unintentionally
quiet Hours: {
  enabled: true,
  startHour: 8,
  endHour: 8    // ❌ Same hours = no quiet hours
}

// Fix:
quietHours: {
  enabled: true,
  startHour: 22,  // 10 PM
  endHour: 8      // 8 AM next day ✅
}
```

---

#### 5. **Batch Processing Timeout**

```
Error: Socket hang up after 30s
```

**Solution**:
- Increase timeout in retry logic
- Reduce batch size from 5 to 3 items
- Check eBay API service status

---

## Troubleshooting

### Debug Mode

```bash
# Enable verbose logging
export DEBUG=ebay-helper:*
npm start

# Output:
# [priceMonitor] Fetching item 123456789
# [pricing] Converting 2900 JPY → USD
# [notifications] Sending email to user@example.com
# [notifications] Discord webhook sent successfully
```

---

### Database Queries

```sql
-- Check price monitoring history
SELECT * FROM "ItemHistory"
  WHERE "wishlistItemId" = 42
  ORDER BY "recordedAt" DESC
  LIMIT 20;

-- Find items below target
SELECT id, "itemTitle", "currentPrice", "targetPrice"
  FROM "WishlistItem"
  WHERE "userId" = 1
    AND "currentPrice" < "targetPrice"
    AND "isActive" = true;

-- Check notification preferences
SELECT * FROM "UserNotificationPreferences"
  WHERE "userId" = 1;
```

---

### Performance Optimization

**Current Settings**:
- Batch size: 5 items concurrent
- Batch delay: 500ms
- Cache TTL: 5 minutes (exchange rates)
- Database: Use indexes on `wishlistItemId`, `userId`, `ebayItemId`

**For High Volume** (1000+ items):
```typescript
// Option 1: Reduce batch size + increase delay
for (let i = 0; i < items.length; i += 3) {
  // ...
  await sleep(1000); // 1 second between batches
}

// Option 2: Split users across multiple workers
// Use BullMQ for distributed job queue (see worker-system docs)
```

---

### Common Configuration Mistakes

| Issue | Solution |
|-------|----------|
| Notifications not sending | Check user has channel configured + API keys set |
| Only USD conversions working | Set EXCHANGE_RATE_API_KEY and verify API key is valid |
| Emails marked as spam | Add DNS records (SPF, DKIM, DMARC) |
| Discord embeds not rendering | Verify webhook URL is correct and webhook still exists |
| Silent failures in logs | Enable DEBUG mode and check /api/prices/summary/:userId |

---

## Production Checklist

- [ ] Set `EBAY_SANDBOX=false` in production
- [ ] Configure all required environment variables
- [ ] Set up automated price monitoring cycle (cron or BullMQ)
- [ ] Test all 5 notification channels with sample alert
- [ ] Set up monitoring/alerting for price check failures
- [ ] Configure database backups (ItemHistory accumulates)
- [ ] Document custom quiet hours schedule for users
- [ ] Monitor exchange rate API quota (if using paid tier)
- [ ] Set up log rotation (price checks generate many logs)
- [ ] Test failover: What happens if eBay API is down? (graceful degradation)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01-15 | Initial release with 5 notification channels, multi-currency support |

---

## Support

For issues or feature requests:
1. Check [Troubleshooting](#troubleshooting) section
2. Enable DEBUG logging
3. Check database for ItemHistory records
4. Review /api/prices/summary/:userId for stats
