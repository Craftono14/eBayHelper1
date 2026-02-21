/**
 * Price Monitoring Routes
 * REST API endpoints for price monitoring and alerts
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  runPriceMonitoringCycle,
  setupDefaultNotifications,
  updateNotificationPreferences,
  getUserPriceSummary,
} from '../workers/price-monitor-worker';

export function createPriceMonitoringRouter(
  prisma: PrismaClient,
  accessToken: string
): Router {
  const router = Router();

  /**
   * POST /api/prices/check
   * Manually trigger price monitoring for all users
   */
  router.post('/check', async (req: Request, res: Response) => {
    try {
      console.log('[priceRoutes] Triggering price monitoring');
      const stats = await runPriceMonitoringCycle(prisma, {
        accessToken,
        sandbox: process.env.EBAY_SANDBOX === 'true',
        baseCurrency: req.body.baseCurrency || 'USD',
      });

      res.json({
        success: true,
        message: 'Price monitoring cycle completed',
        stats,
      });
    } catch (error) {
      console.error('[priceRoutes] Price check failed:', error);
      res.status(500).json({
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /api/prices/check/:userId
   * Check prices for a specific user
   */
  router.post('/check/:userId', async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.params.userId);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { ebayAccessToken: true },
      });

      if (!user || !user.ebayAccessToken) {
        res.status(404).json({
          error: 'User not found or no OAuth token',
        });
        return;
      }

      const { createPriceMonitor } = await import('../services/price-monitor');

      const monitor = createPriceMonitor(
        prisma,
        user.ebayAccessToken,
        process.env.EBAY_SANDBOX === 'true'
      );

      const results = await monitor.checkUserWishlistPrices(
        userId,
        req.body.baseCurrency || 'USD'
      );

      const stats = monitor.getStats();

      res.json({
        success: true,
        userId,
        stats,
        results: results.slice(0, 10), // Return first 10 for brevity
      });
    } catch (error) {
      console.error('[priceRoutes] User price check failed:', error);
      res.status(500).json({
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /api/prices/summary/:userId
   * Get price summary for a user
   */
  router.get('/summary/:userId', async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.params.userId);

      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const summary = await getUserPriceSummary(prisma, userId);

      res.json({
        userId,
        summary,
      });
    } catch (error) {
      console.error('[priceRoutes] Summary fetch failed:', error);
      res.status(500).json({
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /api/prices/items/:userId
   * Get all wishlist items with current prices for a user
   */
  router.get('/items/:userId', async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const items = await prisma.wishlistItem.findMany({
        where: {
          userId,
          isActive: true,
        },
        select: {
          id: true,
          ebayItemId: true,
          itemTitle: true,
          currentPrice: true,
          targetPrice: true,
          lowestPriceRecorded: true,
          highestPriceRecorded: true,
          lastCheckedAt: true,
        },
        take: limit,
        skip: offset,
        orderBy: {
          lastCheckedAt: 'desc',
        },
      });

      const total = await prisma.wishlistItem.count({
        where: {
          userId,
          isActive: true,
        },
      });

      res.json({
        userId,
        total,
        limit,
        offset,
        items: items.map((item: any) => ({
          ...item,
          currentPrice: item.currentPrice
            ? parseFloat(item.currentPrice.toString())
            : null,
          targetPrice: item.targetPrice
            ? parseFloat(item.targetPrice.toString())
            : null,
          lowestPrice: item.lowestPriceRecorded
            ? parseFloat(item.lowestPriceRecorded.toString())
            : null,
          highestPrice: item.highestPriceRecorded
            ? parseFloat(item.highestPriceRecorded.toString())
            : null,
        })),
      });
    } catch (error) {
      console.error('[priceRoutes] Items fetch failed:', error);
      res.status(500).json({
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /api/prices/history/:wishlistItemId
   * Get price history for a specific item
   */
  router.get('/history/:wishlistItemId', async (req: Request, res: Response): Promise<void> => {
    try {
      const wishlistItemId = parseInt(req.params.wishlistItemId);
      const limit = parseInt(req.query.limit as string) || 30;

      const history = await prisma.itemHistory.findMany({
        where: {
          wishlistItemId,
        },
        select: {
          id: true,
          price: true,
          priceDropped: true,
          priceDropAmount: true,
          recordedAt: true,
        },
        take: limit,
        orderBy: {
          recordedAt: 'desc',
        },
      });

      if (history.length === 0) {
        res.status(404).json({
          error: 'No price history found',
        });
        return;
      }

      // Get item info
      const item = await prisma.wishlistItem.findUnique({
        where: { id: wishlistItemId },
        select: {
          itemTitle: true,
          targetPrice: true,
        },
      });

      res.json({
        wishlistItemId,
        itemTitle: item?.itemTitle,
        targetPrice: item?.targetPrice
          ? parseFloat(item.targetPrice.toString())
          : null,
        history: history.map((h: any) => ({
          ...h,
          price: parseFloat(h.price.toString()),
          priceDropAmount: h.priceDropAmount
            ? parseFloat(h.priceDropAmount.toString())
            : null,
        })),
      });
    } catch (error) {
      console.error('[priceRoutes] History fetch failed:', error);
      res.status(500).json({
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /api/prices/notifications/setup/:userId
   * Set up notification preferences for a user
   */
  router.post(
    '/notifications/setup/:userId',
    async (req: Request, res: Response): Promise<void> => {
      try {
        const userId = parseInt(req.params.userId);
        const { emailAddress, discordWebhook } = req.body;

        // Verify user exists
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        await setupDefaultNotifications(userId, emailAddress, discordWebhook);

        res.json({
          success: true,
          userId,
          message: 'Notification preferences configured',
        });
      } catch (error) {
        console.error('[priceRoutes] Notification setup failed:', error);
        res.status(500).json({
          error: (error as Error).message,
        });
      }
    }
  );

  /**
   * PATCH /api/prices/notifications/:userId
   * Update notification preferences
   */
  router.patch('/notifications/:userId', async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.params.userId);

      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      await updateNotificationPreferences(userId, req.body);

      res.json({
        success: true,
        userId,
        message: 'Notification preferences updated',
      });
    } catch (error) {
      console.error('[priceRoutes] Notification update failed:', error);
      res.status(500).json({
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /api/prices/items/:wishlistItemId/target
   * Update target price for an item
   */
  router.post(
    '/items/:wishlistItemId/target',
    async (req: Request, res: Response): Promise<void> => {
      try {
        const wishlistItemId = parseInt(req.params.wishlistItemId);
        const { targetPrice } = req.body;

        if (typeof targetPrice !== 'number' || targetPrice < 0) {
          res.status(400).json({
            error: 'targetPrice must be a positive number',
          });
          return;
        }

        const item = await prisma.wishlistItem.update({
          where: { id: wishlistItemId },
          data: { targetPrice },
        });

        res.json({
          success: true,
          wishlistItemId,
          newTargetPrice: parseFloat(item.targetPrice?.toString() || '0'),
        });
      } catch (error) {
        console.error('[priceRoutes] Target price update failed:', error);
        res.status(500).json({
          error: (error as Error).message,
        });
      }
    }
  );

  return router;
}
