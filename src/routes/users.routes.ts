import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { PrismaClient } from '@prisma/client';
import { sendPriceAlertDM } from '../services/discord-notification';

const router = Router();
const prisma = new PrismaClient();

// GET /api/users/discord-settings - Get current user's Discord settings
router.get('/discord-settings', requireAuth, async (req: AuthRequest, res): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        discordId: true,
        username: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      discordId: user.discordId,
      username: user.username
    });
  } catch (error) {
    console.error('Error fetching Discord settings:', error);
    res.status(500).json({ error: 'Failed to fetch Discord settings' });
  }
});

// POST /api/users/discord-settings - Update Discord settings
router.post('/discord-settings', requireAuth, async (req: AuthRequest, res): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { discordId, username } = req.body;

    // Validate Discord ID format (should be numeric string)
    if (discordId && !/^\d+$/.test(discordId)) {
      return res.status(400).json({ error: 'Invalid Discord User ID format' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        discordId: discordId || null,
        username: username || null
      },
      select: {
        discordId: true,
        username: true
      }
    });

    res.json({
      message: 'Discord settings updated successfully',
      discordId: updatedUser.discordId,
      username: updatedUser.username
    });
  } catch (error) {
    console.error('Error updating Discord settings:', error);
    res.status(500).json({ error: 'Failed to update Discord settings' });
  }
});

// DELETE /api/users/discord-settings - Clear Discord settings
router.delete('/discord-settings', requireAuth, async (req: AuthRequest, res): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        discordId: null,
        username: null
      }
    });

    res.json({ message: 'Discord settings cleared successfully' });
  } catch (error) {
    console.error('Error clearing Discord settings:', error);
    res.status(500).json({ error: 'Failed to clear Discord settings' });
  }
});

// POST /api/users/discord-settings/test - Send a test Discord DM
router.post('/discord-settings/test', requireAuth, async (req: AuthRequest, res): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        discordId: true,
      },
    });

    if (!user?.discordId) {
      return res.status(400).json({
        error: 'Discord User ID is not configured. Save it in Discord Settings first.',
      });
    }

    const sent = await sendPriceAlertDM(
      { discordId: user.discordId },
      {
        itemName: '[TEST] eBay Helper Notification',
        currentPrice: 19.99,
        targetPrice: 24.99,
        url: 'https://www.ebay.com',
      }
    );

    if (!sent) {
      return res.status(502).json({
        error: 'Failed to send test Discord DM. Check server logs for Discord API error details.',
      });
    }

    return res.json({ success: true, message: 'Test Discord DM sent successfully.' });
  } catch (error) {
    console.error('Error sending test Discord DM:', error);
    return res.status(500).json({ error: 'Failed to send test Discord DM' });
  }
});

export default router;
