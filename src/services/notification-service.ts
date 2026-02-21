/**
 * Notification System
 * Handles price drop alerts and other user notifications
 */

import { EventEmitter } from 'events';

export interface PriceDropAlert {
  userId: number;
  wishlistItemId: number;
  itemId: string;
  itemTitle: string;
  previousPrice: number;
  currentPrice: number;
  targetPrice: number;
  priceDropAmount: number;
  priceDropPercent: number;
  currency: string;
  itemUrl: string;
  timestamp: Date;
}

export interface NotificationChannel {
  type: 'email' | 'sms' | 'discord' | 'pushNotification' | 'webhook';
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface UserNotificationPreferences {
  userId: number;
  priceDropThresholdPercent: number; // Alert if drops > X%
  channels: NotificationChannel[];
  quietHours?: {
    enabled: boolean;
    startHour: number; // 0-23
    endHour: number;   // 0-23
  };
}

/**
 * Global notification event emitter
 */
class NotificationManager extends EventEmitter {
  private userPreferences: Map<number, UserNotificationPreferences> = new Map();

  /**
   * Register user notification preferences
   */
  registerUserPreferences(prefs: UserNotificationPreferences): void {
    this.userPreferences.set(prefs.userId, prefs);
    console.log(
      `[notifications] Registered preferences for user ${prefs.userId}`
    );
  }

  /**
   * Emit a price drop alert
   */
  emitPriceDropAlert(alert: PriceDropAlert): void {
    const prefs = this.userPreferences.get(alert.userId);

    // Check if user has preferences configured
    if (!prefs) {
      console.warn(
        `[notifications] No preferences for user ${alert.userId}, skipping notification`
      );
      return;
    }

    // Check quiet hours
    if (prefs.quietHours?.enabled) {
      const now = new Date();
      const currentHour = now.getHours();
      if (this.isInQuietHours(currentHour, prefs.quietHours)) {
        console.log(
          `[notifications] Skipping notification for user ${alert.userId} (quiet hours)`
        );
        return;
      }
    }

    // Check if drop meets threshold
    if (alert.priceDropPercent < prefs.priceDropThresholdPercent) {
      console.log(
        `[notifications] Drop ${alert.priceDropPercent.toFixed(1)}% below threshold ${prefs.priceDropThresholdPercent}%, skipping`
      );
      return;
    }

    // Send to all enabled channels
    for (const channel of prefs.channels) {
      if (channel.enabled) {
        this.emit('priceDropAlert', { alert, channel });
      }
    }

    console.log(
      `[notifications] Price drop alert emitted: ${alert.itemTitle} ($${alert.currentPrice} from $${alert.previousPrice})`
    );
  }

  /**
   * Get user preferences
   */
  getUserPreferences(userId: number): UserNotificationPreferences | null {
    return this.userPreferences.get(userId) || null;
  }

  /**
   * Check if current hour is within quiet hours
   */
  private isInQuietHours(
    currentHour: number,
    quietHours: { startHour: number; endHour: number }
  ): boolean {
    if (quietHours.startHour < quietHours.endHour) {
      // Normal case: 22 to 8 doesn't wrap
      return currentHour >= quietHours.startHour && currentHour < quietHours.endHour;
    } else {
      // Wrapped case: 22 to 8 (crosses midnight)
      return currentHour >= quietHours.startHour || currentHour < quietHours.endHour;
    }
  }
}

/**
 * Global notification manager instance
 */
export const notificationManager = new NotificationManager();

/**
 * Default handlers for different notification channels
 */

// Email handler
notificationManager.on(
  'priceDropAlert',
  ({ alert, channel }: { alert: PriceDropAlert; channel: NotificationChannel }) => {
    if (channel.type === 'email' && channel.enabled) {
      sendEmailNotification(alert, channel);
    }
  }
);

// Webhook handler
notificationManager.on(
  'priceDropAlert',
  ({ alert, channel }: { alert: PriceDropAlert; channel: NotificationChannel }) => {
    if (channel.type === 'webhook' && channel.enabled) {
      sendWebhookNotification(alert, channel);
    }
  }
);

// Discord handler
notificationManager.on(
  'priceDropAlert',
  ({ alert, channel }: { alert: PriceDropAlert; channel: NotificationChannel }) => {
    if (channel.type === 'discord' && channel.enabled) {
      sendDiscordNotification(alert, channel);
    }
  }
);

// SMS handler
notificationManager.on(
  'priceDropAlert',
  ({ alert, channel }: { alert: PriceDropAlert; channel: NotificationChannel }) => {
    if (channel.type === 'sms' && channel.enabled) {
      sendSMSNotification(alert, channel);
    }
  }
);

// Push notification handler
notificationManager.on(
  'priceDropAlert',
  ({ alert, channel }: { alert: PriceDropAlert; channel: NotificationChannel }) => {
    if (channel.type === 'pushNotification' && channel.enabled) {
      sendPushNotification(alert, channel);
    }
  }
);

/**
 * Email notification sender
 */
async function sendEmailNotification(
  alert: PriceDropAlert,
  channel: NotificationChannel
): Promise<void> {
  try {
    const to = channel.config.emailAddress as string;
    if (!to) {
      console.warn('[notifications] Email address not configured');
      return;
    }

    console.log(
      `[notifications] Sending email to ${to}: Price drop alert for ${alert.itemTitle}`
    );

    // TODO: Implement actual email sending (nodemailer, SendGrid, etc.)
    // For now, just log it
    console.log(`[email] Subject: Price Drop! ${alert.itemTitle}`);
    console.log(
      `[email] Body: Price dropped to ${alert.currency}${alert.currentPrice} (was ${alert.currency}${alert.previousPrice})`
    );
  } catch (error) {
    console.error('[notifications] Email send failed:', error);
  }
}

/**
 * Discord notification sender
 */
async function sendDiscordNotification(
  alert: PriceDropAlert,
  channel: NotificationChannel
): Promise<void> {
  try {
    const webhookUrl = channel.config.webhookUrl as string;
    if (!webhookUrl) {
      console.warn('[notifications] Discord webhook URL not configured');
      return;
    }

    // Discord embed message format (awaiting implementation of actual webhook)
    void ({
      embeds: [
        {
          title: '💰 Price Drop Alert!',
          description: alert.itemTitle,
          color: 0x00ff00,
          fields: [
            {
              name: 'Price',
              value: `${alert.currency}${alert.previousPrice.toFixed(2)} → ${alert.currency}${alert.currentPrice.toFixed(2)}`,
              inline: true,
            },
            {
              name: 'Drop',
              value: `${alert.currency}${alert.priceDropAmount.toFixed(2)} (${alert.priceDropPercent.toFixed(1)}%)`,
              inline: true,
            },
            {
              name: 'Target Price',
              value: `${alert.currency}${alert.targetPrice.toFixed(2)}`,
              inline: true,
            },
          ],
          url: alert.itemUrl,
          timestamp: alert.timestamp.toISOString(),
        },
      ],
    });

    console.log(`[notifications] Sending Discord webhook: ${alert.itemTitle}`);

    // TODO: Uncomment when implementing actual webhook
    // const webhookUrl = channel.config.webhookUrl as string;
    // await axios.post(webhookUrl, message);
  } catch (error) {
    console.error('[notifications] Discord send failed:', error);
  }
}

/**
 * Webhook notification sender
 */
async function sendWebhookNotification(
  alert: PriceDropAlert,
  channel: NotificationChannel
): Promise<void> {
  try {
    const webhookUrl = channel.config.url as string;
    if (!webhookUrl) {
      console.warn('[notifications] Webhook URL not configured');
      return;
    }

    // Webhook payload format (awaiting implementation of actual endpoint)
    void ({
      type: 'priceDropAlert',
      userId: alert.userId,
      item: {
        id: alert.itemId,
        title: alert.itemTitle,
        url: alert.itemUrl,
      },
      price: {
        previous: alert.previousPrice,
        current: alert.currentPrice,
        target: alert.targetPrice,
        currency: alert.currency,
        dropAmount: alert.priceDropAmount,
        dropPercent: alert.priceDropPercent,
      },
      timestamp: alert.timestamp.toISOString(),
    });

    console.log(`[notifications] Sending webhook to ${webhookUrl}: ${alert.itemTitle}`);

    // TODO: Uncomment when implementing actual webhook
    // await axios.post(webhookUrl, payload);
  } catch (error) {
    console.error('[notifications] Webhook send failed:', error);
  }
}

/**
 * SMS notification sender
 */
async function sendSMSNotification(
  alert: PriceDropAlert,
  channel: NotificationChannel
): Promise<void> {
  try {
    const phoneNumber = channel.config.phoneNumber as string;
    if (!phoneNumber) {
      console.warn('[notifications] Phone number not configured');
      return;
    }

    const message = `Price Drop! ${alert.itemTitle} is now ${alert.currency}${alert.currentPrice.toFixed(2)} (was ${alert.currency}${alert.previousPrice.toFixed(2)}). Target: ${alert.currency}${alert.targetPrice.toFixed(2)}`;

    console.log(
      `[notifications] Sending SMS to ${phoneNumber}: ${alert.itemTitle}`
    );
    console.log(`[sms] Message: ${message}`);

    // TODO: Implement actual SMS sending (Twilio, AWS SNS, etc.)
  } catch (error) {
    console.error('[notifications] SMS send failed:', error);
  }
}

/**
 * Push notification sender
 */
async function sendPushNotification(
  alert: PriceDropAlert,
  channel: NotificationChannel
): Promise<void> {
  try {
    const deviceToken = channel.config.deviceToken as string;
    if (!deviceToken) {
      console.warn('[notifications] Device token not configured');
      return;
    }

    const message = `Price Drop! ${alert.itemTitle}: ${alert.currency}${alert.currentPrice.toFixed(2)}`;

    console.log(
      `[notifications] Sending push notification to device ${deviceToken}: ${alert.itemTitle}`
    );
    console.log(`[push] Message: ${message}`);

    // TODO: Implement actual push notifications (Firebase Cloud Messaging, OneSignal, etc.)
  } catch (error) {
    console.error('[notifications] Push notification send failed:', error);
  }
}

/**
 * Format notification message
 */
export function formatPriceDropMessage(alert: PriceDropAlert): string {
  return (
    `🏷️ ${alert.itemTitle}\n` +
    `💰 Price: ${alert.currency}${alert.previousPrice.toFixed(2)} → ${alert.currency}${alert.currentPrice.toFixed(2)}\n` +
    `📉 Drop: ${alert.currency}${alert.priceDropAmount.toFixed(2)} (${alert.priceDropPercent.toFixed(1)}%)\n` +
    `🎯 Target: ${alert.currency}${alert.targetPrice.toFixed(2)}\n` +
    `🔗 ${alert.itemUrl}`
  );
}
