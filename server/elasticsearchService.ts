/**
 * Elasticsearch Integration Service
 * Provides full-text search across parcels, transactions, and documents
 */

import { Client } from '@elastic/elasticsearch';

interface SearchConfig {
  node: string;
  auth?: {
    username: string;
    password: string;
  };
}

interface SearchResult<T> {
  hits: Array<{
    id: string;
    score: number;
    data: T;
    highlights?: Record<string, string[]>;
  }>;
  total: number;
  took: number;
  maxScore: number;
}

interface IndexConfig {
  index: string;
  mappings: Record<string, any>;
  settings?: Record<string, any>;
}

export class ElasticsearchService {
  private client: Client;
  private indices = {
    parcels: 'idlr-parcels',
    transactions: 'idlr-transactions',
    documents: 'idlr-documents',
    users: 'idlr-users',
  };

  constructor(config: SearchConfig) {
    this.client = new Client({
      node: config.node,
      auth: config.auth,
    });
  }

  /**
   * Initialize all indices with mappings
   */
  async initializeIndices(): Promise<void> {
    const indexConfigs: IndexConfig[] = [
      {
        index: this.indices.parcels,
        mappings: {
          properties: {
            parcelId: { type: 'keyword' },
            address: { type: 'text', analyzer: 'standard' },
            city: { type: 'keyword' },
            state: { type: 'keyword' },
            country: { type: 'keyword' },
            landUse: { type: 'keyword' },
            area: { type: 'float' },
            coordinates: { type: 'geo_point' },
            ownerId: { type: 'keyword' },
            ownerName: { type: 'text' },
            status: { type: 'keyword' },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' },
          },
        },
        settings: {
          number_of_shards: 3,
          number_of_replicas: 1,
        },
      },
      {
        index: this.indices.transactions,
        mappings: {
          properties: {
            transactionId: { type: 'keyword' },
            transactionType: { type: 'keyword' },
            parcelId: { type: 'keyword' },
            fromUserId: { type: 'keyword' },
            toUserId: { type: 'keyword' },
            amount: { type: 'float' },
            status: { type: 'keyword' },
            paymentMethod: { type: 'keyword' },
            description: { type: 'text' },
            createdAt: { type: 'date' },
            completedAt: { type: 'date' },
          },
        },
        settings: {
          number_of_shards: 3,
          number_of_replicas: 1,
        },
      },
      {
        index: this.indices.documents,
        mappings: {
          properties: {
            documentId: { type: 'keyword' },
            title: { type: 'text' },
            documentType: { type: 'keyword' },
            content: { type: 'text', analyzer: 'standard' },
            parcelId: { type: 'keyword' },
            ownerId: { type: 'keyword' },
            fileUrl: { type: 'keyword' },
            extractedText: { type: 'text' },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' },
          },
        },
        settings: {
          number_of_shards: 2,
          number_of_replicas: 1,
        },
      },
      {
        index: this.indices.users,
        mappings: {
          properties: {
            userId: { type: 'keyword' },
            name: { type: 'text' },
            email: { type: 'keyword' },
            phone: { type: 'keyword' },
            role: { type: 'keyword' },
            organization: { type: 'text' },
            createdAt: { type: 'date' },
          },
        },
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
        },
      },
    ];

    for (const config of indexConfigs) {
      const exists = await this.client.indices.exists({ index: config.index });
      
      if (!exists) {
        await this.client.indices.create({
          index: config.index,
          mappings: config.mappings,
          settings: config.settings,
        } as any);
        console.log(`Created index: ${config.index}`);
      } else {
        console.log(`Index already exists: ${config.index}`);
      }
    }
  }

  /**
   * Index a parcel document
   */
  async indexParcel(parcel: any): Promise<void> {
    await this.client.index({
      index: this.indices.parcels,
      id: parcel.id.toString(),
      document: {
        parcelId: parcel.parcelId,
        address: parcel.address,
        city: parcel.city,
        state: parcel.state,
        country: parcel.country,
        landUse: parcel.landUse,
        area: parcel.area,
        coordinates: parcel.latitude && parcel.longitude 
          ? { lat: parcel.latitude, lon: parcel.longitude }
          : null,
        ownerId: parcel.ownerId,
        ownerName: parcel.ownerName,
        status: parcel.status,
        createdAt: parcel.createdAt,
        updatedAt: parcel.updatedAt,
      },
    });
  }

  /**
   * Index a transaction document
   */
  async indexTransaction(transaction: any): Promise<void> {
    await this.client.index({
      index: this.indices.transactions,
      id: transaction.id.toString(),
      document: {
        transactionId: transaction.transactionId,
        transactionType: transaction.transactionType,
        parcelId: transaction.parcelId,
        fromUserId: transaction.fromUserId,
        toUserId: transaction.toUserId,
        amount: transaction.amount,
        status: transaction.status,
        paymentMethod: transaction.paymentMethod,
        description: transaction.description,
        createdAt: transaction.createdAt,
        completedAt: transaction.completedAt,
      },
    });
  }

  /**
   * Index a document
   */
  async indexDocument(document: any): Promise<void> {
    await this.client.index({
      index: this.indices.documents,
      id: document.id.toString(),
      document: {
        documentId: document.documentId,
        title: document.title,
        documentType: document.documentType,
        content: document.content,
        parcelId: document.parcelId,
        ownerId: document.ownerId,
        fileUrl: document.fileUrl,
        extractedText: document.extractedText,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      },
    });
  }

  /**
   * Search parcels
   */
  async searchParcels(
    query: string,
    filters?: Record<string, any>,
    from = 0,
    size = 20
  ): Promise<SearchResult<any>> {
    const must: any[] = [];
    
    if (query) {
      must.push({
        multi_match: {
          query,
          fields: ['parcelId^3', 'address^2', 'ownerName', 'city', 'state'],
          fuzziness: 'AUTO',
        },
      });
    }

    if (filters) {
      if (filters.city) must.push({ term: { city: filters.city } });
      if (filters.state) must.push({ term: { state: filters.state } });
      if (filters.landUse) must.push({ term: { landUse: filters.landUse } });
      if (filters.status) must.push({ term: { status: filters.status } });
      if (filters.minArea || filters.maxArea) {
        must.push({
          range: {
            area: {
              gte: filters.minArea || 0,
              lte: filters.maxArea || 999999999,
            },
          },
        });
      }
    }

    const result = await this.client.search({
      index: this.indices.parcels,
      from,
      size,
      query: must.length > 0 ? { bool: { must } } : { match_all: {} },
      highlight: {
        fields: {
          address: {},
          ownerName: {},
          parcelId: {},
        },
      },
    } as any);

    return this.formatSearchResult(result);
  }

  /**
   * Search transactions
   */
  async searchTransactions(
    query: string,
    filters?: Record<string, any>,
    from = 0,
    size = 20
  ): Promise<SearchResult<any>> {
    const must: any[] = [];

    if (query) {
      must.push({
        multi_match: {
          query,
          fields: ['transactionId^3', 'description', 'parcelId'],
          fuzziness: 'AUTO',
        },
      });
    }

    if (filters) {
      if (filters.transactionType) must.push({ term: { transactionType: filters.transactionType } });
      if (filters.status) must.push({ term: { status: filters.status } });
      if (filters.paymentMethod) must.push({ term: { paymentMethod: filters.paymentMethod } });
      if (filters.minAmount || filters.maxAmount) {
        must.push({
          range: {
            amount: {
              gte: filters.minAmount || 0,
              lte: filters.maxAmount || 999999999,
            },
          },
        });
      }
      if (filters.startDate || filters.endDate) {
        must.push({
          range: {
            createdAt: {
              gte: filters.startDate || '1970-01-01',
              lte: filters.endDate || '2099-12-31',
            },
          },
        });
      }
    }

    const result = await this.client.search({
      index: this.indices.transactions,
      from,
      size,
      query: must.length > 0 ? { bool: { must } } : { match_all: {} },
      sort: [{ createdAt: { order: 'desc' } }],
      highlight: {
        fields: {
          transactionId: {},
          description: {},
        },
      },
    } as any);

    return this.formatSearchResult(result);
  }

  /**
   * Search documents
   */
  async searchDocuments(
    query: string,
    filters?: Record<string, any>,
    from = 0,
    size = 20
  ): Promise<SearchResult<any>> {
    const must: any[] = [];

    if (query) {
      must.push({
        multi_match: {
          query,
          fields: ['title^3', 'content^2', 'extractedText', 'documentId'],
          fuzziness: 'AUTO',
        },
      });
    }

    if (filters) {
      if (filters.documentType) must.push({ term: { documentType: filters.documentType } });
      if (filters.parcelId) must.push({ term: { parcelId: filters.parcelId } });
      if (filters.ownerId) must.push({ term: { ownerId: filters.ownerId } });
    }

    const result = await this.client.search({
      index: this.indices.documents,
      from,
      size,
      query: must.length > 0 ? { bool: { must } } : { match_all: {} },
      sort: [{ createdAt: { order: 'desc' } }],
      highlight: {
        fields: {
          title: {},
          content: {},
          extractedText: {},
        },
      },
    } as any);

    return this.formatSearchResult(result);
  }

  /**
   * Global search across all indices
   */
  async globalSearch(
    query: string,
    from = 0,
    size = 20
  ): Promise<Record<string, SearchResult<any>>> {
    const [parcels, transactions, documents] = await Promise.all([
      this.searchParcels(query, {}, from, size),
      this.searchTransactions(query, {}, from, size),
      this.searchDocuments(query, {}, from, size),
    ]);

    return {
      parcels,
      transactions,
      documents,
    };
  }

  /**
   * Geospatial search for parcels within radius
   */
  async searchParcelsByLocation(
    lat: number,
    lon: number,
    radiusKm: number,
    from = 0,
    size = 20
  ): Promise<SearchResult<any>> {
    const result = await this.client.search({
      index: this.indices.parcels,
      from,
      size,
      query: {
        bool: {
          filter: {
            geo_distance: {
              distance: `${radiusKm}km`,
              coordinates: {
                lat,
                lon,
              },
            },
          },
        },
      },
      sort: [
        {
          _geo_distance: {
            coordinates: {
              lat,
              lon,
            },
            order: 'asc',
            unit: 'km',
          },
        },
      ],
    } as any);

    return this.formatSearchResult(result);
  }

  /**
   * Bulk index documents
   */
  async bulkIndex(indexName: string, documents: any[]): Promise<void> {
    const body = documents.flatMap(doc => [
      { index: { _index: indexName, _id: doc.id?.toString() } },
      doc,
    ]);

    await this.client.bulk({ body });
  }

  /**
   * Delete document by ID
   */
  async deleteDocument(indexName: string, id: string): Promise<void> {
    await this.client.delete({
      index: indexName,
      id,
    });
  }

  /**
   * Update document
   */
  async updateDocument(indexName: string, id: string, doc: any): Promise<void> {
    await this.client.update({
      index: indexName,
      id,
      doc,
    });
  }

  /**
   * Format search result
   */
  private formatSearchResult(result: any): SearchResult<any> {
    return {
      hits: result.hits.hits.map((hit: any) => ({
        id: hit._id,
        score: hit._score,
        data: hit._source,
        highlights: hit.highlight,
      })),
      total: result.hits.total.value,
      took: result.took,
      maxScore: result.hits.max_score,
    };
  }

  /**
   * Get index statistics
   */
  async getIndexStats(indexName: string): Promise<any> {
    return await this.client.indices.stats({ index: indexName });
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    await this.client.close();
  }
}

// Export singleton instance
let elasticsearchService: ElasticsearchService | null = null;

export function getElasticsearchService(): ElasticsearchService {
  if (!elasticsearchService) {
    const node = process.env.ELASTICSEARCH_URL?.trim();
    const username = process.env.ELASTICSEARCH_USERNAME?.trim();
    const password = process.env.ELASTICSEARCH_PASSWORD;
    if (!node || !username || !password) {
      throw new Error('ELASTICSEARCH_URL, ELASTICSEARCH_USERNAME, and ELASTICSEARCH_PASSWORD must be configured');
    }
    const config: SearchConfig = {
      node,
      auth: { username, password },
    };
    elasticsearchService = new ElasticsearchService(config);
  }
  return elasticsearchService;
}
