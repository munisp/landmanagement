/**
 * Mojaloop Client Service
 * 
 * Provides SDK-like interface for interacting with Mojaloop payment network.
 * Implements the Mojaloop API specification for quotes, transfers, and party lookups.
 * 
 * @see https://docs.mojaloop.io/api/
 */

import crypto from 'crypto';
import { requireDb } from './db';
import { mojaloopTransactions, mojaloopPaymentEvents, mojaloopFspConfig } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

// Mojaloop API Types
export interface PartyIdentifier {
  partyIdType: 'MSISDN' | 'ACCOUNT_ID' | 'EMAIL' | 'PERSONAL_ID' | 'BUSINESS' | 'DEVICE' | 'IBAN';
  partyIdentifier: string;
  partySubIdOrType?: string;
  fspId?: string;
}

export interface Money {
  currency: string;
  amount: string;
}

export interface QuoteRequest {
  quoteId: string;
  transactionId: string;
  payer: PartyIdentifier & { personalInfo?: { name?: string } };
  payee: PartyIdentifier & { personalInfo?: { name?: string } };
  amountType: 'SEND' | 'RECEIVE';
  amount: Money;
  transactionType: {
    scenario: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' | 'PAYMENT' | 'REFUND';
    initiator: 'PAYER' | 'PAYEE';
    initiatorType: 'CONSUMER' | 'AGENT' | 'BUSINESS' | 'DEVICE';
  };
  note?: string;
  expiration?: string;
}

export interface QuoteResponse {
  transferAmount: Money;
  payeeReceiveAmount?: Money;
  payeeFspFee?: Money;
  payeeFspCommission?: Money;
  expiration: string;
  ilpPacket: string;
  condition: string;
}

export interface TransferRequest {
  transferId: string;
  payerFsp: string;
  payeeFsp: string;
  amount: Money;
  ilpPacket: string;
  condition: string;
  expiration: string;
}

export interface TransferResponse {
  fulfilment?: string;
  completedTimestamp?: string;
  transferState: 'RECEIVED' | 'RESERVED' | 'COMMITTED' | 'ABORTED';
}

/**
 * Mojaloop Client Configuration
 */
interface MojaloopConfig {
  apiBaseUrl: string;
  apiVersion: string;
  fspId: string;
  authToken?: string;
  timeout?: number;
}

/**
 * Mojaloop Client Class
 * Handles all interactions with the Mojaloop network
 */
export class MojaloopClient {
  private config: MojaloopConfig;
  private defaultHeaders: Record<string, string>;

  constructor(config: MojaloopConfig) {
    this.config = {
      timeout: 30000, // 30 seconds default
      ...config,
    };

    this.defaultHeaders = {
      'Content-Type': 'application/vnd.interoperability+json;version=1.1',
      'Accept': 'application/vnd.interoperability+json;version=1.1',
      'FSPIOP-Source': this.config.fspId,
      'Date': new Date().toUTCString(),
    };

    if (this.config.authToken) {
      this.defaultHeaders['Authorization'] = `Bearer ${this.config.authToken}`;
    }
  }

  /**
   * Party Lookup - Get party information by identifier
   */
  async getParty(partyIdType: string, partyIdentifier: string): Promise<any> {
    const url = `${this.config.apiBaseUrl}/parties/${partyIdType}/${partyIdentifier}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.defaultHeaders,
        signal: AbortSignal.timeout(this.config.timeout!),
      });

      if (!response.ok) {
        throw new Error(`Party lookup failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Mojaloop party lookup error:', error);
      throw error;
    }
  }

  /**
   * Request Quote - Get quote for a transfer
   */
  async requestQuote(quoteRequest: QuoteRequest): Promise<QuoteResponse> {
    const url = `${this.config.apiBaseUrl}/quotes`;
    
    const headers = {
      ...this.defaultHeaders,
      'FSPIOP-Destination': quoteRequest.payee.fspId || '',
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(quoteRequest),
        signal: AbortSignal.timeout(this.config.timeout!),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Quote request failed: ${response.statusText} - ${errorBody}`);
      }

      const quoteResponse = await response.json();
      
      // Log the quote event
      await this.logPaymentEvent({
        transactionId: quoteRequest.transactionId,
        eventType: 'QUOTE_REQUEST',
        eventStatus: 'SUCCESS',
        requestPayload: JSON.stringify(quoteRequest),
        responsePayload: JSON.stringify(quoteResponse),
        fspId: this.config.fspId,
      });

      return quoteResponse;
    } catch (error) {
      // Log the failed quote event
      await this.logPaymentEvent({
        transactionId: quoteRequest.transactionId,
        eventType: 'QUOTE_REQUEST',
        eventStatus: 'FAILED',
        requestPayload: JSON.stringify(quoteRequest),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        fspId: this.config.fspId,
      });

      console.error('Mojaloop quote request error:', error);
      throw error;
    }
  }

  /**
   * Prepare Transfer - Initiate a transfer
   */
  async prepareTransfer(transferRequest: TransferRequest): Promise<void> {
    const url = `${this.config.apiBaseUrl}/transfers`;
    
    const headers = {
      ...this.defaultHeaders,
      'FSPIOP-Destination': transferRequest.payeeFsp,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(transferRequest),
        signal: AbortSignal.timeout(this.config.timeout!),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Transfer prepare failed: ${response.statusText} - ${errorBody}`);
      }

      // Log the transfer prepare event
      await this.logPaymentEvent({
        transactionId: transferRequest.transferId,
        eventType: 'TRANSFER_PREPARE',
        eventStatus: 'SUCCESS',
        requestPayload: JSON.stringify(transferRequest),
        fspId: this.config.fspId,
      });
    } catch (error) {
      // Log the failed transfer event
      await this.logPaymentEvent({
        transactionId: transferRequest.transferId,
        eventType: 'TRANSFER_PREPARE',
        eventStatus: 'FAILED',
        requestPayload: JSON.stringify(transferRequest),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        fspId: this.config.fspId,
      });

      console.error('Mojaloop transfer prepare error:', error);
      throw error;
    }
  }

  /**
   * Commit Transfer - Fulfill a transfer with the fulfilment
   */
  async commitTransfer(transferId: string, fulfilment: string): Promise<TransferResponse> {
    const url = `${this.config.apiBaseUrl}/transfers/${transferId}`;
    
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: this.defaultHeaders,
        body: JSON.stringify({ fulfilment }),
        signal: AbortSignal.timeout(this.config.timeout!),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Transfer commit failed: ${response.statusText} - ${errorBody}`);
      }

      const transferResponse = await response.json();

      // Log the transfer commit event
      await this.logPaymentEvent({
        transactionId: transferId,
        eventType: 'TRANSFER_COMMIT',
        eventStatus: 'SUCCESS',
        requestPayload: JSON.stringify({ fulfilment }),
        responsePayload: JSON.stringify(transferResponse),
        fspId: this.config.fspId,
      });

      return transferResponse;
    } catch (error) {
      // Log the failed commit event
      await this.logPaymentEvent({
        transactionId: transferId,
        eventType: 'TRANSFER_COMMIT',
        eventStatus: 'FAILED',
        requestPayload: JSON.stringify({ fulfilment }),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        fspId: this.config.fspId,
      });

      console.error('Mojaloop transfer commit error:', error);
      throw error;
    }
  }

  /**
   * Generate ILP Packet and Condition
   * Used for transfer security
   */
  generateIlpPacketAndCondition(amount: Money, payee: PartyIdentifier): {
    ilpPacket: string;
    condition: string;
    fulfilment: string;
  } {
    // Generate a random 32-byte fulfilment
    const fulfilment = crypto.randomBytes(32).toString('base64');
    
    // Generate condition as SHA-256 hash of fulfilment
    const condition = crypto
      .createHash('sha256')
      .update(Buffer.from(fulfilment, 'base64'))
      .digest('base64');

    // Create ILP packet (simplified version)
    const ilpPacketData = {
      amount: amount.amount,
      currency: amount.currency,
      destination: payee.partyIdentifier,
      data: Buffer.from(JSON.stringify({ payee })).toString('base64'),
    };

    const ilpPacket = Buffer.from(JSON.stringify(ilpPacketData)).toString('base64');

    return { ilpPacket, condition, fulfilment };
  }

  /**
   * Log payment events to database
   */
  private async logPaymentEvent(event: {
    transactionId: string;
    eventType: string;
    eventStatus: string;
    requestPayload?: string;
    responsePayload?: string;
    errorCode?: string;
    errorMessage?: string;
    fspId?: string;
  }): Promise<void> {
    try {
      const db = await requireDb();
      await db.insert(mojaloopPaymentEvents).values(event);
    } catch (error) {
      console.error('Failed to log payment event:', error);
      // Don't throw - logging failure shouldn't break the payment flow
    }
  }
}

/**
 * Get Mojaloop client instance with configuration from database
 */
export async function getMojaloopClient(fspId?: string): Promise<MojaloopClient> {
  const db = await requireDb();
  
  // Get FSP configuration from database
  const configs = await db
    .select()
    .from(mojaloopFspConfig)
    .where(eq(mojaloopFspConfig.isActive, true))
    .limit(1);

  if (configs.length === 0) {
    throw new Error('No active Mojaloop FSP configuration found. Please configure an FSP first.');
  }

  const config = configs[0];

  return new MojaloopClient({
    apiBaseUrl: config.apiBaseUrl,
    apiVersion: config.apiVersion,
    fspId: config.fspId,
    authToken: config.authToken || undefined,
  });
}

/**
 * Helper function to generate unique transaction IDs
 */
export function generateTransactionId(): string {
  return `txn_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Helper function to generate unique quote IDs
 */
export function generateQuoteId(): string {
  return `quote_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Helper function to generate unique transfer IDs
 */
export function generateTransferId(): string {
  return `transfer_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}
