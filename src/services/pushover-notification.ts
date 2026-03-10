const PUSHOVER_API_URL = 'https://api.pushover.net/1/messages.json';
const PUSHOVER_APP_TOKEN = process.env.PUSHOVER_APP_TOKEN;

export interface PushoverSendResult {
  success: boolean;
  error?: string;
}

interface PushoverPriceAlertPayload {
  userKey: string;
  itemName: string;
  currentPrice: number;
  itemUrl: string;
  device?: string | null;
}

export async function sendPriceAlertPushover(
  payload: PushoverPriceAlertPayload
): Promise<PushoverSendResult> {
  if (!PUSHOVER_APP_TOKEN) {
    return { success: false, error: 'PUSHOVER_APP_TOKEN is not configured on server' };
  }

  if (!payload.userKey) {
    return { success: false, error: 'Pushover user key is missing' };
  }

  try {
    const form = new URLSearchParams();
    form.set('token', PUSHOVER_APP_TOKEN);
    form.set('user', payload.userKey);
    form.set(
      'message',
      `eBay Price Drop Notification: ${payload.itemName} has dropped to $${payload.currentPrice.toFixed(2)}. eBay Item Link: ${payload.itemUrl}`
    );
    form.set('title', 'eBay Price Drop Notification');
    form.set('url', payload.itemUrl);
    form.set('url_title', 'Open eBay Item');

    if (payload.device) {
      form.set('device', payload.device);
    }

    const response = await fetch(PUSHOVER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      return { success: false, error: `Pushover API error (${response.status}): ${bodyText}` };
    }

    return { success: true };
  } catch (error) {
    console.error('[Pushover] Unexpected send error:', error);
    return { success: false, error: 'Unexpected error while sending Pushover notification' };
  }
}
