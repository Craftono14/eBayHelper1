import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { PrismaClient } from '@prisma/client';
import { sendPriceAlertDM } from '../services/discord-notification';
import { sendPriceAlertPushover } from '../services/pushover-notification';

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

    const result = await sendPriceAlertDM(
      { discordId: user.discordId },
      {
        itemName: '[TEST] eBay Helper Notification',
        currentPrice: 19.99,
        targetPrice: 24.99,
        url: 'https://www.ebay.com',
      }
    );

    if (!result.success) {
      return res.status(502).json({
        error: `Failed to send test Discord DM. ${result.error || 'Check server logs for Discord API details.'}`,
      });
    }

    return res.json({ success: true, message: 'Test Discord DM sent successfully.' });
  } catch (error) {
    console.error('Error sending test Discord DM:', error);
    return res.status(500).json({ error: 'Failed to send test Discord DM' });
  }
});

// GET /api/users/pushover-settings - Get current user's Pushover settings
router.get('/pushover-settings', requireAuth, async (req: AuthRequest, res): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        pushoverUserKey: true,
        pushoverDevice: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      pushoverUserKey: user.pushoverUserKey,
      pushoverDevice: user.pushoverDevice,
    });
  } catch (error) {
    console.error('Error fetching Pushover settings:', error);
    return res.status(500).json({ error: 'Failed to fetch Pushover settings' });
  }
});

// POST /api/users/pushover-settings - Update Pushover settings
router.post('/pushover-settings', requireAuth, async (req: AuthRequest, res): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { pushoverUserKey, pushoverDevice } = req.body;

    if (pushoverUserKey && !/^[A-Za-z0-9]{25,40}$/.test(pushoverUserKey)) {
      return res.status(400).json({ error: 'Invalid Pushover user key format' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        pushoverUserKey: pushoverUserKey || null,
        pushoverDevice: pushoverDevice || null,
      },
      select: {
        pushoverUserKey: true,
        pushoverDevice: true,
      },
    });

    return res.json({
      message: 'Pushover settings updated successfully',
      pushoverUserKey: updatedUser.pushoverUserKey,
      pushoverDevice: updatedUser.pushoverDevice,
    });
  } catch (error) {
    console.error('Error updating Pushover settings:', error);
    return res.status(500).json({ error: 'Failed to update Pushover settings' });
  }
});

// DELETE /api/users/pushover-settings - Clear Pushover settings
router.delete('/pushover-settings', requireAuth, async (req: AuthRequest, res): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        pushoverUserKey: null,
        pushoverDevice: null,
      },
    });

    return res.json({ message: 'Pushover settings cleared successfully' });
  } catch (error) {
    console.error('Error clearing Pushover settings:', error);
    return res.status(500).json({ error: 'Failed to clear Pushover settings' });
  }
});

// POST /api/users/pushover-settings/test - Send a test Pushover notification
router.post('/pushover-settings/test', requireAuth, async (req: AuthRequest, res): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        pushoverUserKey: true,
        pushoverDevice: true,
      },
    });

    if (!user?.pushoverUserKey) {
      return res.status(400).json({ error: 'Pushover User Key is not configured.' });
    }

    const result = await sendPriceAlertPushover({
      userKey: user.pushoverUserKey,
      device: user.pushoverDevice,
      itemName: '[TEST] eBay Helper Notification',
      currentPrice: 19.99,
      itemUrl: 'https://www.ebay.com',
    });

    if (!result.success) {
      return res.status(502).json({
        error: `Failed to send test Pushover notification. ${result.error || 'Unknown error'}`,
      });
    }

    return res.json({ success: true, message: 'Test Pushover notification sent successfully.' });
  } catch (error) {
    console.error('Error sending test Pushover notification:', error);
    return res.status(500).json({ error: 'Failed to send test Pushover notification' });
  }
});

// GET /api/users/notification-preferences - Get current user's notification preference
router.get('/notification-preferences', requireAuth, async (req: AuthRequest, res): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreference: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ notificationPreference: user.notificationPreference || 'DISCORD' });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
});

// POST /api/users/notification-preferences - Update notification preference
router.post('/notification-preferences', requireAuth, async (req: AuthRequest, res): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { notificationPreference } = req.body;
    if (notificationPreference !== 'DISCORD' && notificationPreference !== 'PUSHOVER') {
      return res.status(400).json({ error: 'Invalid notification preference' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { notificationPreference },
      select: { notificationPreference: true },
    });

    return res.json({
      message: 'Notification preference updated successfully',
      notificationPreference: user.notificationPreference,
    });
  } catch (error) {
    console.error('Error updating notification preference:', error);
    return res.status(500).json({ error: 'Failed to update notification preference' });
  }
});

export default router;
