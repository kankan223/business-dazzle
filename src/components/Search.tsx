import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search as SearchIcon, Filter, X } from 'lucide-react';
import { apiService } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';

interface SearchResult {
  collection: string;
  id: string;
  score: number;
  highlights: Array<{
    term: string;
    context: string;
  }>;
  [key: string]: any;
}

interface SearchFilters {
  dateRange?: number;
  status?: string[];
  platform?: string[];
  amountRange?: {
    min: number;
    max: number;
  };
  customFields?: Record<string, any>;
}

interface SearchProps {
  className?: string;
  onResultClick?: (result: SearchResult) => void;
}

export const SearchComponent: React.FC<SearchProps> = ({ className = '', onResultClick }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  
  const [filters, setFilters] = useState<SearchFilters>({
    dateRange: 30,
    status: [],
    platform: [],
    amountRange: { min: 0, max: 10000 }
  });

  const [sortBy, setSortBy] = useState('relevance');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<number | null>(null);

  const collections = [
    { value: 'customers', label: 'Customers' },
    { value: 'conversations', label: 'Conversations' },
    { value: 'orders', label: 'Orders' },
    { value: 'invoices', label: 'Invoices' },
    { value: 'approvals', label: 'Approvals' },
    { value: 'inventory', label: 'Inventory' },
    { value: 'users', label: 'Users' }
  ];

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ];

  const platformOptions = [
    { value: 'telegram', label: 'Telegram' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'web', label: 'Web' }
  ];

  const sortOptions = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'date', label: 'Date' },
    { value: 'amount', label: 'Amount' },
    { value: 'name', label: 'Name' }
  ];

  // Perform search
  const performSearch = useCallback(async (resetOffset = false) => {
    if (!query.trim()) {
      setResults([]);
      setTotalResults(0);
      return;
    }

    try {
      setLoading(true);
      
      const searchParams = {
        query,
        collections: selectedCollections,
        filters,
        sortBy,
        sortOrder,
        limit: 20,
        offset: resetOffset ? 0 : offset
      };

      const response = await apiService.performSearch(searchParams);
      
      if (resetOffset) {
        setResults(response.results);
        setOffset(0);
      } else {
        setResults(prev => [...prev, ...response.results]);
      }
      setTotalResults(response.total);
      setHasMore(response.hasMore);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed');
    } finally {
      setLoading(false);
    }
  }, [query, selectedCollections, filters, sortBy, sortOrder, offset]);

  // Get suggestions
  const getSuggestions = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const suggestions = await apiService.getSearchSuggestions(searchQuery, 8);
      setSuggestions(suggestions);
      setShowSuggestions(suggestions.length > 0);
    } catch (error) {
      console.error('Error getting suggestions:', error);
    }
  }, []);

  // Debounced search
  const debouncedSearch = useCallback(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      performSearch(true);
    }, 300);
  }, [performSearch]);

  // Handle query change
  useEffect(() => {
    debouncedSearch();
    getSuggestions(query);
  }, [query, debouncedSearch, getSuggestions]);

  // Handle collection selection
  const handleCollectionToggle = (collection: string) => {
    setSelectedCollections(prev => 
      prev.includes(collection) 
        ? prev.filter(c => c !== collection)
        : [...prev, collection]
    );
    setOffset(0);
  };

  // Handle filter changes
  const handleFilterChange = (key: keyof SearchFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    setOffset(0);
  };

  // Handle search
  const handleSearch = () => {
    performSearch(true);
  };

  // Clear search
  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setTotalResults(0);
    setHasMore(false);
    setOffset(0);
    setShowSuggestions(false);
    searchInputRef.current?.focus();
  };

  // Load more results
  const loadMore = () => {
    setOffset(prev => prev + 20);
    performSearch(false);
  };

  // Format result display
  const formatResultDisplay = (result: SearchResult) => {
    switch (result.collection) {
      case 'customers':
        return {
          title: result.name || result.customerName || 'Unknown Customer',
          subtitle: result.email || result.phone || 'No contact info',
          badge: result.platform || 'Unknown',
          icon: '👤'
        };
      case 'orders':
        return {
          title: `Order #${result.id || result.orderId || 'Unknown'}`,
          subtitle: `₹${result.totalAmount || result.amount || 0} - ${result.status || 'Unknown'}`,
          badge: result.status || 'Unknown',
          icon: '📦'
        };
      case 'invoices':
        return {
          title: `Invoice #${result.id || result.invoiceId || 'Unknown'}`,
          subtitle: `₹${result.totalAmount || result.amount || 0} - ${result.status || 'Unknown'}`,
          badge: result.status || 'Unknown',
          icon: '🧾'
        };
      case 'conversations':
        return {
          title: result.customerName || 'Conversation',
          subtitle: `${result.messages?.length || 0} messages`,
          badge: result.platform || 'Unknown',
          icon: '💬'
        };
      case 'approvals':
        return {
          title: `Approval #${result.id || 'Unknown'}`,
          subtitle: result.action || result.details?.intent || 'Unknown action',
          badge: result.status || 'Unknown',
          icon: '✅'
        };
      case 'inventory':
        return {
          title: result.name || result.productName || 'Unknown Product',
          subtitle: `Stock: ${result.quantity || 0} - ₹${result.price || 0}`,
          badge: result.category || 'Inventory',
          icon: '📦'
        };
      case 'users':
        return {
          title: result.name || result.username || 'Unknown User',
          subtitle: result.email || result.role || 'Unknown role',
          badge: result.status || 'User',
          icon: '👤'
        };
      default:
        return {
          title: 'Unknown',
          subtitle: 'No description available',
          badge: 'Unknown',
          icon: '📄'
        };
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            {/* Search Input */}
            <div className="relative">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search customers, orders, invoices, conversations..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-10 pr-10"
                />
                {query && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSearch}
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              {/* Suggestions Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setQuery(suggestion);
                        setShowSuggestions(false);
                        searchInputRef.current?.focus();
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-2">
              <Select
                value={sortBy}
                onValueChange={setSortBy}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={sortOrder}
                onValueChange={setSortOrder}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Newest First</SelectItem>
                  <SelectItem value="asc">Oldest First</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2"
              >
                <Filter className="h-4 w-4" />
                Filters
                {(Object.keys(filters).some(key => {
                  const value = filters[key as keyof SearchFilters];
                  return Array.isArray(value) ? value.length > 0 : value !== undefined;
                }) || selectedCollections.length > 0) && (
                  <Badge variant="secondary" className="h-5">
                    {selectedCollections.length + Object.keys(filters).length}
                  </Badge>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleSearch}
                disabled={loading}
              >
                {loading ? 'Searching...' : 'Search'}
              </Button>
            </div>

            {/* Collection Filters */}
            {selectedCollections.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCollections.map(collection => (
                  <Badge
                    key={collection}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => handleCollectionToggle(collection)}
                  >
                    {collections.find(c => c.value === collection)?.label || collection}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters Panel */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Search Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Collections */}
            <div>
              <h4 className="text-sm font-medium mb-3">Collections</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {collections.map(collection => (
                  <div key={collection.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={collection.value}
                      checked={selectedCollections.includes(collection.value)}
                      onCheckedChange={() => handleCollectionToggle(collection.value)}
                    />
                    <label htmlFor={collection.value} className="text-sm">
                      {collection.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div>
              <h4 className="text-sm font-medium mb-3">Date Range</h4>
              <Select
                value={filters.dateRange?.toString()}
                onValueChange={(value) => handleFilterChange('dateRange', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div>
              <h4 className="text-sm font-medium mb-3">Status</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {statusOptions.map(status => (
                  <div key={status.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={status.value}
                      checked={filters.status?.includes(status.value)}
                      onCheckedChange={(checked) => {
                        const current = filters.status || [];
                        if (checked) {
                          handleFilterChange('status', [...current, status.value]);
                        } else {
                          handleFilterChange('status', current.filter(s => s !== status.value));
                        }
                      }}
                    />
                    <label htmlFor={status.value} className="text-sm">
                      {status.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Platform Filter */}
            <div>
              <h4 className="text-sm font-medium mb-3">Platform</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {platformOptions.map(platform => (
                  <div key={platform.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={platform.value}
                      checked={filters.platform?.includes(platform.value)}
                      onCheckedChange={(checked) => {
                        const current = filters.platform || [];
                        if (checked) {
                          handleFilterChange('platform', [...current, platform.value]);
                        } else {
                          handleFilterChange('platform', current.filter(p => p !== platform.value));
                        }
                      }}
                    />
                    <label htmlFor={platform.value} className="text-sm">
                      {platform.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Amount Range */}
            <div>
              <h4 className="text-sm font-medium mb-3">Amount Range (₹)</h4>
              <div className="space-y-2">
                <div className="flex items-center space-x-4">
                  <span className="text-sm w-12">Min:</span>
                  <Slider
                    value={[filters.amountRange?.min || 0, filters.amountRange?.max || 10000]}
                    onValueChange={([min, max]) => handleFilterChange('amountRange', { min, max })}
                    max={10000}
                    step={100}
                    className="flex-1"
                  />
                  <span className="text-sm w-12 text-right">
                    ₹{filters.amountRange?.max || 10000}
                  </span>
                </div>
              </div>
            </div>

            {/* Clear Filters */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setFilters({
                    dateRange: 30,
                    status: [],
                    platform: [],
                    amountRange: { min: 0, max: 10000 }
                  });
                  setSelectedCollections([]);
                  setOffset(0);
                }}
              >
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Search Results</span>
            {totalResults > 0 && (
              <Badge variant="secondary">
                {totalResults} results
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : results.length === 0 && query ? (
            <div className="text-center py-8 text-gray-500">
              <SearchIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No results found for "{query}"</p>
              <p className="text-sm">Try adjusting your search terms or filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((result, index) => {
                const display = formatResultDisplay(result);
                return (
                  <div
                    key={`${result.collection}:${result.id}:${index}`}
                    className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => onResultClick?.(result)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="text-2xl">{display.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <h3 className="font-medium text-gray-900 truncate">
                              {display.title}
                            </h3>
                            {display.badge && (
                              <Badge variant="outline" className="text-xs">
                                {display.badge}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{display.subtitle}</p>
                          {result.createdAt && (
                            <p className="text-xs text-gray-500">
                              {formatDate(result.createdAt)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-gray-400">
                        Score: {result.score.toFixed(1)}
                      </div>
                    </div>
                    
                    {/* Highlights */}
                    {result.highlights && result.highlights.length > 0 && (
                      <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                        <p className="text-gray-600">
                          {result.highlights.map((highlight, index) => (
                            <span key={index} dangerouslySetInnerHTML={{ __html: highlight.context }} />
                          ))}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Load More */}
              {hasMore && (
                <div className="text-center py-4">
                  <Button
                    variant="outline"
                    onClick={loadMore}
                    disabled={loading}
                  >
                    {loading ? 'Loading...' : 'Load More Results'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SearchComponent;
