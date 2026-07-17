/**
 * TigerBeetle gRPC Client Bridge
 * 
 * This module provides a Node.js client for the TigerBeetle Golang gRPC service.
 * It wraps the gRPC calls in a simple, Promise-based API for use in the Node.js backend.
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Load proto file
const PROTO_PATH = path.join(__dirname, '../tigerbeetle-service/proto/ledger.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const ledgerProto = protoDescriptor.ledger;

// Environment variables
const TIGERBEETLE_GRPC_URL = process.env.TIGERBEETLE_GRPC_URL || 'localhost:50051';

// Account types
export enum AccountType {
  ASSET = 1,
  LIABILITY = 2,
  EQUITY = 3,
  REVENUE = 4,
  EXPENSE = 5,
}

// Transfer status
export enum TransferStatus {
  PENDING = 1,
  POSTED = 2,
  VOIDED = 3,
}

// Interfaces
export interface Account {
  accountId: string;
  ledgerId: number;
  code: number;
  type: AccountType;
  debitsPosted: string;
  creditsPosted: string;
  debitsPending: string;
  creditsPending: string;
  userData128?: string;
  timestamp: string;
}

export interface Transfer {
  transferId: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  ledgerId: number;
  code: number;
  status: TransferStatus;
  userData128?: string;
  timestamp: string;
}

export interface AccountBalance {
  debitsPosted: string;
  creditsPosted: string;
  debitsPending: string;
  creditsPending: string;
  balance: string;
}

/**
 * TigerBeetle gRPC Client
 */
export class TigerBeetleClient {
  private client: any;
  private connected: boolean = false;

  constructor(serverUrl: string = TIGERBEETLE_GRPC_URL) {
    this.client = new ledgerProto.LedgerService(
      serverUrl,
      grpc.credentials.createInsecure()
    );
  }

  /**
   * Test connection to TigerBeetle service
   */
  async testConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);

      this.client.waitForReady(deadline, (error: Error | null) => {
        if (error) {
          console.error('TigerBeetle service not ready:', error.message);
          this.connected = false;
          resolve(false);
        } else {
          console.log('TigerBeetle service is ready');
          this.connected = true;
          resolve(true);
        }
      });
    });
  }

  /**
   * Create a new account
   */
  async createAccount(params: {
    accountId?: string;
    ledgerId: number;
    code: number;
    type: AccountType;
    userData128?: string;
  }): Promise<{ success: boolean; error?: string; account?: Account }> {
    const accountId = params.accountId || uuidv4();

    return new Promise((resolve, reject) => {
      this.client.CreateAccount(
        {
          account_id: accountId,
          ledger_id: params.ledgerId,
          code: params.code,
          type: params.type,
          user_data_128: params.userData128 || '',
        },
        (error: grpc.ServiceError | null, response: any) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              success: response.success,
              error: response.error,
              account: response.account ? this.mapAccount(response.account) : undefined,
            });
          }
        }
      );
    });
  }

  /**
   * Get account details
   */
  async getAccount(accountId: string): Promise<{ success: boolean; error?: string; account?: Account }> {
    return new Promise((resolve, reject) => {
      this.client.GetAccount(
        { account_id: accountId },
        (error: grpc.ServiceError | null, response: any) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              success: response.success,
              error: response.error,
              account: response.account ? this.mapAccount(response.account) : undefined,
            });
          }
        }
      );
    });
  }

  /**
   * Get account balance
   */
  async getAccountBalance(accountId: string): Promise<{ success: boolean; error?: string; balance?: AccountBalance }> {
    return new Promise((resolve, reject) => {
      this.client.GetAccountBalance(
        { account_id: accountId },
        (error: grpc.ServiceError | null, response: any) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              success: response.success,
              error: response.error,
              balance: response.success
                ? {
                    debitsPosted: response.debits_posted,
                    creditsPosted: response.credits_posted,
                    debitsPending: response.debits_pending,
                    creditsPending: response.credits_pending,
                    balance: response.balance,
                  }
                : undefined,
            });
          }
        }
      );
    });
  }

  /**
   * Create an immediate transfer
   */
  async createTransfer(params: {
    transferId?: string;
    debitAccountId: string;
    creditAccountId: string;
    amount: string | number;
    ledgerId: number;
    code: number;
    userData128?: string;
    timeout?: number;
  }): Promise<{ success: boolean; error?: string; transfer?: Transfer }> {
    const transferId = params.transferId || uuidv4();

    return new Promise((resolve, reject) => {
      this.client.CreateTransfer(
        {
          transfer_id: transferId,
          debit_account_id: params.debitAccountId,
          credit_account_id: params.creditAccountId,
          amount: String(params.amount),
          ledger_id: params.ledgerId,
          code: params.code,
          user_data_128: params.userData128 || '',
          timeout: params.timeout || 0,
        },
        (error: grpc.ServiceError | null, response: any) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              success: response.success,
              error: response.error,
              transfer: response.transfer ? this.mapTransfer(response.transfer) : undefined,
            });
          }
        }
      );
    });
  }

  /**
   * Create a pending transfer (two-phase commit)
   */
  async createPendingTransfer(params: {
    transferId?: string;
    debitAccountId: string;
    creditAccountId: string;
    amount: string | number;
    ledgerId: number;
    code: number;
    userData128?: string;
    timeout?: number;
  }): Promise<{ success: boolean; error?: string; transfer?: Transfer }> {
    const transferId = params.transferId || uuidv4();

    return new Promise((resolve, reject) => {
      this.client.CreatePendingTransfer(
        {
          transfer_id: transferId,
          debit_account_id: params.debitAccountId,
          credit_account_id: params.creditAccountId,
          amount: String(params.amount),
          ledger_id: params.ledgerId,
          code: params.code,
          user_data_128: params.userData128 || '',
          timeout: params.timeout || 0,
        },
        (error: grpc.ServiceError | null, response: any) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              success: response.success,
              error: response.error,
              transfer: response.transfer ? this.mapTransfer(response.transfer) : undefined,
            });
          }
        }
      );
    });
  }

  /**
   * Post (commit) a pending transfer
   */
  async postPendingTransfer(transferId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve, reject) => {
      this.client.PostPendingTransfer(
        { transfer_id: transferId },
        (error: grpc.ServiceError | null, response: any) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              success: response.success,
              error: response.error,
            });
          }
        }
      );
    });
  }

  /**
   * Void (cancel) a pending transfer
   */
  async voidPendingTransfer(transferId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve, reject) => {
      this.client.VoidPendingTransfer(
        { transfer_id: transferId },
        (error: grpc.ServiceError | null, response: any) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              success: response.success,
              error: response.error,
            });
          }
        }
      );
    });
  }

  /**
   * Reconcile a Mojaloop payment with blockchain transaction
   */
  async reconcilePayment(params: {
    paymentId: string;
    transactionHash: string;
    debitAccountId: string;
    creditAccountId: string;
    amount: string | number;
    code: number;
    metadata?: string;
  }): Promise<{ success: boolean; error?: string; transferId?: string; timestamp?: string }> {
    return new Promise((resolve, reject) => {
      this.client.ReconcilePayment(
        {
          payment_id: params.paymentId,
          transaction_hash: params.transactionHash,
          debit_account_id: params.debitAccountId,
          credit_account_id: params.creditAccountId,
          amount: String(params.amount),
          code: params.code,
          metadata: params.metadata || '',
        },
        (error: grpc.ServiceError | null, response: any) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              success: response.success,
              error: response.error,
              transferId: response.transfer_id,
              timestamp: response.timestamp,
            });
          }
        }
      );
    });
  }

  /**
   * Get transfer details
   */
  async getTransfer(transferId: string): Promise<{ success: boolean; error?: string; transfer?: Transfer }> {
    return new Promise((resolve, reject) => {
      this.client.GetTransfer(
        { transfer_id: transferId },
        (error: grpc.ServiceError | null, response: any) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              success: response.success,
              error: response.error,
              transfer: response.transfer ? this.mapTransfer(response.transfer) : undefined,
            });
          }
        }
      );
    });
  }

  /**
   * Close the client connection
   */
  close(): void {
    if (this.client) {
      this.client.close();
      this.connected = false;
    }
  }

  // Helper methods
  private mapAccount(account: any): Account {
    return {
      accountId: account.account_id,
      ledgerId: account.ledger_id,
      code: account.code,
      type: account.type,
      debitsPosted: account.debits_posted,
      creditsPosted: account.credits_posted,
      debitsPending: account.debits_pending,
      creditsPending: account.credits_pending,
      userData128: account.user_data_128,
      timestamp: account.timestamp,
    };
  }

  private mapTransfer(transfer: any): Transfer {
    return {
      transferId: transfer.transfer_id,
      debitAccountId: transfer.debit_account_id,
      creditAccountId: transfer.credit_account_id,
      amount: transfer.amount,
      ledgerId: transfer.ledger_id,
      code: transfer.code,
      status: transfer.status,
      userData128: transfer.user_data_128,
      timestamp: transfer.timestamp,
    };
  }
}

// Singleton instance
let tigerBeetleClient: TigerBeetleClient | null = null;

/**
 * Get or create TigerBeetle client instance
 */
export function getTigerBeetleClient(): TigerBeetleClient {
  if (!tigerBeetleClient) {
    tigerBeetleClient = new TigerBeetleClient();
  }
  return tigerBeetleClient;
}

/**
 * Initialize TigerBeetle client and test connection
 */
export async function initializeTigerBeetle(): Promise<boolean> {
  const client = getTigerBeetleClient();
  return await client.testConnection();
}
