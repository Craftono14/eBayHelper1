import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { ebaySyncService } from '../services/ebaySync.service';
import { sendPriceAlertDM } from '../services/discord-notification';
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

    // Process triggered alerts: keep manual alerts, reset auto alerts with percentage if set
    if (triggeredItems.length > 0) {
      // Fetch user's Discord settings to send notifications
      const userWithDiscord = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          discordId: true,
          globalPriceDropPercentage: true,
        },
      });

      for (const item of triggeredItems) {
        // Send Discord notification if user has Discord ID configured
        if (userWithDiscord?.discordId) {
          const currentPrice = Number(item.currentPrice);
          const itemUrl = item.itemUrl || 'https://ebay.com';
          
          await sendPriceAlertDM(
            { discordId: userWithDiscord.discordId },
            {
              itemName: item.itemTitle || 'Unknown Item',
              currentPrice,
              targetPrice: Number(item.targetPrice),
              url: itemUrl,
            }
          );
        }

        // Skip manually set alerts - user needs to manually remove/edit them
        if (item.targetPriceSetManually) {
          continue;
        }

        const currentPrice = parseFloat(item.currentPrice!.toString());
        
        if (globalPercentage !== null && globalPercentage > 0) {
          // Reapply percentage based on new current price for auto alerts
          const newTarget = currentPrice * (1 - globalPercentage / 100);
          await prisma.wishlistItem.update({
            where: { id: item.id },
            data: {
              targetPrice: newTarget,
              targetPriceSetManually: false,
            },
          });
        } else {
          // No global percentage, just clear the auto alert
          await prisma.wishlistItem.update({
            where: { id: item.id },
            data: {
              targetPrice: null,
              targetPriceSetManually: false,
            },
          });
        }
      }
      
      console.log(`[sync] Processed ${triggeredItems.length} triggered price alerts`);
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
