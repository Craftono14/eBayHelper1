import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

/**
 * eBay Account Deletion Notification Routes
 * 
 * Complies with eBay's account deletion/closure notification requirements:
 * https://developer.ebay.com/api-docs/user-api/latest/user-account-deletion/account-deletion-compliance
 * 
 * The endpoint must:
 * 1. Receive and validate challenge codes from eBay
 * 2. Process account deletion/closure notifications
 */

/**
 * GET /api/ebay/account-deletion/notification
 * 
 * eBay sends a GET request with challenge_code query parameter for verification.
 * This endpoint validates the challenge and responds with the hashed response.
 * 
 * Format: GET https://<callback_URL>?challenge_code=123
 * Response: {"challengeResponse": "hashed_value"}
 */
router.get('/notification', (req: Request, res: Response): void => {
  try {
    const challengeCode = req.query.challenge_code as string;
    
    if (!challengeCode) {
      res.status(400).json({ error: 'challenge_code query parameter is required' });
      return;
    }

    // Get verification token from environment
    const verificationToken = process.env.EBAY_NOTIFICATION_VERIFICATION_TOKEN;
    if (!verificationToken) {
      console.error('EBAY_NOTIFICATION_VERIFICATION_TOKEN is not set in environment variables');
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    // Get the endpoint URL from environment
    const endpoint = process.env.EBAY_NOTIFICATION_ENDPOINT_URL;
    if (!endpoint) {
      console.error('EBAY_NOTIFICATION_ENDPOINT_URL is not set in environment variables');
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    // Compute the challenge response
    // Hash order matters: challengeCode + verificationToken + endpoint
    const hash = createHash('sha256');
    hash.update(challengeCode);
    hash.update(verificationToken);
    hash.update(endpoint);
    const challengeResponse = hash.digest('hex');

    // Return the response as JSON with proper content-type
    // Important: Use JSON library to avoid BOM (Byte Order Mark) issues
    const response = {
      challengeResponse,
    };

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(response);

    console.log(
      `[eBay Account Deletion] Challenge response sent successfully for code: ${challengeCode.substring(0, 10)}...`
    );
  } catch (error) {
    console.error('[eBay Account Deletion] Error processing challenge:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ebay/account-deletion/notification
 * 
 * eBay sends account deletion/closure notifications as POST requests.
 * This endpoint receives and processes the deletion notifications.
 * 
 * Request body format:
 * {
 *   "metadata": {
 *     "topic": "ACCOUNT_DELETION",
 *     "schemaVersion": "1.0",
 *     "notificationId": "abc123",
 *     "eventDate": "2023-12-01T12:00:00Z"
 *   },
 *   "notification": {
 *     "userId": "ebay-user-id",
 *     "deletionDate": "2023-12-01T12:00:00Z",
 *     "deletionReason": "USER_REQUESTED" | "ACCOUNT_SUSPENDED" | "ACCOUNT_CLOSED"
 *   }
 * }
 */
router.post('/notification', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('[eBay Account Deletion] POST notification received');
    console.log('[eBay Account Deletion] Request headers:', req.headers);
    console.log('[eBay Account Deletion] Request body:', JSON.stringify(req.body, null, 2));

    const { metadata, notification } = req.body;

    if (!metadata || !notification) {
      console.error('[eBay Account Deletion] Missing metadata or notification in payload');
      console.error('[eBay Account Deletion] Received:', { metadata, notification });
      res.status(400).json({ error: 'Invalid notification payload - missing metadata or notification' });
      return;
    }

    const { topic } = metadata;
    const { notificationId, eventDate, data } = notification;

    if (!data || !data.userId) {
      console.error('[eBay Account Deletion] Missing user data in notification');
      console.error('[eBay Account Deletion] Received:', { data });
      res.status(400).json({ error: 'Invalid notification payload - missing data or userId' });
      return;
    }

    const { userId, username } = data;

    console.log(
      `[eBay Account Deletion] Received ${topic} notification for user: ${username} (ID: ${userId})`
    );

    // Process account deletion
    if (topic === 'MARKETPLACE_ACCOUNT_DELETION') {
      // Find and save the deletion record
      const deletionRecord = await prisma.ebayAccountDeletion.upsert({
        where: {
          ebayUserId: userId,
        },
        update: {
          deletionReason: 'MARKETPLACE_DELETION',
          deletionDate: new Date(eventDate),
          notificationId,
          processedAt: new Date(),
        },
        create: {
          ebayUserId: userId,
          deletionReason: 'MARKETPLACE_DELETION',
          deletionDate: new Date(eventDate),
          notificationId,
          processedAt: new Date(),
        },
      });

      // Find user by eBay ID and soft delete or clean their data
      const user = await prisma.user.findFirst({
        where: {
          ebayUserId: userId,
        },
      });

      if (user) {
        // Option 1: Soft delete - mark as deleted
        await prisma.user.update({
          where: { id: user.id },
          data: {
            deletedAt: new Date(),
            ebayAccessToken: null,
            ebayRefreshToken: null,
            ebayTokenExpiry: null,
          },
        });

        console.log(
          `[eBay Account Deletion] User account marked as deleted: ${user.id} (eBay ID: ${userId}, username: ${username})`
        );
      } else {
        console.log(
          `[eBay Account Deletion] No local user found for deletion (eBay ID: ${userId}, username: ${username}). Recording deletion anyway.`
        );
      }

      // Acknowledge successful processing
      res.status(200).json({
        success: true,
        message: `Account deletion notification processed for user ${username}`,
        recordId: deletionRecord.id,
      });

      console.log(`[eBay Account Deletion] Successfully processed deletion for ${username}`);
    } else {
      // Unknown notification type
      console.warn(`[eBay Account Deletion] Unknown notification topic: ${topic}`);
      res.status(400).json({ error: `Unknown notification topic: ${topic}` });
    }
  } catch (error) {
    console.error('[eBay Account Deletion] Error processing notification:', error);
    res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

export default router;
