/**
 * Feed Routes - Combine results from all saved searches
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.middleware';

const prisma = new PrismaClient();
const router = Router();

interface ItemSummary {
  itemId: string;
  title: string;
  image: {
    imageUrl: string;
  };
  price: {
    value: string;
    currency: string;
  };
  buyingOptions: string[];
  shippingOptions?: Array<{
    shippingCost: {
      value: string;
      currency: string;
    };
  }>;
  itemWebUrl?: string;
  itemOriginDate?: string; // Listing date for sorting
}

// Get eBay OAuth app token (client credentials flow)
async function getEbayAppToken(): Promise<string> {
  const tokenUrl = process.env.EBAY_SANDBOX_MODE === 'true'
    ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
    : 'https://api.ebay.com/identity/v1/oauth2/token';

  try {
    const response = await axios.post(
      tokenUrl,
      'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(
            `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
          ).toString('base64')}`,
        },
      }
    );

    return response.data.access_token;
  } catch (error: any) {
    console.error('[feed] Failed to get eBay app token:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with eBay');
  }
}

// Helper function to fetch items for a single search
async function fetchSearchItems(
  accessToken: string,
  searchKeywords: string,
  categoryIds?: string,
  minPrice?: number,
  maxPrice?: number,
  condition?: string,
  buyingFormat?: string
): Promise<ItemSummary[]> {
  const browseUrl = process.env.EBAY_SANDBOX_MODE === 'true'
    ? 'https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search'
    : 'https://api.ebay.com/buy/browse/v1/item_summary/search';

  const filters: string[] = [];

  // Price range filter
  if (minPrice !== null && minPrice !== undefined && maxPrice !== null && maxPrice !== undefined) {
    filters.push(`price:[${minPrice}..${maxPrice}]`);
  } else if (minPrice !== null && minPrice !== undefined) {
    filters.push(`price:[${minPrice}..]`);
  } else if (maxPrice !== null && maxPrice !== undefined) {
    filters.push(`price:[..${maxPrice}]`);
  }

  // Condition filter (map to Browse API format)
  if (condition) {
    const conditionMap: Record<string, string> = {
      'New': 'NEW',
      'Used': 'USED',
      'Refurbished': 'REFURBISHED',
      'For parts or not working': 'FOR_PARTS_OR_NOT_WORKING',
    };
    const browseCondition = conditionMap[condition] || condition.toUpperCase().replace(/ /g, '_');
    filters.push(`conditions:{${browseCondition}}`);
  }

  // Buying format filter
  if (buyingFormat) {
    const formatMap: Record<string, string> = {
      'Auction': 'AUCTION',
      'Buy It Now': 'FIXED_PRICE',
      'FixItPrice': 'FIXED_PRICE',
      'AuctionWithBIN': 'AUCTION|FIXED_PRICE',
      'Both': 'AUCTION|FIXED_PRICE',
    };
    const browseFormat = formatMap[buyingFormat] || 'FIXED_PRICE';
    filters.push(`buyingOptions:{${browseFormat}}`);
  }

  const params: any = {
    q: searchKeywords,
    sort: 'newlyListed', // Always use newest first for feed
    limit: '50', // Get max results per search
  };

  if (filters.length > 0) {
    params.filter = filters.join(',');
  }

  if (categoryIds) {
    params.category_ids = categoryIds;
  }

  try {
    const response = await axios.get(browseUrl, {
      params,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });

    const itemSummaries = response.data.itemSummaries || [];

    // Transform response to include only needed fields
    return itemSummaries.map((item: any) => ({
      itemId: item.itemId,
      title: item.title,
      image: item.image,
      price: item.price,
      buyingOptions: item.buyingOptions || [],
      shippingOptions: item.shippingOptions,
      itemWebUrl: item.itemWebUrl,
      itemOriginDate: item.itemOriginDate, // Include listing date for sorting
    }));
  } catch (error: any) {
    console.error(`[feed] Error fetching items for "${searchKeywords}":`, error.response?.data || error.message);
    return [];
  }
}

/**
 * POST /api/feed/refresh
 * Refresh feed by combining results from multiple saved searches
 * Body: { searchIds: number[] }
 */
router.post('/refresh', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { searchIds } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!searchIds || !Array.isArray(searchIds) || searchIds.length === 0) {
      res.status(400).json({ error: 'searchIds array is required' });
      return;
    }

    // Fetch all saved searches included in feed
    const searches = await (prisma.savedSearch as any).findMany({
      where: {
        userId,
        id: { in: searchIds },
        isActive: true,
        includeInFeed: true,
      },
    });

    if (searches.length === 0) {
      res.status(400).json({ error: 'No active searches found' });
      return;
    }

    console.log(`[feed] Refreshing feed for user ${userId} with ${searches.length} searches`);

    // Get eBay app token
    const accessToken = await getEbayAppToken();

    // Fetch items from all searches
    const allItems: ItemSummary[] = [];
    const itemsPerSearch: Record<number, number> = {};
    const seenItemIds = new Set<string>();

    for (const search of searches) {
      try {
        console.log(`[feed] Fetching results for search "${search.name}"`);

        const items = await fetchSearchItems(
          accessToken,
          search.searchKeywords,
          search.categories,
          search.minPrice ? parseFloat(search.minPrice.toString()) : undefined,
          search.maxPrice ? parseFloat(search.maxPrice.toString()) : undefined,
          search.condition,
          search.buyingFormat
        );

        // Add unique items only
        const newItems = items.filter(item => !seenItemIds.has(item.itemId));
        newItems.forEach(item => seenItemIds.add(item.itemId));

        allItems.push(...newItems);
        itemsPerSearch[search.id] = newItems.length;

        console.log(`[feed] Search "${search.name}": found ${items.length} items, ${newItems.length} new`);
      } catch (error: any) {
        console.error(`[feed] Error processing search "${search.name}":`, error.message);
        // Continue with other searches even if one fails
      }
    }

    // Re-sort all combined items by itemOriginDate (newest first)
    allItems.sort((a, b) => {
      const dateA = a.itemOriginDate ? new Date(a.itemOriginDate).getTime() : 0;
      const dateB = b.itemOriginDate ? new Date(b.itemOriginDate).getTime() : 0;
      return dateB - dateA; // Descending order (newest first)
    });

    console.log(`[feed] Feed refresh complete: ${allItems.length} total unique items from ${searches.length} searches, re-sorted by newest first`);

    res.json({
      items: allItems,
      searchCount: searches.length,
      itemsPerSearch,
    });
  } catch (error: any) {
    console.error('[feed] Refresh error:', error.response?.data || error.message);

    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message || 'Failed to refresh feed';

    res.status(statusCode).json({ error: errorMessage });
  }
});

export default router;
