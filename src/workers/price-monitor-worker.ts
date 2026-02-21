/**
 * Price Monitor Worker
 * Integrates price monitoring into the background worker system
 */

import { PrismaClient } from '@prisma/client';
import { createPriceMonitor } from '../services/price-monitor';
import { notificationManager, UserNotificationPreferences } from '../services/notification-service';

export interface PriceMonitorWorkerConfig {
  accessToken: string;
  sandbox?: boolean;
  baseCurrency?: string;
  maxItemsPerCycle?: number;
}

export interface PriceMonitorCycleStats {
  usersChecked: number;
  itemsChecked: number;
  pricesUpdated: number;
  priceDropsDetected: number;
  alertsTriggered: number;
  conversionErrors: number;
  apiErrors: number;
  durationMs: number;
}

/**
 * Run price monitoring cycle for all users
 */
export async function runPriceMonitoringCycle(
  prisma: PrismaClient,
  config: PriceMonitorWorkerConfig
): Promise<PriceMonitorCycleStats> {
  const startTime = Date.now();
  const baseCurrency = config.baseCurrency || 'USD';
  console.log('[priceMonitorWorker] Starting price monitoring cycle');

  const stats: PriceMonitorCycleStats = {
    usersChecked: 0,
    itemsChecked: 0,
    pricesUpdated: 0,
    priceDropsDetected: 0,
    alertsTriggered: 0,
    conversionErrors: 0,
    apiErrors: 0,
    durationMs: 0,
  };

  try {
    // Get all unique users with active wishlist items
    const users = await prisma.user.findMany({
      where: {
        wishlistItems: {
          some: {
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        ebayAccessToken: true,
      },
    });

    console.log(
      `[priceMonitorWorker] Found ${users.length} users with active wishlist items`
    );

    // Process each user
    for (const user of users) {
      if (!user.ebayAccessToken) {
        console.warn(`[priceMonitorWorker] User ${user.id} has no OAuth token, skipping`);
        continue;
      }

      try {
        // Create monitor for this user
        const monitor = createPriceMonitor(prisma, user.ebayAccessToken, config.sandbox);

        // Check prices
        await monitor.checkUserWishlistPrices(user.id, baseCurrency);

        // Aggregate stats
        const userStats = monitor.getStats();
        stats.usersChecked++;
        stats.itemsChecked += userStats.itemsChecked;
        stats.pricesUpdated += userStats.pricesUpdated;
        stats.priceDropsDetected += userStats.priceDropsDetected;
        stats.alertsTriggered += userStats.alertsTriggered;
        stats.conversionErrors += userStats.conversionErrors;
        stats.apiErrors += userStats.apiErrors;

        console.log(
          `[priceMonitorWorker] User ${user.id}: ${userStats.itemsChecked} checked, ${userStats.alertsTriggered} alerts`
        );
      } catch (error) {
        console.error(
          `[priceMonitorWorker] Error monitoring prices for user ${user.id}:`,
          error
        );
        stats.apiErrors++;
      }
    }
  } catch (error) {
    console.error('[priceMonitorWorker] Error during monitoring cycle:', error);
  }

  stats.durationMs = Date.now() - startTime;

  console.log(
    `[priceMonitorWorker] Cycle complete: ${stats.usersChecked} users, ${stats.itemsChecked} items, ${stats.alertsTriggered} alerts (${stats.durationMs}ms)`
  );

  return stats;
}

/**
 * Set up default notification preferences for a user
 */
export async function setupDefaultNotifications(
  userId: number,
  emailAddress?: string,
  discordWebhook?: string
): Promise<void> {
  const channels = [];

  if (emailAddress) {
    channels.push({
      type: 'email',
      enabled: true,
      config: { emailAddress },
    });
  }

  if (discordWebhook) {
    channels.push({
      type: 'discord',
      enabled: true,
      config: { webhookUrl: discordWebhook },
    });
  }

  const preferences: UserNotificationPreferences = {
    userId,
    priceDropThresholdPercent: 5, // Alert on 5% or more drops
    channels: channels as any,
    quietHours: {
      enabled: false,
      startHour: 22,
      endHour: 8,
    },
  };

  notificationManager.registerUserPreferences(preferences);
  console.log(`[priceMonitorWorker] Set up notifications for user ${userId}`);
}

/**
 * Update user notification preferences
 */
export async function updateNotificationPreferences(
  userId: number,
  updates: Partial<UserNotificationPreferences>
): Promise<void> {
  const current = notificationManager.getUserPreferences(userId);
  if (!current) {
    console.warn(`[priceMonitorWorker] No preferences found for user ${userId}`);
    return;
  }

  const updated = { ...current, ...updates };
  notificationManager.registerUserPreferences(updated);
  console.log(`[priceMonitorWorker] Updated preferences for user ${userId}`);
}

/**
 * Get price summary for a user
 */
export async function getUserPriceSummary(
  prisma: PrismaClient,
  userId: number
): Promise<{
  totalItems: number;
  pricesDropped: number;
  averagePrice: number;
  lowestPrice: number;
  highestPrice: number;
  itemsBelowTarget: number;
}> {
  const items = await prisma.wishlistItem.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: {
      currentPrice: true,
      targetPrice: true,
      lowestPriceRecorded: true,
      highestPriceRecorded: true,
    },
  });

  const prices = items
    .map((item: any) => parseFloat(item.currentPrice?.toString() || '0'))
    .filter((p: number) => p > 0);

  return {
    totalItems: items.length,
    pricesDropped: items.filter((item: any) => {
      const current = parseFloat(item.currentPrice?.toString() || '0');
      const lowest = item.lowestPriceRecorded
        ? parseFloat(item.lowestPriceRecorded.toString())
        : current;
      return current === lowest;
    }).length,
    averagePrice: prices.length > 0 ? prices.reduce((a: number, b: number) => a + b) / prices.length : 0,
    lowestPrice: prices.length > 0 ? Math.min(...prices) : 0,
    highestPrice: prices.length > 0 ? Math.max(...prices) : 0,
    itemsBelowTarget: items.filter((item: any) => {
      const current = parseFloat(item.currentPrice?.toString() || '0');
      const target = item.targetPrice ? parseFloat(item.targetPrice.toString()) : Infinity;
      return current < target;
    }).length,
  };
}
