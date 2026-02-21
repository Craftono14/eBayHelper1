import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { ebaySyncService } from '../services/ebaySync.service';

const router = Router();

// POST /api/ebay-sync/saved-searches - Sync saved searches from eBay
router.post('/saved-searches', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log(`[ebay-sync] Starting saved searches sync for user ${userId}`);

    await ebaySyncService.syncSavedSearches(userId);

    return res.json({
      success: true,
      message: 'Saved searches synced successfully',
    });
  } catch (error: any) {
    console.error('[ebay-sync] Saved searches sync error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync saved searches',
    });
  }
});

// POST /api/ebay-sync/watchlist - Sync watchlist from eBay
router.post('/watchlist', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log(`[ebay-sync] Starting watchlist sync for user ${userId}`);

    await ebaySyncService.syncWishlist(userId);

    return res.json({
      success: true,
      message: 'Watchlist synced successfully',
    });
  } catch (error: any) {
    console.error('[ebay-sync] Watchlist sync error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync watchlist',
    });
  }
});

// POST /api/ebay-sync/all - Sync both saved searches and watchlist
router.post('/all', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log(`[ebay-sync] Starting full sync for user ${userId}`);

    await ebaySyncService.syncAll(userId);

    return res.json({
      success: true,
      message: 'Full sync completed successfully',
    });
  } catch (error: any) {
    console.error('[ebay-sync] Full sync error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to complete full sync',
    });
  }
});

export default router;
