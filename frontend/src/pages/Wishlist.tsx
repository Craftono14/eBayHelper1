import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface WishlistItem {
  id: number;
  ebayItemId: string | null;
  title: string;
  currentPrice: number | null;
  targetPrice: number | null;
  seller: string | null;
  sellerRating: number | null;
  isActive: boolean;
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
  const [filter, setFilter] = useState<'active' | 'won' | 'purchased' | 'all'>('active');

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }

    const fetchWishlist = async () => {
      try {
        setLoading(true);
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

    fetchWishlist();
  }, [isLoggedIn, filter]);

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
            onClick={() => setFilter('won')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filter === 'won'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Won
          </button>
          <button
            onClick={() => setFilter('purchased')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filter === 'purchased'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Purchased
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

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-6">
          {error}
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
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-bold">{item.title || 'Untitled Item'}</h3>
                    {item.isEbayImported && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        eBay Sync
                      </span>
                    )}
                  </div>
                  
                  {item.ebayItemId && (
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-medium">Item ID:</span> {item.ebayItemId}
                    </p>
                  )}
                  
                  {item.seller && (
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-medium">Seller:</span> {item.seller}
                      {item.sellerRating && ` (${item.sellerRating} ⭐)`}
                    </p>
                  )}

                  {item.search && (
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-medium">From:</span> {item.search}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  {item.currentPrice !== null && (
                    <div className="text-2xl font-bold text-blue-600 mb-1">
                      ${item.currentPrice.toFixed(2)}
                    </div>
                  )}
                  
                  {item.targetPrice !== null && (
                    <div className="text-sm text-gray-600">
                      Target: ${item.targetPrice.toFixed(2)}
                    </div>
                  )}

                  {item.lowestPrice !== null && (
                    <div className="text-xs text-gray-500 mt-2">
                      Low: ${item.lowestPrice.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-500">
                  Added: {new Date(item.addedAt).toLocaleDateString()}
                  {item.lastChecked && (
                    <> • Last checked: {new Date(item.lastChecked).toLocaleDateString()}</>
                  )}
                </div>

                <div className="flex gap-2">
                  {item.ebayItemId && (
                    <a
                      href={`https://www.ebay.com/itm/${item.ebayItemId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition text-sm"
                    >
                      View on eBay →
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
