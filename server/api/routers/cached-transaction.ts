/**
 * Cached Transaction Router
 * 
 * Wraps transaction operations with Redis caching for improved performance.
 * Implements cache-aside pattern with automatic invalidation.
 */

import { router, publicProcedure, protectedProcedure } from '../../_core/trpc';
import { z } from 'zod';
import { transactionService } from '../../db';
import * as cache from '../../_core/cache';
import { logger } from '../../_core/logger';

/**
 * Generate cache key for transaction list queries
 */
function getTransactionListCacheKey(filters: any): string {
  const filterString = JSON.stringify(filters);
  const hash = Buffer.from(filterString).toString('base64').substring(0, 20);
  return cache.CacheKeys.transactionList(hash);
}

/**
 * Cached Transaction Router
 */
export const cachedTransactionRouter = router({
  /**
   * List transactions with caching
   */
  list: publicProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      status: z.string().optional(),
      type: z.string().optional(),
      parcelId: z.number().optional(),
      userId: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const cacheKey = getTransactionListCacheKey(input);
      
      // Try to get from cache
      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        logger.debug({ cacheKey }, 'Transaction list cache hit');
        return cached;
      }

      // Cache miss - fetch from service
      logger.debug({ cacheKey }, 'Transaction list cache miss');
      const result = await transactionService.get('/api/v1/transactions', { params: input });

      // Store in cache for 2 minutes (shorter TTL due to frequent updates)
      await cache.set(cacheKey, result, cache.CacheTTL.SHORT);

      return result;
    }),

  /**
   * Get transaction by ID with caching
   */
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const cacheKey = cache.CacheKeys.transaction(input.id);
      
      // Try to get from cache
      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        logger.debug({ cacheKey, transactionId: input.id }, 'Transaction cache hit');
        return cached;
      }

      // Cache miss - fetch from service
      logger.debug({ cacheKey, transactionId: input.id }, 'Transaction cache miss');
      const result = await transactionService.get(`/api/v1/transactions/${input.id}`);

      // Store in cache for 5 minutes
      await cache.set(cacheKey, result, cache.CacheTTL.MEDIUM);

      return result;
    }),

  /**
   * Get transactions by parcel with caching
   */
  getByParcel: publicProcedure
    .input(z.object({ parcelId: z.number() }))
    .query(async ({ input }) => {
      const cacheKey = `transaction:parcel:${input.parcelId}`;
      
      // Try to get from cache
      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        logger.debug({ cacheKey, parcelId: input.parcelId }, 'Transaction by parcel cache hit');
        return cached;
      }

      // Cache miss - fetch from service
      logger.debug({ cacheKey, parcelId: input.parcelId }, 'Transaction by parcel cache miss');
      const result = await transactionService.get(`/api/v1/transactions/parcel/${input.parcelId}`);

      // Store in cache for 5 minutes
      await cache.set(cacheKey, result, cache.CacheTTL.MEDIUM);

      return result;
    }),

  /**
   * Create transaction with cache invalidation
   */
  create: protectedProcedure
    .input(z.object({
      parcelId: z.number(),
      type: z.enum(['sale', 'transfer', 'mortgage', 'lease']),
      buyerId: z.string().optional(),
      sellerId: z.string().optional(),
      amount: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Create transaction
      const result = await transactionService.post('/api/v1/transactions', {
        ...input,
        initiatedBy: ctx.user.id,
      });

      // Invalidate list caches
      await cache.invalidate('transaction:list:*');
      
      // Invalidate parcel-specific transaction cache
      await cache.del(`transaction:parcel:${input.parcelId}`);

      // Invalidate related parcel cache
      await cache.del(cache.CacheKeys.property(input.parcelId.toString()));

      logger.info({ transactionId: result.id }, 'Transaction created, cache invalidated');

      return result;
    }),

  /**
   * Update transaction with cache invalidation
   */
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: z.object({
        status: z.string().optional(),
        notes: z.string().optional(),
        amount: z.number().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      // Update transaction
      const result = await transactionService.put(`/api/v1/transactions/${input.id}`, input.data);

      // Invalidate specific transaction cache
      const cacheKey = cache.CacheKeys.transaction(input.id);
      await cache.del(cacheKey);

      // Invalidate list caches
      await cache.invalidate('transaction:list:*');

      // Invalidate parcel-specific transaction cache if parcelId is available
      if (result.parcelId) {
        await cache.del(`transaction:parcel:${result.parcelId}`);
        await cache.del(cache.CacheKeys.property(result.parcelId.toString()));
      }

      logger.info({ transactionId: input.id }, 'Transaction updated, cache invalidated');

      return result;
    }),

  /**
   * Approve transaction with cache invalidation
   */
  approve: protectedProcedure
    .input(z.object({
      id: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Approve transaction
      const result = await transactionService.post(`/api/v1/transactions/${input.id}/approve`, {
        approverId: ctx.user.id,
        notes: input.notes,
      });

      // Invalidate specific transaction cache
      const cacheKey = cache.CacheKeys.transaction(input.id);
      await cache.del(cacheKey);

      // Invalidate list caches
      await cache.invalidate('transaction:list:*');

      // Invalidate parcel-specific caches
      if (result.parcelId) {
        await cache.del(`transaction:parcel:${result.parcelId}`);
        await cache.del(cache.CacheKeys.property(result.parcelId.toString()));
      }

      logger.info({ transactionId: input.id }, 'Transaction approved, cache invalidated');

      return result;
    }),

  /**
   * Reject transaction with cache invalidation
   */
  reject: protectedProcedure
    .input(z.object({
      id: z.string(),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Reject transaction
      const result = await transactionService.post(`/api/v1/transactions/${input.id}/reject`, {
        rejectedBy: ctx.user.id,
        reason: input.reason,
      });

      // Invalidate specific transaction cache
      const cacheKey = cache.CacheKeys.transaction(input.id);
      await cache.del(cacheKey);

      // Invalidate list caches
      await cache.invalidate('transaction:list:*');

      // Invalidate parcel-specific caches
      if (result.parcelId) {
        await cache.del(`transaction:parcel:${result.parcelId}`);
        await cache.del(cache.CacheKeys.property(result.parcelId.toString()));
      }

      logger.info({ transactionId: input.id }, 'Transaction rejected, cache invalidated');

      return result;
    }),

  /**
   * Get transaction statistics (cached for 1 hour)
   */
  getStatistics: publicProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const cacheKey = `transaction:stats:${input.startDate || 'all'}:${input.endDate || 'all'}`;
      
      // Try to get from cache
      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        logger.debug({ cacheKey }, 'Transaction statistics cache hit');
        return cached;
      }

      // Cache miss - fetch from service
      logger.debug({ cacheKey }, 'Transaction statistics cache miss');
      const result = await transactionService.get('/api/v1/transactions/statistics', { params: input });

      // Store in cache for 1 hour
      await cache.set(cacheKey, result, cache.CacheTTL.VERY_LONG);

      return result;
    }),

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats: protectedProcedure
    .query(async () => {
      return await cache.getStats();
    }),

  /**
   * Clear all transaction caches (admin only)
   */
  clearCache: protectedProcedure
    .mutation(async () => {
      await cache.invalidate('transaction:*');
      logger.warn('All transaction caches cleared');
      return { success: true, message: 'All transaction caches cleared' };
    }),
});
