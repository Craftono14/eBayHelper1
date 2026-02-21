/**
 * eBay OAuth2 Utilities
 * Handles OAuth2 Authorization Code flow and token management
 */

import axios, { AxiosError } from 'axios';
import crypto from 'crypto';

// eBay OAuth Configuration
export interface EbayOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  sandbox: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

/**
 * Get eBay OAuth endpoints based on sandbox flag
 */
function getOAuthEndpoints(sandbox: boolean): { auth: string; token: string } {
  if (sandbox) {
    return {
      auth: 'https://auth.sandbox.ebay.com/oauth2/authorize',
      token: 'https://api.sandbox.ebay.com/identity/v1/oauth2/token',
    };
  }
  return {
    auth: 'https://auth.ebay.com/oauth2/authorize',
    token: 'https://api.ebay.com/identity/v1/oauth2/token',
  };
}

/**
 * Get the state signing secret from environment or generate a default
 * In production, OAUTH_STATE_SECRET should be set in environment variables
 */
function getStateSecret(): string {
  return process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET || 'default-oauth-state-secret-change-me';
}

/**
 * Generate a signed state parameter for CSRF protection
 * Format: timestamp.random.signature
 */
function generateState(): string {
  const timestamp = Date.now().toString();
  const random = crypto.randomBytes(16).toString('hex');
  const secret = getStateSecret();
  
  // Create signature: HMAC of timestamp + random
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.${random}`);
  const signature = hmac.digest('hex');
  
  return `${timestamp}.${random}.${signature}`;
}

/**
 * Validate a signed state parameter
 * Returns true if state is valid and not expired (10 minute window)
 */
export function validateState(state: string): boolean {
  try {
    const parts = state.split('.');
    if (parts.length !== 3) {
      console.warn('[OAuth] Invalid state format - expected 3 parts');
      return false;
    }
    
    const [timestamp, random, signature] = parts;
    const secret = getStateSecret();
    
    // Verify signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${timestamp}.${random}`);
    const expectedSignature = hmac.digest('hex');
    
    if (signature !== expectedSignature) {
      console.warn('[OAuth] Invalid state signature');
      return false;
    }
    
    // Check if state is expired (10 minute window)
    const stateTimestamp = parseInt(timestamp);
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    
    if (now - stateTimestamp > tenMinutes) {
      console.warn('[OAuth] State expired');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[OAuth] Error validating state:', error);
    return false;
  }
}

/**
 * Generate the OAuth consent URL for the user to authorize
 * https://developer.ebay.com/docs/buy/static/oauth-authorization-code-grant-request.html
 */
export function generateConsentUrl(config: EbayOAuthConfig, scopes: string[] = []): string {
  // Default scopes if none provided
  if (scopes.length === 0) {
    scopes = [
      'https://api.ebay.com/oauth/api_scope', // View eBay account
      'https://api.ebay.com/oauth/api_scope/sell.marketing', // Marketing
    ];
  }

  const state = generateState();
  const endpoints = getOAuthEndpoints(config.sandbox);

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    scope: scopes.join(' '),
    state,
  });

  return `${endpoints.auth}?${params.toString()}`;
}

/**
 * Exchange authorization code for access and refresh tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  config: EbayOAuthConfig
): Promise<OAuthTokens> {
  const endpoints = getOAuthEndpoints(config.sandbox);

  try {
    const response = await axios.post<TokenResponse>(
      endpoints.token,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
      }),
      {
        auth: {
          username: config.clientId,
          password: config.clientSecret,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: new Date(Date.now() + expires_in * 1000),
    };
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Failed to exchange code for tokens:', axiosError.message);
    throw new Error(
      `OAuth token exchange failed: ${axiosError.response?.statusText || axiosError.message}`
    );
  }
}

/**
 * Refresh the access token using the refresh token
 * https://developer.ebay.com/docs/buy/static/oauth-refresh-token-grant.html
 */
export async function refreshAccessToken(
  refreshToken: string,
  config: EbayOAuthConfig
): Promise<OAuthTokens> {
  const endpoints = getOAuthEndpoints(config.sandbox);

  try {
    const response = await axios.post<TokenResponse>(
      endpoints.token,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      {
        auth: {
          username: config.clientId,
          password: config.clientSecret,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;

    return {
      accessToken: access_token,
      refreshToken: refresh_token || refreshToken, // Use new refresh token if provided
      expiresAt: new Date(Date.now() + expires_in * 1000),
    };
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Failed to refresh access token:', axiosError.message);
    throw new Error(
      `OAuth token refresh failed: ${axiosError.response?.statusText || axiosError.message}`
    );
  }
}

/**
 * Check if an access token is expired or close to expiring
 * (buffer of 5 minutes before actual expiration)
 */
export function isTokenExpired(expirationDate: Date, bufferSeconds: number = 300): boolean {
  const bufferTime = new Date(Date.now() + bufferSeconds * 1000);
  return expirationDate <= bufferTime;
}

/**
 * Make an authenticated API call with automatic token refresh
 * Retries once with refreshed token if getting 401
 */
export async function makeAuthenticatedRequest<T = unknown>(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  accessToken: string,
  config: EbayOAuthConfig,
  data?: unknown,
  refreshToken?: string,
  onTokenRefresh?: (tokens: OAuthTokens) => Promise<void>
): Promise<T> {
  try {
    const response = await axios<T>({
      method,
      url,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data,
    });

    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;

    // If 401 and we have a refresh token, try refreshing
    if (axiosError.response?.status === 401 && refreshToken) {
      console.log('Access token expired, attempting refresh...');

      try {
        const newTokens = await refreshAccessToken(refreshToken, config);

        // Notify caller of new tokens (for database update)
        if (onTokenRefresh) {
          await onTokenRefresh(newTokens);
        }

        // Retry the original request with new token
        const retryResponse = await axios<T>({
          method,
          url,
          headers: {
            Authorization: `Bearer ${newTokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          data,
        });

        return retryResponse.data;
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        throw new Error('Token refresh failed and request was unauthorized');
      }
    }

    throw axiosError;
  }
}
