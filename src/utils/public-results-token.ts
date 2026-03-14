import crypto from 'crypto';

export interface PublicResultItem {
  itemId: string;
  title: string;
  price: number;
  itemWebUrl?: string;
  imageUrl?: string;
}

interface PublicResultsPayload {
  v: 1;
  iat: number;
  exp: number;
  searchName: string;
  items: PublicResultItem[];
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf8');
}

function signPayload(payloadB64: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getTokenSecret(): string {
  return process.env.PUBLIC_RESULTS_TOKEN_SECRET || process.env.JWT_SECRET || '';
}

export function createPublicResultsToken(input: {
  searchName: string;
  items: PublicResultItem[];
  ttlSeconds?: number;
}): string {
  const secret = getTokenSecret();
  if (!secret) {
    throw new Error('PUBLIC_RESULTS_TOKEN_SECRET or JWT_SECRET must be configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: PublicResultsPayload = {
    v: 1,
    iat: now,
    exp: now + (input.ttlSeconds ?? 60 * 60 * 24 * 7),
    searchName: input.searchName,
    items: input.items,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const sig = signPayload(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

export function verifyPublicResultsToken(token: string): PublicResultsPayload {
  const secret = getTokenSecret();
  if (!secret) {
    throw new Error('PUBLIC_RESULTS_TOKEN_SECRET or JWT_SECRET must be configured');
  }

  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) {
    throw new Error('Invalid token format');
  }

  const expectedSig = signPayload(payloadB64, secret);
  if (expectedSig !== sig) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(base64UrlDecode(payloadB64)) as PublicResultsPayload;

  if (!payload || payload.v !== 1 || !Array.isArray(payload.items)) {
    throw new Error('Invalid token payload');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error('Token expired');
  }

  return payload;
}
