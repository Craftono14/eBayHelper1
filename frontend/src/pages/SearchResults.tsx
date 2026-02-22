import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
}

interface SearchResponse {
  items: ItemSummary[];
  total: number;
  offset: number;
  limit: number;
}

interface SavedSearchDetails {
  id: number;
  name: string;
  searchKeywords: string;
  sortBy?: string | null;
  sortOrder?: string | null;
  buyingFormat?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  condition?: string | null;
  categories?: string | null;
  itemLocation?: string | null;
  currency?: string | null;
  freeShipping?: boolean;
}

export const SearchResults: React.FC = () => {
  const { searchId } = useParams<{ searchId: string }>();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  
  const [searchName, setSearchName] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortParam, setSortParam] = useState<string>('');
  const [filterParam, setFilterParam] = useState<string>('');
  const [categoryIds, setCategoryIds] = useState<string>('');
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [limit] = useState(50);

  const token = localStorage.getItem('token');

  // Map eBay SavedSearch sortBy values to Browse API sort format
  const mapSortToBrowseAPI = (savedSearchSort: string | null, sortOrder?: string | null): string => {
    if (!savedSearchSort) {
      console.log('[SearchResults] No sort preference specified, using default (Best Match)');
      return '';
    }
    
    // eBay Trading API ItemSort values to Browse API sort format mapping
    // Reference: https://developer.ebay.com/docs/trading/handle-search-requests
    const sortMap: Record<string, string> = {
      // Date-based sorting
      'EndTime': 'endingSoonest',          // Items ending soon first
      'EndTimeSoonest': 'endingSoonest',   // Alias
      'NewlyListed': 'newlyListed',        // Newly listed items first
      'RecentlyListed': 'newlyListed',     // Alias
      'StartDate': 'newlyListed',          // Start date (newly listed items)
      
      // Price-based sorting
      'CurrentPriceLowest': 'price',       // Lowest price first
      'PriceLowest': 'price',              // Lowest price first
      'CurrentPriceHighest': '-price',     // Highest price first
      'PriceHighest': '-price',            // Highest price first
      
      // Price plus shipping - depends on sort order
      'PricePlusShipping': sortOrder === 'Descending' ? '-price' : 'price',  // Use sort order to determine direction
      
      // Location-based sorting - not directly supported by Browse API
      'Distance': '',                      // No direct equivalent in Browse API, default to Best Match
      
      // Default/best match
      'BestMatch': '',                     // Empty string = use default/best match
      '': '',                              // Empty = default
    };
    
    const mappedSort = sortMap[savedSearchSort];
    if (mappedSort !== undefined) {
      console.log('[SearchResults] Mapped sort:', { ebaySort: savedSearchSort, sortOrder: sortOrder || 'N/A', browseAPISort: mappedSort || 'default (Best Match)' });
      return mappedSort;
    }
    
    // If not found in map, log warning and return empty (default to Best Match)
    console.warn('[SearchResults] Unknown eBay sort value:', savedSearchSort, '- defaulting to Best Match');
    return '';
  };

  // Build Browse API filter string from saved search details
  const buildFilterString = (search: SavedSearchDetails): string => {
    const filters: string[] = [];

    // Price range filter
    if (search.minPrice !== null && search.minPrice !== undefined && 
        search.maxPrice !== null && search.maxPrice !== undefined) {
      filters.push(`price:[${search.minPrice}..${search.maxPrice}]`);
    } else if (search.minPrice !== null && search.minPrice !== undefined) {
      filters.push(`price:[${search.minPrice}..]`);
    } else if (search.maxPrice !== null && search.maxPrice !== undefined) {
      filters.push(`price:[..${search.maxPrice}]`);
    }

    // Currency filter
    if (search.currency) {
      filters.push(`priceCurrency:${search.currency}`);
    }

    // Condition filter (map to Browse API format)
    if (search.condition) {
      const conditionMap: Record<string, string> = {
        'New': 'NEW',
        'Used': 'USED',
        'Refurbished': 'REFURBISHED',
        'For parts or not working': 'FOR_PARTS_OR_NOT_WORKING',
      };
      const browseCondition = conditionMap[search.condition] || search.condition.toUpperCase().replace(/ /g, '_');
      filters.push(`conditions:{${browseCondition}}`);
    }

    // Buying format filter
    if (search.buyingFormat) {
      const formatMap: Record<string, string> = {
        'Auction': 'AUCTION',
        'Buy It Now': 'FIXED_PRICE',
        'FixItPrice': 'FIXED_PRICE',
        'AuctionWithBIN': 'AUCTION|FIXED_PRICE',
        'Both': 'AUCTION|FIXED_PRICE',
      };
      const browseFormat = formatMap[search.buyingFormat] || 'FIXED_PRICE';
      filters.push(`buyingOptions:{${browseFormat}}`);
    }

    // Free shipping filter
    if (search.freeShipping) {
      filters.push('maxDeliveryCost:0');
    }

    const filterString = filters.join(',');
    console.log('[SearchResults] Built filter string:', filterString);
    return filterString;
  };

  // Fetch search details first
  useEffect(() => {
    if (!isLoggedIn || !searchId) return;

    const fetchSearchDetails = async () => {
      try {
        const response = await fetch(`/api/searches/${searchId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error('Failed to fetch search details');

        const search: SavedSearchDetails = await response.json();
        console.log('[SearchResults] Full search object:', search);
        
        setSearchName(search.name);
        setSearchQuery(search.searchKeywords);
        
        // Map the sort preference to Browse API format
        const sortValue = mapSortToBrowseAPI(search.sortBy, search.sortOrder);
        setSortParam(sortValue);
        
        // Build filter string
        const filterValue = buildFilterString(search);
        setFilterParam(filterValue);
        
        // Parse and set category IDs
        if (search.categories) {
          try {
            const cats = JSON.parse(search.categories);
            if (Array.isArray(cats) && cats.length > 0) {
              setCategoryIds(cats.join(','));
              console.log('[SearchResults] Category IDs:', cats.join(','));
            }
          } catch (err) {
            console.error('[SearchResults] Failed to parse categories:', err);
          }
        }
        
        console.log('[SearchResults] Sort mapping:', { 
          rawSortBy: search.sortBy,
          mappedBrowseSort: sortValue,
          rawSortOrder: search.sortOrder 
        });
      } catch (err) {
        console.error('Failed to fetch search details:', err);
        setError(err instanceof Error ? err.message : 'Failed to load search');
      }
    };

    fetchSearchDetails();
  }, [isLoggedIn, searchId, token]);

  // Fetch items when search query is available
  useEffect(() => {
    if (!searchQuery) return;

    const fetchItems = async () => {
      try {
        setLoading(true);
        setError('');

        // Build URL with sort, filter, and category parameters
        let url = `/api/browse/search?q=${encodeURIComponent(searchQuery)}&limit=${limit}&offset=${currentOffset}`;
        if (sortParam) {
          url += `&sort=${encodeURIComponent(sortParam)}`;
        }
        if (filterParam) {
          url += `&filter=${encodeURIComponent(filterParam)}`;
        }
        if (categoryIds) {
          url += `&category_ids=${encodeURIComponent(categoryIds)}`;
        }

        const response = await fetch(url);

        if (!response.ok) throw new Error('Failed to fetch items');

        const data: SearchResponse = await response.json();
        console.log('[SearchResults] Response received:', {
          itemCount: data.items?.length,
          total: data.total,
          offset: data.offset,
          limit: data.limit,
          appliedSort: sortParam,
          appliedFilter: filterParam,
          appliedCategories: categoryIds,
        });
        console.log('[SearchResults] Items received:', data.items);
        setItems(data.items || []);
        setTotal(data.total || 0);
      } catch (err) {
        console.error('[SearchResults] Error fetching items:', err);
        setError(err instanceof Error ? err.message : 'Failed to load search results');
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [searchQuery, currentOffset, limit, sortParam, filterParam, categoryIds]);

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
      console.error('[SearchResults] Error getting shipping cost:', err);
      return 'Check item';
    }
  };

  const getBuyingOptions = (options: string[]): string => {
    if (options.length === 0) return 'Unknown';
    if (options.length === 1) return options[0];
    return options.join(' / ');
  };

  const handlePrevPage = () => {
    if (currentOffset >= limit) {
      setCurrentOffset(currentOffset - limit);
    }
  };

  const handleNextPage = () => {
    if (currentOffset + limit < total) {
      setCurrentOffset(currentOffset + limit);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="text-center py-16">
        <h1 className="text-3xl font-bold mb-4">Search Results</h1>
        <p className="text-gray-600 mb-6">Please log in to view search results.</p>
        <a href="/login" className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition">
          Login
        </a>
      </div>
    );
  }

  if (loading && items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading search results...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <button
          onClick={() => navigate('/saved-searches')}
          className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2"
        >
          ← Back to Saved Searches
        </button>
        <h1 className="text-3xl font-bold mb-2">{searchName || 'Search Results'}</h1>
        <p className="text-gray-600">Query: {searchQuery}</p>
        <p className="text-sm text-gray-500 mt-2">{total} items found</p>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="bg-gray-100 rounded-lg p-12 text-center">
          <h2 className="text-xl font-bold mb-2">No items found</h2>
          <p className="text-gray-600">Try adjusting your search query.</p>
        </div>
      ) : (
        <>
          {/* Items Grid */}
          <div className="grid grid-cols-5 gap-6 mb-8">
            {items.filter(item => item?.itemId).map((item) => {
              try {
                const price = item.price?.value ? parseFloat(item.price.value).toFixed(2) : 'N/A';
                const currency = item.price?.currency || 'USD';
                
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
                          <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-800">
                            Unknown
                          </span>
                        )}
                      </div>
                    </div>
                  </a>
                );
              } catch (err) {
                console.error('[SearchResults] Error rendering item:', item?.itemId, err);
                return null;
              }
            })}
          </div>

          {/* Pagination */}
          {total > limit && (
            <div className="flex justify-between items-center mb-8 pt-8 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Showing {currentOffset + 1} to {Math.min(currentOffset + limit, total)} of {total} items
              </div>
              <div className="flex gap-4">
                <button
                  onClick={handlePrevPage}
                  disabled={currentOffset < limit}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={currentOffset + limit >= total}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
