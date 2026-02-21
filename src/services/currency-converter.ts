/**
 * Currency Converter Utility
 * Handles multi-currency support with live conversion rates
 */

import axios from 'axios';

export interface ExchangeRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  timestamp: Date;
}

/**
 * Simple in-memory cache for exchange rates (5-minute TTL)
 */
class ExchangeRateCache {
  private cache: Map<string, ExchangeRate> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  set(key: string, rate: ExchangeRate): void {
    this.cache.set(key, rate);
  }

  get(key: string): ExchangeRate | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    // Check if expired
    const now = new Date();
    const age = now.getTime() - cached.timestamp.getTime();
    if (age > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached;
  }

  clear(): void {
    this.cache.clear();
  }
}

const rateCache = new ExchangeRateCache();

/**
 * Currency codes for major eBay sites
 */
export const EBAY_SITE_CURRENCIES: Record<string, string> = {
  EBAY_US: 'USD',
  EBAY_CA: 'CAD',
  EBAY_GB: 'GBP',
  EBAY_AU: 'AUD',
  EBAY_DE: 'EUR',
  EBAY_FR: 'EUR',
  EBAY_IT: 'EUR',
  EBAY_ES: 'EUR',
  EBAY_NL: 'EUR',
  EBAY_BE: 'EUR',
  EBAY_CH: 'CHF',
  EBAY_AT: 'EUR',
  EBAY_SE: 'SEK',
  EBAY_JP: 'JPY',
  EBAY_IN: 'INR',
  EBAY_SG: 'SGD',
  EBAY_HK: 'HKD',
};

/**
 * Get exchange rate between two currencies
 * Uses Open Exchange Rates API (or cache)
 */
export async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  // If same currency, no conversion needed
  if (fromCurrency === toCurrency) {
    return 1.0;
  }

  const cacheKey = `${fromCurrency}_${toCurrency}`;

  // Check cache first
  const cached = rateCache.get(cacheKey);
  if (cached) {
    return cached.rate;
  }

  // Try to fetch from API
  try {
    // Using exchangerate-api.com (free tier available)
    // Alternative: api.exchangerate-api.com, fixer.io, etc.
    const apiKey = process.env.EXCHANGE_RATE_API_KEY;
    if (!apiKey) {
      console.warn(
        '[currency] EXCHANGE_RATE_API_KEY not set, using fallback rates'
      );
      return getFallbackRate(fromCurrency, toCurrency);
    }

    const response = await axios.get(
      `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${fromCurrency}`,
      { timeout: 5000 }
    );

    const rate = response.data.conversion_rates[toCurrency];
    if (!rate) {
      console.warn(`[currency] No rate found for ${fromCurrency} → ${toCurrency}`);
      return getFallbackRate(fromCurrency, toCurrency);
    }

    // Cache the rate
    rateCache.set(cacheKey, {
      fromCurrency,
      toCurrency,
      rate,
      timestamp: new Date(),
    });

    return rate;
  } catch (error) {
    console.error(
      `[currency] Failed to fetch exchange rate: ${(error as Error).message}`
    );
    return getFallbackRate(fromCurrency, toCurrency);
  }
}

/**
 * Fallback rates (approximate, updated monthly)
 * This ensures system works even without API key
 */
function getFallbackRate(from: string, to: string): number {
  const fallbackRates: Record<string, Record<string, number>> = {
    USD: { CAD: 1.35, GBP: 0.79, EUR: 0.92, AUD: 1.52, JPY: 149.5, CHF: 0.88, SEK: 10.5, INR: 83.2, SGD: 1.34, HKD: 7.81 },
    EUR: { USD: 1.09, GBP: 0.86, CAD: 1.47, AUD: 1.65, JPY: 162.5, CHF: 0.96, SEK: 11.4, INR: 90.5, SGD: 1.46, HKD: 8.5 },
    GBP: { USD: 1.27, EUR: 1.16, CAD: 1.71, AUD: 1.92, JPY: 189.0, CHF: 1.12, SEK: 13.3, INR: 105.0, SGD: 1.70, HKD: 9.9 },
    CAD: { USD: 0.74, EUR: 0.68, GBP: 0.58, AUD: 1.12, JPY: 110.5, CHF: 0.65, SEK: 7.8, INR: 67.0, SGD: 0.99, HKD: 5.78 },
    AUD: { USD: 0.66, EUR: 0.61, GBP: 0.52, CAD: 0.89, JPY: 98.5, CHF: 0.58, SEK: 6.9, INR: 59.8, SGD: 0.88, HKD: 5.14 },
    JPY: { USD: 0.0067, EUR: 0.0062, GBP: 0.0053, CAD: 0.0090, AUD: 0.0102, CHF: 0.0059, SEK: 0.070, INR: 0.61, SGD: 0.0090, HKD: 0.054 },
    CHF: { USD: 1.14, EUR: 1.04, GBP: 0.89, CAD: 1.54, AUD: 1.72, JPY: 170.0, SEK: 11.9, INR: 94.5, SGD: 1.52, HKD: 8.88 },
    SEK: { USD: 0.095, EUR: 0.088, GBP: 0.075, CAD: 0.13, AUD: 0.15, JPY: 14.3, CHF: 0.084, INR: 7.9, SGD: 0.127, HKD: 0.745 },
    INR: { USD: 0.012, EUR: 0.011, GBP: 0.0095, CAD: 0.016, AUD: 0.017, JPY: 1.64, CHF: 0.0106, SEK: 0.127, SGD: 0.016, HKD: 0.094 },
    SGD: { USD: 0.75, EUR: 0.69, GBP: 0.59, CAD: 1.01, AUD: 1.14, JPY: 111.0, CHF: 0.66, SEK: 7.87, INR: 62.5, HKD: 5.88 },
    HKD: { USD: 0.128, EUR: 0.117, GBP: 0.101, CAD: 0.172, AUD: 0.194, JPY: 18.9, CHF: 0.112, SEK: 1.34, INR: 10.6, SGD: 0.17 },
  };

  const baseRate = fallbackRates[from]?.[to];
  if (baseRate) return baseRate;

  // Try reverse rate (A→B = 1 / B→A)
  const reverseRate = fallbackRates[to]?.[from];
  if (reverseRate) return 1 / reverseRate;

  // Default: assume 1:1 (should not happen for major currencies)
  console.warn(
    `[currency] No fallback rate for ${from}→${to}, using 1:1 approximation`
  );
  return 1.0;
}

/**
 * Convert price from one currency to another
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  const rate = await getExchangeRate(fromCurrency, toCurrency);
  return amount * rate;
}

/**
 * Get currency symbol for display
 */
export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CAD: 'C$',
    AUD: 'A$',
    CHF: 'CHF',
    SEK: 'kr',
    INR: '₹',
    SGD: 'S$',
    HKD: 'HK$',
  };
  return symbols[currency] || currency;
}

/**
 * Format price with currency symbol
 */
export function formatPrice(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  const formatted = amount.toFixed(2);
  return `${symbol}${formatted}`;
}
