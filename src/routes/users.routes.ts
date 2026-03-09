import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/users/discord-settings - Get current user's Discord settings
router.get('/discord-settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        discordWebhookUrl: true,
        discordId: true,
        username: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      discordWebhookUrl: user.discordWebhookUrl,
      discordId: user.discordId,
      username: user.username
    });
  } catch (error) {
    console.error('Error fetching Discord settings:', error);
    res.status(500).json({ error: 'Failed to fetch Discord settings' });
  }
});

// POST /api/users/discord-settings - Update Discord settings
router.post('/discord-settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { discordWebhookUrl, discordId, username } = req.body;

    // Validate webhook URL format (basic validation)
    if (discordWebhookUrl && !discordWebhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return res.status(400).json({ error: 'Invalid Discord webhook URL format' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        discordWebhookUrl: discordWebhookUrl || null,
        discordId: discordId || null,
        username: username || null
      },
      select: {
        discordWebhookUrl: true,
        discordId: true,
        username: true
      }
    });

    res.json({
      message: 'Discord settings updated successfully',
      discordWebhookUrl: updatedUser.discordWebhookUrl,
      discordId: updatedUser.discordId,
      username: updatedUser.username
    });
  } catch (error) {
    console.error('Error updating Discord settings:', error);
    res.status(500).json({ error: 'Failed to update Discord settings' });
  }
});

// DELETE /api/users/discord-settings - Clear Discord settings
router.delete('/discord-settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        discordWebhookUrl: null,
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

export default router;
