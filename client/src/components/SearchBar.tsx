import { useState, useEffect, useRef } from 'react';
import { Search, Filter, X, MapPin, FileText, Receipt } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useLocation } from 'wouter';

interface SearchFilters {
  type: 'all' | 'parcels' | 'transactions' | 'documents';
  city?: string;
  state?: string;
  landUse?: string;
  transactionType?: string;
  documentType?: string;
  minAmount?: number;
  maxAmount?: number;
  startDate?: string;
  endDate?: string;
}

interface SearchBarProps {
  onSearch?: (query: string, filters: SearchFilters) => void;
  placeholder?: string;
  showFilters?: boolean;
}

export function SearchBar({ 
  onSearch, 
  placeholder = 'Search parcels, transactions, documents...', 
  showFilters = true 
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({ type: 'all' });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  // Debounce query for autocomplete
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Get autocomplete suggestions
  const { data: suggestions } = trpc.search.autocomplete.useQuery(
    { query: debouncedQuery, type: filters.type },
    { enabled: debouncedQuery.length >= 2 }
  );

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = () => {
    if (query.trim()) {
      onSearch?.(query, filters);
      setShowSuggestions(false);
      setLocation(`/search?q=${encodeURIComponent(query)}&type=${filters.type}`);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleSuggestionClick = (suggestion: any) => {
    setQuery(suggestion.text);
    setShowSuggestions(false);
    
    // Navigate directly to the item
    if (suggestion.type === 'parcel') {
      setLocation(`/parcels/${suggestion.id}`);
    } else if (suggestion.type === 'transaction') {
      setLocation(`/transactions/${suggestion.id}`);
    } else if (suggestion.type === 'document') {
      setLocation(`/documents/${suggestion.id}`);
    }
  };

  const clearFilters = () => {
    setFilters({ type: 'all' });
  };

  const activeFilterCount = Object.keys(filters).filter(
    key => key !== 'type' && filters[key as keyof SearchFilters]
  ).length;

  return (
    <div ref={searchRef} className="relative w-full max-w-3xl">
      <div className="flex gap-2">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onKeyPress={handleKeyPress}
            onFocus={() => setShowSuggestions(true)}
            className="pl-10 pr-4"
          />
          
          {/* Autocomplete Suggestions */}
          {showSuggestions && suggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-96 overflow-y-auto">
              {suggestions.map((suggestion: any, index: number) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full px-4 py-3 text-left hover:bg-accent flex items-start gap-3 border-b last:border-b-0"
                >
                  {suggestion.type === 'parcel' && <MapPin className="h-4 w-4 mt-0.5 text-blue-500" />}
                  {suggestion.type === 'transaction' && <Receipt className="h-4 w-4 mt-0.5 text-green-500" />}
                  {suggestion.type === 'document' && <FileText className="h-4 w-4 mt-0.5 text-purple-500" />}
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{suggestion.text}</div>
                    {suggestion.subtitle && (
                      <div className="text-sm text-muted-foreground truncate">
                        {suggestion.subtitle}
                      </div>
                    )}
                  </div>
                  
                  <Badge variant="outline" className="shrink-0">
                    {suggestion.type}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search Button */}
        <Button onClick={handleSearch} disabled={!query.trim()}>
          Search
        </Button>

        {/* Filters Button */}
        {showFilters && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="relative">
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center"
                  >
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Search Filters</h3>
                  {activeFilterCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="h-4 w-4 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>

                {/* Search Type */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Search In</label>
                  <Select
                    value={filters.type}
                    onValueChange={(value: any) => setFilters({ ...filters, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="parcels">Parcels</SelectItem>
                      <SelectItem value="transactions">Transactions</SelectItem>
                      <SelectItem value="documents">Documents</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Parcel Filters */}
                {(filters.type === 'all' || filters.type === 'parcels') && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">City</label>
                      <Input
                        placeholder="Enter city"
                        value={filters.city || ''}
                        onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">State</label>
                      <Input
                        placeholder="Enter state"
                        value={filters.state || ''}
                        onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Land Use</label>
                      <Select
                        value={filters.landUse || 'any'}
                        onValueChange={(value) => 
                          setFilters({ ...filters, landUse: value === 'any' ? undefined : value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any</SelectItem>
                          <SelectItem value="residential">Residential</SelectItem>
                          <SelectItem value="commercial">Commercial</SelectItem>
                          <SelectItem value="agricultural">Agricultural</SelectItem>
                          <SelectItem value="industrial">Industrial</SelectItem>
                          <SelectItem value="mixed">Mixed Use</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {/* Transaction Filters */}
                {(filters.type === 'all' || filters.type === 'transactions') && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Transaction Type</label>
                      <Select
                        value={filters.transactionType || 'any'}
                        onValueChange={(value) => 
                          setFilters({ ...filters, transactionType: value === 'any' ? undefined : value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any</SelectItem>
                          <SelectItem value="registration">Registration</SelectItem>
                          <SelectItem value="transfer">Transfer</SelectItem>
                          <SelectItem value="mortgage">Mortgage</SelectItem>
                          <SelectItem value="lease">Lease</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Min Amount</label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={filters.minAmount || ''}
                          onChange={(e) => setFilters({ ...filters, minAmount: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Max Amount</label>
                        <Input
                          type="number"
                          placeholder="Any"
                          value={filters.maxAmount || ''}
                          onChange={(e) => setFilters({ ...filters, maxAmount: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Document Filters */}
                {(filters.type === 'all' || filters.type === 'documents') && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Document Type</label>
                    <Select
                      value={filters.documentType || 'any'}
                      onValueChange={(value) => 
                        setFilters({ ...filters, documentType: value === 'any' ? undefined : value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="title_deed">Title Deed</SelectItem>
                        <SelectItem value="survey">Survey</SelectItem>
                        <SelectItem value="certificate">Certificate</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button onClick={handleSearch} className="w-full">
                  Apply Filters
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Active Filters Display */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {filters.city && (
            <Badge variant="secondary">
              City: {filters.city}
              <button
                onClick={() => setFilters({ ...filters, city: undefined })}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.state && (
            <Badge variant="secondary">
              State: {filters.state}
              <button
                onClick={() => setFilters({ ...filters, state: undefined })}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.landUse && (
            <Badge variant="secondary">
              Land Use: {filters.landUse}
              <button
                onClick={() => setFilters({ ...filters, landUse: undefined })}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.transactionType && (
            <Badge variant="secondary">
              Type: {filters.transactionType}
              <button
                onClick={() => setFilters({ ...filters, transactionType: undefined })}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
