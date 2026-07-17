import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, protectedProcedure, router } from '../../_core/trpc';
import {
  addMarketplaceFavorite,
  createMarketplaceEscrow,
  createMarketplaceListing,
  deleteMarketplaceListing,
  fundMarketplaceEscrow,
  getMarketplaceBids,
  getMarketplaceFavorites,
  getMarketplaceListing,
  getMyMarketplaceBids,
  getMyMarketplaceListings,
  listMarketplaceListings,
  placeMarketplaceBid,
  releaseMarketplaceEscrow,
  removeMarketplaceFavorite,
  updateMarketplaceListing,
} from '../../marketplaceRepository';

export const marketplaceRouter = router({
  /**
   * Create property listing
   */
  createListing: protectedProcedure
    .input(
      z.object({
        parcelId: z.number(),
        title: z.string().min(10),
        description: z.string().min(50),
        listingType: z.enum(['sale', 'lease', 'auction']),
        price: z.number().positive(),
        currency: z.string().default('NGN'),
        duration: z.number().optional(),
        auctionEndDate: z.string().optional(),
        minimumBid: z.number().optional(),
        images: z.array(z.string().url()).optional(),
        features: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const listing = createMarketplaceListing({
          ...input,
          sellerId: Number(ctx.user.id),
        });

        return {
          success: true,
          listing,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: error?.message === 'Parcel not found' ? 'NOT_FOUND' : 'BAD_REQUEST',
          message: error?.message || 'Unable to create listing',
        });
      }
    }),

  /**
   * Get all active listings
   */
  getListings: publicProcedure
    .input(
      z.object({
        listingType: z.enum(['sale', 'lease', 'auction', 'all']).default('all'),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
        status: z.enum(['active', 'sold', 'cancelled', 'expired', 'all']).default('active'),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      return listMarketplaceListings(input);
    }),

  /**
   * Get listing by ID
   */
  getListing: publicProcedure
    .input(z.object({ listingId: z.number() }))
    .query(async ({ input }) => {
      const listing = getMarketplaceListing(input.listingId, true);
      if (!listing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Listing not found',
        });
      }
      return listing;
    }),

  /**
   * Place bid on auction
   */
  placeBid: protectedProcedure
    .input(
      z.object({
        listingId: z.number(),
        bidAmount: z.number().positive(),
        message: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const bid = placeMarketplaceBid({
          listingId: input.listingId,
          bidderId: Number(ctx.user.id),
          bidAmount: input.bidAmount,
          message: input.message,
        });

        return {
          success: true,
          bid,
          message: 'Bid placed successfully',
        };
      } catch (error: any) {
        const message = error?.message || 'Unable to place bid';
        throw new TRPCError({
          code: message === 'Listing not found' ? 'NOT_FOUND' : 'BAD_REQUEST',
          message,
        });
      }
    }),

  /**
   * Get bids for a listing
   */
  getBids: publicProcedure
    .input(z.object({ listingId: z.number() }))
    .query(async ({ input }) => {
      return getMarketplaceBids(input.listingId);
    }),

  /**
   * Create escrow for transaction
   */
  createEscrow: protectedProcedure
    .input(
      z.object({
        listingId: z.number(),
        buyerId: z.number(),
        amount: z.number().positive(),
        terms: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const listing = getMarketplaceListing(input.listingId, false);
      if (!listing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Listing not found' });
      }

      try {
        const escrow = createMarketplaceEscrow({
          listingId: input.listingId,
          sellerId: Number(ctx.user.id),
          buyerId: input.buyerId,
          amount: input.amount,
          terms: input.terms,
        });

        return {
          success: true,
          escrow,
          message: 'Escrow created successfully',
        };
      } catch (error: any) {
        throw new TRPCError({
          code: error?.message === 'Listing not found' ? 'NOT_FOUND' : 'BAD_REQUEST',
          message: error?.message || 'Unable to create escrow',
        });
      }
    }),

  /**
   * Fund escrow (buyer deposits funds)
   */
  fundEscrow: protectedProcedure
    .input(
      z.object({
        escrowId: z.number(),
        paymentMethod: z.enum(['card', 'bank_transfer', 'mojaloop']),
        paymentReference: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const escrow = fundMarketplaceEscrow({
          escrowId: input.escrowId,
          buyerId: Number(ctx.user.id),
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference,
        });

        return {
          success: true,
          message: 'Escrow funded successfully',
          escrowId: escrow.id,
          status: escrow.status,
        };
      } catch (error: any) {
        const message = error?.message || 'Unable to fund escrow';
        throw new TRPCError({
          code: message === 'Escrow not found' ? 'NOT_FOUND' : message === 'Only the buyer can fund this escrow' ? 'FORBIDDEN' : 'BAD_REQUEST',
          message,
        });
      }
    }),

  /**
   * Release escrow (after conditions met)
   */
  releaseEscrow: protectedProcedure
    .input(
      z.object({
        escrowId: z.number(),
        releaseToSeller: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const escrow = releaseMarketplaceEscrow({
          escrowId: input.escrowId,
          releaseToSeller: input.releaseToSeller,
        });

        return {
          success: true,
          message: input.releaseToSeller ? 'Funds released to seller' : 'Funds refunded to buyer',
          escrowId: escrow.id,
          status: escrow.status,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: error?.message === 'Escrow not found' ? 'NOT_FOUND' : 'BAD_REQUEST',
          message: error?.message || 'Unable to release escrow',
        });
      }
    }),

  /**
   * Get user's listings
   */
  getMyListings: protectedProcedure
    .input(
      z.object({
        status: z.enum(['active', 'sold', 'cancelled', 'expired', 'all']).default('all'),
      })
    )
    .query(async ({ input, ctx }) => {
      return getMyMarketplaceListings(Number(ctx.user.id), input.status);
    }),

  /**
   * Get user's bids
   */
  getMyBids: protectedProcedure.query(async ({ ctx }) => {
    return getMyMarketplaceBids(Number(ctx.user.id));
  }),

  /**
   * Update listing
   */
  updateListing: protectedProcedure
    .input(
      z.object({
        listingId: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        price: z.number().optional(),
        status: z.enum(['active', 'sold', 'cancelled', 'expired']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        updateMarketplaceListing({
          ...input,
          sellerId: Number(ctx.user.id),
        });

        return {
          success: true,
          message: 'Listing updated successfully',
        };
      } catch (error: any) {
        const message = error?.message || 'Unable to update listing';
        throw new TRPCError({
          code: message === 'Listing not found' ? 'NOT_FOUND' : message === 'You do not own this listing' ? 'FORBIDDEN' : 'BAD_REQUEST',
          message,
        });
      }
    }),

  /**
   * Delete listing
   */
  deleteListing: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        deleteMarketplaceListing(input.listingId, Number(ctx.user.id));
        return {
          success: true,
          message: 'Listing deleted successfully',
        };
      } catch (error: any) {
        const message = error?.message || 'Unable to delete listing';
        throw new TRPCError({
          code: message === 'Listing not found' ? 'NOT_FOUND' : message === 'You do not own this listing' ? 'FORBIDDEN' : 'BAD_REQUEST',
          message,
        });
      }
    }),

  /**
   * Add listing to favorites
   */
  addFavorite: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      addMarketplaceFavorite(Number(ctx.user.id), input.listingId);
      return {
        success: true,
        message: 'Added to favorites',
      };
    }),

  /**
   * Remove listing from favorites
   */
  removeFavorite: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      removeMarketplaceFavorite(Number(ctx.user.id), input.listingId);
      return {
        success: true,
        message: 'Removed from favorites',
      };
    }),

  /**
   * Get user's favorite listings
   */
  getMyFavorites: protectedProcedure.query(async ({ ctx }) => {
    return getMarketplaceFavorites(Number(ctx.user.id));
  }),
});
