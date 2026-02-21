import { Router, Request, Response } from 'express';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.middleware';
import { refreshAccessToken, EbayOAuthConfig } from '../utils/ebayOAuth';

const prisma = new PrismaClient();
const router = Router();

const ebayConfig: EbayOAuthConfig = {
  clientId: process.env.EBAY_CLIENT_ID || '',
  clientSecret: process.env.EBAY_CLIENT_SECRET || '',
  redirectUri: process.env.EBAY_OAUTH_REDIRECT_URI || '',
  sandbox: process.env.EBAY_SANDBOX_MODE === 'true',
};

const TRADING_API_URL = ebayConfig.sandbox
  ? 'https://api.sandbox.ebay.com/ws/api.dll'
  : 'https://api.ebay.com/ws/api.dll';

// POST /api/ebay-watchlist/add - Add item to eBay watchlist
router.post('/add', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id;
    const { itemId } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: 'itemId is required' });
    }

    // Get user's eBay token
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ebayAccessToken: true,
        ebayRefreshToken: true,
      },
    });

    if (!user?.ebayAccessToken) {
      return res.status(401).json({ error: 'eBay account not linked' });
    }

    // Build XML request
    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<AddToWatchListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${user.ebayAccessToken}</eBayAuthToken>
  </RequesterCredentials>
  <ItemID>${itemId}</ItemID>
</AddToWatchListRequest>`;

    try {
      console.log('[ebay-watchlist] Sending request to eBay:', xmlRequest);
      
      const response = await axios.post(TRADING_API_URL, xmlRequest, {
        headers: {
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
          'X-EBAY-API-CALL-NAME': 'AddToWatchList',
          'Content-Type': 'text/xml',
        },
      });

      console.log('[ebay-watchlist] eBay response:', response.data);

      // Parse response for WatchListCount and WatchListMaximum
      const watchListCount = extractXmlValue(response.data, 'WatchListCount');
      const watchListMaximum = extractXmlValue(response.data, 'WatchListMaximum');
      const ack = extractXmlValue(response.data, 'Ack');

      if (ack === 'Success' || ack === 'Warning') {
        return res.json({
          success: true,
          itemId,
          watchListCount: watchListCount ? parseInt(watchListCount) : null,
          watchListMaximum: watchListMaximum ? parseInt(watchListMaximum) : null,
        });
      } else {
        const errorMessage = extractXmlValue(response.data, 'Errors', 'LongMessage') || 'Unknown error';
        const errorCode = extractXmlValue(response.data, 'Errors', 'ErrorCode');
        console.log('[ebay-watchlist] eBay API error:', { ack, errorCode, errorMessage });
        return res.status(400).json({ error: errorMessage });
      }
    } catch (error: any) {
      // Handle 401 - attempt token refresh
      if (error.response?.status === 401 && user.ebayRefreshToken) {
        console.log('[ebay-watchlist] Token expired, refreshing...');
        
        const newTokens = await refreshAccessToken(user.ebayRefreshToken, ebayConfig);
        await prisma.user.update({
          where: { id: userId },
          data: {
            ebayAccessToken: newTokens.accessToken,
            ebayRefreshToken: newTokens.refreshToken,
            ebayTokenExpiry: newTokens.expiresAt,
          },
        });

        // Retry with new token
        const retryXmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<AddToWatchListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${newTokens.accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <ItemID>${itemId}</ItemID>
</AddToWatchListRequest>`;

        const retryResponse = await axios.post(TRADING_API_URL, retryXmlRequest, {
          headers: {
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
            'X-EBAY-API-CALL-NAME': 'AddToWatchList',
            'Content-Type': 'text/xml',
          },
        });

        const watchListCount = extractXmlValue(retryResponse.data, 'WatchListCount');
        const watchListMaximum = extractXmlValue(retryResponse.data, 'WatchListMaximum');
        const ack = extractXmlValue(retryResponse.data, 'Ack');

        if (ack === 'Success' || ack === 'Warning') {
          return res.json({
            success: true,
            itemId,
            watchListCount: watchListCount ? parseInt(watchListCount) : null,
            watchListMaximum: watchListMaximum ? parseInt(watchListMaximum) : null,
          });
        } else {
          const errorMessage = extractXmlValue(retryResponse.data, 'Errors', 'LongMessage') || 'Unknown error';
          return res.status(400).json({ error: errorMessage });
        }
      }

      throw error;
    }
  } catch (error: any) {
    console.error('[ebay-watchlist] Add error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to add item to watchlist' });
  }
});

// POST /api/ebay-watchlist/remove - Remove item from eBay watchlist
router.post('/remove', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id;
    const { itemId } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: 'itemId is required' });
    }

    // Get user's eBay token
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ebayAccessToken: true,
        ebayRefreshToken: true,
      },
    });

    if (!user?.ebayAccessToken) {
      return res.status(401).json({ error: 'eBay account not linked' });
    }

    // Build XML request
    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<RemoveFromWatchListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${user.ebayAccessToken}</eBayAuthToken>
  </RequesterCredentials>
  <ItemID>${itemId}</ItemID>
</RemoveFromWatchListRequest>`;

    try {
      const response = await axios.post(TRADING_API_URL, xmlRequest, {
        headers: {
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
          'X-EBAY-API-CALL-NAME': 'RemoveFromWatchList',
          'Content-Type': 'text/xml',
        },
      });

      // Parse response
      const watchListCount = extractXmlValue(response.data, 'WatchListCount');
      const watchListMaximum = extractXmlValue(response.data, 'WatchListMaximum');
      const ack = extractXmlValue(response.data, 'Ack');

      if (ack === 'Success' || ack === 'Warning') {
        return res.json({
          success: true,
          itemId,
          watchListCount: watchListCount ? parseInt(watchListCount) : null,
          watchListMaximum: watchListMaximum ? parseInt(watchListMaximum) : null,
        });
      } else {
        const errorMessage = extractXmlValue(response.data, 'Errors', 'LongMessage') || 'Unknown error';
        return res.status(400).json({ error: errorMessage });
      }
    } catch (error: any) {
      // Handle 401 - attempt token refresh
      if (error.response?.status === 401 && user.ebayRefreshToken) {
        console.log('[ebay-watchlist] Token expired, refreshing...');
        
        const newTokens = await refreshAccessToken(user.ebayRefreshToken, ebayConfig);
        await prisma.user.update({
          where: { id: userId },
          data: {
            ebayAccessToken: newTokens.accessToken,
            ebayRefreshToken: newTokens.refreshToken,
            ebayTokenExpiry: newTokens.expiresAt,
          },
        });

        // Retry with new token
        const retryXmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<RemoveFromWatchListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${newTokens.accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <ItemID>${itemId}</ItemID>
</RemoveFromWatchListRequest>`;

        const retryResponse = await axios.post(TRADING_API_URL, retryXmlRequest, {
          headers: {
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
            'X-EBAY-API-CALL-NAME': 'RemoveFromWatchList',
            'Content-Type': 'text/xml',
          },
        });

        const watchListCount = extractXmlValue(retryResponse.data, 'WatchListCount');
        const watchListMaximum = extractXmlValue(retryResponse.data, 'WatchListMaximum');
        const ack = extractXmlValue(retryResponse.data, 'Ack');

        if (ack === 'Success' || ack === 'Warning') {
          return res.json({
            success: true,
            itemId,
            watchListCount: watchListCount ? parseInt(watchListCount) : null,
            watchListMaximum: watchListMaximum ? parseInt(watchListMaximum) : null,
          });
        } else {
          const errorMessage = extractXmlValue(retryResponse.data, 'Errors', 'LongMessage') || 'Unknown error';
          return res.status(400).json({ error: errorMessage });
        }
      }

      throw error;
    }
  } catch (error: any) {
    console.error('[ebay-watchlist] Remove error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to remove item from watchlist' });
  }
});

// Helper function to extract value from XML
function extractXmlValue(xml: string, ...tagNames: string[]): string | undefined {
  let currentXml = xml;
  
  for (let i = 0; i < tagNames.length - 1; i++) {
    const tagRegex = new RegExp(`<${tagNames[i]}[^>]*>([\\s\\S]*?)<\\/${tagNames[i]}>`, 'i');
    const match = currentXml.match(tagRegex);
    if (!match) return undefined;
    currentXml = match[1];
  }

  const lastTag = tagNames[tagNames.length - 1];
  const tagRegex = new RegExp(`<${lastTag}[^>]*>([^<]*)<\\/${lastTag}>`, 'i');
  const match = currentXml.match(tagRegex);
  return match ? match[1].trim() : undefined;
}

export default router;
