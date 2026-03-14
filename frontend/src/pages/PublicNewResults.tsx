import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

interface PublicResultItem {
  itemId: string;
  title: string;
  price: number;
  itemWebUrl?: string;
  imageUrl?: string;
}

interface PublicResultsResponse {
  searchName: string;
  items: PublicResultItem[];
  createdAt: string;
  expiresAt: string;
}

export const PublicNewResults: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<PublicResultsResponse | null>(null);

  useEffect(() => {
    const fetchResults = async () => {
      if (!token) {
        setError('Missing results token');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/public/new-results/${encodeURIComponent(token)}`);
        const body = await response.json();

        if (!response.ok) {
          throw new Error(body.message || body.error || 'Failed to load results');
        }

        setData(body as PublicResultsResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load results');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [token]);

  if (loading) {
    return (
      <div className="text-center py-16">
        <h1 className="text-3xl font-bold mb-4">Loading Results...</h1>
        <p className="text-gray-600">Fetching shared search results.</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-16">
        <h1 className="text-3xl font-bold mb-4">Link Not Available</h1>
        <p className="text-red-600">{error || 'Unable to load results'}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{data.searchName}</h1>
        <p className="text-gray-600">{data.items.length} new items captured</p>
        <p className="text-xs text-gray-500 mt-2">Link expires: {new Date(data.expiresAt).toLocaleString()}</p>
      </div>

      {data.items.length === 0 ? (
        <div className="bg-gray-100 rounded-lg p-8 text-center text-gray-600">
          No items available in this shared result set.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.items.map((item) => (
            <div key={item.itemId} className="bg-white rounded-lg shadow p-4">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="w-full h-48 object-cover rounded mb-3"
                />
              ) : (
                <div className="w-full h-48 bg-gray-200 rounded mb-3" />
              )}

              <h2 className="font-semibold text-gray-900 mb-2 line-clamp-2">{item.title}</h2>
              <p className="text-lg font-bold text-green-700 mb-3">${item.price.toFixed(2)}</p>

              <a
                href={item.itemWebUrl || `https://www.ebay.com/itm/${item.itemId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 transition"
              >
                Open on eBay
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
