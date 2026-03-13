import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { ebaySyncService } from '../services/ebaySync.service';

const router = Router();

/**
 * POST /api/sync/ebay
 * Sync both saved searches and watchlist from eBay
 * Protected by auth middleware
 */
router.post('/ebay', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log(`[sync] Starting eBay sync for user ${userId}`);
    const result = await ebaySyncService.syncUserData(userId);
    const totalCount = result.savedSearches + result.watchlistItems;

    return res.json({
      success: true,
      message: `Successfully synced ${totalCount} items from eBay`,
      details: {
        savedSearches: result.savedSearches,
        watchlistItems: result.watchlistItems,
        total: totalCount,
        alertsTriggered: result.alertsTriggered,
        notifications: result.notifications,
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
