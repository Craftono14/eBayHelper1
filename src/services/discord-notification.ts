/**
 * Discord Notification Service
 * Handles sending price alert notifications via Discord DM
 * 
 * Required environment variables:
 * - DISCORD_BOT_TOKEN: The bot token from Discord Developer Portal
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

interface DiscordUser {
  discordId: string;
  username?: string;
}

interface PriceAlertNotification {
  itemName: string;
  currentPrice: number;
  targetPrice: number;
  url: string;
}

/**
 * Send a price alert notification via Discord DM
 * @param user - User's Discord info (ID required)
 * @param alert - Price alert details
 */
export async function sendPriceAlertDM(
  user: DiscordUser,
  alert: PriceAlertNotification
): Promise<boolean> {
  if (!user.discordId) {
    console.warn('Cannot send Discord DM: No Discord ID provided');
    return false;
  }

  if (!BOT_TOKEN) {
    console.warn('Cannot send Discord DM: DISCORD_BOT_TOKEN not configured');
    return false;
  }

  try {
    // Step 1: Create a DM channel with the user
    const channelResponse = await fetch(`${DISCORD_API_BASE}/users/@me/channels`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient_id: user.discordId
      })
    });

    if (!channelResponse.ok) {
      console.error('Failed to create DM channel:', await channelResponse.text());
      return false;
    }

    const channel = await channelResponse.json() as { id: string };
    const channelId = channel.id;

    // Step 2: Send the price alert message to the DM channel
    const messageContent = formatPriceAlertMessage(alert);
    const messageResponse = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: messageContent,
        embeds: [createPriceAlertEmbed(alert)]
      })
    });

    if (!messageResponse.ok) {
      console.error('Failed to send DM message:', await messageResponse.text());
      return false;
    }

    console.log(`[Discord] Price alert sent to user ${user.discordId} for item: ${alert.itemName}`);
    return true;
  } catch (error) {
    console.error('[Discord] Error sending price alert notification:', error);
    return false;
  }
}

/**
 * Format the text content of the price alert message
 */
function formatPriceAlertMessage(alert: PriceAlertNotification): string {
  return `🔔 **Price Alert Triggered!**\n\n**${alert.itemName}**\nCurrent Price: $${alert.currentPrice.toFixed(2)}\nTarget Price: $${alert.targetPrice.toFixed(2)}`;
}

/**
 * Create a Discord embed (rich message) for the price alert
 */
function createPriceAlertEmbed(alert: PriceAlertNotification) {
  const priceDropAmount = alert.targetPrice - alert.currentPrice;
  const priceDropPercent = ((priceDropAmount / alert.targetPrice) * 100).toFixed(1);

  return {
    title: '🔔 Price Alert Triggered!',
    description: `Your watched item has dropped below your target price.`,
    color: 0xFF6B6B, // Red color for price drop alert
    fields: [
      {
        name: 'Item Name',
        value: alert.itemName,
        inline: false
      },
      {
        name: 'Current Price',
        value: `$${alert.currentPrice.toFixed(2)}`,
        inline: true
      },
      {
        name: 'Target Price',
        value: `$${alert.targetPrice.toFixed(2)}`,
        inline: true
      },
      {
        name: 'Savings',
        value: `$${priceDropAmount.toFixed(2)} (${priceDropPercent}%)`,
        inline: false
      }
    ],
    url: alert.url,
    timestamp: new Date().toISOString()
  };
}

/**
 * Test the Discord bot connection
 * Sends a test message to the admin user (if DISCORD_ADMIN_ID is set)
 */
export async function testDiscordConnection(): Promise<boolean> {
  const adminId = process.env.DISCORD_ADMIN_ID;

  if (!adminId) {
    console.warn('DISCORD_ADMIN_ID not set, skipping connection test');
    return true; // Not an error, just not configured
  }

  return await sendPriceAlertDM(
    { discordId: adminId },
    {
      itemName: '[TEST] eBay Helper Price Alert',
      currentPrice: 25.99,
      targetPrice: 29.99,
      url: 'https://example.com'
    }
  );
}
