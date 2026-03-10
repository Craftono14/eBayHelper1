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
  imageUrl?: string | null;
  device?: string | null;
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('gif')) return '.gif';
  return '.jpg';
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
    const form = new FormData();
    form.append('token', PUSHOVER_APP_TOKEN);
    form.append('user', payload.userKey);
    form.append(
      'message',
      `eBay Price Drop Notification: ${payload.itemName} has dropped to $${payload.currentPrice.toFixed(2)}. eBay Item Link: ${payload.itemUrl}`
    );
    form.append('title', 'eBay Price Drop Notification');
    form.append('url', payload.itemUrl);
    form.append('url_title', 'Open eBay Item');

    if (payload.device) {
      form.append('device', payload.device);
    }

    // Attach item image when available for richer push notifications.
    if (payload.imageUrl) {
      try {
        const imageResponse = await fetch(payload.imageUrl);
        if (imageResponse.ok) {
          const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
          if (contentType.startsWith('image/')) {
            const imageBuffer = await imageResponse.arrayBuffer();
            const imageBlob = new Blob([imageBuffer], { type: contentType });
            const extension = extensionFromMimeType(contentType);
            form.append('attachment', imageBlob, `item-image${extension}`);
          }
        }
      } catch (imageError) {
        console.warn('[Pushover] Failed to fetch item image for attachment. Sending without image.', imageError);
      }
    }

    const response = await fetch(PUSHOVER_API_URL, {
      method: 'POST',
      body: form,
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
