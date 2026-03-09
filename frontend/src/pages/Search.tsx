import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface ItemSummary {
  itemId: string;
  title: string;
  image?: {
    imageUrl: string;
  };
  price?: {
    value: string;
    currency: string;
  };
  currentBidPrice?: {
    value: string;
    currency: string;
  };
  buyingOptions: string[];
  shippingOptions?: Array<{
    shippingCost?: {
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

interface CategoryNode {
  id: string;
  name: string;
  children?: CategoryNode[];
}

interface ListingTypeOption {
  value: string;
  label: string;
}

interface SortOption {
  value: string;
  label: string;
}

interface CategoryConfig {
  categories: CategoryNode[];
  conditions: string[];
  itemLocations: string[];
  listingTypes: ListingTypeOption[];
  currencies: string[];
  sortOptions: SortOption[];
}

export const Search: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const token = localStorage.getItem('token');

  // Form state
  const [searchKeywords, setSearchKeywords] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCondition, setSelectedCondition] = useState<string>('');
  const [itemLocation, setItemLocation] = useState('Default');
  const [listingType, setListingType] = useState('Both');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [maxOfferPrice, setMaxOfferPrice] = useState('');
  const [searchName, setSearchName] = useState('');
  const [returns, setReturns] = useState('ignore');
  const [freeShipping, setFreeShipping] = useState(false);
  const [searchInDescription, setSearchInDescription] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [sortBy, setSortBy] = useState('BestMatch');

  // UI state
  const [expandedNodes, setExpandedNodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [debugFilter, setDebugFilter] = useState('');
  const [debugRequest, setDebugRequest] = useState('');
  const [categoryConfig, setCategoryConfig] = useState<CategoryConfig>({
    categories: [],
    conditions: ['New', 'Refurbished', 'Used', 'For parts or not working'],
    itemLocations: ['Default', 'US Only', 'North America', 'Worldwide'],
    listingTypes: [
      { value: 'Buy It Now', label: 'Buy It Now' },
      { value: 'Auction', label: 'Auction' },
      { value: 'Both', label: 'Buy It Now & Auction' },
    ],
    currencies: ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'JPY', 'CNY'],
    sortOptions: [
      { value: 'BestMatch', label: 'Best Match' },
      { value: 'EndTimeSoonest', label: 'Ending Soonest' },
      { value: 'NewlyListed', label: 'Newly Listed' },
      { value: 'PricePlusShippingLowest', label: 'Price + Shipping Lowest First' },
      { value: 'PricePlusShippingHighest', label: 'Price + Shipping Highest First' },
    ],
  });

  const categories = categoryConfig.categories;
  const conditions = categoryConfig.conditions;
  const itemLocations = categoryConfig.itemLocations;
  const listingTypes = categoryConfig.listingTypes;
  const currencies = categoryConfig.currencies;
  const sortOptions = categoryConfig.sortOptions;

  const isPricePlusShippingSort = (sortValue: string): boolean => {
    return (
      sortValue === 'PricePlusShippingLowest' ||
      sortValue === 'PricePlusShippingHighest' ||
      sortValue === 'PricePlusShipping'
    );
  };

  useEffect(() => {
    const loadCategoryConfig = async () => {
      try {
        const response = await fetch('/ebay-categories.json');
        if (!response.ok) {
          throw new Error('Failed to load eBay category structure');
        }
        const data: CategoryConfig = await response.json();
        setCategoryConfig(data);
      } catch (loadError) {
        console.error('[Search] Failed to load category structure:', loadError);
      }
    };

    loadCategoryConfig();
  }, []);

  const toggleCategorySelection = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const toggleNodeExpanded = (nodeKey: string) => {
    setExpandedNodes((prev) =>
      prev.includes(nodeKey)
        ? prev.filter((key) => key !== nodeKey)
        : [...prev, nodeKey]
    );
  };

  const renderCategoryNode = (node: CategoryNode, depth = 0, path = ''): React.ReactNode => {
    const nodeKey = path ? `${path}>${node.id}` : node.id;
    const hasChildren = (node.children?.length || 0) > 0;
    const isExpanded = expandedNodes.includes(nodeKey);

    return (
      <div key={nodeKey} className="space-y-1">
        <div className="flex items-center" style={{ paddingLeft: `${depth * 16}px` }}>
          <input
            type="checkbox"
            id={`cat-${nodeKey}`}
            checked={selectedCategories.includes(node.id)}
            onChange={() => toggleCategorySelection(node.id)}
            className="w-4 h-4 rounded"
          />
          <label
            htmlFor={`cat-${nodeKey}`}
            className={`ml-3 cursor-pointer flex-1 ${depth === 0 ? 'font-semibold' : ''}`}
          >
            {node.name}
          </label>

          {hasChildren && (
            <button
              onClick={() => toggleNodeExpanded(nodeKey)}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              {isExpanded ? '▼' : '▶'} Show
            </button>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {node.children?.map((child) => renderCategoryNode(child, depth + 1, nodeKey))}
          </div>
        )}
      </div>
    );
  };

  const mapSortToBrowseAPI = (savedSearchSort: string): string => {
    const sortMap: Record<string, string> = {
      EndTime: 'endingSoonest',
      EndTimeSoonest: 'endingSoonest',
      NewlyListed: 'newlyListed',
      RecentlyListed: 'newlyListed',
      StartDate: 'newlyListed',
      CurrentPriceLowest: 'price',
      PriceLowest: 'price',
      CurrentPriceHighest: '-price',
      PriceHighest: '-price',
      PricePlusShippingLowest: 'price',
      PricePlusShippingHighest: '-price',
      BestMatch: '',
      '': '',
    };

    if (savedSearchSort === 'PricePlusShipping') {
      return 'price';
    }

    return sortMap[savedSearchSort] ?? '';
  };

  const buildFilterString = (filters: {
    minPrice: number | null;
    maxPrice: number | null;
    currency: string;
    condition: string | null;
    buyingFormat: string;
    freeShipping: boolean;
    returnsAccepted: boolean;
    freeReturns: boolean;
    searchInDescription: boolean;
    itemLocation: string | null;
    sortBy: string;
  }): string => {
    const parts: string[] = [];

    const hasPriceFilter = filters.minPrice !== null || filters.maxPrice !== null;

    if (filters.minPrice !== null && filters.maxPrice !== null) {
      parts.push(`price:[${filters.minPrice}..${filters.maxPrice}]`);
    } else if (filters.minPrice !== null) {
      parts.push(`price:[${filters.minPrice}..]`);
    } else if (filters.maxPrice !== null) {
      parts.push(`price:[..${filters.maxPrice}]`);
    }

    // priceCurrency must be included when price filter is used
    if (hasPriceFilter && filters.currency) {
      parts.push(`priceCurrency:${filters.currency}`);
    }

    if (filters.condition) {
      const conditionMap: Record<string, string> = {
        New: 'NEW',
        Used: 'USED',
        Refurbished: 'REFURBISHED',
        'For parts or not working': 'FOR_PARTS_OR_NOT_WORKING',
      };
      const browseCondition =
        conditionMap[filters.condition] || filters.condition.toUpperCase().replace(/ /g, '_');
      parts.push(`conditions:{${browseCondition}}`);
    }

    if (filters.buyingFormat) {
      const formatMap: Record<string, string> = {
        Auction: 'AUCTION',
        'Buy It Now': 'FIXED_PRICE',
        FixItPrice: 'FIXED_PRICE',
        AuctionWithBIN: 'AUCTION|FIXED_PRICE',
        Both: 'AUCTION|FIXED_PRICE',
      };
      const browseFormat = formatMap[filters.buyingFormat] || 'FIXED_PRICE';
      parts.push(`buyingOptions:{${browseFormat}}`);
    }

    if (filters.freeShipping) {
      parts.push('maxDeliveryCost:0');
    }

    if (filters.returnsAccepted) {
      parts.push('returnsAccepted:true');
    }

    if (filters.freeReturns) {
      parts.push('freeReturns:true');
    }

    if (filters.searchInDescription) {
      parts.push('searchInDescription:true');
    }

    // Item location filter
    if (filters.itemLocation) {
      if (filters.itemLocation === 'US Only') {
        parts.push('itemLocationCountry:US');
      } else if (filters.itemLocation === 'North America') {
        parts.push('itemLocationRegion:NORTH_AMERICA');
      } else if (filters.itemLocation === 'Worldwide') {
        parts.push('itemLocationRegion:WORLDWIDE');
      }
    }

    if (isPricePlusShippingSort(filters.sortBy)) {
      parts.push('deliveryPostalCode:80011');
    }

    return parts.join(',');
  };

  // Get all descendant category IDs from a category node
  const getAllDescendantIds = (categoryId: string, categories: CategoryNode[]): string[] => {
    const ids: string[] = [categoryId];
    
    const findAndCollect = (nodes: CategoryNode[]) => {
      for (const node of nodes) {
        if (node.id === categoryId && node.children) {
          const collectChildren = (children: CategoryNode[]) => {
            for (const child of children) {
              ids.push(child.id);
              if (child.children) {
                collectChildren(child.children);
              }
            }
          };
          collectChildren(node.children);
          return true;
        }
        if (node.children && findAndCollect(node.children)) {
          return true;
        }
      }
      return false;
    };
    
    findAndCollect(categories);
    return ids;
  };

  // Simplify categories by removing children if parent is selected
  const simplifyCategories = (selectedIds: string[]): string[] => {
    if (selectedIds.length <= 1) return selectedIds;
    
    const simplified = new Set(selectedIds);
    
    // For each selected category, check if any other selected category contains it
    for (const categoryId of selectedIds) {
      for (const otherCategoryId of selectedIds) {
        if (categoryId === otherCategoryId) continue;
        
        // Get all descendants of otherCategoryId
        const descendants = getAllDescendantIds(otherCategoryId, categoryConfig.categories);
        
        // If categoryId is a descendant of otherCategoryId, remove categoryId
        if (descendants.includes(categoryId)) {
          simplified.delete(categoryId);
          break;
        }
      }
    }
    
    return Array.from(simplified);
  };

  // Perform multi-category search and combine results
  const performMultiCategorySearch = async (
    categories: string[],
    searchParams: {
      keywords: string;
      sortParam: string;
      filterParam: string;
    }
  ): Promise<{ items: ItemSummary[]; total: number }> => {
    const { keywords, sortParam, filterParam } = searchParams;
    
    // Perform parallel searches for each category
    const searchPromises = categories.map(async (categoryId) => {
      let url = `/api/browse/search?q=${encodeURIComponent(keywords)}&limit=50&offset=0`;
      if (sortParam) {
        url += `&sort=${encodeURIComponent(sortParam)}`;
      }
      if (filterParam) {
        url += `&filter=${encodeURIComponent(filterParam)}`;
      }
      url += `&category_ids=${encodeURIComponent(categoryId)}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to search category ${categoryId}`);
      }
      
      const data: SearchResponse = await response.json();
      return {
        categoryId,
        items: data.items || [],
        total: data.total || 0,
      };
    });
    
    const results = await Promise.all(searchPromises);
    
    // Deduplicate items by itemId
    const seenIds = new Set<string>();
    let combinedItems: ItemSummary[] = [];
    
    // Check if using Best Match sort (no sort param or default)
    const isBestMatch = !sortParam || sortParam === '';
    
    if (isBestMatch) {
      // Mix results proportionally for Best Match
      const totalResults = results.reduce((sum, r) => sum + r.total, 0);
      
      // Calculate how many items to take from each category result
      const itemQueues = results.map(r => ({
        items: [...r.items],
        weight: r.total / totalResults,
        nextInsertAt: 0,
      }));
      
      let position = 0;
      while (itemQueues.some(q => q.items.length > 0)) {
        // Find which queue should provide the next item
        for (const queue of itemQueues) {
          if (queue.items.length > 0 && position >= queue.nextInsertAt) {
            const item = queue.items.shift()!;
            if (!seenIds.has(item.itemId)) {
              seenIds.add(item.itemId);
              combinedItems.push(item);
            }
            // Calculate next insert position based on weight
            queue.nextInsertAt = position + Math.ceil(1 / queue.weight);
          }
        }
        position++;
        
        // Safety check to prevent infinite loops
        if (position > 1000) break;
      }
    } else {
      // For other sorts, combine all results then re-sort
      const allItems: ItemSummary[] = [];
      for (const result of results) {
        for (const item of result.items) {
          if (!seenIds.has(item.itemId)) {
            seenIds.add(item.itemId);
            allItems.push(item);
          }
        }
      }
      
      // Re-sort combined results based on sort parameter
      if (sortParam === 'price' || sortParam === '-price') {
        allItems.sort((a, b) => {
          const priceA = parseFloat(a.price?.value || a.currentBidPrice?.value || '0');
          const priceB = parseFloat(b.price?.value || b.currentBidPrice?.value || '0');
          return sortParam === 'price' ? priceA - priceB : priceB - priceA;
        });
      } else if (sortParam === 'endingSoonest') {
        // Note: itemEndDate would need to be added to ItemSummary interface if available
        // For now, keep original order
      } else if (sortParam === 'newlyListed') {
        // Note: itemStartDate would need to be added to ItemSummary interface if available
        // For now, keep original order
      }
      
      combinedItems = allItems;
    }
    
    const totalCount = results.reduce((sum, r) => sum + r.total, 0);
    
    return {
      items: combinedItems,
      total: totalCount,
    };
  };

  const handleSaveSearch = async () => {
    if (!searchName.trim()) {
      setError('Please enter a search name');
      return;
    }

    if (!searchKeywords.trim()) {
      setError('Please enter search keywords');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Build filter object (same as in handleSearch)
      const filters = {
        searchKeywords,
        categories: selectedCategories,
        condition: selectedCondition || null,
        itemLocation: itemLocation !== 'Default' ? itemLocation : null,
        buyingFormat: listingType,
        minPrice: minPrice ? parseFloat(minPrice) : null,
        maxPrice: maxPrice ? parseFloat(maxPrice) : null,
        returnsAccepted: returns === 'accepted',
        freeReturns: returns === 'free',
        freeShipping,
        searchInDescription,
        currency,
        sortBy,
        sortOrder: sortBy === 'PricePlusShippingHighest' ? 'Descending' : 'Ascending',
      };

      // Check if a search with this name already exists
      const listResponse = await fetch('/api/search/saved', {
        headers: {
          'x-user-id': token || '0',
        },
      });

      if (!listResponse.ok) {
        throw new Error('Failed to check existing searches');
      }

      const { searches } = await listResponse.json();
      const existingSearch = searches.find((s: any) => s.name === searchName);

      let response;
      if (existingSearch) {
        // Update existing search
        response = await fetch(`/api/search/saved/${existingSearch.id}`, {
          method: 'PUT',
          headers: {
            'x-user-id': token || '0',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: searchName,
            ...filters,
          }),
        });
      } else {
        // Create new search
        response = await fetch('/api/search/saved', {
          method: 'POST',
          headers: {
            'x-user-id': token || '0',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: searchName,
            ...filters,
          }),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save search');
      }

      await response.json();
      alert(existingSearch ? 'Search updated successfully!' : 'Search saved successfully!');
    } catch (err) {
      console.error('[Search] Save Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save search');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchKeywords.trim()) {
      setError('Please enter search keywords');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Build filter object
      const filters = {
        searchKeywords,
        categories: selectedCategories,
        condition: selectedCondition || null,
        itemLocation: itemLocation !== 'Default' ? itemLocation : null,
        buyingFormat: listingType,
        minPrice: minPrice ? parseFloat(minPrice) : null,
        maxPrice: maxPrice ? parseFloat(maxPrice) : null,
        maxOfferPrice: maxOfferPrice ? parseFloat(maxOfferPrice) : null,
        returnsAccepted: returns === 'accepted',
        freeReturns: returns === 'free',
        freeShipping,
        searchInDescription,
        currency,
        sortBy,
        sortOrder: sortBy === 'PricePlusShippingHighest' ? 'Descending' : 'Ascending',
      };

      const sortParam = mapSortToBrowseAPI(filters.sortBy);
      const filterParam = buildFilterString({
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        currency: filters.currency,
        condition: filters.condition,
        buyingFormat: filters.buyingFormat,
        freeShipping: filters.freeShipping,
        returnsAccepted: filters.returnsAccepted,
        freeReturns: filters.freeReturns,
        searchInDescription: filters.searchInDescription,
        itemLocation: filters.itemLocation,
        sortBy: filters.sortBy,
      });

      setDebugFilter(filterParam || '(none)');

      // Simplify categories to remove redundant child selections
      const simplifiedCategories = simplifyCategories(selectedCategories);
      
      if (simplifiedCategories.length > 1) {
        // Multi-category search: perform parallel searches and combine results
        setDebugRequest(`Multi-category search for ${simplifiedCategories.length} categories: ${simplifiedCategories.join(', ')}`);
        
        const result = await performMultiCategorySearch(simplifiedCategories, {
          keywords: filters.searchKeywords,
          sortParam,
          filterParam,
        });
        
        setItems(result.items);
        setTotal(result.total);
      } else {
        // Single or no category: standard search
        let url = `/api/browse/search?q=${encodeURIComponent(filters.searchKeywords)}&limit=50&offset=0`;
        if (sortParam) {
          url += `&sort=${encodeURIComponent(sortParam)}`;
        }
        if (filterParam) {
          url += `&filter=${encodeURIComponent(filterParam)}`;
        }
        if (simplifiedCategories.length === 1) {
          url += `&category_ids=${encodeURIComponent(simplifiedCategories[0])}`;
        }

        setDebugRequest(url);

        const response = await fetch(url);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to search items');
        }

        const data: SearchResponse = await response.json();
        setItems(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('[Search] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to perform search');
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
    } catch {
      return 'Check item';
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold mb-6">New Search</h1>
        <p className="text-gray-600">Please log in to create a search.</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow-md">
      <h1 className="text-3xl font-bold mb-8">New Search</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main search column */}
        <div className="lg:col-span-2 space-y-8">
          {/* Search Keywords */}
          <div>
            <label className="block text-lg font-semibold mb-3">Search Keywords *</label>
            <input
              type="text"
              value={searchKeywords}
              onChange={(e) => setSearchKeywords(e.target.value)}
              placeholder="e.g., vintage books, pokemon cards"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Categories */}
          <div>
            <label className="block text-lg font-semibold mb-3">Categories</label>
            <div className="space-y-2 max-h-96 overflow-y-auto border border-gray-300 rounded-lg p-4">
              {categories.map((category) => renderCategoryNode(category))}
            </div>
            {selectedCategories.length > 0 && (
              <p className="text-sm text-gray-600 mt-2">
                Selected: {selectedCategories.length} categor{selectedCategories.length === 1 ? 'y' : 'ies'}
              </p>
            )}
          </div>
        </div>

        {/* Filters column */}
        <div className="lg:col-span-1 space-y-6">
          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-lg font-semibold">Condition</label>
              <button
                type="button"
                onClick={() => setSelectedCondition('')}
                disabled={!selectedCondition}
                className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            </div>
            <div className="space-y-2">
              {conditions.map((condition) => (
                <div key={condition} className="flex items-center">
                  <input
                    type="radio"
                    name="itemCondition"
                    id={`cond-${condition}`}
                    checked={selectedCondition === condition}
                    onChange={() => setSelectedCondition(condition)}
                    className="w-4 h-4"
                  />
                  <label htmlFor={`cond-${condition}`} className="ml-3 cursor-pointer">
                    {condition}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Item Location */}
          <div>
            <label className="block text-sm font-semibold mb-2">Item Location</label>
            <select
              value={itemLocation}
              onChange={(e) => setItemLocation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            >
              {itemLocations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </div>

          {/* Listing Type */}
          <div>
            <label className="block text-sm font-semibold mb-2">Listing Type</label>
            <select
              value={listingType}
              onChange={(e) => setListingType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            >
              {listingTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Price Range */}
          <div>
            <label className="block text-sm font-semibold mb-2">Price Range</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="Min"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                step="0.01"
              />
              <input
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Max"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                step="0.01"
              />
            </div>
          </div>

          {/* Max Offer Price */}
          <div>
            <label className="block text-sm font-semibold mb-2">Max Offer Price</label>
            <input
              type="number"
              value={maxOfferPrice}
              onChange={(e) => setMaxOfferPrice(e.target.value)}
              placeholder="e.g., 50.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              step="0.01"
            />
          </div>

          {/* Returns Filter */}
          <div>
            <label className="block text-sm font-semibold mb-2">Returns</label>
            <select
              value={returns}
              onChange={(e) => setReturns(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            >
              <option value="ignore">Ignore Returns</option>
              <option value="accepted">Returns Accepted</option>
              <option value="free">Free Returns</option>
            </select>
          </div>

          {/* Free Shipping */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="freeShipping"
              checked={freeShipping}
              onChange={(e) => setFreeShipping(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="freeShipping" className="ml-3 text-sm font-semibold cursor-pointer">
              Free Shipping Only
            </label>
          </div>

          {/* Search in Description */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="searchInDescription"
              checked={searchInDescription}
              onChange={(e) => setSearchInDescription(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="searchInDescription" className="ml-3 text-sm font-semibold cursor-pointer">
              Search in Description
            </label>
          </div>

          {/* Currency */}
          <div>
            <label className="block text-sm font-semibold mb-2">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            >
              {currencies.map((curr) => (
                <option key={curr} value={curr}>
                  {curr}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-sm font-semibold mb-2">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            >
              {sortOptions.map((sort) => (
                <option key={sort.value} value={sort.value}>
                  {sort.label}
                </option>
              ))}
            </select>
          </div>

          {/* Search Name (for saving) */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              Search Name (for saving)
            </label>
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="e.g., Vintage Books Under $20"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter a name to save this search for later
            </p>
          </div>

          {/* Search Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-semibold"
            >
              {loading ? 'Searching...' : 'Search eBay'}
            </button>
            
            <button
              onClick={handleSaveSearch}
              disabled={loading || !searchName.trim()}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-semibold"
            >
              {loading ? 'Saving...' : 'Save Search'}
            </button>
          </div>

          <div className="bg-gray-100 border border-gray-200 rounded-lg p-3 text-xs text-gray-700">
            <p className="font-semibold mb-1">Debug</p>
            <p className="break-all"><span className="font-semibold">Request:</span> {debugRequest || '(run a search)'}</p>
            <p className="break-all mt-1"><span className="font-semibold">Filter:</span> {debugFilter || '(run a search)'}</p>
          </div>
        </div>
      </div>

      <div className="mt-10 border-t border-gray-200 pt-8">
        <h2 className="text-2xl font-bold mb-2">Search Results</h2>
        <p className="text-sm text-gray-500 mb-6">{total} items found</p>

        {items.length === 0 ? (
          <div className="bg-gray-100 rounded-lg p-10 text-center">
            <p className="text-gray-600">Run a search to see results here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            {items.filter((item) => item?.itemId).map((item) => {
              const isAuction = item.buyingOptions?.includes('AUCTION');
              // For auction items: show current bid if available, otherwise show price (BIN or starting bid)
              // For non-auction items: show price (fixed price)
              const displayPriceValue = isAuction 
                ? (item.currentBidPrice?.value || item.price?.value)
                : item.price?.value;
              const displayPrice = displayPriceValue ? parseFloat(displayPriceValue).toFixed(2) : 'N/A';

              return (
                <a
                  key={item.itemId}
                  href={item.itemWebUrl || `https://www.ebay.com/itm/${item.itemId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white rounded-lg shadow-md hover:shadow-lg transition overflow-hidden flex flex-col group"
                >
                  <div className="w-full h-44 bg-gray-100 overflow-hidden flex items-center justify-center">
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

                  <div className="p-3 flex-1 flex flex-col">
                    <h3 className="text-sm font-semibold mb-2 line-clamp-2 group-hover:text-blue-600">
                      {item.title || 'Untitled Item'}
                    </h3>

                    <div className="flex-1" />

                    <p className="text-lg font-bold text-blue-600 mb-2">
                      {displayPrice === 'N/A' ? 'Price N/A' : `$${displayPrice}`}
                    </p>

                    <p className="text-xs text-gray-600 mb-2">
                      Shipping: <span className="font-semibold">{getShippingCost(item)}</span>
                    </p>

                    <div className="flex flex-wrap gap-1">
                      {item.buyingOptions?.length ? (
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
            })}
          </div>
        )}
      </div>
    </div>
  );
};
