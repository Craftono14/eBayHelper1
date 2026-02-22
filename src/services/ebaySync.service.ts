/**
 * eBay Sync Service
 * Handles syncing saved searches and watchlist items from eBay to local database
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import {
  EbayOAuthConfig,
  OAuthTokens,
  refreshAccessToken,
} from '../utils/ebayOAuth';

const prisma = new PrismaClient();

// OAuth Configuration
const ebayConfig: EbayOAuthConfig = {
  clientId: process.env.EBAY_CLIENT_ID || '',
  clientSecret: process.env.EBAY_CLIENT_SECRET || '',
  redirectUri: process.env.EBAY_OAUTH_REDIRECT_URI || '',
  sandbox: process.env.EBAY_SANDBOX_MODE === 'true',
};

// eBay API response types
// Saved searches interface - not yet implemented
// interface EbaySavedSearch {
//   searchId: string;
//   searchName: string;
//   query: string;
//   emailNotificationEnabled?: boolean;
//   createdDate?: string;
//   lastModifiedDate?: string;
// }

interface EbayWatchlistItem {
  itemId: string;
  title: string;
  itemWebUrl?: string;
  itemImageUrl?: string;
  price?: {
    value: string;
    currency: string;
  };
  shippingCost?: {
    value: string;
    currency: string;
  };
  listingStatus?: string;
  timeLeft?: string;
  seller?: {
    username: string;
    feedbackScore?: number;
  };
  condition?: string;
  quantityAvailable?: number;
}

/**
 * eBay Sync Service Class
 */
export class EbaySyncService {
  /**
   * Sync saved searches from eBay to local database
   * Uses eBay Trading API GetMyeBayBuying with FavoriteSearches container
   * @returns Number of saved searches synced
   */
  async syncSavedSearches(userId: number): Promise<number> {
    try {
      console.log(`[EbaySyncService] Syncing saved searches for user ${userId}`);

      // Get user with eBay tokens
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          ebayAccessToken: true,
          ebayRefreshToken: true,
          ebayTokenExpiry: true,
        },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      if (!user.ebayAccessToken) {
        throw new Error(`User ${userId} does not have an eBay access token`);
      }

      // Trading API endpoint
      const apiUrl = ebayConfig.sandbox
        ? 'https://api.sandbox.ebay.com/ws/api.dll'
        : 'https://api.ebay.com/ws/api.dll';

      // Build XML request for GetMyeBayBuying with FavoriteSearches
      const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBayBuyingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${user.ebayAccessToken}</eBayAuthToken>
  </RequesterCredentials>
  <FavoriteSearches>
    <Include>true</Include>
  </FavoriteSearches>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBayBuyingRequest>`;

      console.log('[EbaySyncService] Sending saved searches request to eBay');

      try {
        // Make Trading API call
        const response = await axios.post(apiUrl, xmlRequest, {
          headers: {
            'X-EBAY-API-SITEID': '0', // 0 = US
            'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
            'X-EBAY-API-CALL-NAME': 'GetMyeBayBuying',
            'Content-Type': 'text/xml',
          },
        });

        console.log('[EbaySyncService] Received response from eBay');
        
        // Parse XML response for saved searches
        const savedSearches = this.parseSavedSearchesXML(response.data);
        console.log(`[EbaySyncService] Found ${savedSearches.length} saved searches`);

        const ebaySearchIds = savedSearches
          .map((search) => search.searchName)
          .filter((searchName) => Boolean(searchName));

        // Remove previously imported searches that no longer exist on eBay
        await prisma.savedSearch.deleteMany({
          where: {
            userId,
            isEbayImported: true,
            ebaySearchId: ebaySearchIds.length > 0 ? { notIn: ebaySearchIds } : undefined,
          },
        });

        // Upsert each saved search into database
        let syncedCount = 0;
        for (const ebaySearch of savedSearches) {
          try {
            const categoriesJson = ebaySearch.categoryId ? JSON.stringify([ebaySearch.categoryId]) : null;
            console.log(`[EbaySyncService] Saving search "${ebaySearch.searchName}" - CategoryID: ${ebaySearch.categoryId || 'null'}, Categories JSON: ${categoriesJson || 'null'}`);
            
            await prisma.savedSearch.upsert({
              where: {
                ebaySearchId: ebaySearch.searchName, // Use SearchName as unique identifier
              },
              update: {
                name: ebaySearch.searchName,
                searchKeywords: ebaySearch.queryKeywords || '',
                searchQuery: ebaySearch.searchQuery,
                minPrice: ebaySearch.priceMin,
                maxPrice: ebaySearch.priceMax,
                currency: ebaySearch.currency,
                sortBy: ebaySearch.itemSort,
                sortOrder: ebaySearch.sortOrder,
                condition: ebaySearch.condition,
                buyingFormat: ebaySearch.itemType,
                categories: categoriesJson,
                itemLocation: ebaySearch.itemsLocatedIn,
                zipCode: ebaySearch.postalCode,
                isEbayImported: true,
                lastSyncedAt: new Date(),
              },
              create: {
                userId,
                name: ebaySearch.searchName,
                searchKeywords: ebaySearch.queryKeywords || '',
                searchQuery: ebaySearch.searchQuery,
                minPrice: ebaySearch.priceMin,
                maxPrice: ebaySearch.priceMax,
                currency: ebaySearch.currency,
                sortBy: ebaySearch.itemSort,
                sortOrder: ebaySearch.sortOrder,
                condition: ebaySearch.condition,
                buyingFormat: ebaySearch.itemType,
                categories: categoriesJson,
                itemLocation: ebaySearch.itemsLocatedIn,
                zipCode: ebaySearch.postalCode,
                isEbayImported: true,
                ebaySearchId: ebaySearch.searchName,
                lastSyncedAt: new Date(),
              },
            });
            syncedCount++;
          } catch (error: any) {
            console.error(`[EbaySyncService] Failed to sync search "${ebaySearch.searchName}":`, error.message);
          }
        }

        console.log(`[EbaySyncService] Successfully synced ${syncedCount} saved searches for user ${userId}`);

        // Update user's lastSyncedAt
        await prisma.user.update({
          where: { id: userId },
          data: { lastSyncedAt: new Date() },
        });
        
        return syncedCount;
      } catch (error: any) {
        // Handle 401 - attempt token refresh
        if (error.response?.status === 401 && user.ebayRefreshToken) {
          console.log('[EbaySyncService] Access token expired, attempting refresh...');
          
          try {
            const newTokens = await refreshAccessToken(user.ebayRefreshToken, ebayConfig);
            await this.updateUserTokens(userId, newTokens);

            // Retry with new token
            const retryXmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBayBuyingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${newTokens.accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <FavoriteSearches>
    <Include>true</Include>
  </FavoriteSearches>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBayBuyingRequest>`;

            const retryResponse = await axios.post(apiUrl, retryXmlRequest, {
              headers: {
                'X-EBAY-API-SITEID': '0',
                'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
                'X-EBAY-API-CALL-NAME': 'GetMyeBayBuying',
                'Content-Type': 'text/xml',
              },
            });

            const savedSearches = this.parseSavedSearchesXML(retryResponse.data);
            const ebaySearchIds = savedSearches
              .map((search) => search.searchName)
              .filter((searchName) => Boolean(searchName));

            // Remove previously imported searches that no longer exist on eBay
            await prisma.savedSearch.deleteMany({
              where: {
                userId,
                isEbayImported: true,
                ebaySearchId: ebaySearchIds.length > 0 ? { notIn: ebaySearchIds } : undefined,
              },
            });
            
            // Upsert saved searches (same logic as above)
            let syncedCount = 0;
            for (const ebaySearch of savedSearches) {
              try {
                await prisma.savedSearch.upsert({
                  where: {
                    ebaySearchId: ebaySearch.searchName,
                  },
                  update: {
                    name: ebaySearch.searchName,
                    searchKeywords: ebaySearch.queryKeywords || '',
                    searchQuery: ebaySearch.searchQuery,
                    minPrice: ebaySearch.priceMin,
                    maxPrice: ebaySearch.priceMax,
                    currency: ebaySearch.currency,
                    sortBy: ebaySearch.itemSort,
                    sortOrder: ebaySearch.sortOrder,
                    condition: ebaySearch.condition,
                    buyingFormat: ebaySearch.itemType,
                    categories: ebaySearch.categoryId ? JSON.stringify([ebaySearch.categoryId]) : null,
                    itemLocation: ebaySearch.itemsLocatedIn,
                    zipCode: ebaySearch.postalCode,
                    isEbayImported: true,
                    lastSyncedAt: new Date(),
                  },
                  create: {
                    userId,
                    name: ebaySearch.searchName,
                    searchKeywords: ebaySearch.queryKeywords || '',
                    searchQuery: ebaySearch.searchQuery,
                    minPrice: ebaySearch.priceMin,
                    maxPrice: ebaySearch.priceMax,
                    currency: ebaySearch.currency,
                    sortBy: ebaySearch.itemSort,
                    sortOrder: ebaySearch.sortOrder,
                    condition: ebaySearch.condition,
                    buyingFormat: ebaySearch.itemType,
                    categories: ebaySearch.categoryId ? JSON.stringify([ebaySearch.categoryId]) : null,
                    itemLocation: ebaySearch.itemsLocatedIn,
                    zipCode: ebaySearch.postalCode,
                    isEbayImported: true,
                    ebaySearchId: ebaySearch.searchName,
                    lastSyncedAt: new Date(),
                  },
                });
                syncedCount++;
              } catch (error: any) {
                console.error(`[EbaySyncService] Failed to sync search:`, error.message);
              }
            }

            console.log(`[EbaySyncService] Successfully synced ${syncedCount} saved searches after token refresh`);

            await prisma.user.update({
              where: { id: userId },
              data: { lastSyncedAt: new Date() },
            });
            
            return syncedCount;
          } catch (refreshError: any) {
            console.error('[EbaySyncService] Token refresh failed:', refreshError.message);
            throw new Error('Token refresh failed and saved searches sync was unauthorized');
          }
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      console.error('[EbaySyncService] Failed to sync saved searches:', error.message);
      throw error;
    }
  }

  /**
   * Sync watchlist/wishlist items from eBay to local database
   * Uses eBay Trading API GetMyeBayBuying call
   * @returns Number of watchlist items synced
   */
  async syncWishlist(userId: number): Promise<number> {
    try {
      console.log(`[EbaySyncService] Syncing watchlist for user ${userId}`);

      // Get user with eBay tokens
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          ebayAccessToken: true,
          ebayRefreshToken: true,
          ebayTokenExpiry: true,
        },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      if (!user.ebayAccessToken) {
        throw new Error(`User ${userId} does not have an eBay access token`);
      }

      // Trading API endpoint
      const apiUrl = ebayConfig.sandbox
        ? 'https://api.sandbox.ebay.com/ws/api.dll'
        : 'https://api.ebay.com/ws/api.dll';

      // Fetch all watchlist items with pagination
      let watchlistItems: EbayWatchlistItem[] = [];
      let currentPage = 1;
      let hasMorePages = true;
      const entriesPerPage = 200;

      try {
        while (hasMorePages) {
          // Build XML request for current page
          const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBayBuyingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${user.ebayAccessToken}</eBayAuthToken>
  </RequesterCredentials>
  <WatchList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>${entriesPerPage}</EntriesPerPage>
      <PageNumber>${currentPage}</PageNumber>
    </Pagination>
  </WatchList>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBayBuyingRequest>`;

          console.log(`[EbaySyncService] Fetching watchlist page ${currentPage}...`);

          // Make Trading API call
          const response = await axios.post(apiUrl, xmlRequest, {
            headers: {
              'X-EBAY-API-SITEID': '0', // 0 = US
              'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
              'X-EBAY-API-CALL-NAME': 'GetMyeBayBuying',
              'Content-Type': 'text/xml',
            },
          });
          
          // Parse XML response
          const pageItems = this.parseWatchlistXML(response.data);
          console.log(`[EbaySyncService] Page ${currentPage}: Found ${pageItems.length} items`);
          
          watchlistItems.push(...pageItems);
          
          // Check if there are more pages
          const totalPages = this.extractTotalPagesFromXML(response.data);
          console.log(`[EbaySyncService] Total pages: ${totalPages}, Current page: ${currentPage}`);
          
          if (currentPage >= totalPages || pageItems.length < entriesPerPage) {
            hasMorePages = false;
          } else {
            currentPage++;
          }
        }

        console.log(`[EbaySyncService] Total watchlist items fetched: ${watchlistItems.length}`);
      } catch (error: any) {
        // Handle 401 - attempt token refresh
        if (error.response?.status === 401 && user.ebayRefreshToken) {
          console.log('[EbaySyncService] Access token expired, attempting refresh...');
          
          try {
            const newTokens = await refreshAccessToken(user.ebayRefreshToken, ebayConfig);
            await this.updateUserTokens(userId, newTokens);

            // Retry with new token - fetch all pages
            watchlistItems = [];
            currentPage = 1;
            hasMorePages = true;

            while (hasMorePages) {
              const retryXmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBayBuyingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${newTokens.accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <WatchList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>${entriesPerPage}</EntriesPerPage>
      <PageNumber>${currentPage}</PageNumber>
    </Pagination>
  </WatchList>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBayBuyingRequest>`;

              const retryResponse = await axios.post(apiUrl, retryXmlRequest, {
                headers: {
                  'X-EBAY-API-SITEID': '0',
                  'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
                  'X-EBAY-API-CALL-NAME': 'GetMyeBayBuying',
                  'Content-Type': 'text/xml',
                },
              });

              const pageItems = this.parseWatchlistXML(retryResponse.data);
              watchlistItems.push(...pageItems);

              const totalPages = this.extractTotalPagesFromXML(retryResponse.data);
              if (currentPage >= totalPages || pageItems.length < entriesPerPage) {
                hasMorePages = false;
              } else {
                currentPage++;
              }
            }
          } catch (refreshError: any) {
            console.error('[EbaySyncService] Token refresh failed:', refreshError.message);
            throw new Error('Token refresh failed and watchlist sync was unauthorized');
          }
        } else {
          throw error;
        }
      }

      const ebayItemIds = watchlistItems
        .map((item) => item.itemId)
        .filter((itemId) => Boolean(itemId));

      // Remove previously imported watchlist items that no longer exist on eBay
      await prisma.wishlistItem.deleteMany({
        where: {
          userId,
          isEbayImported: true,
          ebayItemId: ebayItemIds.length > 0 ? { notIn: ebayItemIds } : undefined,
        },
      });

      // Upsert each watchlist item into database
      let syncedCount = 0;
      for (const ebayItem of watchlistItems) {
        try {
          const currentPrice = ebayItem.price
            ? parseFloat(ebayItem.price.value)
            : null;
          const shippingCost = ebayItem.shippingCost
            ? parseFloat(ebayItem.shippingCost.value)
            : null;
          // Check if listing has ended using TimeLeft (PT0S = ended/zero seconds left)
          const isActive = ebayItem.timeLeft 
            ? ebayItem.timeLeft.toUpperCase() !== 'PT0S'
            : true;

          // Find existing item or create new one
          const existingItem = await prisma.wishlistItem.findFirst({
            where: {
              userId,
              ebayItemId: ebayItem.itemId,
            },
          });

          if (existingItem) {
            // Update existing item
            await prisma.wishlistItem.update({
              where: { id: existingItem.id },
              data: {
                itemTitle: ebayItem.title,
                itemUrl: ebayItem.itemWebUrl,
                itemImageUrl: ebayItem.itemImageUrl,
                currentPrice: currentPrice,
                shippingCost: shippingCost,
                seller: ebayItem.seller?.username,
                sellerRating: ebayItem.seller?.feedbackScore,
                isEbayImported: true,
                isActive: isActive,
                listingStatus: ebayItem.listingStatus || null,
                lastCheckedAt: new Date(),
                updatedAt: new Date(),
              },
            });
          } else {
            // Create new item
            await prisma.wishlistItem.create({
              data: {
                userId,
                ebayItemId: ebayItem.itemId,
                itemTitle: ebayItem.title,
                itemUrl: ebayItem.itemWebUrl,
                itemImageUrl: ebayItem.itemImageUrl,
                currentPrice: currentPrice,
                shippingCost: shippingCost,
                targetPrice: currentPrice || 0, // Default to current price
                seller: ebayItem.seller?.username,
                sellerRating: ebayItem.seller?.feedbackScore,
                isEbayImported: true,
                isActive: isActive,
                listingStatus: ebayItem.listingStatus || null,
              },
            });
          }
          syncedCount++;
        } catch (error: any) {
          console.error(`[EbaySyncService] Failed to sync item ${ebayItem.itemId}:`, error.message);
        }
      }

      console.log(`[EbaySyncService] Synced ${syncedCount} of ${watchlistItems.length} watchlist items`);
      return syncedCount;
    } catch (error: any) {
      console.error(`[EbaySyncService] Error syncing watchlist for user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Parse XML response from GetMyeBayBuying WatchList
   */
  private parseWatchlistXML(xmlData: string): EbayWatchlistItem[] {
    const items: EbayWatchlistItem[] = [];

    try {
      // First, extract only the WatchList section
      const watchListRegex = /<WatchList>([\s\S]*?)<\/WatchList>/;
      const watchListMatch = xmlData.match(watchListRegex);
      
      if (!watchListMatch) {
        console.log('[EbaySyncService] No WatchList section found in response');
        return items;
      }

      const watchListXml = watchListMatch[1];
      console.log('[EbaySyncService] Found WatchList section, parsing items...');

      // Now parse items only from the WatchList section
      const itemRegex = /<Item>([\s\S]*?)<\/Item>/g;
      const itemMatches = watchListXml.matchAll(itemRegex);

      for (const match of itemMatches) {
        const itemXml = match[1];

        // Extract fields
        const itemId = this.extractXmlValue(itemXml, 'ItemID');
        const title = this.extractXmlValue(itemXml, 'Title');
        const itemWebUrl = this.extractXmlValue(itemXml, 'ListingDetails', 'ViewItemURL');
        
        // Debug PictureDetails extraction
        const pictureDetailsRegex = /<PictureDetails>([\s\S]*?)<\/PictureDetails>/i;
        const pictureDetailsMatch = itemXml.match(pictureDetailsRegex);
        if (pictureDetailsMatch && itemId) {
          console.log(`[EbaySyncService] PictureDetails for ${itemId}:`, pictureDetailsMatch[1].substring(0, 300));
        }
        
        const galleryURL = this.extractXmlValue(itemXml, 'PictureDetails', 'GalleryURL');
        const pictureURL = this.extractXmlValue(itemXml, 'PictureDetails', 'PictureURL');
        const imageUrl = galleryURL || pictureURL;
        
        if (itemId) {
          console.log(`[EbaySyncService] Item ${itemId} - GalleryURL: ${galleryURL}, PictureURL: ${pictureURL}, Final: ${imageUrl}`);
        }
        
        // Debug image extraction
        if (!imageUrl && itemId) {
          console.log(`[EbaySyncService] No image found for item ${itemId}: ${title?.substring(0, 50)}`);
          if (!pictureDetailsMatch) {
            console.log(`[EbaySyncService] No PictureDetails section found for item ${itemId}`);
          }
        }
        
        const priceValue = this.extractXmlValue(itemXml, 'SellingStatus', 'CurrentPrice');
        const priceCurrency = this.extractXmlValue(itemXml, 'SellingStatus', 'CurrentPrice', 'currencyID');
        const listingStatus = this.extractXmlValue(itemXml, 'SellingStatus', 'ListingStatus');
        const timeLeft = this.extractXmlValue(itemXml, 'TimeLeft');
        const shippingValue = this.extractXmlValue(
          itemXml,
          'ShippingDetails',
          'ShippingServiceOptions',
          'ShippingServiceCost'
        );
        const shippingCurrency = this.extractXmlValue(
          itemXml,
          'ShippingDetails',
          'ShippingServiceOptions',
          'ShippingServiceCost',
          'currencyID'
        );
        const sellerUsername = this.extractXmlValue(itemXml, 'Seller', 'UserID');
        const sellerFeedback = this.extractXmlValue(itemXml, 'Seller', 'FeedbackScore');
        const quantity = this.extractXmlValue(itemXml, 'Quantity');

        if (itemId) {
          items.push({
            itemId,
            title: title || '',
            itemWebUrl: itemWebUrl,
            itemImageUrl: imageUrl,
            price: priceValue ? {
              value: priceValue,
              currency: priceCurrency || 'USD',
            } : undefined,
            listingStatus: listingStatus,
            timeLeft: timeLeft,
            shippingCost: shippingValue ? {
              value: shippingValue,
              currency: shippingCurrency || 'USD',
            } : undefined,
            seller: sellerUsername ? {
              username: sellerUsername,
              feedbackScore: sellerFeedback ? parseInt(sellerFeedback) : undefined,
            } : undefined,
            quantityAvailable: quantity ? parseInt(quantity) : undefined,
          });
        }
      }

      console.log(`[EbaySyncService] Parsed ${items.length} items from WatchList section`);
    } catch (error: any) {
      console.error('[EbaySyncService] Error parsing watchlist XML:', error.message);
    }

    return items;
  }

  /**
   * Extract total number of pages from WatchList pagination info
   */
  private extractTotalPagesFromXML(xmlData: string): number {
    try {
      // Extract the WatchList section first
      const watchListRegex = /<WatchList>([\s\S]*?)<\/WatchList>/;
      const watchListMatch = xmlData.match(watchListRegex);
      
      if (!watchListMatch) {
        return 1;
      }

      const watchListXml = watchListMatch[1];
      
      // Try to find TotalNumberOfPages in PaginationResult
      const totalPagesValue = this.extractXmlValue(watchListXml, 'PaginationResult', 'TotalNumberOfPages');
      
      if (totalPagesValue) {
        const pages = parseInt(totalPagesValue);
        return isNaN(pages) ? 1 : pages;
      }
      
      return 1;
    } catch (error: any) {
      console.error('[EbaySyncService] Error extracting total pages:', error.message);
      return 1;
    }
  }

  /**
   * Extract value from XML string using simple regex
   * For nested tags, provide multiple tag names
   */
  private extractXmlValue(xml: string, ...tagNames: string[]): string | undefined {
    let currentXml = xml;
    
    for (let i = 0; i < tagNames.length - 1; i++) {
      const tagRegex = new RegExp(`<${tagNames[i]}[^>]*>([\\s\\S]*?)<\/${tagNames[i]}>`, 'i');
      const match = currentXml.match(tagRegex);
      if (!match) return undefined;
      currentXml = match[1];
    }

    // Last tag
    const lastTag = tagNames[tagNames.length - 1];
    
    // Try to extract attribute first (for currencyID, etc.)
    if (lastTag.includes('currencyID')) {
      const attrRegex = /currencyID="([^"]+)"/i;
      const attrMatch = currentXml.match(attrRegex);
      if (attrMatch) return attrMatch[1];
    }

    // Extract tag content - use non-greedy match to get content before closing tag
    const tagRegex = new RegExp(`<${lastTag}[^>]*>([\\s\\S]*?)<\/${lastTag}>`, 'i');
    const match = currentXml.match(tagRegex);
    return match ? match[1].trim() : undefined;
  }

  /**
   * Parse saved searches from eBay GetMyeBayBuying XML response
   */
  private parseSavedSearchesXML(xmlData: string): any[] {
    const searches: any[] = [];

    try {
      // Parse FavoriteSearch elements
      const searchRegex = /<FavoriteSearch>([\s\S]*?)<\/FavoriteSearch>/g;
      const searchMatches = xmlData.matchAll(searchRegex);

      for (const match of searchMatches) {
        const searchXml = match[1];

        // Extract all fields from MyeBayFavoriteSearchType
        const searchName = this.extractXmlValue(searchXml, 'SearchName');
        const queryKeywords = this.extractXmlValue(searchXml, 'QueryKeywords');
        const searchQuery = this.extractXmlValue(searchXml, 'SearchQuery');
        
        // Try to get CategoryID from XML field first, then from SearchQuery URL
        let categoryId = this.extractXmlValue(searchXml, 'CategoryID');
        if (!categoryId && searchQuery) {
          // Extract category from _sacat parameter in SearchQuery URL
          // Note: URLs in XML have &amp; instead of & so we need to handle both
          const sacatMatch = searchQuery.match(/[?&](?:amp;)?_sacat=(\d+)/);
          if (sacatMatch) {
            categoryId = sacatMatch[1];
            console.log(`[EbaySyncService] Extracted category ${categoryId} from SearchQuery URL for "${searchName}"`);
          }
        }
        
        const priceMinValue = this.extractXmlValue(searchXml, 'PriceMin');
        const priceMaxValue = this.extractXmlValue(searchXml, 'PriceMax');
        const currency = this.extractXmlValue(searchXml, 'Currency');
        const itemSort = this.extractXmlValue(searchXml, 'ItemSort');
        const sortOrder = this.extractXmlValue(searchXml, 'SortOrder');
        const condition = this.extractXmlValue(searchXml, 'Condition');
        const itemType = this.extractXmlValue(searchXml, 'ItemType');
        const itemsLocatedIn = this.extractXmlValue(searchXml, 'ItemsLocatedIn');
        const postalCode = this.extractXmlValue(searchXml, 'PostalCode');

        if (searchName) {
          console.log(`[EbaySyncService] Search "${searchName}" - ItemSort: ${itemSort}, SortOrder: ${sortOrder}, CategoryID: ${categoryId || 'null'}`);
          searches.push({
            searchName,
            queryKeywords,
            searchQuery,
            categoryId,
            priceMin: priceMinValue ? parseFloat(priceMinValue) : null,
            priceMax: priceMaxValue ? parseFloat(priceMaxValue) : null,
            currency,
            itemSort,
            sortOrder,
            condition,
            itemType,
            itemsLocatedIn,
            postalCode,
          });
        }
      }

      console.log(`[EbaySyncService] Parsed ${searches.length} saved searches from XML`);
    } catch (error: any) {
      console.error('[EbaySyncService] Error parsing saved searches XML:', error.message);
    }

    return searches;
  }

  /**
   * Helper method to update user tokens in database
   */
  private async updateUserTokens(userId: number, tokens: OAuthTokens): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ebayAccessToken: tokens.accessToken,
        ebayRefreshToken: tokens.refreshToken,
        ebayTokenExpiry: tokens.expiresAt,
      },
    });
    console.log(`[EbaySyncService] Updated tokens for user ${userId}`);
  }

  /**
   * Sync both saved searches and watchlist for a user
   */
  async syncAll(userId: number): Promise<void> {
    console.log(`[EbaySyncService] Starting full sync for user ${userId}`);
    
    try {
      await this.syncSavedSearches(userId);
    } catch (error: any) {
      console.error(`[EbaySyncService] Saved searches sync failed:`, error.message);
    }

    try {
      await this.syncWishlist(userId);
    } catch (error: any) {
      console.error(`[EbaySyncService] Watchlist sync failed:`, error.message);
    }

    console.log(`[EbaySyncService] Full sync completed for user ${userId}`);
  }
}

// Export singleton instance
export const ebaySyncService = new EbaySyncService();
