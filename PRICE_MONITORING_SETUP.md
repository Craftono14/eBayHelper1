# Price Monitoring - Integration Guide

Step-by-step guide to integrate price monitoring into your eBay Helper Express server.

## Quick Start (5 minutes)

### Step 1: Update Express Server

Add to `src/index.ts`:

```typescript
import { createPriceMonitoringRouter } from './routes/prices.routes';
import { notificationManager } from './services/notification-service';

// After setting up other routes
app.use('/api/prices', createPriceMonitoringRouter(prisma, ebayAccessToken));

// Initialize notification manager (optional)
app.on('startup', () => {
  console.log('✅ Price monitoring module loaded');
});
```

### Step 2: Test API

```bash
# Test that routes are accessible
curl -X POST http://localhost:3000/api/prices/check \
  -H "Content-Type: application/json" \
  -d '{"baseCurrency": "USD"}'

# Expected: { "success": true, "stats": {...} }
```

### Step 3: Set Environment Variables

Add to `.env`:

```bash
# Exchange rates (optional - uses fallback if not set)
EXCHANGE_RATE_API_KEY=your_api_key

# Email notifications (choose one provider)
SENDGRID_API_KEY=sg_...
# OR
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-password

# Done! REST API is ready to use
```

---

## Full Integration (15 minutes)

### Step 1: Add Routes to Express

File: `src/index.ts`

```typescript
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createPriceMonitoringRouter } from './routes/prices.routes';
import { notificationManager } from './services/notification-service';

const app = express();
const prisma = new PrismaClient();

// ... other middleware ...

// Initialize routes
app.use('/api/oauth', createOAuthRouter(prisma));
app.use('/api/search', createSearchRouter(prisma));
app.use('/api/prices', createPriceMonitoringRouter(
  prisma,
  process.env.EBAY_ACCESS_TOKEN!
));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Price monitoring routes available at http://localhost:${PORT}/api/prices`);
});
```

### Step 2: Add Background Price Checking (Cron)

File: `src/workers/price-monitor-scheduler.ts` (NEW)

```typescript
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { runPriceMonitoringCycle } from './price-monitor-worker';

export function startPriceMonitoringScheduler(
  prisma: PrismaClient,
  accessToken: string
) {
  // Run every 5 minutes
  const job = cron.schedule('*/5 * * * *', async () => {
    try {
      console.log('[scheduler] Starting price monitoring cycle...');
      
      const stats = await runPriceMonitoringCycle(prisma, {
        accessToken,
        sandbox: process.env.EBAY_SANDBOX === 'true',
        baseCurrency: 'USD',
      });

      console.log('✅ Price monitoring cycle completed:', {
        itemsChecked: stats.itemsChecked,
        alertsTriggered: stats.alertsTriggered,
        durationMs: stats.durationMs,
      });
    } catch (error) {
      console.error('❌ Price monitoring cycle failed:', error);
    }
  });

  return job;
}
```

Update `src/index.ts`:

```typescript
import { startPriceMonitoringScheduler } from './workers/price-monitor-scheduler';

// After app initialization
const priceScheduler = startPriceMonitoringScheduler(
  prisma,
  process.env.EBAY_ACCESS_TOKEN!
);

// On shutdown
process.on('SIGTERM', () => {
  priceScheduler.stop();
  prisma.$disconnect();
  process.exit(0);
});
```

### Step 3: Initialize First-Time User Notifications

File: `src/routes/oauth.routes.ts` (ADD to existing OAuth handler)

```typescript
import { setupDefaultNotifications } from '../workers/price-monitor-worker';

// After successful OAuth login
router.post('/callback', async (req, res) => {
  // ... existing OAuth code ...
  
  const user = await prisma.user.create({
    data: {
      // ... user data ...
    },
  });

  // Initialize default notifications for new user
  await setupDefaultNotifications(user.id);

  res.json({ success: true, userId: user.id });
});
```

### Step 4: Configure Notification Channels

Create file: `src/config/notifications.ts`

```typescript
export const notificationConfig = {
  email: {
    enabled: !!process.env.SENDGRID_API_KEY,
    provider: 'sendgrid',
    apiKey: process.env.SENDGRID_API_KEY,
    fromAddress: process.env.SENDGRID_FROM_ADDRESS || 'alerts@ebayhelper.com',
  },
  discord: {
    enabled: true,
  },
  webhook: {
    enabled: true,
  },
  sms: {
    enabled: !!process.env.TWILIO_ACCOUNT_SID,
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
  },
  push: {
    enabled: !!process.env.FIREBASE_PROJECT_ID,
    projectId: process.env.FIREBASE_PROJECT_ID,
  },
};
```

### Step 5: Environment Setup

```bash
# Add to .env
SENDGRID_API_KEY=sg_xxxxx
SENDGRID_FROM_ADDRESS=alerts@ebayhelper.com
EXCHANGE_RATE_API_KEY=your_key
```

---

## Testing Integration

### Test 1: API Available

```bash
curl -X OPTIONS http://localhost:3000/api/prices/check -v
```

### Test 2: Manual Price Check  

```bash
curl -X POST http://localhost:3000/api/prices/check \
  -H "Content-Type: application/json" \
  -d '{"baseCurrency": "USD"}'
```

### Test 3: User Notifications

```bash
curl -X POST http://localhost:3000/api/prices/notifications/setup/1 \
  -H "Content-Type: application/json" \
  -d '{
    "emailAddress": "test@example.com",
    "discordWebhook": "https://discordapp.com/api/webhooks/..."
  }'
```

---

## Production Deployment

### Checklist

- [ ] All environment variables configured
- [ ] Database ready
- [ ] Email provider credentials verified
- [ ] Background scheduler tested
- [ ] Monitoring/alerting set up
- [ ] Database backups scheduled

### Deploy

```bash
npm run build
NODE_ENV=production npm start
```

---

## Support

- **Full docs**: `docs/PRICE_MONITORING.md`
- **API reference**: `API_REFERENCE.md`  
- **Implementation**: `PRICE_MONITORING_IMPLEMENTATION.md`

Generated: 2024-01-15
