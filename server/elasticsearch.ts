import { Client } from '@elastic/elasticsearch';

// Initialize Elasticsearch client
const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
    password: process.env.ELASTICSEARCH_PASSWORD || 'changeme',
  },
});

// Index names
const INDICES = {
  PARCELS: 'parcels',
  TRANSACTIONS: 'transactions',
  DOCUMENTS: 'documents',
  USERS: 'users',
};

/**
 * Initialize Elasticsearch indices with mappings
 */
export async function initializeIndices() {
  try {
    // Parcels index
    const parcelsExists = await esClient.indices.exists({ index: INDICES.PARCELS });
    if (!parcelsExists) {
      await esClient.indices.create({
        index: INDICES.PARCELS,
        body: {
          mappings: {
            properties: {
              parcel_id: { type: 'keyword' },
              title: { type: 'text', analyzer: 'standard' },
              address: { type: 'text', analyzer: 'standard' },
              location: { type: 'geo_point' },
              area: { type: 'float' },
              land_use: { type: 'keyword' },
              status: { type: 'keyword' },
              owner_name: { type: 'text', analyzer: 'standard' },
              owner_nin: { type: 'keyword' },
              price: { type: 'float' },
              created_at: { type: 'date' },
              updated_at: { type: 'date' },
            },
          },
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            analysis: {
              analyzer: {
                autocomplete: {
                  tokenizer: 'autocomplete',
                  filter: ['lowercase'],
                },
                autocomplete_search: {
                  tokenizer: 'lowercase',
                },
              },
              tokenizer: {
                autocomplete: {
                  type: 'edge_ngram',
                  min_gram: 2,
                  max_gram: 10,
                  token_chars: ['letter', 'digit'],
                },
              },
            },
          },
        },
      } as any);
      console.log('[Elasticsearch] Parcels index created');
    }

    // Transactions index
    const transactionsExists = await esClient.indices.exists({ index: INDICES.TRANSACTIONS });
    if (!transactionsExists) {
      await esClient.indices.create({
        index: INDICES.TRANSACTIONS,
        body: {
          mappings: {
            properties: {
              transaction_id: { type: 'keyword' },
              type: { type: 'keyword' },
              parcel_id: { type: 'keyword' },
              from_owner: { type: 'text' },
              to_owner: { type: 'text' },
              amount: { type: 'float' },
              status: { type: 'keyword' },
              created_at: { type: 'date' },
              completed_at: { type: 'date' },
            },
          },
        },
      } as any);
      console.log('[Elasticsearch] Transactions index created');
    }

    // Documents index
    const documentsExists = await esClient.indices.exists({ index: INDICES.DOCUMENTS });
    if (!documentsExists) {
      await esClient.indices.create({
        index: INDICES.DOCUMENTS,
        body: {
          mappings: {
            properties: {
              document_id: { type: 'keyword' },
              title: { type: 'text', analyzer: 'standard' },
              type: { type: 'keyword' },
              content: { type: 'text', analyzer: 'standard' },
              parcel_id: { type: 'keyword' },
              transaction_id: { type: 'keyword' },
              uploaded_by: { type: 'keyword' },
              created_at: { type: 'date' },
            },
          },
        },
      } as any);
      console.log('[Elasticsearch] Documents index created');
    }

    console.log('[Elasticsearch] All indices initialized');
  } catch (error) {
    console.error('[Elasticsearch] Failed to initialize indices:', error);
  }
}

/**
 * Index a parcel document
 */
export async function indexParcel(parcel: any) {
  try {
    await esClient.index({
      index: INDICES.PARCELS,
      id: parcel.id.toString(),
      document: {
        parcel_id: parcel.parcel_id,
        title: parcel.title,
        address: parcel.address,
        location: {
          lat: parcel.latitude,
          lon: parcel.longitude,
        },
        area: parcel.area,
        land_use: parcel.land_use,
        status: parcel.status,
        owner_name: parcel.owner_name,
        owner_nin: parcel.owner_nin,
        price: parcel.price,
        created_at: parcel.created_at,
        updated_at: parcel.updated_at,
      },
    });
    console.log(`[Elasticsearch] Indexed parcel ${parcel.parcel_id}`);
  } catch (error) {
    console.error('[Elasticsearch] Failed to index parcel:', error);
  }
}

/**
 * Search parcels with autocomplete and fuzzy matching
 */
export async function searchParcels(query: string, options: {
  from?: number;
  size?: number;
  filters?: any;
  location?: { lat: number; lon: number; distance: string };
}) {
  try {
    const { from = 0, size = 20, filters = {}, location } = options;

    const must: any[] = [];
    const filter: any[] = [];

    // Full-text search with fuzzy matching
    if (query) {
      must.push({
        multi_match: {
          query,
          fields: ['title^3', 'address^2', 'parcel_id^2', 'owner_name'],
          fuzziness: 'AUTO',
          prefix_length: 1,
        },
      });
    }

    // Filters
    if (filters.status) {
      filter.push({ term: { status: filters.status } });
    }
    if (filters.land_use) {
      filter.push({ term: { land_use: filters.land_use } });
    }
    if (filters.min_area || filters.max_area) {
      const range: any = {};
      if (filters.min_area) range.gte = filters.min_area;
      if (filters.max_area) range.lte = filters.max_area;
      filter.push({ range: { area: range } });
    }
    if (filters.min_price || filters.max_price) {
      const range: any = {};
      if (filters.min_price) range.gte = filters.min_price;
      if (filters.max_price) range.lte = filters.max_price;
      filter.push({ range: { price: range } });
    }

    // Geospatial proximity search
    if (location) {
      filter.push({
        geo_distance: {
          distance: location.distance,
          location: {
            lat: location.lat,
            lon: location.lon,
          },
        },
      });
    }

    // @ts-ignore - Elasticsearch types are complex
    const response = await esClient.search({
      index: INDICES.PARCELS,
      from,
      size,
      body: {
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter,
          },
        },
        highlight: {
          fields: {
            title: {},
            address: {},
            owner_name: {},
          },
        },
        sort: query
          ? [{ _score: 'desc' }]
          : [{ created_at: 'desc' }],
      },
    });

    return {
      total: (response.hits.total as any).value,
      results: response.hits.hits.map((hit: any) => ({
        ...hit._source,
        id: hit._id,
        score: hit._score,
        highlights: hit.highlight,
      })),
    };
  } catch (error) {
    console.error('[Elasticsearch] Search failed:', error);
    return { total: 0, results: [] };
  }
}

/**
 * Get autocomplete suggestions
 */
export async function getAutocompleteSuggestions(query: string, field: string = 'title') {
  try {
    // Use prefix query for autocomplete instead of suggest API
    const response = await esClient.search({
      index: INDICES.PARCELS,
      size: 10,
      _source: [field],
      body: {
        query: {
          bool: {
            should: [
              {
                match_phrase_prefix: {
                  [field]: {
                    query: query,
                    max_expansions: 10,
                  },
                },
              },
              {
                fuzzy: {
                  [field]: {
                    value: query,
                    fuzziness: 'AUTO',
                  },
                },
              },
            ],
          },
        },
      },
    } as any);

    return response.hits.hits.map((hit: any) => hit._source[field]).filter(Boolean);
  } catch (error) {
    console.error('[Elasticsearch] Autocomplete failed:', error);
    return [];
  }
}

/**
 * Search analytics - track search queries
 */
export async function trackSearchQuery(query: string, userId: string, results: number) {
  try {
    await esClient.index({
      index: 'search_analytics',
      document: {
        query,
        user_id: userId,
        results_count: results,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('[Elasticsearch] Failed to track search:', error);
  }
}

/**
 * Get popular search queries
 */
export async function getPopularSearches(limit: number = 10) {
  try {
    // @ts-ignore - Elasticsearch types are complex
    const response = await esClient.search({
      index: 'search_analytics',
      body: {
        size: 0,
        aggs: {
          popular_searches: {
            terms: {
              field: 'query.keyword',
              size: limit,
            },
          },
        },
      },
    });

    const aggs = response.aggregations as any;
    return aggs?.popular_searches?.buckets?.map((bucket: any) => ({
      query: bucket.key,
      count: bucket.doc_count,
    })) || [];
  } catch (error) {
    console.error('[Elasticsearch] Failed to get popular searches:', error);
    return [];
  }
}

// Initialize indices on module load
initializeIndices().catch(console.error);

export { esClient, INDICES };
