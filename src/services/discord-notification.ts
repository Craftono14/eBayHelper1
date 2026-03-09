/**
 * Discord Notification Service
 * Handles sending price alert notifications via Discord DM
 * 
 * Required environment variables:
 * - DISCORD_BOT_TOKEN: The bot token from Discord Developer Portal
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const dmChannelCache = new Map<string, string>();

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

export interface DiscordSendResult {
  success: boolean;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bot ${BOT_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'EbayHelperBot (https://ebayhelper1.onrender.com, 1.0)',
  };
}

async function requestWithRateLimitRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  let attempt = 0;
  while (true) {
    const response = await fetch(url, init);

    if (response.status !== 429 || attempt >= retries) {
      return response;
    }

    const retryAfterHeader = response.headers.get('retry-after');
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : 1;
    const waitMs = Number.isFinite(retryAfterSeconds) ? Math.max(1000, retryAfterSeconds * 1000) : 1000;
    console.warn(`[Discord] 429 rate limit hit. Retrying in ${waitMs}ms (attempt ${attempt + 1}/${retries})`);
    await sleep(waitMs);
    attempt += 1;
  }
}

/**
 * Send a price alert notification via Discord DM
 * @param user - User's Discord info (ID required)
 * @param alert - Price alert details
 */
export async function sendPriceAlertDM(
  user: DiscordUser,
  alert: PriceAlertNotification
): Promise<DiscordSendResult> {
  if (!user.discordId) {
    console.warn('Cannot send Discord DM: No Discord ID provided');
    return { success: false, error: 'No Discord ID provided' };
  }

  if (!BOT_TOKEN) {
    console.warn('Cannot send Discord DM: DISCORD_BOT_TOKEN not configured');
    return { success: false, error: 'DISCORD_BOT_TOKEN not configured' };
  }

  try {
    // Step 1: Get or create DM channel with the user
    let channelId = dmChannelCache.get(user.discordId);
    if (!channelId) {
      const channelResponse = await requestWithRateLimitRetry(`${DISCORD_API_BASE}/users/@me/channels`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          recipient_id: user.discordId,
        }),
      });

      if (!channelResponse.ok) {
        const errorText = await channelResponse.text();
        if (errorText.includes('Error 1015')) {
          console.error('[Discord] Cloudflare 1015 rate limit. Your host IP is temporarily blocked by discord.com.');
          return { success: false, error: 'Cloudflare 1015: host IP temporarily rate-limited by Discord' };
        }

        console.error('Failed to create DM channel:', errorText);
        return { success: false, error: `Failed to create DM channel (${channelResponse.status})` };
      }

      const channel = (await channelResponse.json()) as { id: string };
      channelId = channel.id;
      dmChannelCache.set(user.discordId, channelId);
    }

    // Step 2: Send the price alert message to the DM channel
    const messageContent = formatPriceAlertMessage(alert);
    const messageResponse = await requestWithRateLimitRetry(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        content: messageContent,
        embeds: [createPriceAlertEmbed(alert)],
      }),
    });

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      if (errorText.includes('Error 1015')) {
        console.error('[Discord] Cloudflare 1015 rate limit while sending message.');
        return { success: false, error: 'Cloudflare 1015: host IP temporarily rate-limited by Discord' };
      }

      // If cached channel becomes invalid, remove and allow recreation next attempt.
      if (messageResponse.status === 404 || messageResponse.status === 403) {
        dmChannelCache.delete(user.discordId);
      }

      console.error('Failed to send DM message:', errorText);
      return { success: false, error: `Failed to send DM message (${messageResponse.status})` };
    }

    console.log(`[Discord] Price alert sent to user ${user.discordId} for item: ${alert.itemName}`);
    return { success: true };
  } catch (error) {
    console.error('[Discord] Error sending price alert notification:', error);
    return { success: false, error: 'Unexpected error while sending Discord DM' };
  }
}

/**
 * Format the text content of the price alert message
 */
function formatPriceAlertMessage(alert: PriceAlertNotification): string {
  return `eBay Price Drop Notification: ${alert.itemName} has dropped to $${alert.currentPrice.toFixed(2)}. eBay Item Link: ${alert.url}`;
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

  const result = await sendPriceAlertDM(
    { discordId: adminId },
    {
      itemName: '[TEST] eBay Helper Price Alert',
      currentPrice: 25.99,
      targetPrice: 29.99,
      url: 'https://example.com',
    }
  );

  return result.success;
}
