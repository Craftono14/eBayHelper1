import { Router, Request, Response } from 'express';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.middleware';

const prisma = new PrismaClient();
const router = Router();

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const EBAY_OAUTH_REDIRECT_URI = process.env.EBAY_OAUTH_REDIRECT_URI;
const EBAY_SANDBOX = (process.env.EBAY_SANDBOX_MODE || 'false') === 'true';
const EBAY_AUTH_BASE = EBAY_SANDBOX ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com';
const EBAY_TOKEN_BASE = EBAY_SANDBOX ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';

// Default scopes needed for reading saved searches and wishlists. Can be overridden via env EBAY_OAUTH_SCOPES
const DEFAULT_SCOPES = (
  process.env.EBAY_OAUTH_SCOPES ||
  'https://api.ebay.com/oauth/api_scope/shopping https://api.ebay.com/oauth/api_scope/sell.account.readonly'
).trim();

// GET /api/ebay/link - generate eBay OAuth URL and redirect user
router.get('/link', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log('[ebay-link] /link route called');
    console.log('[ebay-link] EBAY_CLIENT_ID:', EBAY_CLIENT_ID ? '✓ set' : '✗ missing');
    console.log('[ebay-link] EBAY_OAUTH_REDIRECT_URI:', EBAY_OAUTH_REDIRECT_URI ? '✓ set' : '✗ missing');
    
    if (!EBAY_CLIENT_ID || !EBAY_OAUTH_REDIRECT_URI) {
      console.error('[ebay-link] eBay OAuth not configured');
      return res.status(500).json({ error: 'eBay OAuth not configured on server' });
    }

    const state = String((req as any).user?.id || '');
    const params = new URLSearchParams({
      client_id: EBAY_CLIENT_ID,
      redirect_uri: EBAY_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: DEFAULT_SCOPES,
      state,
    });

    const url = `${EBAY_AUTH_BASE}/oauth2/authorize?${params.toString()}`;
    console.log('[ebay-link] Full authorization URL:', url);

    // Redirect user to eBay consent page
    return res.redirect(url);
  } catch (error) {
    console.error('[ebay-link] link error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Alias route for frontend: GET /api/ebay/authorize -> same as /link
router.get('/authorize', requireAuth, async (req: Request, res: Response) => {
  try {    console.log('[ebay-link] /authorize alias route called, redirecting to /api/ebay/link');
    // Pass token query param through the redirect
    const token = req.query.token;
    const redirectUrl = token ? `/api/ebay/link?token=${encodeURIComponent(String(token))}` : '/api/ebay/link';
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error('[ebay] authorize alias error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/ebay/callback - exchange authorization code for tokens and store on user
router.get('/callback', async (req: Request, res: Response) => {
  try {
    console.log('[ebay-link] callback called with query:', req.query);
    
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    
    if (!code) {
      console.error('[ebay-link] callback missing code');
      return res.status(400).json({ error: 'Missing code parameter' });
    }
    
    if (!state) {
      console.error('[ebay-link] callback missing state (user ID)');
      return res.status(400).json({ error: 'Missing state parameter' });
    }

    const userId = parseInt(state, 10);
    if (isNaN(userId)) {
      console.error('[ebay-link] invalid state/userId:', state);
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET || !EBAY_OAUTH_REDIRECT_URI) {
      return res.status(500).json({ error: 'eBay OAuth not configured on server' });
    }

    // Exchange code for tokens
    const tokenUrl = `${EBAY_TOKEN_BASE}/identity/v1/oauth2/token`;
    const auth = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', EBAY_OAUTH_REDIRECT_URI);

    const tokenResp = await axios.post(tokenUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
    });

    const tokenData = tokenResp.data as any;
    const accessToken = tokenData.access_token as string | undefined;
    const refreshToken = tokenData.refresh_token as string | undefined;
    const expiresIn = tokenData.expires_in as number | undefined;

    if (!accessToken) {
      console.error('[ebay] token response missing access_token', tokenData);
      return res.status(500).json({ error: 'Failed to obtain access token from eBay' });
    }

    const expiry = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    console.log('[ebay-link] storing tokens for user:', userId);

    await (prisma.user as any).update({
      where: { id: userId },
      data: {
        ebayAccessToken: accessToken,
        ebayRefreshToken: refreshToken || undefined,
        ebayTokenExpiry: expiry || undefined,
      },
    });

    console.log('[ebay-link] tokens stored successfully, redirecting to:', process.env.EBAY_CLIENT_POST_AUTH_REDIRECT);

    // Redirect back to frontend's account page (if desired) or return JSON
    // If frontend is hosting, you can redirect to a front-end route; else return success JSON
    const clientRedirect = process.env.EBAY_CLIENT_POST_AUTH_REDIRECT || '/';
    return res.redirect(clientRedirect);
  } catch (error: any) {
    console.error('[ebay] callback error', error?.response?.data || error.message || error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/ebay/status - check if user has linked their eBay account
router.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ebayAccessToken: true,
        ebayRefreshToken: true,
        ebayTokenExpiry: true,
        ebayUserId: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isLinked = !!user.ebayAccessToken;
    const isExpired = user.ebayTokenExpiry ? new Date(user.ebayTokenExpiry) < new Date() : true;

    return res.json({
      isLinked,
      hasRefreshToken: !!user.ebayRefreshToken,
      isExpired,
      ebayUserId: user.ebayUserId,
      tokenExpiry: user.ebayTokenExpiry,
    });
  } catch (error) {
    console.error('[ebay] status error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
