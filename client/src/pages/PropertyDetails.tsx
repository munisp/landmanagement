import { useState } from 'react';
import { useRoute } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MapPin, Calendar, DollarSign, Eye, Heart, Clock, User, FileText } from 'lucide-react';
import { useAuth } from '@/_core/hooks/useAuth';

export default function PropertyDetails() {
  const [, params] = useRoute('/marketplace/:id');
  const listingId = params?.id ? parseInt(params.id) : 0;
  const { user } = useAuth();

  const [bidAmount, setBidAmount] = useState('');
  const [bidMessage, setBidMessage] = useState('');
  const [escrowDialogOpen, setEscrowDialogOpen] = useState(false);
  const [escrowTerms, setEscrowTerms] = useState('');

  const { data: listing, isLoading } = trpc.marketplace.getListing.useQuery({ listingId });
  const { data: bidsData } = trpc.marketplace.getBids.useQuery(
    { listingId },
    { enabled: listing?.listingType === 'auction' }
  );

  const placeBid = trpc.marketplace.placeBid.useMutation({
    onSuccess: () => {
      setBidAmount('');
      setBidMessage('');
      alert('Bid placed successfully!');
    },
  });

  const createEscrow = trpc.marketplace.createEscrow.useMutation({
    onSuccess: () => {
      setEscrowDialogOpen(false);
      alert('Escrow created successfully!');
    },
  });

  const addFavorite = trpc.marketplace.addFavorite.useMutation({
    onSuccess: () => alert('Added to favorites!'),
  });

  const handlePlaceBid = async () => {
    if (!bidAmount || parseFloat(bidAmount) <= 0) {
      alert('Please enter a valid bid amount');
      return;
    }

    try {
      await placeBid.mutateAsync({
        listingId,
        bidAmount: parseFloat(bidAmount),
        message: bidMessage,
      });
    } catch (error: any) {
      alert(error.message || 'Failed to place bid');
    }
  };

  const handleCreateEscrow = async () => {
    if (!user || !listing) return;

    try {
      await createEscrow.mutateAsync({
        listingId,
        buyerId: user.id,
        amount: parseFloat(listing.price),
        terms: escrowTerms,
      });
    } catch (error: any) {
      alert(error.message || 'Failed to create escrow');
    }
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <Card className="animate-pulse">
          <div className="h-96 bg-muted" />
          <CardHeader>
            <div className="h-8 bg-muted rounded mb-4" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Property Not Found</CardTitle>
            <CardDescription>The property you're looking for doesn't exist.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isAuction = listing.listingType === 'auction';
  const currentBid = listing.currentBid ? parseFloat(listing.currentBid) : 0;
  const minimumBid = listing.minimumBid ? parseFloat(listing.minimumBid) : 0;

  return (
    <div className="container py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Image Gallery */}
          <Card>
            <CardContent className="p-0">
              {listing.images && listing.images.length > 0 ? (
                <div className="relative">
                  <img
                    src={listing.images[0]}
                    alt={listing.title}
                    className="w-full h-96 object-cover rounded-t-lg"
                  />
                  <Badge className="absolute top-4 right-4 text-lg">
                    {listing.listingType}
                  </Badge>
                </div>
              ) : (
                <div className="w-full h-96 bg-muted flex items-center justify-center rounded-t-lg">
                  <MapPin className="h-24 w-24 text-muted-foreground" />
                </div>
              )}
              
              {listing.images && listing.images.length > 1 && (
                <div className="grid grid-cols-4 gap-2 p-4">
                  {listing.images.slice(1, 5).map((img: string, idx: number) => (
                    <img
                      key={idx}
                      src={img}
                      alt={`Property ${idx + 2}`}
                      className="w-full h-24 object-cover rounded cursor-pointer hover:opacity-80"
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Property Details */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-3xl mb-2">{listing.title}</CardTitle>
                  <CardDescription className="flex items-center gap-4">
                    <span className="flex items-center">
                      <Eye className="h-4 w-4 mr-1" />
                      {listing.viewCount || 0} views
                    </span>
                    <span className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      Listed {new Date(listing.createdAt).toLocaleDateString()}
                    </span>
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => addFavorite.mutate({ listingId })}
                >
                  <Heart className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              <Tabs defaultValue="description">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="description">Description</TabsTrigger>
                  <TabsTrigger value="features">Features</TabsTrigger>
                  {isAuction && <TabsTrigger value="bids">Bids ({bidsData?.bids.length || 0})</TabsTrigger>}
                </TabsList>

                <TabsContent value="description" className="space-y-4">
                  <p className="text-muted-foreground leading-relaxed">
                    {listing.description}
                  </p>

                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <div>
                      <h4 className="font-semibold mb-2">Property Type</h4>
                      <p className="text-muted-foreground capitalize">{listing.listingType}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Status</h4>
                      <Badge>{listing.status}</Badge>
                    </div>
                    {listing.duration && (
                      <div>
                        <h4 className="font-semibold mb-2">Lease Duration</h4>
                        <p className="text-muted-foreground">{listing.duration} months</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="features">
                  {listing.features && listing.features.length > 0 ? (
                    <ul className="grid grid-cols-2 gap-3">
                      {listing.features.map((feature: string, idx: number) => (
                        <li key={idx} className="flex items-center">
                          <span className="h-2 w-2 bg-primary rounded-full mr-2" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">No features listed</p>
                  )}
                </TabsContent>

                {isAuction && (
                  <TabsContent value="bids" className="space-y-3">
                    {bidsData?.bids && bidsData.bids.length > 0 ? (
                      bidsData.bids.map((bid: any) => (
                        <Card key={bid.id}>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-semibold">
                                  {listing.currency} {parseFloat(bid.bidAmount).toLocaleString()}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(bid.createdAt).toLocaleString()}
                                </p>
                                {bid.message && (
                                  <p className="text-sm mt-1">{bid.message}</p>
                                )}
                              </div>
                              <Badge variant={bid.status === 'active' ? 'default' : 'secondary'}>
                                {bid.status}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <p className="text-muted-foreground">No bids yet. Be the first to bid!</p>
                    )}
                  </TabsContent>
                )}
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Price Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl">
                {listing.currency} {parseFloat(listing.price).toLocaleString()}
              </CardTitle>
              {isAuction && (
                <CardDescription>
                  {currentBid > 0 ? (
                    <>
                      Current Bid: {listing.currency} {currentBid.toLocaleString()}
                    </>
                  ) : (
                    <>
                      Starting Bid: {listing.currency} {minimumBid.toLocaleString()}
                    </>
                  )}
                </CardDescription>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              {isAuction && listing.auctionEndDate && (
                <div className="flex items-center text-sm">
                  <Clock className="h-4 w-4 mr-2" />
                  <span>
                    Ends: {new Date(listing.auctionEndDate).toLocaleString()}
                  </span>
                </div>
              )}

              {isAuction ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Your Bid Amount</label>
                    <Input
                      type="number"
                      placeholder={`Min: ${Math.max(currentBid, minimumBid) + 1}`}
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Message (Optional)</label>
                    <Textarea
                      placeholder="Add a message with your bid..."
                      value={bidMessage}
                      onChange={(e) => setBidMessage(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={handlePlaceBid}
                    disabled={!user || placeBid.isPending}
                  >
                    {placeBid.isPending ? 'Placing Bid...' : 'Place Bid'}
                  </Button>
                </>
              ) : (
                <>
                  <Dialog open={escrowDialogOpen} onOpenChange={setEscrowDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full" disabled={!user}>
                        <DollarSign className="h-4 w-4 mr-2" />
                        Buy with Escrow
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create Escrow</DialogTitle>
                        <DialogDescription>
                          Secure your purchase with escrow protection
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">Amount</label>
                          <p className="text-2xl font-bold">
                            {listing.currency} {parseFloat(listing.price).toLocaleString()}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Terms & Conditions</label>
                          <Textarea
                            placeholder="Enter escrow terms..."
                            value={escrowTerms}
                            onChange={(e) => setEscrowTerms(e.target.value)}
                            rows={4}
                          />
                        </div>
                        <Button
                          className="w-full"
                          onClick={handleCreateEscrow}
                          disabled={!escrowTerms || createEscrow.isPending}
                        >
                          {createEscrow.isPending ? 'Creating...' : 'Create Escrow'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button variant="outline" className="w-full">
                    <FileText className="h-4 w-4 mr-2" />
                    Contact Seller
                  </Button>
                </>
              )}

              {!user && (
                <p className="text-sm text-muted-foreground text-center">
                  Please log in to {isAuction ? 'place a bid' : 'make a purchase'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Seller Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <User className="h-5 w-5 mr-2" />
                Seller Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Seller ID: {listing.sellerId}
              </p>
              <Button variant="outline" className="w-full mt-4">
                View Seller Profile
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
