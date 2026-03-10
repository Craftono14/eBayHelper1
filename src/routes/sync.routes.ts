import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { ebaySyncService } from '../services/ebaySync.service';
import { sendPriceAlertDM } from '../services/discord-notification';
import { sendPriceAlertPushover } from '../services/pushover-notification';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/sync/ebay
 * Sync both saved searches and watchlist from eBay
 * Protected by auth middleware
 */
router.post('/ebay', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id;
    const syncStartedAt = new Date();

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log(`[sync] Starting eBay sync for user ${userId}`);

    // Sync both saved searches and watchlist
    let searchesCount = 0;
    let watchlistCount = 0;

    try {
      searchesCount = await ebaySyncService.syncSavedSearches(userId);
      console.log(`[sync] Synced ${searchesCount} saved searches`);
    } catch (error: any) {
      console.error('[sync] Failed to sync saved searches:', error.message);
      // Continue with watchlist sync even if searches fail
    }

    try {
      watchlistCount = await ebaySyncService.syncWishlist(userId);
      console.log(`[sync] Synced ${watchlistCount} watchlist items`);
    } catch (error: any) {
      console.error('[sync] Failed to sync watchlist:', error.message);
      // Continue to return partial results
    }

    // Get user's global price drop percentage
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { globalPriceDropPercentage: true },
    });

    const globalPercentage = user?.globalPriceDropPercentage
      ? parseFloat(user.globalPriceDropPercentage.toString())
      : null;

    // Apply global percentage to items without manual alerts
    if (globalPercentage !== null && globalPercentage > 0) {
      const itemsWithoutManualAlerts = await prisma.wishlistItem.findMany({
        where: {
          userId,
          isEbayImported: true,
          currentPrice: { not: null },
          AND: [
            { targetPriceSetManually: false }, // Only auto-set or no alerts
          ],
        },
        select: {
          id: true,
          currentPrice: true,
          targetPrice: true,
          targetPriceSetManually: true,
        },
      });

      for (const item of itemsWithoutManualAlerts) {
        const currentPrice = parseFloat(item.currentPrice!.toString());
        const calculatedTarget = currentPrice * (1 - globalPercentage / 100);

        await prisma.wishlistItem.update({
          where: { id: item.id },
          data: {
            targetPrice: calculatedTarget,
            targetPriceSetManually: false,
          },
        });
      }

      console.log(`[sync] Applied global percentage (${globalPercentage}%) to ${itemsWithoutManualAlerts.length} items`);
    }

    // Find any price alerts that were triggered by this sync run.
    const recentlySyncedItems = await prisma.wishlistItem.findMany({
      where: {
        userId,
        isEbayImported: true,
        updatedAt: { gte: syncStartedAt },
        targetPrice: { not: null },
        currentPrice: { not: null },
      },
      select: {
        id: true,
        itemTitle: true,
        itemUrl: true,
        itemImageUrl: true,
        currentPrice: true,
        targetPrice: true,
        targetPriceSetManually: true,
      },
    });

    const triggeredItems = recentlySyncedItems.filter((item) => {
      const currentPrice = Number(item.currentPrice);
      const targetPrice = Number(item.targetPrice);
      return Number.isFinite(currentPrice) && Number.isFinite(targetPrice) && currentPrice <= targetPrice;
    });

    let notificationsSent = 0;
    let notificationsFailed = 0;
    let notificationsSkipped = 0;

    // Process triggered alerts: send notification and then clear alert to avoid repeat spam
    if (triggeredItems.length > 0) {
      // Fetch user's Discord settings to send notifications
      const userWithDiscord = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          notificationPreference: true,
          discordId: true,
          pushoverUserKey: true,
          pushoverDevice: true,
        },
      });

      const preference = userWithDiscord?.notificationPreference || 'DISCORD';

      for (const item of triggeredItems) {
        // Send notification only through the user's selected method.
        if (preference === 'DISCORD' && userWithDiscord?.discordId) {
          const currentPrice = Number(item.currentPrice);
          const itemUrl = item.itemUrl || 'https://ebay.com';

          const dmResult = await sendPriceAlertDM(
            { discordId: userWithDiscord.discordId },
            {
              itemName: item.itemTitle || 'Unknown Item',
              currentPrice,
              targetPrice: Number(item.targetPrice),
              url: itemUrl,
            }
          );

          if (!dmResult.success) {
            notificationsFailed += 1;
            console.warn(
              `[sync] Discord DM failed for user ${userId}, item ${item.id} (${item.itemTitle || 'Unknown Item'}): ${dmResult.error || 'Unknown error'}`
            );
          } else {
            notificationsSent += 1;
          }
        } else if (preference === 'PUSHOVER' && userWithDiscord?.pushoverUserKey) {
          const currentPrice = Number(item.currentPrice);
          const itemUrl = item.itemUrl || 'https://ebay.com';

          const pushResult = await sendPriceAlertPushover({
            userKey: userWithDiscord.pushoverUserKey,
            device: userWithDiscord.pushoverDevice,
            itemName: item.itemTitle || 'Unknown Item',
            currentPrice,
            itemUrl,
            imageUrl: item.itemImageUrl,
          });

          if (!pushResult.success) {
            notificationsFailed += 1;
            console.warn(
              `[sync] Pushover notification failed for user ${userId}, item ${item.id} (${item.itemTitle || 'Unknown Item'}): ${pushResult.error || 'Unknown error'}`
            );
          } else {
            notificationsSent += 1;
          }
        } else {
          notificationsSkipped += 1;
          console.warn(
            `[sync] Notification skipped for user ${userId}, item ${item.id}. Preference=${preference}, discordIdConfigured=${Boolean(userWithDiscord?.discordId)}, pushoverConfigured=${Boolean(userWithDiscord?.pushoverUserKey)}`
          );
        }

        // Always clear triggered alerts (manual or auto) to prevent repeated notifications.
        await prisma.wishlistItem.update({
          where: { id: item.id },
          data: {
            targetPrice: null,
            targetPriceSetManually: false,
          },
        });
      }
      
      console.log(`[sync] Processed ${triggeredItems.length} triggered price alerts`);
      console.log(
        `[sync] Notification delivery summary for user ${userId}: sent=${notificationsSent}, failed=${notificationsFailed}, skipped=${notificationsSkipped}, preference=${preference}`
      );
    }

    const alertsTriggered = triggeredItems.map((item) => item.itemTitle || 'Untitled Item');

    const totalCount = searchesCount + watchlistCount;

    return res.json({
      success: true,
      message: `Successfully synced ${totalCount} items from eBay`,
      details: {
        savedSearches: searchesCount,
        watchlistItems: watchlistCount,
        total: totalCount,
        alertsTriggered,
        notifications: {
          sent: notificationsSent,
          failed: notificationsFailed,
          skipped: notificationsSkipped,
        },
      },
    });
  } catch (error: any) {
    console.error('[sync] eBay sync error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync from eBay',
    });
  }
});

export default router;
