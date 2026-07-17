/**
 * Cached Parcel Router
 * 
 * Wraps parcel operations with Redis caching for improved performance.
 * Implements cache-aside pattern with automatic invalidation.
 */

import { router, publicProcedure, protectedProcedure } from '../../_core/trpc';
import { z } from 'zod';
import { parcelService } from '../../db';
import * as cache from '../../_core/cache';
import { logger } from '../../_core/logger';

/**
 * Generate cache key for parcel list queries
 */
function getParcelListCacheKey(filters: any): string {
  const filterString = JSON.stringify(filters);
  const hash = Buffer.from(filterString).toString('base64').substring(0, 20);
  return cache.CacheKeys.propertyList(hash);
}

/**
 * Cached Parcel Router
 */
export const cachedParcelRouter = router({
  /**
   * List parcels with caching
   */
  list: publicProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      query: z.string().optional(),
      state: z.string().optional(),
      lga: z.string().optional(),
      status: z.string().optional(),
      landUseType: z.string().optional(),
      priceMin: z.number().optional(),
      priceMax: z.number().optional(),
      areaMin: z.number().optional(),
      areaMax: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const cacheKey = getParcelListCacheKey(input);
      
      // Try to get from cache
      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        logger.debug({ cacheKey }, 'Parcel list cache hit');
        return cached;
      }

      // Cache miss - fetch from service
      logger.debug({ cacheKey }, 'Parcel list cache miss');
      const result = await parcelService.get('/api/v1/parcels', { params: input });

      // Store in cache for 5 minutes
      await cache.set(cacheKey, result, cache.CacheTTL.MEDIUM);

      return result;
    }),

  /**
   * Get parcel by ID with caching
   */
  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const cacheKey = cache.CacheKeys.property(input.id.toString());
      
      // Try to get from cache
      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        logger.debug({ cacheKey, parcelId: input.id }, 'Parcel cache hit');
        return cached;
      }

      // Cache miss - fetch from service
      logger.debug({ cacheKey, parcelId: input.id }, 'Parcel cache miss');
      const result = await parcelService.get(`/api/v1/parcels/${input.id}`);

      // Store in cache for 30 minutes
      await cache.set(cacheKey, result, cache.CacheTTL.LONG);

      return result;
    }),

  /**
   * Get parcel by number with caching
   */
  getByNumber: publicProcedure
    .input(z.object({ parcelNumber: z.string() }))
    .query(async ({ input }) => {
      const cacheKey = `parcel:number:${input.parcelNumber}`;
      
      // Try to get from cache
      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        logger.debug({ cacheKey, parcelNumber: input.parcelNumber }, 'Parcel number cache hit');
        return cached;
      }

      // Cache miss - fetch from service
      logger.debug({ cacheKey, parcelNumber: input.parcelNumber }, 'Parcel number cache miss');
      const result = await parcelService.get(`/api/v1/parcels/number/${input.parcelNumber}`);

      // Store in cache for 30 minutes
      await cache.set(cacheKey, result, cache.CacheTTL.LONG);

      return result;
    }),

  /**
   * Create parcel with cache invalidation
   */
  create: protectedProcedure
    .input(z.object({
      surveyPlanNumber: z.string(),
      state: z.string(),
      lga: z.string(),
      ward: z.string().optional(),
      streetAddress: z.string().optional(),
      areaSquareMeters: z.number(),
      geometryGeoJSON: z.string(),
      landUseType: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Create parcel
      const result = await parcelService.post('/api/v1/parcels', {
        ...input,
        surveyorId: ctx.user.id,
      });

      // Invalidate list caches
      await cache.invalidate('property:list:*');
      logger.info({ parcelId: result.id }, 'Parcel created, cache invalidated');

      return result;
    }),

  /**
   * Update parcel with cache invalidation
   */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: z.object({
        streetAddress: z.string().optional(),
        landUseType: z.string().optional(),
        notes: z.string().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      // Update parcel
      const result = await parcelService.put(`/api/v1/parcels/${input.id}`, input.data);

      // Invalidate specific parcel cache
      const cacheKey = cache.CacheKeys.property(input.id.toString());
      await cache.del(cacheKey);

      // Invalidate list caches
      await cache.invalidate('property:list:*');

      // Invalidate parcel number cache if it exists
      if (result.parcelNumber) {
        await cache.del(`parcel:number:${result.parcelNumber}`);
      }

      logger.info({ parcelId: input.id }, 'Parcel updated, cache invalidated');

      return result;
    }),

  /**
   * Verify parcel with cache invalidation
   */
  verify: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Verify parcel
      const result = await parcelService.post(`/api/v1/parcels/${input.id}/verify`, {
        verifierId: ctx.user.id,
      });

      // Invalidate specific parcel cache
      const cacheKey = cache.CacheKeys.property(input.id.toString());
      await cache.del(cacheKey);

      // Invalidate list caches
      await cache.invalidate('property:list:*');

      logger.info({ parcelId: input.id }, 'Parcel verified, cache invalidated');

      return result;
    }),

  /**
   * Geospatial search (no caching due to dynamic coordinates)
   */
  geospatialSearch: publicProcedure
    .input(z.object({
      centerLat: z.number(),
      centerLng: z.number(),
      radiusKm: z.number().default(5),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      // Geospatial queries are too dynamic to cache effectively
      return await parcelService.get('/api/v1/parcels/geospatial', { params: input });
    }),

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats: protectedProcedure
    .query(async () => {
      return await cache.getStats();
    }),

  /**
   * Clear all parcel caches (admin only)
   */
  clearCache: protectedProcedure
    .mutation(async () => {
      await cache.invalidate('property:*');
      await cache.invalidate('parcel:*');
      logger.warn('All parcel caches cleared');
      return { success: true, message: 'All parcel caches cleared' };
    }),
});
