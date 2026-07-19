import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../../_core/trpc';
import { getElasticsearchService } from '../../elasticsearchService';
import { getPopularSearches } from '../../elasticsearch';
import { getChallengeConfiguration, verifyChallengeToken } from '../../challengeVerification';
import { getSearchInsights } from '../../lakehouseClient';

function buildExplanation(query: string, filters: Record<string, unknown> | undefined, hit: { score: number; highlights?: Record<string, string[]>; data: Record<string, any> }) {
  const reasons: string[] = [];

  if (query.trim()) {
    reasons.push(`Matched query "${query.trim()}"`);
  }

  if (filters) {
    const activeFilters = Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key]) => key);

    if (activeFilters.length > 0) {
      reasons.push(`Matched active filters: ${activeFilters.join(', ')}`);
    }
  }

  if (hit.highlights && Object.keys(hit.highlights).length > 0) {
    reasons.push(`Highlighted fields: ${Object.keys(hit.highlights).join(', ')}`);
  }

  if (hit.data?.status) {
    reasons.push(`Status: ${String(hit.data.status)}`);
  }

  return {
    score: hit.score,
    reasons,
  };
}

async function enforcePublicSearchChallenge(params: {
  token?: string;
  remoteIp?: string;
}) {
  const config = getChallengeConfiguration();

  if (!config.publicSearchRequired) {
    return {
      success: true,
      enforced: false,
      config,
    };
  }

  const result = await verifyChallengeToken({
    token: params.token,
    remoteIp: params.remoteIp,
    required: true,
  });

  if (!result.success) {
    throw new Error(result.message || 'Public search challenge verification failed');
  }

  return {
    success: true,
    enforced: true,
    config,
  };
}

export const searchRouter = router({
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
            ...parcels.hits.map((hit) => ({
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
            ...transactions.hits.map((hit) => ({
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
            ...documents.hits.map((hit) => ({
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

  searchParcels: publicProcedure
    .input(
      z.object({
        query: z.string(),
        challengeToken: z.string().optional(),
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
    .query(async ({ input, ctx }) => {
      const es = getElasticsearchService();
      const { query, challengeToken, filters, page, pageSize } = input;
      const from = (page - 1) * pageSize;

      try {
        const challenge = await enforcePublicSearchChallenge({
          token: challengeToken,
          remoteIp: ctx.req.ip,
        });

        const result = await es.searchParcels(query, filters, from, pageSize);
        return {
          results: result.hits.map((hit) => ({
            ...hit,
            explanation: buildExplanation(query, filters, hit),
          })),
          total: result.total,
          page,
          pageSize,
          totalPages: Math.ceil(result.total / pageSize),
          meta: {
            took: result.took,
            maxScore: result.maxScore,
            challengeEnforced: challenge.enforced,
            querySummary: query.trim()
              ? `Showing parcel matches for "${query.trim()}"${filters ? ' with active filters applied' : ''}.`
              : 'Showing parcel matches for the selected filters.',
          },
        };
      } catch (error) {
        console.error('Search parcels error:', error);
        return {
          results: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
          meta: {
            took: 0,
            maxScore: 0,
            challengeEnforced: getChallengeConfiguration().publicSearchRequired,
            querySummary: error instanceof Error ? error.message : 'Parcel search unavailable',
          },
        };
      }
    }),

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

  globalSearch: publicProcedure
    .input(
      z.object({
        query: z.string(),
        challengeToken: z.string().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const es = getElasticsearchService();
      const { query, challengeToken, page, pageSize } = input;
      const from = (page - 1) * pageSize;

      try {
        const challenge = await enforcePublicSearchChallenge({
          token: challengeToken,
          remoteIp: ctx.req.ip,
        });
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
          meta: {
            challengeEnforced: challenge.enforced,
            querySummary: `Global search executed for "${query.trim()}" across parcels, transactions, and documents.`,
          },
        };
      } catch (error) {
        console.error('Global search error:', error);
        return {
          parcels: { results: [], total: 0 },
          transactions: { results: [], total: 0 },
          documents: { results: [], total: 0 },
          page,
          pageSize,
          meta: {
            challengeEnforced: getChallengeConfiguration().publicSearchRequired,
            querySummary: error instanceof Error ? error.message : 'Global search unavailable',
          },
        };
      }
    }),

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

  searchInsights: publicProcedure.query(async () => {
    try {
      const insights = await getSearchInsights();
      return {
        ...insights,
        source: 'lakehouse',
      };
    } catch (error) {
      return {
        saved_search_count: 0,
        popular_locations: [],
        diversity_score: 0,
        source: 'fallback',
        message: error instanceof Error ? error.message : 'Search insights unavailable',
      };
    }
  }),

  indexParcel: protectedProcedure
    .input(
      z.object({
        parcelId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const { requireDb } = await import('../../db');
      const db = await requireDb();
      const { parcels } = await import('../../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const [parcel] = await db.select().from(parcels).where(eq(parcels.id, input.parcelId)).limit(1);

      if (!parcel) {
        throw new Error('Parcel not found');
      }

      const es = getElasticsearchService();
      await es.indexParcel(parcel);
      return { success: true };
    }),

  reindexParcels: protectedProcedure.mutation(async () => {
    const { requireDb } = await import('../../db');
    const db = await requireDb();
    const allParcels = await db.select().from((await import('../../../drizzle/schema')).parcels);
    const es = getElasticsearchService();
    await es.bulkIndex('idlr-parcels', allParcels);
    return { success: true, count: allParcels.length };
  }),

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
