import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const Tests: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const [itemId, setItemId] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [watchListCount, setWatchListCount] = useState<number | null>(null);
  const [watchListMaximum, setWatchListMaximum] = useState<number | null>(null);

  const handleAddToWatchlist = async () => {
    if (!itemId.trim()) {
      setError('Please enter an item ID');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ebay-watchlist/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ itemId: itemId.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        let errorMsg = data.error || 'Failed to add item to watchlist';
        
        // Provide helpful context for common errors
        if (errorMsg.includes('None of items have been added')) {
          errorMsg += ' (Possible reasons: item already on watchlist, item belongs to you, or item not available)';
        }
        
        throw new Error(errorMsg);
      }

      setMessage(`✓ Item ${data.itemId} added to watchlist successfully!`);
      setWatchListCount(data.watchListCount);
      setWatchListMaximum(data.watchListMaximum);
      setItemId('');
    } catch (err: any) {
      setError(err.message || 'Failed to add item to watchlist');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromWatchlist = async () => {
    if (!itemId.trim()) {
      setError('Please enter an item ID');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ebay-watchlist/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ itemId: itemId.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove item from watchlist');
      }

      setMessage(`✓ Item ${data.itemId} removed from watchlist successfully!`);
      setWatchListCount(data.watchListCount);
      setWatchListMaximum(data.watchListMaximum);
      setItemId('');
    } catch (err: any) {
      setError(err.message || 'Failed to remove item from watchlist');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncSavedSearches = async () => {
    setSyncLoading(true);
    setSyncError('');
    setSyncMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ebay-sync/saved-searches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync saved searches');
      }

      setSyncMessage(`✓ ${data.message}`);
    } catch (err: any) {
      setSyncError(err.message || 'Failed to sync saved searches');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleSyncWatchlist = async () => {
    setSyncLoading(true);
    setSyncError('');
    setSyncMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ebay-sync/watchlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync watchlist');
      }

      setSyncMessage(`✓ ${data.message}`);
    } catch (err: any) {
      setSyncError(err.message || 'Failed to sync watchlist');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncLoading(true);
    setSyncError('');
    setSyncMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ebay-sync/all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync from eBay');
      }

      setSyncMessage(`✓ ${data.message}`);
    } catch (err: any) {
      setSyncError(err.message || 'Failed to sync from eBay');
    } finally {
      setSyncLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">eBay Watchlist Tests</h1>
        <p className="text-gray-600">Please log in to test watchlist operations.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">eBay Integration Tests</h1>

      {/* Sync Section */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-4">Sync from eBay</h2>
        <p className="text-sm text-gray-600 mb-4">
          Import your saved searches and watchlist items from eBay to your local database.
        </p>
        
        <div className="flex gap-4 mb-4">
          <button
            onClick={handleSyncSavedSearches}
            disabled={syncLoading}
            className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            {syncLoading ? 'Syncing...' : 'Sync Saved Searches'}
          </button>
          <button
            onClick={handleSyncWatchlist}
            disabled={syncLoading}
            className="flex-1 bg-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            {syncLoading ? 'Syncing...' : 'Sync Watchlist'}
          </button>
          <button
            onClick={handleSyncAll}
            disabled={syncLoading}
            className="flex-1 bg-purple-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            {syncLoading ? 'Syncing...' : 'Sync All'}
          </button>
        </div>

        {syncMessage && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {syncMessage}
          </div>
        )}

        {syncError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {syncError}
          </div>
        )}
      </div>

      {/* Watchlist Management Section */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-4">Add/Remove Items from Watchlist</h2>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            eBay Item ID
          </label>
          <input
            type="text"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            placeholder="Enter eBay item ID (e.g., 123456789012)"
            className="w-full p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Find item IDs in eBay listing URLs (e.g., ebay.com/itm/<strong>123456789012</strong>)
          </p>
        </div>

        <div className="flex gap-4 mb-4">
          <button
            onClick={handleAddToWatchlist}
            disabled={loading || !itemId.trim()}
            className="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Processing...' : 'Add to Watchlist'}
          </button>
          <button
            onClick={handleRemoveFromWatchlist}
            disabled={loading || !itemId.trim()}
            className="flex-1 bg-red-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Processing...' : 'Remove From Watchlist'}
          </button>
        </div>

        {message && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 mb-4">
            {message}
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-4">
            {error}
          </div>
        )}

        {(watchListCount !== null || watchListMaximum !== null) && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="font-semibold text-blue-900 mb-2">Watchlist Status:</p>
            <div className="text-sm text-blue-700">
              {watchListCount !== null && (
                <p>Current items: <strong>{watchListCount}</strong></p>
              )}
              {watchListMaximum !== null && (
                <p>Maximum capacity: <strong>{watchListMaximum}</strong></p>
              )}
              {watchListCount !== null && watchListMaximum !== null && (
                <p>Available slots: <strong>{watchListMaximum - watchListCount}</strong></p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
        <h3 className="font-semibold text-yellow-900 mb-2">Testing Tips:</h3>
        <ul className="text-sm text-yellow-800 space-y-1">
          <li>• Use sandbox items from <a href="https://sandbox.ebay.com" target="_blank" rel="noopener noreferrer" className="underline">sandbox.ebay.com</a> for testing</li>
          <li>• If "None of items have been added" error appears, try removing the item first (it may already be on watchlist)</li>
          <li>• You cannot add your own listings to your watchlist</li>
          <li>• Check your <a href="https://www.ebay.com/mye/myebay/watchlist" target="_blank" rel="noopener noreferrer" className="underline">eBay watchlist</a> to verify changes</li>
          <li>• For sandbox testing, use sandbox item IDs from your test listings</li>
        </ul>
      </div>
    </div>
  );
};
