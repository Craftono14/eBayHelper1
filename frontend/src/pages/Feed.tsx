import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface ItemSummary {
  itemId: string;
  title: string;
  image: {
    imageUrl: string;
  };
  price: {
    value: string;
    currency: string;
  };
  buyingOptions: string[];
  shippingOptions?: Array<{
    shippingCost: {
      value: string;
      currency: string;
    };
  }>;
  itemWebUrl?: string;
  itemOriginDate?: string;
}

interface SavedSearch {
  id: number;
  name: string;
  searchKeywords: string;
}

interface FeedResponse {
  items: ItemSummary[];
  searchCount: number;
  itemsPerSearch: Record<number, number>;
}

export const Feed: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [lastRefreshTime, setLastRefreshTime] = useState<string>('');

  const token = localStorage.getItem('token');

  // Fetch saved searches list
  useEffect(() => {
    if (!isLoggedIn) return;

    const fetchSearches = async () => {
      try {
        const response = await fetch('/api/searches/dashboard', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error('Failed to fetch searches');

        const data = await response.json();
        setSearches(data.searches || []);
      } catch (err) {
        console.error('[Feed] Failed to fetch searches:', err);
      }
    };

    fetchSearches();
  }, [isLoggedIn, token]);

  // Fetch combined feed from all searches
  const handleRefresh = async () => {
    if (!isLoggedIn || searches.length === 0) {
      setError('No saved searches to refresh');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const response = await fetch('/api/feed/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchIds: searches.map(s => s.id),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to refresh feed');
      }

      const data: FeedResponse = await response.json();
      console.log('[Feed] Refresh complete:', {
        totalItems: data.items.length,
        searchCount: data.searchCount,
        itemsPerSearch: data.itemsPerSearch,
        firstItemDate: data.items[0]?.itemOriginDate,
        lastItemDate: data.items[data.items.length - 1]?.itemOriginDate,
      });

      // Items are already sorted by newest first from backend
      setItems(data.items);
      setLastRefreshTime(new Date().toLocaleString());
    } catch (err) {
      console.error('[Feed] Error refreshing:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh feed');
    } finally {
      setLoading(false);
    }
  };

  const getShippingCost = (item: ItemSummary): string => {
    try {
      if (!item.shippingOptions || item.shippingOptions.length === 0) {
        return 'Check item';
      }
      const shippingValue = item.shippingOptions[0]?.shippingCost?.value;
      if (!shippingValue) {
        return 'Check item';
      }
      return `$${parseFloat(shippingValue).toFixed(2)}`;
    } catch (err) {
      console.error('[Feed] Error getting shipping cost:', err);
      return 'Check item';
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold mb-6">Feed</h1>
        <p className="text-gray-600">Please log in to view your feed.</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow-md">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Feed</h1>
            <p className="text-gray-600">
              Combined results from all your {searches.length} saved searches, sorted by newest first
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading || searches.length === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-semibold"
          >
            {loading ? 'Refreshing...' : 'Refresh Feed'}
          </button>
        </div>

        {lastRefreshTime && (
          <p className="text-sm text-gray-500">
            Last refreshed: {lastRefreshTime}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {items.length === 0 && !loading ? (
        <div className="bg-gray-100 rounded-lg p-12 text-center">
          <h2 className="text-xl font-bold mb-2">No items yet</h2>
          <p className="text-gray-600">
            {searches.length === 0
              ? 'Create some saved searches first to populate your feed.'
              : 'Click "Refresh Feed" to fetch the latest items from all your searches.'}
          </p>
        </div>
      ) : (
        <>
          {/* Items Grid */}
          <div className="feed-grid gap-6 mb-8">
            {items.filter(item => item?.itemId).map((item) => {
              try {
                const price = item.price?.value ? parseFloat(item.price.value).toFixed(2) : 'N/A';
                
                return (
                  <a
                    key={item.itemId}
                    href={item.itemWebUrl || `https://www.ebay.com/itm/${item.itemId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white rounded-lg shadow-md hover:shadow-lg transition overflow-hidden flex flex-col group"
                  >
                    {/* Image */}
                    <div className="w-full h-48 bg-gray-100 overflow-hidden flex items-center justify-center">
                      {item.image?.imageUrl ? (
                        <img
                          src={item.image.imageUrl}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition"
                        />
                      ) : (
                        <span className="text-xs text-gray-500">No image</span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-4 flex-1 flex flex-col">
                      {/* Title */}
                      <h3 className="text-sm font-semibold mb-3 line-clamp-2 group-hover:text-blue-600">
                        {item.title || 'Untitled Item'}
                      </h3>

                      {/* Spacer */}
                      <div className="flex-1"></div>

                      {/* Price */}
                      <div className="mb-3">
                        <p className="text-xl font-bold text-blue-600">
                          {price === 'N/A' ? 'Price N/A' : `$${price}`}
                        </p>
                      </div>

                      {/* Shipping */}
                      <div className="mb-3 pb-3 border-b border-gray-200">
                        <p className="text-sm text-gray-600">
                          Shipping: <span className="font-semibold">{getShippingCost(item)}</span>
                        </p>
                      </div>

                      {/* Listing Type */}
                      <div className="flex flex-wrap gap-2">
                        {item.buyingOptions && item.buyingOptions.length > 0 ? (
                          item.buyingOptions.map((option) => (
                            <span
                              key={option}
                              className={`text-xs px-2 py-1 rounded ${
                                option === 'FIXED_PRICE'
                                  ? 'bg-green-100 text-green-800'
                                  : option === 'AUCTION'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {option === 'FIXED_PRICE' ? 'Buy It Now' : option}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                            Unknown
                          </span>
                        )}
                      </div>
                    </div>
                  </a>
                );
              } catch (err) {
                console.error('[Feed] Error rendering item:', err);
                return null;
              }
            })}
          </div>

          {/* Pagination Info */}
          {items.length > 0 && (
            <div className="text-center text-gray-600 mt-8">
              <p>Showing {items.length} total unique items from {searches.length} searches</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
