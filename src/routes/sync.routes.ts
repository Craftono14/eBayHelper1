import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { ebaySyncService } from '../services/ebaySync.service';
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
        itemTitle: true,
        currentPrice: true,
        targetPrice: true,
      },
    });

    const alertsTriggered = recentlySyncedItems
      .filter((item) => {
        const currentPrice = Number(item.currentPrice);
        const targetPrice = Number(item.targetPrice);
        return Number.isFinite(currentPrice) && Number.isFinite(targetPrice) && currentPrice <= targetPrice;
      })
      .map((item) => item.itemTitle || 'Untitled Item');

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
