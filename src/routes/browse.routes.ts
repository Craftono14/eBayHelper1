/**
 * Browse Routes - Search and browse items from eBay
 * Uses eBay Browse API for item discovery
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

interface BrowseSearchOptions {
  q: string;
  limit?: number;
  offset?: number;
}

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
    console.error('[browse] Failed to get eBay app token:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with eBay');
  }
}

/**
 * GET /api/browse/search
 * Search for items using eBay Browse API
 * Query params: q (keywords), limit, offset
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, limit = '50', offset = '0' } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Missing required query parameter: q' });
      return;
    }

    // Get app token for Browse API access
    const accessToken = await getEbayAppToken();

    const browseUrl = process.env.EBAY_SANDBOX_MODE === 'true'
      ? 'https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search'
      : 'https://api.ebay.com/buy/browse/v1/item_summary/search';

    const response = await axios.get(browseUrl, {
      params: {
        q: q,
        limit: limit,
        offset: offset,
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });

    const itemSummaries = response.data.itemSummaries || [];

    // Transform response to include only needed fields
    const items = itemSummaries.map((item: any) => ({
      itemId: item.itemId,
      title: item.title,
      image: item.image,
      price: item.price,
      buyingOptions: item.buyingOptions || [],
      shippingOptions: item.shippingOptions,
      itemWebUrl: item.itemWebUrl,
    }));

    res.json({
      items,
      total: response.data.total || 0,
      offset: response.data.offset || 0,
      limit: response.data.limit || 50,
      href: response.data.href,
    });
  } catch (error: any) {
    console.error('[browse] Search error:', error.response?.data || error.message);
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.errors?.[0]?.message || 'Failed to search items';
    
    res.status(statusCode).json({ error: errorMessage });
  }
});

export default router;
