import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../../_core/trpc';
import { getElasticsearchService } from '../../elasticsearchService';
import { getPopularSearches } from '../../elasticsearch';

export const searchRouter = router({
  /**
   * Autocomplete suggestions
   */
  autocomplete: publicProcedure
    .input(
      z.object({
        query: z.string().min(2),
        type: z.enum(['all', 'parcels', 'transactions', 'documents']).default('all'),
      })
    )
    .query(async ({ input }) => {
      const es = getElasticsearchService();
      const { query, type } = input;

      const suggestions: any[] = [];

      try {
        if (type === 'all' || type === 'parcels') {
          const parcels = await es.searchParcels(query, {}, 0, 5);
          suggestions.push(
            ...parcels.hits.map(hit => ({
              id: hit.id,
              type: 'parcel',
              text: hit.data.parcelId || hit.data.address,
              subtitle: hit.data.address || `${hit.data.city}, ${hit.data.state}`,
            }))
          );
        }

        if (type === 'all' || type === 'transactions') {
          const transactions = await es.searchTransactions(query, {}, 0, 5);
          suggestions.push(
            ...transactions.hits.map(hit => ({
              id: hit.id,
              type: 'transaction',
              text: hit.data.transactionId,
              subtitle: `${hit.data.transactionType} - ${hit.data.amount?.toLocaleString()}`,
            }))
          );
        }

        if (type === 'all' || type === 'documents') {
          const documents = await es.searchDocuments(query, {}, 0, 5);
          suggestions.push(
            ...documents.hits.map(hit => ({
              id: hit.id,
              type: 'document',
              text: hit.data.title || hit.data.documentId,
              subtitle: hit.data.documentType,
            }))
          );
        }

        return suggestions.slice(0, 10);
      } catch (error) {
        console.error('Autocomplete error:', error);
        return [];
      }
    }),

  /**
   * Search parcels
   */
  searchParcels: publicProcedure
    .input(
      z.object({
        query: z.string(),
        filters: z
          .object({
            city: z.string().optional(),
            state: z.string().optional(),
            landUse: z.string().optional(),
            status: z.string().optional(),
            minArea: z.number().optional(),
            maxArea: z.number().optional(),
          })
          .optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      const es = getElasticsearchService();
      const { query, filters, page, pageSize } = input;
      const from = (page - 1) * pageSize;

      try {
        const result = await es.searchParcels(query, filters, from, pageSize);
        return {
          results: result.hits,
          total: result.total,
          page,
          pageSize,
          totalPages: Math.ceil(result.total / pageSize),
        };
      } catch (error) {
        console.error('Search parcels error:', error);
        return {
          results: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        };
      }
    }),

  /**
   * Search transactions
   */
  searchTransactions: publicProcedure
    .input(
      z.object({
        query: z.string(),
        filters: z
          .object({
            transactionType: z.string().optional(),
            status: z.string().optional(),
            paymentMethod: z.string().optional(),
            minAmount: z.number().optional(),
            maxAmount: z.number().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
          })
          .optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      const es = getElasticsearchService();
      const { query, filters, page, pageSize } = input;
      const from = (page - 1) * pageSize;

      try {
        const result = await es.searchTransactions(query, filters, from, pageSize);
        return {
          results: result.hits,
          total: result.total,
          page,
          pageSize,
          totalPages: Math.ceil(result.total / pageSize),
        };
      } catch (error) {
        console.error('Search transactions error:', error);
        return {
          results: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        };
      }
    }),

  /**
   * Search documents
   */
  searchDocuments: publicProcedure
    .input(
      z.object({
        query: z.string(),
        filters: z
          .object({
            documentType: z.string().optional(),
            parcelId: z.string().optional(),
            ownerId: z.string().optional(),
          })
          .optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      const es = getElasticsearchService();
      const { query, filters, page, pageSize } = input;
      const from = (page - 1) * pageSize;

      try {
        const result = await es.searchDocuments(query, filters, from, pageSize);
        return {
          results: result.hits,
          total: result.total,
          page,
          pageSize,
          totalPages: Math.ceil(result.total / pageSize),
        };
      } catch (error) {
        console.error('Search documents error:', error);
        return {
          results: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        };
      }
    }),

  /**
   * Global search across all indices
   */
  globalSearch: publicProcedure
    .input(
      z.object({
        query: z.string(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      const es = getElasticsearchService();
      const { query, page, pageSize } = input;
      const from = (page - 1) * pageSize;

      try {
        const results = await es.globalSearch(query, from, pageSize);
        return {
          parcels: {
            results: results.parcels.hits,
            total: results.parcels.total,
          },
          transactions: {
            results: results.transactions.hits,
            total: results.transactions.total,
          },
          documents: {
            results: results.documents.hits,
            total: results.documents.total,
          },
          page,
          pageSize,
        };
      } catch (error) {
        console.error('Global search error:', error);
        return {
          parcels: { results: [], total: 0 },
          transactions: { results: [], total: 0 },
          documents: { results: [], total: 0 },
          page,
          pageSize,
        };
      }
    }),

  /**
   * Geospatial search for parcels
   */
  searchParcelsByLocation: publicProcedure
    .input(
      z.object({
        lat: z.number(),
        lon: z.number(),
        radiusKm: z.number().default(10),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      const es = getElasticsearchService();
      const { lat, lon, radiusKm, page, pageSize } = input;
      const from = (page - 1) * pageSize;

      try {
        const result = await es.searchParcelsByLocation(lat, lon, radiusKm, from, pageSize);
        return {
          results: result.hits,
          total: result.total,
          page,
          pageSize,
          totalPages: Math.ceil(result.total / pageSize),
        };
      } catch (error) {
        console.error('Geospatial search error:', error);
        return {
          results: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        };
      }
    }),

  /**
   * Index a parcel (admin only)
   */
  indexParcel: protectedProcedure
    .input(
      z.object({
        parcelId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Fetch parcel from database
      const { requireDb } = await import('../../db');
      const db = await requireDb();
      
      const { parcels } = await import('../../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      
      const [parcel] = await db.select().from(parcels).where(eq(parcels.id, input.parcelId)).limit(1);

      if (!parcel) {
        throw new Error('Parcel not found');
      }

      // Index in Elasticsearch
      const es = getElasticsearchService();
      await es.indexParcel(parcel);

      return { success: true };
    }),

  /**
   * Bulk reindex all parcels (admin only)
   */
  reindexParcels: protectedProcedure.mutation(async () => {
    const { requireDb } = await import('../../db');
    const db = await requireDb();
    
    const allParcels = await db.select().from((await import('../../../drizzle/schema')).parcels);
    const es = getElasticsearchService();

    await es.bulkIndex('idlr-parcels', allParcels);

    return { success: true, count: allParcels.length };
  }),

  /**
   * Bulk reindex all transactions (admin only)
   */
  reindexTransactions: protectedProcedure.mutation(async () => {
    const { requireDb } = await import('../../db');
    const db = await requireDb();
    
    const allTransactions = await db.select().from((await import('../../../drizzle/schema')).registryTransactions);
    const es = getElasticsearchService();

    await es.bulkIndex('idlr-transactions', allTransactions);

    return { success: true, count: allTransactions.length };
  }),

  popularSearches: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(25).default(10),
      }).optional(),
    )
    .query(async ({ input }) => {
      const popular = await getPopularSearches(input?.limit ?? 10);
      return {
        searches: popular,
      };
    }),
});
