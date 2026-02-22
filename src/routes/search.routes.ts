/**
 * Search Routes - Execute saved searches and manage watchlist
 * Demonstrates OAuth token usage for eBay API calls
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.middleware';
import {
  checkAndRecordPrices,
  executeSavedSearch,
  notifyPriceDrops,
} from '../services/ebay.service';

const router = Router();
const prisma = new PrismaClient();

// Middleware to extract and validate user ID
const requireUserId = (req: Request, res: Response, next: Function): void => {
  const userId = req.headers['x-user-id'] as string;

  if (!userId || isNaN(parseInt(userId))) {
    res.status(400).json({
      error: 'Missing or invalid x-user-id header',
    });
    return;
  }

  (req as any).userId = parseInt(userId);
  next();
};

router.use(requireUserId);

// ============================================================================
// SAVED SEARCHES
// ============================================================================

/**
 * GET /api/search/saved
 * Get all saved searches for user
 */
router.get('/saved', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;

    const searches = await prisma.savedSearch.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        searchKeywords: true,
        minPrice: true,
        maxPrice: true,
        condition: true,
        buyingFormat: true,
        isActive: true,
        lastRunAt: true,
        createdAt: true,
        _count: {
          select: { wishlistItems: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      searches: searches.map((s: any) => ({
        ...s,
        itemCount: s._count.wishlistItems,
      })),
    });
  } catch (error) {
    console.error('Failed to get saved searches:', error);
    res.status(500).json({ error: 'Failed to get saved searches' });
  }
});

/**
 * POST /api/search/saved
 * Create new saved search
 */
router.post('/saved', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const {
      name,
      searchKeywords,
      minPrice,
      maxPrice,
      condition,
      buyingFormat,
      freeShipping,
      freeReturns,
      authorizedSeller,
    } = req.body;

    if (!searchKeywords) {
      res.status(400).json({ error: 'searchKeywords is required' });
      return;
    }

    const search = await prisma.savedSearch.create({
      data: {
        userId,
        name: name || searchKeywords,
        searchKeywords,
        minPrice: minPrice ? parseFloat(minPrice) : null,
        maxPrice: maxPrice ? parseFloat(maxPrice) : null,
        condition: condition || null,
        buyingFormat: buyingFormat || null,
        freeShipping: freeShipping || false,
        freeReturns: freeReturns || false,
        authorizedSeller: authorizedSeller || false,
        isActive: true,
      },
    });

    res.status(201).json({
      message: 'Saved search created',
      search,
    });
  } catch (error) {
    console.error('Failed to create saved search:', error);
    res.status(500).json({ error: 'Failed to create saved search' });
  }
});

/**
 * DELETE /api/search/saved/:id
 * Delete saved search
 */
router.delete('/saved/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const searchId = parseInt(req.params.id);

    // Verify ownership
    const search = await prisma.savedSearch.findUnique({
      where: { id: searchId },
    });

    if (!search || search.userId !== userId) {
      res.status(404).json({ error: 'Search not found' });
      return;
    }

    await prisma.savedSearch.delete({
      where: { id: searchId },
    });

    res.json({ message: 'Search deleted' });
  } catch (error) {
    console.error('Failed to delete search:', error);
    res.status(500).json({ error: 'Failed to delete search' });
  }
});

// ============================================================================
// EXECUTE SEARCHES
// ============================================================================

/**
 * POST /api/search/execute/:id
 * Execute a saved search and add matching items to wishlist
 * Requires valid OAuth token
 */
router.post('/execute/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const searchId = parseInt(req.params.id);

    // Verify user is authenticated
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.ebayAccessToken) {
      res.status(401).json({
        error: 'Not authenticated with eBay. Please authenticate first via /api/oauth/callback',
      });
      return;
    }

    // Verify search ownership
    const search = await prisma.savedSearch.findUnique({
      where: { id: searchId },
    });

    if (!search || search.userId !== userId) {
      res.status(404).json({ error: 'Search not found' });
      return;
    }

    // Execute search (runs async, returns immediately)
    executeSavedSearch(userId, searchId).catch((error) => {
      console.error(`Search execution failed for search ${searchId}:`, error);
    });

    res.json({
      message: 'Search execution started',
      searchId,
      status: 'processing',
      checkStatusAt: `/api/search/saved/${searchId}`,
    });
  } catch (error) {
    console.error('Failed to execute search:', error);
    res.status(500).json({ error: 'Failed to execute search' });
  }
});

// ============================================================================
// PRICE CHECKING
// ============================================================================

/**
 * POST /api/search/check-prices
 * Check current prices for all wishlist items
 * Requires valid OAuth token
 */
router.post('/check-prices', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.ebayAccessToken) {
      res.status(401).json({
        error: 'Not authenticated with eBay',
      });
      return;
    }

    // Run price check async
    checkAndRecordPrices(userId).catch((error) => {
      console.error(`Price check failed for user ${userId}:`, error);
    });

    res.json({
      message: 'Price check started',
      status: 'processing',
    });
  } catch (error) {
    console.error('Failed to check prices:', error);
    res.status(500).json({ error: 'Failed to check prices' });
  }
});

// ============================================================================
// WISHLIST
// ============================================================================

/**
 * GET /api/search/wishlist
 * Get all wishlist items for user
 */
router.get('/wishlist', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const filter = req.query.filter || 'active'; // active, won, purchased, all

    const whereClause =
      filter === 'active'
        ? { userId, isActive: true }
        : filter === 'won'
          ? { userId, isWon: true }
          : filter === 'purchased'
            ? { userId, isPurchased: true }
            : { userId };

    const items = await prisma.wishlistItem.findMany({
      where: whereClause,
      include: {
        search: true,
        priceHistory: {
          take: 1,
          orderBy: { recordedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      items: items.map((item: any) => ({
        id: item.id,
        ebayItemId: item.ebayItemId,
        title: item.itemTitle,
        itemUrl: item.itemUrl,
        itemImageUrl: item.itemImageUrl,
        currentPrice: item.currentPrice != null ? Number(item.currentPrice) : null,
        shippingCost:
          item.shippingCost != null
            ? Number(item.shippingCost)
            : item.priceHistory?.[0]?.shippingCost != null
              ? Number(item.priceHistory?.[0]?.shippingCost)
              : null,
        targetPrice: item.targetPrice != null ? Number(item.targetPrice) : null,
        seller: item.seller,
        sellerRating: item.sellerRating,
        isActive: item.isActive,
        isWon: item.isWon,
        isPurchased: item.isPurchased,
        isEbayImported: item.isEbayImported,
        lowestPrice: item.lowestPriceRecorded != null ? Number(item.lowestPriceRecorded) : null,
        highestPrice: item.highestPriceRecorded != null ? Number(item.highestPriceRecorded) : null,
        search: item.search?.name,
        lastChecked: item.lastCheckedAt,
        addedAt: item.createdAt,
        priceHistory: item.priceHistory,
      })),
      total: items.length,
    });
  } catch (error) {
    console.error('Failed to get wishlist:', error);
    res.status(500).json({ error: 'Failed to get wishlist' });
  }
});

/**
 * POST /api/search/wishlist
 * Add item to wishlist
 */
router.post('/wishlist', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { ebayItemId, itemTitle, itemUrl, targetPrice } = req.body;

    if (!ebayItemId) {
      res.status(400).json({ error: 'ebayItemId is required' });
      return;
    }

    const item = await prisma.wishlistItem.upsert({
      where: {
        userId_ebayItemId: {
          userId,
          ebayItemId,
        },
      },
      update: {
        isActive: true,
        // Re-activate if was marked inactive
      },
      create: {
        userId,
        ebayItemId,
        itemTitle: itemTitle || 'Unknown Item',
        itemUrl: itemUrl || '',
        targetPrice: targetPrice ? parseFloat(targetPrice) : 0,
        currentPrice: 0,
        lowestPriceRecorded: 0,
        highestPriceRecorded: 0,
      },
    });

    res.status(201).json({
      message: 'Item added to wishlist',
      item,
    });
  } catch (error) {
    console.error('Failed to add to wishlist:', error);
    res.status(500).json({ error: 'Failed to add to wishlist' });
  }
});

/**
 * DELETE /api/search/wishlist/:id
 * Remove item from wishlist
 */
router.delete('/wishlist/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const itemId = parseInt(req.params.id);

    // Verify ownership
    const item = await prisma.wishlistItem.findUnique({
      where: { id: itemId },
    });

    if (!item || item.userId !== userId) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    if (item.isEbayImported) {
      res.status(403).json({ error: 'Imported eBay items cannot be deleted here' });
      return;
    }

    // Mark as inactive (soft delete for history)
    await prisma.wishlistItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });

    res.json({ message: 'Item removed from wishlist' });
  } catch (error) {
    console.error('Failed to remove from wishlist:', error);
    res.status(500).json({ error: 'Failed to remove from wishlist' });
  }
});

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * GET /api/search/notifications
 * Get price drop notifications
 */
router.get('/notifications', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const hoursBack = parseInt(req.query.hours as string) || 24;

    const notifications = await prisma.itemHistory.findMany({
      where: {
        userId,
        priceDropped: true,
        recordedAt: {
          gte: new Date(Date.now() - hoursBack * 60 * 60 * 1000),
        },
      },
      include: {
        wishlistItem: {
          select: {
            itemTitle: true,
            itemUrl: true,
          },
        },
      },
      orderBy: { recordedAt: 'desc' },
    });

    res.json({
      notifications: notifications.map((n: any) => ({
        id: n.id,
        item: n.wishlistItem,
        price: n.price,
        priceDropAmount: n.priceDropAmount,
        recordedAt: n.recordedAt,
      })),
      total: notifications.length,
    });
  } catch (error) {
    console.error('Failed to get notifications:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

/**
 * POST /api/search/send-notifications
 * Manually trigger price drop notifications
 */
router.post(
  '/send-notifications',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;

      // Run notifications async
      notifyPriceDrops(userId).catch((error) => {
        console.error(`Notification send failed for user ${userId}:`, error);
      });

      res.json({
        message: 'Notifications queued',
        status: 'processing',
      });
    } catch (error) {
      console.error('Failed to send notifications:', error);
      res.status(500).json({ error: 'Failed to send notifications' });
    }
  }
);

// ============================================================================
// DASHBOARD STATS
// ============================================================================

/**
 * GET /api/search/stats
 * Get dashboard statistics
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;

    const [wishlistCount, searchCount, recentDrops, avgPriceDrop] = await Promise.all([
      prisma.wishlistItem.count({
        where: { userId, isActive: true },
      }),
      prisma.savedSearch.count({
        where: { userId, isActive: true },
      }),
      prisma.itemHistory.count({
        where: {
          userId,
          priceDropped: true,
          recordedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
      prisma.itemHistory.aggregate({
        where: {
          userId,
          priceDropped: true,
        },
        _avg: {
          priceDropAmount: true,
        },
      }),
    ]);

    res.json({
      watchlistItems: wishlistCount,
      savedSearches: searchCount,
      priceDropsLastWeek: recentDrops,
      avgPriceDrop: avgPriceDrop._avg.priceDropAmount || 0,
      lastSync: null, // Would fetch from User model
    });
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
