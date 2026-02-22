import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.middleware';

const prisma = new PrismaClient();
const router = Router();

// GET /api/searches/dashboard - Get user's saved searches with new results count
router.get('/dashboard', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const searches = await (prisma.savedSearch as any).findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const searchesWithCounts = searches.map((search: any) => ({
      id: search.id,
      name: search.name,
      searchKeywords: search.searchKeywords,
      newResultsCount: 0, // TODO: Implement proper new results tracking
      isEbayImported: search.isEbayImported,
      createdAt: search.createdAt,
      updatedAt: search.updatedAt,
    }));

    res.json({ searches: searchesWithCounts });
  } catch (error) {
    console.error('[searches] dashboard error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/searches/:id - Get a specific saved search with full details including sort
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id;
    const searchId = parseInt(req.params.id);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const search = await (prisma.savedSearch as any).findFirst({
      where: { id: searchId, userId },
    });

    if (!search) {
      return res.status(404).json({ error: 'Search not found' });
    }

    res.json({
      id: search.id,
      name: search.name,
      searchKeywords: search.searchKeywords,
      sortBy: search.sortBy,
      sortOrder: search.sortOrder,
      buyingFormat: search.buyingFormat,
      minPrice: search.minPrice,
      maxPrice: search.maxPrice,
      condition: search.condition,
      categories: search.categories,
      itemLocation: search.itemLocation,
      currency: search.currency,
      freeShipping: search.freeShipping,
    });
  } catch (error) {
    console.error('[searches] get by id error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/searches/import-ebay - Sync user's eBay saved searches
router.post('/import-ebay', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await (prisma.user as any).findUnique({
      where: { id: userId },
    });

    if (!user?.ebayAccessToken) {
      return res.status(400).json({ error: 'eBay account not linked' });
    }

    // TODO: Implement eBay Browse API integration to fetch user's saved searches
    // For now, return a placeholder response
    console.log('[searches] import-ebay called for user', userId);
    
    res.json({ 
      message: 'Import from eBay feature coming soon',
      importedCount: 0 
    });
  } catch (error) {
    console.error('[searches] import-ebay error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const createSearchesRouter = () => router;
