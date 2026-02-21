/**
 * Price Monitor Service
 * Tracks WishlistItem prices and triggers notifications on drops
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { EbayBrowseService } from './ebay-browse.service';
import { createEbayBrowseService } from './ebay-browse.service';
import { convertCurrency } from './currency-converter';
import {
  notificationManager,
  PriceDropAlert,
} from './notification-service';

export interface PriceCheckResult {
  wishlistItemId: number;
  itemId: string;
  itemTitle: string;
  previousPrice: number;
  currentPrice: number;
  priceChanged: boolean;
  priceDropped: boolean;
  priceDropAmount: number;
  priceDropPercent: number;
  currency: string;
  alertTriggered: boolean;
  timestamp: Date;
  errorMessage?: string;
}

export interface PriceMonitoringStats {
  itemsChecked: number;
  pricesUpdated: number;
  priceDropsDetected: number;
  alertsTriggered: number;
  conversionErrors: number;
  apiErrors: number;
  durationMs: number;
}

/**
 * Price Monitor Service
 */
export class PriceMonitor {
  private prisma: PrismaClient;
  private ebayService: EbayBrowseService;
  private stats: PriceMonitoringStats = {
    itemsChecked: 0,
    pricesUpdated: 0,
    priceDropsDetected: 0,
    alertsTriggered: 0,
    conversionErrors: 0,
    apiErrors: 0,
    durationMs: 0,
  };

  constructor(prisma: PrismaClient, ebayService: EbayBrowseService) {
    this.prisma = prisma;
    this.ebayService = ebayService;
  }

  /**
   * Check prices for a user's wishlist items
   */
  async checkUserWishlistPrices(
    userId: number,
    baseCurrency: string = 'USD'
  ): Promise<PriceCheckResult[]> {
    const startTime = Date.now();
    console.log(
      `[priceMonitor] Starting price check for user ${userId} (base: ${baseCurrency})`
    );

    try {
      // Fetch active wishlist items
      const wishlistItems = await this.prisma.wishlistItem.findMany({
        where: {
          userId,
          isActive: true,
        },
        include: {
          search: true,
        },
      });

      console.log(
        `[priceMonitor] Found ${wishlistItems.length} active wishlist items for user ${userId}`
      );

      if (wishlistItems.length === 0) {
        this.stats.durationMs = Date.now() - startTime;
        return [];
      }

      // Check prices concurrently (batched)
      const results: PriceCheckResult[] = [];
      const batchSize = 5;

      for (let i = 0; i < wishlistItems.length; i += batchSize) {
        const batch = wishlistItems.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map((item: any) =>
            this.checkItemPrice(item, userId, baseCurrency)
          )
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            this.stats.itemsChecked++;

            if (result.value.priceChanged) {
              this.stats.pricesUpdated++;
            }
            if (result.value.priceDropped) {
              this.stats.priceDropsDetected++;
            }
            if (result.value.alertTriggered) {
              this.stats.alertsTriggered++;
            }
          } else {
            this.stats.apiErrors++;
            console.error(
              `[priceMonitor] Price check failed:`,
              result.reason
            );
          }
        }

        // Delay between batches to avoid rate limiting
        if (i + batchSize < wishlistItems.length) {
          await this.sleep(500);
        }
      }

      this.stats.durationMs = Date.now() - startTime;

      console.log(
        `[priceMonitor] Price check complete for user ${userId}: ${this.stats.itemsChecked} checked, ${this.stats.pricesUpdated} updated, ${this.stats.alertsTriggered} alerts`
      );

      return results;
    } catch (error) {
      this.stats.durationMs = Date.now() - startTime;
      console.error('[priceMonitor] Error checking prices:', error);
      throw error;
    }
  }

  /**
   * Check price for a single item
   */
  private async checkItemPrice(
    wishlistItem: any,
    userId: number,
    baseCurrency: string
  ): Promise<PriceCheckResult> {
    try {
      // Fetch current item details from eBay
      // Default to EBAY_US since WishlistItem doesn't store site info
      const itemDetails = await this.ebayService.getItem(
        wishlistItem.ebayItemId,
        'EBAY_US'
      );

      if (!itemDetails) {
        return {
          wishlistItemId: wishlistItem.id,
          itemId: wishlistItem.ebayItemId,
          itemTitle: wishlistItem.itemTitle || 'Unknown Item',
          previousPrice: wishlistItem.currentPrice
            ? parseFloat(wishlistItem.currentPrice.toString())
            : 0,
          currentPrice: 0,
          priceChanged: false,
          priceDropped: false,
          priceDropAmount: 0,
          priceDropPercent: 0,
          currency: 'USD',
          alertTriggered: false,
          timestamp: new Date(),
          errorMessage: 'Item not found on eBay',
        };
      }

      const currentPrice = parseFloat(itemDetails.price.value);
      const itemCurrency = itemDetails.price.currency;
      const previousPrice = wishlistItem.currentPrice
        ? parseFloat(wishlistItem.currentPrice.toString())
        : currentPrice;

      // Handle currency conversion
      let normalizedCurrentPrice = currentPrice;
      let normalizedPreviousPrice = previousPrice;

      if (itemCurrency !== baseCurrency) {
        try {
          normalizedCurrentPrice = await convertCurrency(
            currentPrice,
            itemCurrency,
            baseCurrency
          );
          normalizedPreviousPrice = await convertCurrency(
            previousPrice,
            itemCurrency,
            baseCurrency
          );
        } catch (error) {
          console.error(
            `[priceMonitor] Currency conversion error for ${wishlistItem.itemTitle}:`,
            error
          );
          this.stats.conversionErrors++;
          // Continue with unconverted prices
        }
      }

      // Calculate price change
      const priceChanged =
        Math.abs(normalizedCurrentPrice - normalizedPreviousPrice) > 0.01;
      const priceDropped = normalizedCurrentPrice < normalizedPreviousPrice;
      const priceDropAmount = normalizedPreviousPrice - normalizedCurrentPrice;
      const priceDropPercent =
        normalizedPreviousPrice > 0
          ? ((priceDropAmount / normalizedPreviousPrice) * 100)
          : 0;

      // Update database with new price
      if (priceChanged) {
        await this.prisma.wishlistItem.update({
          where: { id: wishlistItem.id },
          data: {
            currentPrice: normalizedCurrentPrice,
            lowestPriceRecorded: normalizedCurrentPrice
              ? Math.min(
                  normalizedCurrentPrice,
                  wishlistItem.lowestPriceRecorded
                    ? parseFloat(wishlistItem.lowestPriceRecorded.toString())
                    : normalizedCurrentPrice
                )
              : undefined,
            highestPriceRecorded: normalizedCurrentPrice
              ? Math.max(
                  normalizedCurrentPrice,
                  wishlistItem.highestPriceRecorded
                    ? parseFloat(wishlistItem.highestPriceRecorded.toString())
                    : normalizedCurrentPrice
                )
              : undefined,
            lastCheckedAt: new Date(),
          },
        });
      }

      // Record price history
      await this.prisma.itemHistory.create({
        data: {
          userId,
          wishlistItemId: wishlistItem.id,
          price: new Decimal(normalizedCurrentPrice),
          priceDropped,
          priceDropAmount: priceDropped
            ? new Decimal(priceDropAmount)
            : null,
          quantityAvailable: 1,
        },
      });

      let alertTriggered = false;

      // Check if alert should be triggered
      if (priceDropped && wishlistItem.targetPrice) {
        const targetPrice = parseFloat(wishlistItem.targetPrice.toString());

        if (normalizedCurrentPrice < targetPrice) {
          alertTriggered = true;

          // Get user preferences
          const userPrefs = notificationManager.getUserPreferences(userId);
          if (userPrefs) {
            // Create and emit price drop alert
            const alert: PriceDropAlert = {
              userId,
              wishlistItemId: wishlistItem.id,
              itemId: wishlistItem.ebayItemId,
              itemTitle: wishlistItem.itemTitle,
              previousPrice: normalizedPreviousPrice,
              currentPrice: normalizedCurrentPrice,
              targetPrice,
              priceDropAmount,
              priceDropPercent,
              currency: baseCurrency,
              itemUrl: itemDetails.itemHref || '',
              timestamp: new Date(),
            };

            notificationManager.emitPriceDropAlert(alert);
          }
        }
      }

      return {
        wishlistItemId: wishlistItem.id,
        itemId: wishlistItem.ebayItemId,
        itemTitle: wishlistItem.itemTitle,
        previousPrice: normalizedPreviousPrice,
        currentPrice: normalizedCurrentPrice,
        priceChanged,
        priceDropped,
        priceDropAmount,
        priceDropPercent,
        currency: baseCurrency,
        alertTriggered,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error(
        `[priceMonitor] Error checking price for item ${wishlistItem.ebayItemId}:`,
        error
      );

      return {
        wishlistItemId: wishlistItem.id,
        itemId: wishlistItem.ebayItemId,
        itemTitle: wishlistItem.itemTitle || 'Unknown',
        previousPrice: 0,
        currentPrice: 0,
        priceChanged: false,
        priceDropped: false,
        priceDropAmount: 0,
        priceDropPercent: 0,
        currency: 'USD',
        alertTriggered: false,
        timestamp: new Date(),
        errorMessage: (error as Error).message,
      };
    }
  }

  /**
   * Check prices for specific wishlist items
   */
  async checkWishlistItems(
    wishlistItemIds: number[],
    baseCurrency: string = 'USD'
  ): Promise<PriceCheckResult[]> {
    if (wishlistItemIds.length === 0) {
      return [];
    }

    const items = await this.prisma.wishlistItem.findMany({
      where: { id: { in: wishlistItemIds } },
    });

    const results: PriceCheckResult[] = [];
    for (const item of items) {
      try {
        const result = await this.checkItemPrice(
          item,
          item.userId,
          baseCurrency
        );
        results.push(result);
      } catch (error) {
        console.error(`[priceMonitor] Error checking item ${item.id}:`, error);
      }
    }

    return results;
  }

  /**
   * Get monitoring statistics
   */
  getStats(): PriceMonitoringStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      itemsChecked: 0,
      pricesUpdated: 0,
      priceDropsDetected: 0,
      alertsTriggered: 0,
      conversionErrors: 0,
      apiErrors: 0,
      durationMs: 0,
    };
  }

  /**
   * Utility: sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a price monitor instance
 */
export function createPriceMonitor(
  prisma: PrismaClient,
  accessToken: string,
  sandbox?: boolean
): PriceMonitor {
  const ebayService = createEbayBrowseService({
    accessToken,
    sandbox: sandbox || false,
  });

  return new PriceMonitor(prisma, ebayService);
}

/**
 * Quick function to check if any prices need alerts
 */
export async function checkAndAlertPriceDrop(
  prisma: PrismaClient,
  accessToken: string,
  userId: number,
  baseCurrency: string = 'USD'
): Promise<PriceCheckResult[]> {
  const monitor = createPriceMonitor(prisma, accessToken);
  return monitor.checkUserWishlistPrices(userId, baseCurrency);
}
