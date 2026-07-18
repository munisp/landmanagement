import { getParcelById } from './parcelRepository';
import { readJsonStore, writeJsonStore } from './jsonStore';

export interface MarketplaceListingRecord {
  id: number;
  parcelId: number;
  sellerId: number;
  title: string;
  description: string;
  listingType: 'sale' | 'lease' | 'auction';
  price: string;
  currency: string;
  duration?: number | null;
  auctionEndDate?: string | null;
  minimumBid?: string | null;
  currentBid?: string | null;
  images: string[];
  features: string[];
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceBidRecord {
  id: number;
  listingId: number;
  bidderId: number;
  bidAmount: string;
  status: 'active' | 'outbid' | 'won';
  message?: string | null;
  createdAt: string;
}

export interface MarketplaceEscrowRecord {
  id: number;
  listingId: number;
  sellerId: number;
  buyerId: number;
  amount: string;
  status: 'pending' | 'funded' | 'released' | 'refunded';
  terms: string;
  paymentMethod?: 'card' | 'bank_transfer' | 'mojaloop' | null;
  paymentReference?: string | null;
  fundedAt?: string | null;
  releasedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceFavoriteRecord {
  id: number;
  userId: number;
  listingId: number;
  createdAt: string;
}

interface MarketplaceStore {
  listings: MarketplaceListingRecord[];
  bids: MarketplaceBidRecord[];
  escrow: MarketplaceEscrowRecord[];
  favorites: MarketplaceFavoriteRecord[];
  nextListingId: number;
  nextBidId: number;
  nextEscrowId: number;
  nextFavoriteId: number;
}


function seedStore(): MarketplaceStore {
  return {
    listings: [
      {
        id: 1,
        parcelId: 1,
        sellerId: 1,
        title: 'Prime Residential Parcel - Victoria Island',
        description: 'Verified coastal residential parcel with clean survey history, suitable for premium owner-occupier or redevelopment transactions.',
        listingType: 'sale',
        price: '165000000',
        currency: 'NGN',
        duration: 90,
        auctionEndDate: null,
        minimumBid: null,
        currentBid: null,
        images: ['https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200'],
        features: ['Verified title', 'Ocean corridor access', 'Mortgage eligible'],
        status: 'active',
        viewCount: 245,
        createdAt: '2024-04-01T09:00:00.000Z',
        updatedAt: '2024-04-01T09:00:00.000Z',
      },
      {
        id: 2,
        parcelId: 5,
        sellerId: 2,
        title: 'Maitama Premium Plot with Registry Clearance',
        description: 'High-value residential plot in Maitama with verified records and full registry visibility for institutional buyers.',
        listingType: 'sale',
        price: '255000000',
        currency: 'NGN',
        duration: 120,
        auctionEndDate: null,
        minimumBid: null,
        currentBid: null,
        images: ['https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200'],
        features: ['Prime district', 'Verified parcel', 'Suitable for luxury development'],
        status: 'active',
        viewCount: 189,
        createdAt: '2024-04-08T10:30:00.000Z',
        updatedAt: '2024-04-08T10:30:00.000Z',
      },
      {
        id: 3,
        parcelId: 4,
        sellerId: 4,
        title: 'Industrial Asset Auction - Ikeja Logistics Corridor',
        description: 'Industrial parcel cleared for secured lending and auctioned subject to registry transfer completion and payment escrow.',
        listingType: 'auction',
        price: '300000000',
        currency: 'NGN',
        duration: 30,
        auctionEndDate: '2026-05-31T15:00:00.000Z',
        minimumBid: '280000000',
        currentBid: '292500000',
        images: ['https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200'],
        features: ['Industrial zoning', 'Auction sale', 'Escrow supported'],
        status: 'active',
        viewCount: 412,
        createdAt: '2024-04-12T08:00:00.000Z',
        updatedAt: '2024-04-16T14:00:00.000Z',
      },
    ],
    bids: [
      {
        id: 1,
        listingId: 3,
        bidderId: 2,
        bidAmount: '287500000',
        status: 'outbid',
        message: 'Institutional bid subject to due diligence.',
        createdAt: '2024-04-13T11:00:00.000Z',
      },
      {
        id: 2,
        listingId: 3,
        bidderId: 3,
        bidAmount: '292500000',
        status: 'active',
        message: 'Best and final offer pending title transfer workflow.',
        createdAt: '2024-04-16T14:00:00.000Z',
      },
    ],
    escrow: [],
    favorites: [],
    nextListingId: 4,
    nextBidId: 3,
    nextEscrowId: 1,
    nextFavoriteId: 1,
  };
}

async function loadStore(): Promise<MarketplaceStore> {
  return readJsonStore<MarketplaceStore>('marketplace-store', seedStore);
}

async function saveStore(store: MarketplaceStore) {
  await writeJsonStore('marketplace-store', store);
}

export async function listMarketplaceListings(input: {
  listingType?: 'sale' | 'lease' | 'auction' | 'all';
  minPrice?: number;
  maxPrice?: number;
  status?: 'active' | 'sold' | 'cancelled' | 'expired' | 'all';
  page?: number;
  pageSize?: number;
}) {
  const store = await loadStore();
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;

  const filtered = store.listings.filter((listing) => {
    if (input.listingType && input.listingType !== 'all' && listing.listingType !== input.listingType) return false;
    if (input.status && input.status !== 'all' && listing.status !== input.status) return false;
    const price = parseFloat(listing.price);
    if (input.minPrice !== undefined && price < input.minPrice) return false;
    if (input.maxPrice !== undefined && price > input.maxPrice) return false;
    return true;
  });

  const sorted = filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const start = (page - 1) * pageSize;
  return {
    listings: sorted.slice(start, start + pageSize),
    total: sorted.length,
    page,
    pageSize,
  };
}

export async function getMarketplaceListing(listingId: number, incrementView = false) {
  const store = await loadStore();
  const listing = store.listings.find((item) => item.id === listingId) ?? null;
  if (!listing) return null;

  if (incrementView) {
    listing.viewCount += 1;
    listing.updatedAt = new Date().toISOString();
    await saveStore(store);
  }

  return listing;
}

export async function createMarketplaceListing(input: {
  parcelId: number;
  sellerId: number;
  title: string;
  description: string;
  listingType: 'sale' | 'lease' | 'auction';
  price: number;
  currency?: string;
  duration?: number;
  auctionEndDate?: string;
  minimumBid?: number;
  images?: string[];
  features?: string[];
}) {
  const parcel = await getParcelById(input.parcelId);
  if (!parcel) {
    throw new Error('Parcel not found');
  }

  const store = await loadStore();
  const now = new Date().toISOString();
  const listing: MarketplaceListingRecord = {
    id: store.nextListingId,
    parcelId: input.parcelId,
    sellerId: input.sellerId,
    title: input.title,
    description: input.description,
    listingType: input.listingType,
    price: String(input.price),
    currency: input.currency || 'NGN',
    duration: input.duration ?? null,
    auctionEndDate: input.auctionEndDate ?? null,
    minimumBid: input.minimumBid !== undefined ? String(input.minimumBid) : null,
    currentBid: null,
    images: input.images || [],
    features: input.features || [`${parcel.state} registry listing`],
    status: 'active',
    viewCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  store.listings.unshift(listing);
  store.nextListingId += 1;
  await saveStore(store);
  return listing;
}

export async function updateMarketplaceListing(input: {
  listingId: number;
  sellerId: number;
  title?: string;
  description?: string;
  price?: number;
  status?: 'active' | 'sold' | 'cancelled' | 'expired';
}) {
  const store = await loadStore();
  const listing = store.listings.find((item) => item.id === input.listingId);
  if (!listing) throw new Error('Listing not found');
  if (listing.sellerId !== input.sellerId) throw new Error('You do not own this listing');

  if (input.title) listing.title = input.title;
  if (input.description) listing.description = input.description;
  if (input.price !== undefined) listing.price = String(input.price);
  if (input.status) listing.status = input.status;
  listing.updatedAt = new Date().toISOString();
  await saveStore(store);
  return listing;
}

export function deleteMarketplaceListing(listingId: number, sellerId: number) {
  return updateMarketplaceListing({ listingId, sellerId, status: 'cancelled' });
}

export async function getMyMarketplaceListings(sellerId: number, status?: 'active' | 'sold' | 'cancelled' | 'expired' | 'all') {
  const listings = (await loadStore()).listings.filter((listing) => listing.sellerId === sellerId && (!status || status === 'all' || listing.status === status));
  return {
    listings,
    total: listings.length,
  };
}

export async function placeMarketplaceBid(input: {
  listingId: number;
  bidderId: number;
  bidAmount: number;
  message?: string;
}) {
  const store = await loadStore();
  const listing = store.listings.find((item) => item.id === input.listingId);
  if (!listing) throw new Error('Listing not found');
  if (listing.listingType !== 'auction') throw new Error('This listing is not an auction');
  if (listing.status !== 'active') throw new Error('This auction is no longer active');

  const minimumBid = listing.minimumBid ? parseFloat(listing.minimumBid) : 0;
  const currentBid = listing.currentBid ? parseFloat(listing.currentBid) : minimumBid;
  if (input.bidAmount <= currentBid) {
    throw new Error(`Bid must be higher than current bid of ${currentBid}`);
  }

  store.bids.forEach((bid) => {
    if (bid.listingId === input.listingId && bid.status === 'active') {
      bid.status = 'outbid';
    }
  });

  const bid: MarketplaceBidRecord = {
    id: store.nextBidId,
    listingId: input.listingId,
    bidderId: input.bidderId,
    bidAmount: String(input.bidAmount),
    status: 'active',
    message: input.message,
    createdAt: new Date().toISOString(),
  };

  store.bids.unshift(bid);
  store.nextBidId += 1;
  listing.currentBid = String(input.bidAmount);
  listing.updatedAt = bid.createdAt;
  await saveStore(store);
  return bid;
}

export async function getMarketplaceBids(listingId: number) {
  const bids = (await loadStore()).bids.filter((bid) => bid.listingId === listingId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return {
    bids,
    highestBid: bids.length > 0 ? parseFloat(bids[0].bidAmount) : 0,
  };
}

export async function getMyMarketplaceBids(bidderId: number) {
  const bids = (await loadStore()).bids.filter((bid) => bid.bidderId === bidderId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return {
    bids,
    total: bids.length,
  };
}

export async function createMarketplaceEscrow(input: {
  listingId: number;
  sellerId: number;
  buyerId: number;
  amount: number;
  terms: string;
}) {
  const store = await loadStore();
  const listing = store.listings.find((item) => item.id === input.listingId);
  if (!listing) throw new Error('Listing not found');

  const now = new Date().toISOString();
  const escrow: MarketplaceEscrowRecord = {
    id: store.nextEscrowId,
    listingId: input.listingId,
    sellerId: input.sellerId,
    buyerId: input.buyerId,
    amount: String(input.amount),
    status: 'pending',
    terms: input.terms,
    paymentMethod: null,
    paymentReference: null,
    fundedAt: null,
    releasedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  store.escrow.unshift(escrow);
  store.nextEscrowId += 1;
  await saveStore(store);
  return escrow;
}

export async function fundMarketplaceEscrow(input: {
  escrowId: number;
  buyerId: number;
  paymentMethod: 'card' | 'bank_transfer' | 'mojaloop';
  paymentReference: string;
}) {
  const store = await loadStore();
  const escrow = store.escrow.find((item) => item.id === input.escrowId);
  if (!escrow) throw new Error('Escrow not found');
  if (escrow.buyerId !== input.buyerId) throw new Error('Only the buyer can fund this escrow');

  const now = new Date().toISOString();
  escrow.status = 'funded';
  escrow.paymentMethod = input.paymentMethod;
  escrow.paymentReference = input.paymentReference;
  escrow.fundedAt = now;
  escrow.updatedAt = now;
  await saveStore(store);
  return escrow;
}

export async function releaseMarketplaceEscrow(input: {
  escrowId: number;
  releaseToSeller: boolean;
}) {
  const store = await loadStore();
  const escrow = store.escrow.find((item) => item.id === input.escrowId);
  if (!escrow) throw new Error('Escrow not found');

  const now = new Date().toISOString();
  escrow.status = input.releaseToSeller ? 'released' : 'refunded';
  escrow.releasedAt = now;
  escrow.updatedAt = now;

  const listing = store.listings.find((item) => item.id === escrow.listingId);
  if (listing && input.releaseToSeller) {
    listing.status = 'sold';
    listing.updatedAt = now;
  }

  await saveStore(store);
  return escrow;
}

export async function addMarketplaceFavorite(userId: number, listingId: number) {
  const store = await loadStore();
  const exists = store.favorites.find((favorite) => favorite.userId === userId && favorite.listingId === listingId);
  if (exists) return exists;

  const favorite: MarketplaceFavoriteRecord = {
    id: store.nextFavoriteId,
    userId,
    listingId,
    createdAt: new Date().toISOString(),
  };

  store.favorites.unshift(favorite);
  store.nextFavoriteId += 1;
  await saveStore(store);
  return favorite;
}

export async function removeMarketplaceFavorite(userId: number, listingId: number) {
  const store = await loadStore();
  store.favorites = store.favorites.filter((favorite) => !(favorite.userId === userId && favorite.listingId === listingId));
  await saveStore(store);
  return { success: true };
}

export async function getMarketplaceFavorites(userId: number) {
  const store = await loadStore();
  const listingIds = new Set(store.favorites.filter((favorite) => favorite.userId === userId).map((favorite) => favorite.listingId));
  const favorites = store.listings.filter((listing) => listingIds.has(listing.id));
  return {
    favorites,
    total: favorites.length,
  };
}
