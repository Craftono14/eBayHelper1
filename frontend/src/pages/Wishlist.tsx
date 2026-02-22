import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface WishlistItem {
  id: number;
  ebayItemId: string | null;
  itemUrl: string | null;
  itemImageUrl: string | null;
  title: string;
  currentPrice: number | null;
  shippingCost: number | null;
  targetPrice: number | null;
  seller: string | null;
  sellerRating: number | null;
  isActive: boolean;
  listingStatus: string | null;
  isWon: boolean;
  isPurchased: boolean;
  isEbayImported: boolean;
  lowestPrice: number | null;
  highestPrice: number | null;
  search: string | null;
  lastChecked: string | null;
  addedAt: string;
}

export const Wishlist: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'active' | 'ended' | 'all'>('all');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');

  const fetchWishlist = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/search/wishlist?filter=${filter}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch wishlist');
      }

      const data = await response.json();
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wishlist');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }

    fetchWishlist();
  }, [isLoggedIn, filter]);

  const handleSyncWithEbay = async () => {
    try {
      setSyncing(true);
      setSyncMessage('');
      setError('');
      const token = localStorage.getItem('token');
      const response = await fetch('/api/sync/ebay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync with eBay');
      }

      const data = await response.json();
      setSyncMessage(`Synced ${data.details.total} items (${data.details.watchlistItems} watchlist items)`);
      await fetchWishlist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync with eBay');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (item: WishlistItem) => {
    if (item.isEbayImported) {
      return;
    }

    try {
      setError('');
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/search/wishlist/${item.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete item');
      }

      await fetchWishlist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item');
    }
  };

  const handlePriceDropNotification = async () => {
    try {
      setNotificationMessage('');
      const token = localStorage.getItem('token');
      const response = await fetch('/api/search/send-notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send notifications');
      }

      setNotificationMessage('Price drop notifications queued.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send notifications');
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="text-center py-16">
        <h1 className="text-3xl font-bold mb-4">Wishlist</h1>
        <p className="text-gray-600 mb-6">Please log in to view your wishlist.</p>
        <a href="/login" className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition">
          Login
        </a>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow-md">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold">Wishlist</h1>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncWithEbay}
            disabled={syncing}
            className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {syncing ? 'Syncing...' : 'Sync from eBay'}
          </button>

          {/* Filter Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('active')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filter === 'active'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setFilter('ended')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filter === 'ended'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Ended
            </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All
          </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {syncMessage && (
        <div className="bg-green-100 text-green-700 p-4 rounded-lg mb-6">
          {syncMessage}
        </div>
      )}

      {notificationMessage && (
        <div className="bg-blue-100 text-blue-700 p-4 rounded-lg mb-6">
          {notificationMessage}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Loading your wishlist...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-gray-100 rounded-lg p-12 text-center">
          <h2 className="text-xl font-bold mb-2">No items in your wishlist</h2>
          <p className="text-gray-600 mb-4">
            Add items from your saved searches or sync from eBay to get started.
          </p>
          <a
            href="/saved-searches"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition"
          >
            View Saved Searches
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition">
              <div className="flex gap-4">
                <div className="w-24 h-24 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
                  {item.itemImageUrl ? (
                    <img
                      src={item.itemImageUrl}
                      alt={item.title || 'Wishlist item'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <span className="text-xs text-gray-500">No image</span>
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {item.itemUrl || item.ebayItemId ? (
                      <a
                        href={item.itemUrl || `https://www.ebay.com/itm/${item.ebayItemId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xl font-bold text-blue-700 hover:underline"
                      >
                        {item.title || 'Untitled Item'}
                      </a>
                    ) : (
                      <span className="text-xl font-bold">{item.title || 'Untitled Item'}</span>
                    )}
                    {item.isEbayImported && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        eBay Sync
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-6 text-sm text-gray-600 mb-2">
                    <div>
                      <span className="font-medium">Price:</span>{' '}
                      {item.currentPrice !== null ? `$${item.currentPrice.toFixed(2)}` : 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">Shipping:</span>{' '}
                      {item.shippingCost !== null ? `$${item.shippingCost.toFixed(2)}` : 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">Status:</span>{' '}
                      {item.listingStatus || (item.isActive ? 'Active' : 'Ended')}
                    </div>
                  </div>

                  {item.seller && (
                    <p className="text-sm text-gray-600 mb-1">
                      <span className="font-medium">Seller:</span> {item.seller}
                      {item.sellerRating && ` (${item.sellerRating} ⭐)`}
                    </p>
                  )}

                  <div className="text-xs text-gray-500">
                    Added: {new Date(item.addedAt).toLocaleDateString()}
                    {item.lastChecked && (
                      <> • Last checked: {new Date(item.lastChecked).toLocaleDateString()}</>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={handlePriceDropNotification}
                    className="bg-indigo-600 text-white px-3 py-2 rounded-lg font-medium hover:bg-indigo-700 transition text-sm"
                  >
                    Price Drop Notification
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    disabled={item.isEbayImported}
                    className={`px-3 py-2 rounded-lg font-medium text-sm transition ${
                      item.isEbayImported
                        ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                        : 'bg-gray-700 text-white hover:bg-gray-800'
                    }`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
