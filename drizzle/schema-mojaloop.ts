import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/**
 * Mojaloop Payment Transactions Schema
 * Tracks all payment transactions through the Mojaloop network
 */
export const mojaloopTransactions = sqliteTable('mojaloop_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Transaction identifiers
  transactionId: text('transaction_id').notNull().unique(), // Mojaloop transaction ID
  transferId: text('transfer_id').unique(), // Mojaloop transfer ID
  quoteId: text('quote_id').unique(), // Mojaloop quote ID
  
  // User and property references
  userId: integer('user_id').notNull(), // User initiating the payment
  propertyId: text('property_id'), // Related property/parcel ID
  escrowContractAddress: text('escrow_contract_address'), // Related smart contract
  
  // Payment details
  amount: real('amount').notNull(), // Payment amount
  currency: text('currency').notNull().default('USD'), // Currency code (ISO 4217)
  
  // Payer information
  payerFspId: text('payer_fsp_id').notNull(), // Payer's Financial Service Provider ID
  payerPartyIdType: text('payer_party_id_type').notNull(), // e.g., MSISDN, ACCOUNT_ID
  payerPartyIdentifier: text('payer_party_identifier').notNull(), // Phone number or account ID
  payerName: text('payer_name'),
  
  // Payee information
  payeeFspId: text('payee_fsp_id').notNull(), // Payee's FSP ID
  payeePartyIdType: text('payee_party_id_type').notNull(),
  payeePartyIdentifier: text('payee_party_identifier').notNull(),
  payeeName: text('payee_name'),
  
  // Transaction status
  status: text('status').notNull().default('PENDING'), // PENDING, QUOTE_RECEIVED, RESERVED, COMMITTED, COMPLETED, FAILED, REJECTED
  errorCode: text('error_code'), // Mojaloop error code if failed
  errorDescription: text('error_description'),
  
  // Quote details
  quoteAmount: real('quote_amount'), // Quoted amount (may include fees)
  quoteFees: real('quote_fees'), // Transaction fees
  quoteExpiration: text('quote_expiration'), // Quote expiration timestamp
  
  // Transfer details
  transferState: text('transfer_state'), // RECEIVED, RESERVED, COMMITTED, ABORTED
  transferFulfilment: text('transfer_fulfilment'), // Cryptographic fulfilment
  transferCondition: text('transfer_condition'), // Transfer condition (hash)
  
  // Metadata
  note: text('note'), // Payment description/note
  transactionType: text('transaction_type').notNull().default('TRANSFER'), // TRANSFER, DEPOSIT, WITHDRAWAL
  purpose: text('purpose'), // Property purchase, registration fee, survey fee, etc.
  
  // Timestamps
  createdAt: text('created_at').notNull().default("datetime('now')"),
  updatedAt: text('updated_at').notNull().default("datetime('now')"),
  completedAt: text('completed_at'), // When payment was completed
  
  // Reconciliation
  reconciledAt: text('reconciled_at'), // When reconciled with escrow contract
  blockchainTxHash: text('blockchain_tx_hash'), // Related blockchain transaction
});

/**
 * Mojaloop Payment Events Log
 * Tracks all events in the payment lifecycle for audit trail
 */
export const mojaloopPaymentEvents = sqliteTable('mojaloop_payment_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  transactionId: text('transaction_id').notNull(), // Reference to mojaloop_transactions
  eventType: text('event_type').notNull(), // QUOTE_REQUEST, QUOTE_RESPONSE, TRANSFER_PREPARE, TRANSFER_COMMIT, etc.
  eventStatus: text('event_status').notNull(), // SUCCESS, FAILED, PENDING
  
  // Event payload
  requestPayload: text('request_payload'), // JSON payload of the request
  responsePayload: text('response_payload'), // JSON payload of the response
  
  // Error details
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  
  // Metadata
  fspId: text('fsp_id'), // FSP that triggered this event
  createdAt: text('created_at').notNull().default("datetime('now')"),
});

/**
 * FSP (Financial Service Provider) Configuration
 * Stores configuration for connecting to different FSPs in the Mojaloop network
 */
export const mojaloopFspConfig = sqliteTable('mojaloop_fsp_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  fspId: text('fsp_id').notNull().unique(), // FSP identifier in Mojaloop network
  fspName: text('fsp_name').notNull(), // Human-readable name
  
  // API Configuration
  apiBaseUrl: text('api_base_url').notNull(), // FSP API endpoint
  apiVersion: text('api_version').notNull().default('1.1'), // Mojaloop API version
  
  // Authentication
  authType: text('auth_type').notNull().default('BEARER'), // BEARER, MUTUAL_TLS, etc.
  authToken: text('auth_token'), // API token/key (encrypted)
  certificatePath: text('certificate_path'), // Path to TLS certificate
  
  // Capabilities
  supportedCurrencies: text('supported_currencies').notNull().default('USD'), // Comma-separated
  supportedTransactionTypes: text('supported_transaction_types').notNull().default('TRANSFER'),
  
  // Status
  isActive: integer('is_active').notNull().default(1), // 1 = active, 0 = inactive
  isDefault: integer('is_default').notNull().default(0), // Default FSP for new transactions
  
  // Metadata
  createdAt: text('created_at').notNull().default("datetime('now')"),
  updatedAt: text('updated_at').notNull().default("datetime('now')"),
});

export type MojaloopTransaction = typeof mojaloopTransactions.$inferSelect;
export type NewMojaloopTransaction = typeof mojaloopTransactions.$inferInsert;
export type MojaloopPaymentEvent = typeof mojaloopPaymentEvents.$inferSelect;
export type NewMojaloopPaymentEvent = typeof mojaloopPaymentEvents.$inferInsert;
export type MojaloopFspConfig = typeof mojaloopFspConfig.$inferSelect;
export type NewMojaloopFspConfig = typeof mojaloopFspConfig.$inferInsert;
