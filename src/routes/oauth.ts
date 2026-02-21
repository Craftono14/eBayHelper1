/**
 * eBay OAuth2 Routes
 * Handles authorization code flow, callback, and token management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  EbayOAuthConfig,
  generateConsentUrl,
  validateState,
  exchangeCodeForTokens,
  refreshAccessToken,
  isTokenExpired,
  makeAuthenticatedRequest,
} from '../utils/ebayOAuth';

const router = Router();
const prisma = new PrismaClient();

// OAuth configuration (load from environment)
const ebayOAuthConfig: EbayOAuthConfig = {
  clientId: process.env.EBAY_CLIENT_ID || '',
  clientSecret: process.env.EBAY_CLIENT_SECRET || '',
  redirectUri: process.env.EBAY_REDIRECT_URI || 'http://localhost:3000/api/oauth/callback',
  sandbox: process.env.EBAY_SANDBOX === 'true',
};

// Validate configuration
if (!ebayOAuthConfig.clientId || !ebayOAuthConfig.clientSecret) {
  console.warn('Warning: eBay OAuth credentials not configured in environment variables');
}

/**
 * GET /api/oauth/auth-url
 * Generate the OAuth consent URL for the user
 * Query param: discordId (optional, for linking to a specific user)
 */
router.get('/auth-url', (_req: Request, res: Response, next: NextFunction): void => {
  try {
    const consentUrl = generateConsentUrl(ebayOAuthConfig);
    res.json({
      message: 'OAuth consent URL generated',
      url: consentUrl,
      instructions: 'Redirect user to this URL to authorize eBay access',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/oauth/callback
 * Handle OAuth callback from eBay
 * Query params: code, state
 */
router.get('/callback', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { code, state } = req.query;

    console.log('[OAuth Callback] Received callback from eBay', {
      hasCode: !!code,
      hasState: !!state,
      state: state,
    });

    // Validate query parameters
    if (!code || !state) {
      console.error('[OAuth Callback] Missing required parameters');
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>OAuth Error</title></head>
          <body>
            <h1>OAuth Error</h1>
            <p>Missing required parameters (code or state)</p>
            <a href="/">Return to Home</a>
          </body>
        </html>
      `);
      return;
    }

    // Validate state parameter (CSRF protection)
    console.log('[OAuth Callback] Validating state parameter...');
    if (!validateState(state as string)) {
      console.error('[OAuth Callback] State validation failed');
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>OAuth Error</title></head>
          <body>
            <h1>OAuth Error</h1>
            <p>State parameter validation failed. This may indicate a CSRF attack or an expired link.</p>
            <p>Please try linking your eBay account again.</p>
            <a href="/">Return to Home</a>
          </body>
        </html>
      `);
      return;
    }

    console.log('[OAuth Callback] State validated successfully');

    // Exchange code for tokens
    console.log('[OAuth Callback] Exchanging code for tokens...');
    const tokens = await exchangeCodeForTokens(code as string, ebayOAuthConfig);
    console.log('[OAuth Callback] Tokens received successfully');

    // Get or create user (for demo, create a test user or use header-provided ID)
    // In production, this would be tied to the authenticated Discord user
    const userId = parseInt(req.headers['x-user-id'] as string) || 1;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ebayAccessToken: tokens.accessToken,
        ebayRefreshToken: tokens.refreshToken || null,
        ebayTokenExpiry: tokens.expiresAt,
        updatedAt: new Date(),
      },
    });

    console.log('[OAuth Callback] User updated successfully:', user.id);

    // Redirect to frontend success page
    res.redirect('/?ebay-linked=success');
  } catch (error) {
    console.error('[OAuth Callback] Error during callback processing:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>OAuth Error</title></head>
        <body>
          <h1>OAuth Error</h1>
          <p>An error occurred while linking your eBay account.</p>
          <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          <a href="/">Return to Home</a>
        </body>
      </html>
    `);
  }
});

/**
 * POST /api/oauth/login
 * Complete OAuth flow for a user (generates URL + initiates flow)
 * Body: { discordId }
 */
router.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { discordId } = req.body;

      if (!discordId) {
        res.status(400).json({ error: 'discordId is required' });
        return;
      }

      // Find or create user
      const user = await prisma.user.upsert({
        where: { discordId },
        update: {},
        create: { discordId, username: discordId },
      });

      // Generate consent URL
      const consentUrl = generateConsentUrl(ebayOAuthConfig);

      res.json({
        message: 'OAuth login initiated',
        userId: user.id,
        discordId: user.discordId,
        authorizationUrl: consentUrl,
        instructions: 'User should visit the authorizationUrl to grant eBay access',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/oauth/refresh
 * Manually refresh access token
 * Body: { userId }
 * Header: x-user-id (or provide in body)
 */
router.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let userId = parseInt(req.headers['x-user-id'] as string);
      if (isNaN(userId)) {
        userId = req.body.userId;
      }

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (!user.ebayRefreshToken) {
        res.status(400).json({
          error: 'No refresh token available',
          message: 'User must complete OAuth authorization first',
        });
        return;
      }

      // Refresh the token
      const newTokens = await refreshAccessToken(
        user.ebayRefreshToken,
        ebayOAuthConfig
      );

      // Update user in database
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          ebayAccessToken: newTokens.accessToken,
          ebayRefreshToken: newTokens.refreshToken || user.ebayRefreshToken,
          ebayTokenExpiry: newTokens.expiresAt,
          updatedAt: new Date(),
        },
      });

      res.json({
        message: 'Token refreshed successfully',
        user: {
          id: updatedUser.id,
          ebayAuthenticated: true,
          tokenExpiresAt: updatedUser.ebayTokenExpiry,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/oauth/status
 * Check OAuth token status for a user
 * Header: x-user-id
 */
router.get(
  '/status',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = parseInt(req.headers['x-user-id'] as string);

      if (isNaN(userId)) {
        res.status(400).json({ error: 'x-user-id header is required' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const isExpired =
        user.ebayTokenExpiry && isTokenExpired(user.ebayTokenExpiry);

      res.json({
        user: {
          id: user.id,
          discordId: user.discordId,
          ebayAuthenticated: !!user.ebayAccessToken,
          tokenExpiresAt: user.ebayTokenExpiry,
          tokenExpired: isExpired,
          hasRefreshToken: !!user.ebayRefreshToken,
          lastSyncedAt: user.lastSyncedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/oauth/api-call
 * Make an authenticated API call to eBay with automatic token refresh
 * Body: { userId, url, method?, data? }
 * Header: x-user-id (can override userId in body)
 */
router.post(
  '/api-call',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let userId = parseInt(req.headers['x-user-id'] as string);
      if (isNaN(userId)) {
        userId = req.body.userId;
      }

      const { url, method = 'GET', data } = req.body;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      if (!url) {
        res.status(400).json({ error: 'url is required' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (!user.ebayAccessToken) {
        res.status(401).json({
          error: 'Not authenticated',
          message: 'User must complete OAuth authorization first',
        });
        return;
      }

      // Check if token needs refresh
      if (
        user.ebayTokenExpiry &&
        isTokenExpired(user.ebayTokenExpiry)
      ) {
        if (!user.ebayRefreshToken) {
          res.status(401).json({
            error: 'Token expired',
            message: 'No refresh token available. Re-authorization required.',
          });
          return;
        }
        console.log(`Token expired for user ${userId}, refreshing...`);
      }

      try {
        // Make the API call with automatic token refresh on 401
        const apiResponse = await makeAuthenticatedRequest(
          url,
          method as 'GET' | 'POST' | 'PUT' | 'DELETE',
          user.ebayAccessToken,
          ebayOAuthConfig,
          data,
            user.ebayRefreshToken || undefined,
          async (newTokens) => {
            // Update tokens in database on refresh
            await prisma.user.update({
              where: { id: userId },
              data: {
                  ebayAccessToken: newTokens.accessToken,
                  ebayRefreshToken:
                    newTokens.refreshToken || user.ebayRefreshToken,
                  ebayTokenExpiry: newTokens.expiresAt,
                updatedAt: new Date(),
              },
            });
          }
        );

        res.json({
          message: 'API call successful',
          data: apiResponse,
        });
      } catch (apiError: unknown) {
        const error = apiError as any;
        res.status(error?.response?.status || 500).json({
          error: 'API call failed',
          message: error?.message || 'Unknown error',
          details: error?.response?.data,
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/oauth/revoke
 * Revoke eBay OAuth tokens for a user
 * Header: x-user-id
 */
router.delete(
  '/revoke',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = parseInt(req.headers['x-user-id'] as string);

      if (isNaN(userId)) {
        res.status(400).json({ error: 'x-user-id header is required' });
        return;
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ebayAccessToken: null,
          ebayRefreshToken: null,
          ebayTokenExpiry: null,
        },
      });

      res.json({
        message: 'eBay OAuth tokens revoked',
        user: {
          id: user.id,
          discordId: user.discordId,
          ebayAuthenticated: false,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
