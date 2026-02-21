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

// OAuth state store for CSRF protection
const stateStore = new Map<string, { state: string; expiresAt: Date }>();

// Clean up expired states every 10 minutes
setInterval(() => {
  const now = new Date();
  for (const [key, value] of stateStore.entries()) {
    if (value.expiresAt < now) {
      stateStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

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
 * Generate a random state parameter for CSRF protection
 */
function generateState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate a state parameter
 */
export function validateState(state: string): boolean {
  const stored = stateStore.get(state);
  if (!stored) {
    return false;
  }
  if (stored.expiresAt < new Date()) {
    stateStore.delete(state);
    return false;
  }
  stateStore.delete(state); // State can only be used once
  return true;
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
  // Store state for validation (expires in 10 minutes)
  stateStore.set(state, {
    state,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

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
