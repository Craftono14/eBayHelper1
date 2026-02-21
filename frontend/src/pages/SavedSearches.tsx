import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface SavedSearch {
  id: number;
  name: string;
  searchKeywords: string;
  newResultsCount: number;
  isEbayImported: boolean;
  createdAt: string;
  updatedAt: string;
}

export const SavedSearches: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }

    const fetchSearches = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/searches/dashboard');
        if (!response.ok) throw new Error('Failed to fetch searches');
        const data = await response.json();
        setSearches(data.searches || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load searches');
      } finally {
        setLoading(false);
      }
    };

    fetchSearches();
  }, [isLoggedIn]);

  const handleSyncWithEbay = async () => {
    try {
      setSyncing(true);
      setError('');
      setSyncMessage('');
      
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
      setSyncMessage(`Synced ${data.details.total} items (${data.details.savedSearches} searches, ${data.details.watchlistItems} watchlist items)`);
      
      // Refresh the searches list
      const refreshResponse = await fetch('/api/searches/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        setSearches(refreshData.searches || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync with eBay');
    } finally {
      setSyncing(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="text-center py-16">
        <h1 className="text-3xl font-bold mb-4">Saved Searches</h1>
        <p className="text-gray-600 mb-6">Please log in to view your saved searches.</p>
        <a href="/login" className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition">
          Login
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold">Saved Searches</h1>
        <button
          onClick={handleSyncWithEbay}
          disabled={syncing}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {syncing ? (
            <>
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Syncing...
            </>
          ) : (
            'Sync with eBay'
          )}
        </button>
      </div>

      {syncMessage && (
        <div className="bg-green-100 text-green-700 p-4 rounded-lg mb-6">
          {syncMessage}
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Loading your saved searches...</p>
        </div>
      ) : searches.length === 0 ? (
        <div className="bg-gray-100 rounded-lg p-12 text-center">
          <h2 className="text-xl font-bold mb-2">No saved searches yet</h2>
          <p className="text-gray-600 mb-4">
            Create your first saved search to monitor items automatically.
          </p>
          <button
            onClick={handleSyncWithEbay}
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition"
          >
            Sync with eBay
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {searches.map((search) => (
            <div key={search.id} className="bg-white rounded-lg shadow-md hover:shadow-lg transition p-6 relative">
              {/* eBay Sync Badge */}
              {search.isEbayImported && (
                <div className="absolute top-4 right-4">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    eBay Sync
                  </span>
                </div>
              )}

              <h3 className="text-xl font-bold mb-2 truncate pr-20">{search.name}</h3>
              <p className="text-gray-600 mb-4 truncate">
                <span className="font-medium">Query:</span> {search.searchKeywords}
              </p>

              <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-600">
                <p className="text-center">
                  <span className="text-3xl font-bold text-blue-600">
                    {search.newResultsCount}
                  </span>
                  <br />
                  <span className="text-sm text-gray-600">New results (24h)</span>
                </p>
              </div>

              <div className="space-y-2 text-sm text-gray-500 mb-4">
                <p>Created: {new Date(search.createdAt).toLocaleDateString()}</p>
                <p>Updated: {new Date(search.updatedAt).toLocaleDateString()}</p>
              </div>

              <div className="space-y-2">
                <a
                  href={`/search/${search.id}`}
                  className="block w-full text-center bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
                >
                  View Items →
                </a>

                {/* Edit and Delete buttons - disabled/hidden for eBay imports */}
                {search.isEbayImported ? (
                  <div 
                    className="relative group"
                    title="Imported from eBay. Edit directly on eBay to prevent sync issues."
                  >
                    <div className="flex gap-2 opacity-50 cursor-not-allowed">
                      <button
                        disabled
                        className="flex-1 bg-gray-300 text-gray-500 px-4 py-2 rounded-lg font-medium cursor-not-allowed"
                      >
                        Edit
                      </button>
                      <button
                        disabled
                        className="flex-1 bg-gray-300 text-gray-500 px-4 py-2 rounded-lg font-medium cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      Imported from eBay. Edit directly on eBay to prevent sync issues.
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {/* TODO: Implement edit functionality */}}
                      className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-700 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {/* TODO: Implement delete functionality */}}
                      className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
