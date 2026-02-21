# eBay OAuth2 Implementation Guide

## Overview

This implementation provides a complete OAuth2 Authorization Code flow for eBay API integration, with automatic token refresh and secure token storage in the database.

---

## Architecture

### Components

1. **OAuth Utilities** (`src/utils/ebayOAuth.ts`)
   - Token management functions
   - Authorization URL generation
   - Token exchange and refresh
   - Authenticated API calls with auto-refresh

2. **OAuth Routes** (`src/routes/oauth.ts`)
   - Express endpoints for OAuth flow
   - Token management endpoints
   - Status checking
   - Revocation

### Flow Diagram

```
User                    App Server              eBay OAuth
  │                        │                        │
  │  Click "Login with eBay"│                        │
  ├───────────────────────>│                        │
  │                        │  Generate Consent URL │
  │                        │<──────────────────────│
  │                        │                        │
  │<───────────────────────│                        │
  │   Redirect to eBay     │                        │
  │                        │                        │
  ├────────────────────────────────────────────────>│
  │                                          Authorize
  │                                                 │
  │<────────────────────────────────────────────────│
  │                    Redirect with code
  │                        │                        │
  │                        │  Exchange code for    │
  │                        │  access & refresh     │
  │                        │  tokens               │
  │                        ├───────────────────────>│
  │                        │<───────────────────────│
  │                        │  Return tokens        │
  │                        │  Store in DB          │
  │<───────────────────────│                        │
  │     Success!           │                        │
```

---

## Environment Configuration

### Required Environment Variables

Add these to your `.env` file:

```env
# eBay OAuth Configuration
EBAY_CLIENT_ID=your_client_id_here
EBAY_CLIENT_SECRET=your_client_secret_here
EBAY_REDIRECT_URI=http://localhost:3000/api/oauth/callback
EBAY_SANDBOX=true

# Application
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ebay_helper
```

### Getting eBay Credentials

1. Go to [eBay Developers](https://developer.ebay.com/)
2. Sign in or create an account
3. Create a new application
4. Get your **Client ID** and **Client Secret**
5. Set redirect URI to your callback URL

For development, use sandbox: `EBAY_SANDBOX=true`
For production, use: `EBAY_SANDBOX=false`

---

## API Endpoints

### 1. Generate Authorization URL

**GET** `/api/oauth/auth-url`

Returns the OAuth consent URL for the user to click.

**Response:**
```json
{
  "message": "OAuth consent URL generated",
  "url": "https://auth.ebay.com/oauth2/authorize?...",
  "instructions": "Redirect user to this URL to authorize eBay access"
}
```

**Usage:**
```bash
curl http://localhost:3000/api/oauth/auth-url
```

---

### 2. OAuth Callback Handler

**GET** `/api/oauth/callback?code=...&state=...`

Handles the OAuth callback from eBay. Automatically exchanges code for tokens and stores them.

**Query Parameters:**
- `code` - Authorization code from eBay
- `state` - State parameter (validated for CSRF protection)

**Headers:**
- `x-user-id` - User ID to associate tokens with (required)

**Response:**
```json
{
  "message": "OAuth authorization successful",
  "user": {
    "id": 1,
    "discordId": "123456789",
    "ebayAuthenticated": true,
    "tokenExpiresAt": "2026-02-15T20:45:00.000Z"
  }
}
```

---

### 3. Complete Login Flow

**POST** `/api/oauth/login`

Generates authorization URL and returns it for the user to visit.

**Request Body:**
```json
{
  "discordId": "user_discord_id"
}
```

**Response:**
```json
{
  "message": "OAuth login initiated",
  "userId": 1,
  "discordId": "123456789",
  "authorizationUrl": "https://auth.ebay.com/oauth2/authorize?...",
  "instructions": "User should visit the authorizationUrl to grant eBay access"
}
```

**Usage:**
```bash
curl -X POST http://localhost:3000/api/oauth/login \
  -H "Content-Type: application/json" \
  -d '{"discordId": "123456789"}'
```

---

### 4. Refresh Access Token

**POST** `/api/oauth/refresh`

Manually refresh an access token using the refresh token.

**Headers:**
- `x-user-id` - User ID (or provide userId in body)

**Request Body (Optional):**
```json
{
  "userId": 1
}
```

**Response:**
```json
{
  "message": "Token refreshed successfully",
  "user": {
    "id": 1,
    "ebayAuthenticated": true,
    "tokenExpiresAt": "2026-02-16T00:00:00.000Z"
  }
}
```

**Usage:**
```bash
curl -X POST http://localhost:3000/api/oauth/refresh \
  -H "x-user-id: 1"
```

---

### 5. Check OAuth Status

**GET** `/api/oauth/status`

Check if user is authenticated and token status.

**Headers:**
- `x-user-id` - User ID (required)

**Response:**
```json
{
  "user": {
    "id": 1,
    "discordId": "123456789",
    "ebayAuthenticated": true,
    "tokenExpiresAt": "2026-02-15T20:45:00.000Z",
    "tokenExpired": false,
    "hasRefreshToken": true,
    "lastSyncedAt": "2026-02-15T10:30:00.000Z"
  }
}
```

**Usage:**
```bash
curl http://localhost:3000/api/oauth/status \
  -H "x-user-id: 1"
```

---

### 6. Make Authenticated API Call

**POST** `/api/oauth/api-call`

Make an authenticated call to eBay API with automatic token refresh.

**Headers:**
- `x-user-id` - User ID (or provide userId in body)
- `Content-Type: application/json`

**Request Body:**
```json
{
  "userId": 1,
  "url": "https://api.ebay.com/buy/deal/v1/deal",
  "method": "GET",
  "data": null
}
```

**Response:**
```json
{
  "message": "API call successful",
  "data": {
    // eBay API response data
  }
}
```

**Features:**
- Automatically checks if token is expired
- Refreshes token on 401 response
- Retries request with new token
- Updates database with new tokens

**Usage:**
```bash
curl -X POST http://localhost:3000/api/oauth/api-call \
  -H "x-user-id: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.ebay.com/buy/deal/v1/deal",
    "method": "GET"
  }'
```

---

### 7. Revoke/Logout

**DELETE** `/api/oauth/revoke`

Revoke eBay OAuth tokens for a user (logout).

**Headers:**
- `x-user-id` - User ID (required)

**Response:**
```json
{
  "message": "eBay OAuth tokens revoked",
  "user": {
    "id": 1,
    "discordId": "123456789",
    "ebayAuthenticated": false
  }
}
```

**Usage:**
```bash
curl -X DELETE http://localhost:3000/api/oauth/revoke \
  -H "x-user-id: 1"
```

---

## Implementation Examples

### 1. Basic OAuth Login Flow

```typescript
import axios from 'axios';

async function ebayOAuthLogin(discordId: string) {
  try {
    // Step 1: Initiate login
    const loginResponse = await axios.post(
      'http://localhost:3000/api/oauth/login',
      { discordId }
    );

    const { authorizationUrl, userId } = loginResponse.data;

    // Step 2: Show authorization URL to user
    console.log('Direct user to:', authorizationUrl);

    // Step 3: User authorizes and is redirected to callback (handled by server)
    // Step 4: Access tokens are stored in database

    return { userId, authorizationUrl };
  } catch (error) {
    console.error('OAuth login failed:', error);
  }
}

// Usage
ebayOAuthLogin('user_discord_id');
```

### 2. Call eBay API with Automatic Token Refresh

```typescript
async function fetchEbayDeals(userId: number) {
  try {
    const response = await axios.post(
      'http://localhost:3000/api/oauth/api-call',
      {
        userId,
        url: 'https://api.ebay.com/buy/deal/v1/deal',
        method: 'GET',
      },
      {
        headers: {
          'x-user-id': userId,
        },
      }
    );

    const deals = response.data.data;
    console.log('Deals:', deals);
    return deals;
  } catch (error) {
    console.error('Failed to fetch deals:', error);
  }
}

// Usage
fetchEbayDeals(1);
```

### 3. Check Token Status Before API Call

```typescript
async function checkTokenAndCall(userId: number) {
  try {
    // Check status
    const statusResponse = await axios.get(
      'http://localhost:3000/api/oauth/status',
      {
        headers: {
          'x-user-id': userId,
        },
      }
    );

    const { tokenExpired, ebayAuthenticated } = statusResponse.data.user;

    if (!ebayAuthenticated) {
      throw new Error('User not authenticated with eBay');
    }

    // Refresh if needed
    if (tokenExpired) {
      console.log('Token expired, refreshing...');
      await axios.post(
        'http://localhost:3000/api/oauth/refresh',
        {},
        {
          headers: {
            'x-user-id': userId,
          },
        }
      );
    }

    // Now make API call
    return fetchEbayDeals(userId);
  } catch (error) {
    console.error('Error:', error);
  }
}
```

### 4. Handle 401 Errors Gracefully

```typescript
async function robustEbayApiCall(
  userId: number,
  url: string
) {
  const maxRetries = 1;
  let retries = 0;

  while (retries <= maxRetries) {
    try {
      const response = await axios.post(
        'http://localhost:3000/api/oauth/api-call',
        {
          userId,
          url,
          method: 'GET',
        },
        {
          headers: {
            'x-user-id': userId,
          },
        }
      );

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError;

      if (axiosError.response?.status === 401) {
        if (retries < maxRetries) {
          console.log('Unauthorized, refreshing token...');
          await axios.post(
            'http://localhost:3000/api/oauth/refresh',
            {},
            {
              headers: {
                'x-user-id': userId,
              },
            }
          );
          retries++;
        } else {
          throw new Error('Re-authentication required');
        }
      } else {
        throw error;
      }
    }
  }
}
```

---

## Security Features

### 1. CSRF Protection

The state parameter prevents CSRF attacks:
- Random state is generated for each authorization
- State is validated on callback
- State can only be used once
- Expired states are automatically cleaned up

### 2. Token Storage

Tokens are stored securely in the database:
- Access tokens in `User.ebayOAuthToken`
- Refresh tokens in `User.ebayOAuthRefreshToken`
- Expiration time in `User.ebayOAuthExpiresAt`
- Never exposed in API responses

### 3. Automatic Token Refresh

Tokens are automatically refreshed:
- On API requests if token is expired
- When 401 error occurs
- Before token completely expires (5-minute buffer)
- Without user intervention

### 4. HTTP Methods

- Uses POST for token operations (more secure)
- Refresh tokens only in response to user actions
- No token logging or exposure
- HTTPS recommended for production

---

## Troubleshooting

### "Invalid State" Error

**Problem:** State validation fails on callback

**Solutions:**
- Ensure state is not reused
- Check state hasn't expired (10 minutes)
- Verify redirect URI matches exactly
- Clear browser cookies and retry

### "No Refresh Token" Error

**Problem:** Can't refresh because no refresh token stored

**Solutions:**
- User must complete OAuth flow again
- Check database has refresh token saved
- Verify EBAY_CLIENT_SECRET is correct
- Check database connection

### "401 Unauthorized" After Refresh

**Problem:** API returns 401 even after token refresh

**Solutions:**
- User credentials may have been revoked at eBay
- Require re-authentication
- Check eBay API scopes are correct
- Verify token not manually revoked

### "Redirect URI Mismatch"

**Problem:** eBay rejects redirect URI

**Solutions:**
- Ensure EBAY_REDIRECT_URI exactly matches eBay app settings
- Include protocol (https://)
- No trailing slashes
- Must be registered in eBay application settings

---

## Testing the Implementation

### Test OAuth Flow Locally

```bash
# 1. Start server
npm run dev

# 2. Initiate login in new terminal
curl -X POST http://localhost:3000/api/oauth/login \
  -H "Content-Type: application/json" \
  -d '{"discordId": "test_user"}'

# 3. Visit the authorizationUrl in browser
# (You'll be redirected to eBay sandbox to authorize)

# 4. After authorization, you'll be redirected back to callback
# Tokens are automatically stored in database

# 5. Check status
curl http://localhost:3000/api/oauth/status \
  -H "x-user-id: 1"

# 6. Make an API call
curl -X POST http://localhost:3000/api/oauth/api-call \
  -H "x-user-id: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.sandbox.ebay.com/buy/deal/v1/deal",
    "method": "GET"
  }'
```

---

## Production Checklist

Before deploying to production:

- [ ] Use HTTPS for all OAuth endpoints
- [ ] Set `EBAY_SANDBOX=false` for production credentials
- [ ] Implement request rate limiting
- [ ] Add monitoring for token refresh failures
- [ ] Implement audit logging for OAuth operations
- [ ] Set up automatic token refresh scheduling
- [ ] Test token refresh edge cases
- [ ] Implement password reset flow
- [ ] Add OAuth scope validation
- [ ] Set up error alerting

---

## Database Schema Integration

The OAuth tokens are stored in the existing User model:

```prisma
model User {
  id                      Int       @id @default(autoincrement())
  discordId               String    @unique
  username                String?
  
  // eBay OAuth (added in schema)
  ebayOAuthToken          String?
  ebayOAuthRefreshToken   String?
  ebayOAuthExpiresAt      DateTime?
  
  // ... other fields
}
```

All functions automatically handle database updates when tokens change.

---

## Next Steps

1. Set up environment variables in `.env`
2. Get eBay OAuth credentials
3. Test the OAuth flow locally
4. Integrate with your frontend
5. Deploy to production
6. Monitor token refresh operations

---

## References

- [eBay OAuth Documentation](https://developer.ebay.com/docs/buy/static/oauth-authorization-code-grant-request.html)
- [eBay API Scopes](https://developer.ebay.com/docs/buy/buy-api-oauth-scopes_oauth_scopes.html)
- [eBay Token Refresh](https://developer.ebay.com/docs/buy/static/oauth-refresh-token-grant.html)
- [OAuth 2.0 Standard](https://tools.ietf.org/html/rfc6749)
