import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { MapPin, Calendar, DollarSign, Eye, Heart } from 'lucide-react';

export default function MarketplaceListing() {
  const [listingType, setListingType] = useState<'all' | 'sale' | 'lease' | 'auction'>('all');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [page, setPage] = useState(1);
  const [comparisonIds, setComparisonIds] = useState<number[]>([]);

  const { data, isLoading } = trpc.marketplace.getListings.useQuery({
    listingType,
    minPrice: minPrice ? parseFloat(minPrice) : undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    status: 'active',
    page,
    pageSize: 12,
  });

  const addFavorite = trpc.marketplace.addFavorite.useMutation();

  const handleAddFavorite = async (listingId: number) => {
    try {
      await addFavorite.mutateAsync({ listingId });
      alert('Added to favorites!');
    } catch (error) {
      alert('Failed to add to favorites');
    }
  };

  const comparisonListings = (data?.listings || []).filter((listing: any) => comparisonIds.includes(listing.id));

  const toggleComparison = (listingId: number) => {
    setComparisonIds((current) => {
      if (current.includes(listingId)) {
        return current.filter((id) => id !== listingId);
      }
      if (current.length >= 3) {
        return [...current.slice(1), listingId];
      }
      return [...current, listingId];
    });
  };

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Property Marketplace</h1>
        <p className="text-muted-foreground">
          Browse available properties for sale, lease, or auction
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Filter Properties</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Listing Type</label>
              <Select value={listingType} onValueChange={(value: any) => setListingType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="sale">For Sale</SelectItem>
                  <SelectItem value="lease">For Lease</SelectItem>
                  <SelectItem value="auction">Auction</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Min Price</label>
              <Input
                type="number"
                placeholder="Min price"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Max Price</label>
              <Input
                type="number"
                placeholder="Max price"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setListingType('all');
                  setMinPrice('');
                  setMaxPrice('');
                  setPage(1);
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {comparisonListings.length >= 2 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Property Comparison</CardTitle>
            <CardDescription>Compare up to three active marketplace listings side by side.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">Field</th>
                    {comparisonListings.map((listing: any) => (
                      <th key={listing.id} className="text-left py-2 pr-4 font-medium min-w-[220px]">{listing.title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Type', getter: (listing: any) => listing.listingType },
                    { label: 'Price', getter: (listing: any) => `${listing.currency} ${parseFloat(listing.price).toLocaleString()}` },
                    { label: 'Status', getter: (listing: any) => listing.status },
                    { label: 'Views', getter: (listing: any) => String(listing.viewCount || 0) },
                    { label: 'Current Bid', getter: (listing: any) => listing.currentBid ? `${listing.currency} ${parseFloat(listing.currentBid).toLocaleString()}` : 'N/A' },
                    { label: 'Auction End', getter: (listing: any) => listing.auctionEndDate ? new Date(listing.auctionEndDate).toLocaleDateString() : 'N/A' },
                    { label: 'Description', getter: (listing: any) => listing.description || 'N/A' },
                  ].map((field) => (
                    <tr key={field.label} className="border-b align-top">
                      <td className="py-2 pr-4 font-medium">{field.label}</td>
                      {comparisonListings.map((listing: any) => (
                        <td key={`${listing.id}-${field.label}`} className="py-2 pr-4 text-muted-foreground">{field.getter(listing)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Listings Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-48 bg-muted" />
              <CardHeader>
                <div className="h-6 bg-muted rounded mb-2" />
                <div className="h-4 bg-muted rounded w-2/3" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data?.listings.map((listing: any) => (
              <Card key={listing.id} className="hover:shadow-lg transition-shadow">
                <div className="relative">
                  {listing.images && listing.images.length > 0 ? (
                    <img
                      src={listing.images[0]}
                      alt={listing.title}
                      className="w-full h-48 object-cover rounded-t-lg"
                    />
                  ) : (
                    <div className="w-full h-48 bg-muted flex items-center justify-center rounded-t-lg">
                      <MapPin className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  <Badge className="absolute top-2 right-2">
                    {listing.listingType}
                  </Badge>
                </div>

                <CardHeader>
                  <CardTitle className="line-clamp-1">{listing.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {listing.description}
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold">
                        {listing.currency} {parseFloat(listing.price).toLocaleString()}
                      </span>
                    </div>

                    {listing.listingType === 'auction' && listing.auctionEndDate && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4 mr-1" />
                        Ends: {new Date(listing.auctionEndDate).toLocaleDateString()}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <Eye className="h-4 w-4 mr-1" />
                        {listing.viewCount || 0} views
                      </div>
                      {listing.currentBid && (
                        <div className="flex items-center">
                          <DollarSign className="h-4 w-4 mr-1" />
                          Current: {listing.currency} {parseFloat(listing.currentBid).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="flex gap-2">
                  <Link href={`/marketplace/${listing.id}`} className="flex-1">
                    <Button className="w-full">View Details</Button>
                  </Link>
                  <Button
                    variant={comparisonIds.includes(listing.id) ? 'secondary' : 'outline'}
                    onClick={() => toggleComparison(listing.id)}
                  >
                    Compare
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleAddFavorite(listing.id)}
                  >
                    <Heart className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {data && data.total > data.pageSize && (
            <div className="flex justify-center gap-2 mt-8">
              <Button
                variant="outline"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="flex items-center px-4">
                Page {page} of {Math.ceil(data.total / data.pageSize)}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(data.total / data.pageSize)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
