# eBay Account Deletion Compliance Setup Guide

This guide explains how to set up and configure your application to comply with eBay's account deletion/closure notification policy.

## Overview

eBay requires that applications subscribed to account deletion/closure notifications implement a verification endpoint. This endpoint must:

1. **Receive and validate challenge codes** from eBay during initial setup
2. **Process account deletion notifications** when users delete/close their eBay accounts

The implementation in this project includes:
- ✅ Challenge code validation endpoint (GET `/api/ebay/account-deletion/notification`)
- ✅ Account deletion notification handler (POST `/api/ebay/account-deletion/notification`)
- ✅ Database tracking of deletions for compliance logging
- ✅ User soft-deletion to preserve compliance records

## Step 1: Generate a Verification Token

You need to generate a secure verification token (32-80 characters) that eBay will use to validate your endpoint.

**Requirements:**
- Length: 32-80 characters
- Allowed characters: alphanumeric (a-z, A-Z, 0-9), underscore (`_`), hyphen (`-`)
- No special characters

### Generate using Node.js:

```javascript
const crypto = require('crypto');
const token = crypto.randomBytes(32).toString('hex');
console.log(token); // 64-character hex string
```

### Or generate using PowerShell:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes($bytes)
-join ($bytes | ForEach-Object { '{0:x2}' -f $_ })
```

### Example Generated Token:
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0
```

Once generated, add it to your `.env` file:

```env
EBAY_NOTIFICATION_VERIFICATION_TOKEN="a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0"
```

## Step 2: Configure Your Endpoint URL

Set the full HTTPS endpoint URL where eBay will send notifications:

```env
EBAY_NOTIFICATION_ENDPOINT_URL="https://your-domain.com/api/ebay/account-deletion/notification"
```

### Important Requirements:
- **Must use HTTPS** (not HTTP) in production
- **Cannot be localhost** or internal IP in production
- **Must be publicly accessible** from eBay servers
- **Must be a valid domain** you own/control

### Local Development:
For local testing, you can use:
```env
EBAY_NOTIFICATION_ENDPOINT_URL="http://localhost:3000/api/ebay/account-deletion/notification"
```

But you'll need to use a tunneling service like **ngrok** to test with actual eBay challenge codes:

```bash
# Start ngrok tunnel
ngrok http 3000

# Your public URL will be something like:
# https://abc123.ngrok.io/api/ebay/account-deletion/notification
```

Update your `.env`:
```env
EBAY_NOTIFICATION_ENDPOINT_URL="https://abc123.ngrok.io/api/ebay/account-deletion/notification"
```

## Step 3: Register Your Endpoint in eBay Developer Portal

1. Go to [eBay Developer Portal](https://developer.ebay.com/)
2. Navigate to **Alerts and Notifications** section
3. Click **Add notification**
4. Select **Account Deletion/Closure** for the notification type
5. Fill in:
   - **Alert Email**: Your email address for notifications
   - **Endpoint URL**: `https://your-domain.com/api/ebay/account-deletion/notification`
   - **Verification Token**: Your generated verification token
6. Click **Submit**

## Step 4: Verify the Challenge Code

When you save the notification subscription, eBay will immediately send a challenge code to your endpoint:

```
GET https://your-domain.com/api/ebay/account-deletion/notification?challenge_code=abc123xyz...
```

Your application will:

1. **Receive** the challenge code from the query parameter
2. **Hash** the challenge code + verification token + endpoint URL using SHA-256
3. **Return** a JSON response:
   ```json
   {
     "challengeResponse": "hex_encoded_sha256_hash"
   }
   ```

### How the Challenge Hash is Computed:

```typescript
import { createHash } from 'crypto';

const challengeCode = 'abc123xyz...';        // From query parameter
const verificationToken = 'your-token...';   // From .env
const endpoint = 'https://...com/...';       // From .env

const hash = createHash('sha256');
hash.update(challengeCode);
hash.update(verificationToken);
hash.update(endpoint);
const challengeResponse = hash.digest('hex');

// Response:
console.log({
  challengeResponse  // "a1b2c3d4..."
});
```

⚠️ **Important**: The order matters - challenge code, then token, then endpoint. If you change the order, eBay will reject the response.

## Step 5: Monitor Account Deletions

Once your endpoint is verified, eBay will send POST requests when users delete/close their accounts:

```json
POST /api/ebay/account-deletion/notification

{
  "metadata": {
    "topic": "ACCOUNT_DELETION",
    "schemaVersion": "1.0",
    "notificationId": "abc-123-def",
    "eventDate": "2023-12-01T12:00:00Z"
  },
  "notification": {
    "userId": "ebay_user_id_12345",
    "deletionDate": "2023-12-01T12:00:00Z",
    "deletionReason": "USER_REQUESTED"
  }
}
```

Your application will:
1. ✅ Log the deletion notification
2. ✅ Store deletion record in `ebay_account_deletions` table
3. ✅ Soft-delete the user (set `deletedAt` timestamp)
4. ✅ Clear eBay tokens and credentials
5. ✅ Return 200 OK to acknowledge receipt

## Step 6: Testing Your Implementation

### Test the Challenge Endpoint

```bash
# Test challenge validation
curl -X GET "http://localhost:3000/api/ebay/account-deletion/notification?challenge_code=test_code_12345"

# Expected response:
{
  "challengeResponse": "computed_sha256_hash_here"
}
```

### Test Notification Processing

```bash
# Test deletion notification
curl -X POST "http://localhost:3000/api/ebay/account-deletion/notification" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "topic": "ACCOUNT_DELETION",
      "schemaVersion": "1.0",
      "notificationId": "test-123",
      "eventDate": "2023-12-01T12:00:00Z"
    },
    "notification": {
      "userId": "test_ebay_user",
      "deletionDate": "2023-12-01T12:00:00Z",
      "deletionReason": "USER_REQUESTED"
    }
  }'

# Expected response:
{
  "success": true,
  "message": "Account deletion notification processed for user test_ebay_user",
  "recordId": 1
}
```

## Environment Variables Summary

```env
# Required for eBay compliance
EBAY_NOTIFICATION_VERIFICATION_TOKEN="your-32-80-char-token"
EBAY_NOTIFICATION_ENDPOINT_URL="https://your-domain.com/api/ebay/account-deletion/notification"

# Existing eBay credentials
EBAY_CLIENT_ID="your-client-id"
EBAY_CLIENT_SECRET="your-client-secret"
EBAY_OAUTH_REDIRECT_URI="your-redirect-uri"
EBAY_SANDBOX_MODE="true"  # Set to false for production
```

## Database Schema

### EbayAccountDeletion Table
Tracks all account deletion/closure notifications:

```sql
CREATE TABLE ebay_account_deletions (
  id SERIAL PRIMARY KEY,
  ebayUserId VARCHAR(255) UNIQUE NOT NULL,  -- eBay user ID
  deletionReason VARCHAR(255),               -- USER_REQUESTED, ACCOUNT_SUSPENDED, ACCOUNT_CLOSED
  deletionDate TIMESTAMP NOT NULL,           -- When deletion occurred
  notificationId VARCHAR(255) UNIQUE,        -- For tracking
  processedAt TIMESTAMP DEFAULT now(),       -- When we processed it
  createdAt TIMESTAMP DEFAULT now()
);
```

### User Table Changes
Users now have a `deletedAt` field for soft deletion:

```sql
ALTER TABLE users ADD COLUMN deletedAt TIMESTAMP;
```

When a user account is deleted via eBay notification:
- Their `deletedAt` field is set to the current timestamp
- Their eBay tokens are cleared (`ebayAccessToken`, `ebayRefreshToken`, `ebayTokenExpiry`)
- Their data is preserved for compliance logging

## Endpoints

### GET /api/ebay/account-deletion/notification
**Challenge Code Validation**

Receives eBay's challenge code and responds with validation hash.

**Query Parameters:**
- `challenge_code` (string, required): Challenge code from eBay

**Response:**
```json
{
  "challengeResponse": "sha256_hex_digest"
}
```

### POST /api/ebay/account-deletion/notification
**Account Deletion Notification**

Processes account deletion/closure notifications from eBay.

**Request Body:**
```json
{
  "metadata": {
    "topic": "ACCOUNT_DELETION" | "ACCOUNT_CLOSURE",
    "schemaVersion": "1.0",
    "notificationId": "string",
    "eventDate": "ISO-8601 datetime"
  },
  "notification": {
    "userId": "ebay_user_id",
    "deletionDate": "ISO-8601 datetime",
    "deletionReason": "USER_REQUESTED" | "ACCOUNT_SUSPENDED" | "ACCOUNT_CLOSED"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Account deletion notification processed",
  "recordId": 123
}
```

## Troubleshooting

### Challenge Validation Fails
- ❌ Verify `EBAY_NOTIFICATION_VERIFICATION_TOKEN` is set and matches what you registered
- ❌ Check that `EBAY_NOTIFICATION_ENDPOINT_URL` is exactly what you registered with eBay
- ❌ Ensure the hash order is correct: challenge code → token → endpoint
- ❌ Verify the endpoint is publicly accessible from eBay servers

### Notifications Not Received
- ❌ Confirm endpoint URL is HTTPS and publicly accessible
- ❌ Check application logs for errors
- ❌ Verify firewall allows incoming connections from eBay on port 443
- ❌ Confirm notification subscription is active in eBay Developer Portal

### Environment Variables Not Loading
- ❌ Ensure `.env` file exists in project root
- ❌ Run `npm run dev` to reload environment
- ❌ Verify no leading/trailing spaces in `.env` values

## Important Notes

1. **HTTPS Required**: In production, your endpoint MUST use HTTPS
2. **Public URL Required**: eBay cannot reach localhost or internal IPs
3. **Token Security**: Keep your verification token secret - don't commit to version control
4. **Hash Order**: Must be challenge code → token → endpoint, or validation fails
5. **Compliance**: This is a legal requirement for eBay API production access
6. **Data Handling**: Deleted user data should be retained for compliance records

## References

- [eBay Account Deletion Notification Documentation](https://developer.ebay.com/api-docs/user-api/latest/user-account-deletion/account-deletion-compliance)
- [RFC 8259 - JSON Specification](https://tools.ietf.org/html/rfc8259#section-8.1)
- [Byte Order Mark (BOM) FAQ](https://www.unicode.org/faq/utf_bom.html)

## Next Steps

1. ✅ Generate your verification token
2. ✅ Update `.env` with token and endpoint URL
3. ✅ Deploy to a public HTTPS domain
4. ✅ Register endpoint in eBay Developer Portal
5. ✅ Verify the challenge code (eBay will perform this automatically)
6. ✅ Monitor logs for deletion notifications
7. ✅ Ensure user data is soft-deleted properly
