import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import categoriesData from '../data/ebay-categories.json';

interface Category {
  id: string;
  name: string;
  subcategories: Subcategory[];
}

interface Subcategory {
  id: string;
  name: string;
  subsubcategories: SubSubcategory[];
}

interface SubSubcategory {
  id: string;
  name: string;
}

export const Search: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  // Form state
  const [searchKeywords, setSearchKeywords] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [minFeedback, setMinFeedback] = useState('');
  const [itemLocation, setItemLocation] = useState('All Locations');
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
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedSubcategory, setExpandedSubcategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const categories: Category[] = categoriesData.categories;
  const conditions = categoriesData.conditions;
  const itemLocations = categoriesData.itemLocations;
  const listingTypes = categoriesData.listingTypes;
  const currencies = categoriesData.currencies;
  const sortOptions = categoriesData.sortOptions;

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
        categories: selectedCategories.length > 0 ? JSON.stringify(selectedCategories) : null,
        condition: selectedConditions.length > 0 ? selectedConditions[0] : null,
        minFeedback: minFeedback ? parseInt(minFeedback) : null,
        itemLocation: itemLocation !== 'All Locations' ? itemLocation : null,
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
        sortOrder: 'Ascending', // Default sort order
      };

      // Create search or just perform search
      if (searchName) {
        // Save search and then navigate
        const response = await fetch('/api/searches', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: searchName,
            ...filters,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create search');
        }

        const data = await response.json();
        navigate(`/searches/${data.id}`);
      } else {
        // Just perform search without saving
        // Store search params and navigate to results
        localStorage.setItem('temporarySearch', JSON.stringify(filters));
        navigate('/search-results');
      }
    } catch (err) {
      console.error('[Search] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to perform search');
    } finally {
      setLoading(false);
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
              {categories.map((category) => (
                <div key={category.id} className="space-y-1">
                  {/* Main Category */}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id={`cat-${category.id}`}
                      checked={selectedCategories.includes(category.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCategories([...selectedCategories, category.id]);
                        } else {
                          setSelectedCategories(
                            selectedCategories.filter((c) => c !== category.id)
                          );
                        }
                      }}
                      className="w-4 h-4 rounded"
                    />
                    <label
                      htmlFor={`cat-${category.id}`}
                      className="ml-3 font-semibold cursor-pointer flex-1"
                    >
                      {category.name}
                    </label>
                    {category.subcategories.length > 0 && (
                      <button
                        onClick={() =>
                          setExpandedCategory(
                            expandedCategory === category.id ? null : category.id
                          )
                        }
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        {expandedCategory === category.id ? '▼' : '▶'} Show
                      </button>
                    )}
                  </div>

                  {/* Subcategories */}
                  {expandedCategory === category.id && (
                    <div className="ml-6 space-y-1">
                      {category.subcategories.map((subcat) => (
                        <div key={subcat.id} className="space-y-1">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id={`subcat-${subcat.id}`}
                              checked={selectedCategories.includes(subcat.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCategories([...selectedCategories, subcat.id]);
                                } else {
                                  setSelectedCategories(
                                    selectedCategories.filter((c) => c !== subcat.id)
                                  );
                                }
                              }}
                              className="w-4 h-4 rounded"
                            />
                            <label
                              htmlFor={`subcat-${subcat.id}`}
                              className="ml-3 cursor-pointer flex-1"
                            >
                              {subcat.name}
                            </label>
                            {subcat.subsubcategories.length > 0 && (
                              <button
                                onClick={() =>
                                  setExpandedSubcategory(
                                    expandedSubcategory === subcat.id ? null : subcat.id
                                  )
                                }
                                className="text-blue-600 hover:text-blue-800 text-sm"
                              >
                                {expandedSubcategory === subcat.id ? '▼' : '▶'} Show
                              </button>
                            )}
                          </div>

                          {/* Sub-subcategories */}
                          {expandedSubcategory === subcat.id && (
                            <div className="ml-6 space-y-1">
                              {subcat.subsubcategories.map((subsubcat) => (
                                <div key={subsubcat.id} className="flex items-center">
                                  <input
                                    type="checkbox"
                                    id={`subsubcat-${subsubcat.id}`}
                                    checked={selectedCategories.includes(subsubcat.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedCategories([
                                          ...selectedCategories,
                                          subsubcat.id,
                                        ]);
                                      } else {
                                        setSelectedCategories(
                                          selectedCategories.filter(
                                            (c) => c !== subsubcat.id
                                          )
                                        );
                                      }
                                    }}
                                    className="w-4 h-4 rounded"
                                  />
                                  <label
                                    htmlFor={`subsubcat-${subsubcat.id}`}
                                    className="ml-3 cursor-pointer text-sm"
                                  >
                                    {subsubcat.name}
                                  </label>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
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
            <label className="block text-lg font-semibold mb-3">Condition</label>
            <div className="space-y-2">
              {conditions.map((condition) => (
                <div key={condition} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`cond-${condition}`}
                    checked={selectedConditions.includes(condition)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedConditions([...selectedConditions, condition]);
                      } else {
                        setSelectedConditions(
                          selectedConditions.filter((c) => c !== condition)
                        );
                      }
                    }}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor={`cond-${condition}`} className="ml-3 cursor-pointer">
                    {condition}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Min Feedback */}
          <div>
            <label className="block text-sm font-semibold mb-2">Min Seller Feedback</label>
            <input
              type="number"
              value={minFeedback}
              onChange={(e) => setMinFeedback(e.target.value)}
              placeholder="e.g., 100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
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
              Save as Search (Optional)
            </label>
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="e.g., Vintage Books Under $20"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave blank to search without saving
            </p>
          </div>

          {/* Search Button */}
          <button
            onClick={handleSearch}
            disabled={loading}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-semibold"
          >
            {loading ? 'Searching...' : 'Search eBay'}
          </button>
        </div>
      </div>
    </div>
  );
};
