/**
 * Swagger/OpenAPI Documentation for IDLR-PTS API
 * 
 * This file generates OpenAPI 3.0 specification for the public API
 */

export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'IDLR-PTS API',
    version: '1.0.0',
    description: 'Integrated Digital Land Registry & Property Title System Public API',
    contact: {
      name: 'IDLR-PTS Support',
      email: 'support@idlr-pts.gov.ng',
    },
    license: {
      name: 'Proprietary',
    },
  },
  servers: [
    {
      url: 'https://api.idlr-pts.gov.ng/v1',
      description: 'Production server',
    },
    {
      url: 'https://api-staging.idlr-pts.gov.ng/v1',
      description: 'Staging server',
    },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for authentication. Contact support to obtain an API key.',
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from OAuth2 login',
      },
    },
    schemas: {
      Parcel: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          parcelNumber: { type: 'string', example: 'LG-VI-2024-001' },
          state: { type: 'string', example: 'Lagos' },
          lga: { type: 'string', example: 'Victoria Island' },
          ward: { type: 'string', example: 'Ward 1' },
          streetAddress: { type: 'string', example: '123 Ahmadu Bello Way' },
          areaSquareMeters: { type: 'number', example: 1200.5 },
          landUseType: { type: 'string', enum: ['residential', 'commercial', 'industrial', 'agricultural', 'mixed'], example: 'residential' },
          surveyPlanNumber: { type: 'string', example: 'SP/2024/001' },
          status: { type: 'string', enum: ['draft', 'pending_verification', 'verified', 'registered', 'disputed'], example: 'verified' },
          geometryGeoJSON: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Transaction: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          parcelId: { type: 'integer', example: 1 },
          type: { type: 'string', enum: ['registration', 'transfer', 'subdivision', 'consolidation', 'mortgage', 'lease'], example: 'transfer' },
          status: { type: 'string', enum: ['draft', 'pending_approval', 'approved', 'rejected', 'completed'], example: 'pending_approval' },
          initiatedBy: { type: 'integer', example: 1 },
          processingFee: { type: 'number', example: 5000000 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Title: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          parcelId: { type: 'integer', example: 1 },
          titleNumber: { type: 'string', example: 'TN-2024-001' },
          ownerId: { type: 'integer', example: 1 },
          ownerName: { type: 'string', example: 'John Doe' },
          ownershipType: { type: 'string', enum: ['freehold', 'leasehold', 'customary'], example: 'freehold' },
          issuedDate: { type: 'string', format: 'date' },
          expiryDate: { type: 'string', format: 'date', nullable: true },
          status: { type: 'string', enum: ['active', 'expired', 'transferred', 'revoked'], example: 'active' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'UNAUTHORIZED' },
              message: { type: 'string', example: 'Invalid API key' },
            },
          },
        },
      },
    },
  },
  paths: {
    '/parcels': {
      get: {
        summary: 'Search parcels',
        description: 'Search for land parcels with optional filters',
        tags: ['Parcels'],
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: 'state',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by state',
          },
          {
            name: 'lga',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by Local Government Area',
          },
          {
            name: 'landUseType',
            in: 'query',
            schema: { type: 'string', enum: ['residential', 'commercial', 'industrial', 'agricultural', 'mixed'] },
            description: 'Filter by land use type',
          },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['draft', 'pending_verification', 'verified', 'registered', 'disputed'] },
            description: 'Filter by status',
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1 },
            description: 'Page number for pagination',
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 20, maximum: 100 },
            description: 'Number of results per page',
          },
        ],
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Parcel' },
                    },
                    pagination: {
                      type: 'object',
                      properties: {
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                        total: { type: 'integer' },
                        totalPages: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/parcels/{id}': {
      get: {
        summary: 'Get parcel by ID',
        description: 'Retrieve detailed information about a specific parcel',
        tags: ['Parcels'],
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'Parcel ID',
          },
        ],
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Parcel' },
              },
            },
          },
          '404': {
            description: 'Parcel not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/transactions': {
      get: {
        summary: 'List transactions',
        description: 'Retrieve a list of transactions with optional filters',
        tags: ['Transactions'],
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: 'parcelId',
            in: 'query',
            schema: { type: 'integer' },
            description: 'Filter by parcel ID',
          },
          {
            name: 'type',
            in: 'query',
            schema: { type: 'string', enum: ['registration', 'transfer', 'subdivision', 'consolidation', 'mortgage', 'lease'] },
            description: 'Filter by transaction type',
          },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['draft', 'pending_approval', 'approved', 'rejected', 'completed'] },
            description: 'Filter by status',
          },
        ],
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Transaction' },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create transaction',
        description: 'Initiate a new land transaction',
        tags: ['Transactions'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['parcelId', 'type'],
                properties: {
                  parcelId: { type: 'integer', example: 1 },
                  type: { type: 'string', enum: ['registration', 'transfer', 'subdivision', 'consolidation', 'mortgage', 'lease'], example: 'transfer' },
                  buyerName: { type: 'string', example: 'Jane Doe' },
                  buyerEmail: { type: 'string', example: 'jane@example.com' },
                  buyerPhone: { type: 'string', example: '+234 XXX XXX XXXX' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Transaction created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Transaction' },
              },
            },
          },
        },
      },
    },
    '/titles/{parcelId}': {
      get: {
        summary: 'Get title by parcel ID',
        description: 'Retrieve the current title information for a parcel',
        tags: ['Titles'],
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: 'parcelId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'Parcel ID',
          },
        ],
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Title' },
              },
            },
          },
        },
      },
    },
    '/blockchain/verify/{txHash}': {
      get: {
        summary: 'Verify blockchain transaction',
        description: 'Verify a transaction recorded on the blockchain',
        tags: ['Blockchain'],
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: 'txHash',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Blockchain transaction hash',
          },
        ],
        responses: {
          '200': {
            description: 'Verification result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    verified: { type: 'boolean' },
                    blockNumber: { type: 'integer' },
                    timestamp: { type: 'string', format: 'date-time' },
                    data: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  tags: [
    { name: 'Parcels', description: 'Land parcel management' },
    { name: 'Transactions', description: 'Transaction operations' },
    { name: 'Titles', description: 'Property title information' },
    { name: 'Blockchain', description: 'Blockchain verification' },
  ],
};

/**
 * Generate API key for external integrations
 */
export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'idlr_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}
