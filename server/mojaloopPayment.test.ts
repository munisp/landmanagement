/**
 * Mojaloop Payment Service Tests
 * 
 * Tests the complete payment flow: initiation → quote → transfer → completion
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from './db';
import { users, mojaloopTransactions, mojaloopFspConfig } from '../drizzle/schema';
import {
  initiatePropertyPayment,
  executePayment,
  getPaymentStatus,
  getUserPaymentHistory,
  cancelPayment,
  reconcilePaymentWithEscrow,
} from './mojaloopPaymentService';
import {
  createOfflineMojaloopTransaction,
  getOfflineMojaloopTransaction,
} from './mojaloopPaymentRepository';
import { eq } from 'drizzle-orm';

describe('Mojaloop Payment Service', () => {
  let testUserId: number;
  let testTransactionId: string;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) {
      testUserId = 1201;
      testTransactionId = 'offline-seed-mojaloop-1';
      return;
    }

    // Create test user
    const userResults = await db
      .insert(users)
      .values({
        openId: `test-mojaloop-${Date.now()}`,
        name: 'Mojaloop Test User',
        email: `mojaloop-test-${Date.now()}@example.com`,
        role: 'user',
      })
      .returning();

    testUserId = userResults[0].id;

    // Create test FSP configuration
    await db.insert(mojaloopFspConfig).values({
      fspId: 'test-fsp',
      fspName: 'Test FSP',
      apiBaseUrl: 'https://sandbox.mojaloop.io/api',
      apiVersion: '1.1',
      authType: 'BEARER',
      authToken: 'test-token',
      supportedCurrencies: 'USD,NGN,KES',
      supportedTransactionTypes: 'TRANSFER',
      isActive: true,
      isDefault: true,
    });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Cleanup test data
    await db.delete(mojaloopTransactions).where(eq(mojaloopTransactions.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(mojaloopFspConfig).where(eq(mojaloopFspConfig.fspId, 'test-fsp'));
  });

  it('should create payment transaction record in database', async () => {
    const db = await getDb();

    // Create a mock payment transaction directly
    const transactionId = `test-txn-${Date.now()}`;
    if (!db) {
      createOfflineMojaloopTransaction({
        transactionId,
        userId: testUserId,
        amount: 1000,
        currency: 'USD',
        payerFspId: 'test-fsp',
        payerPartyIdType: 'MSISDN',
        payerPartyIdentifier: '+2348012345678',
        payeeFspId: 'test-fsp',
        payeePartyIdType: 'MSISDN',
        payeePartyIdentifier: '+2348087654321',
        status: 'pending',
        transactionType: 'property_purchase',
        purpose: 'Test property purchase',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const transaction = getOfflineMojaloopTransaction(transactionId);
      expect(transaction).not.toBeNull();
      expect(transaction?.transactionId).toBe(transactionId);
      expect(transaction?.userId).toBe(testUserId);
      expect(transaction?.amount).toBe(1000);
      expect(transaction?.currency).toBe('USD');
      expect(transaction?.status).toBe('pending');
      testTransactionId = transactionId;
      return;
    }
    
    await db.insert(mojaloopTransactions).values({
      transactionId,
      userId: testUserId,
      amount: 1000.00,
      currency: 'USD',
      payerFspId: 'test-fsp',
      payerPartyIdType: 'MSISDN',
      payerPartyIdentifier: '+2348012345678',
      payeeFspId: 'test-fsp',
      payeePartyIdType: 'MSISDN',
      payeePartyIdentifier: '+2348087654321',
      status: 'pending',
      transactionType: 'property_purchase',
      purpose: 'Test property purchase',
    });

    const transactions = await db
      .select()
      .from(mojaloopTransactions)
      .where(eq(mojaloopTransactions.transactionId, transactionId))
      .limit(1);

    expect(transactions.length).toBe(1);
    expect(transactions[0].transactionId).toBe(transactionId);
    expect(transactions[0].userId).toBe(testUserId);
    expect(transactions[0].amount).toBe(1000);
    expect(transactions[0].currency).toBe('USD');
    expect(transactions[0].status).toBe('pending');

    testTransactionId = transactionId;
  });

  it('should retrieve payment status', async () => {
    const status = await getPaymentStatus(testTransactionId);

    expect(status).not.toBeNull();
    expect(status?.transactionId).toBe(testTransactionId);
    expect(status?.status).toBe('pending');
    expect(status?.amount).toBe('1000');
    expect(status?.currency).toBe('USD');
  });

  it('should retrieve user payment history', async () => {
    const history = await getUserPaymentHistory(testUserId, 10);

    expect(history.length).toBeGreaterThan(0);
    expect(history[0].transactionId).toBe(testTransactionId);
  });

  it('should cancel pending payment', async () => {
    const db = await getDb();

    const cancelTxnId = `test-cancel-${Date.now()}`;
    if (!db) {
      createOfflineMojaloopTransaction({
        transactionId: cancelTxnId,
        userId: testUserId,
        amount: 500,
        currency: 'USD',
        payerFspId: 'test-fsp',
        payerPartyIdType: 'MSISDN',
        payerPartyIdentifier: '+2348012345678',
        payeeFspId: 'test-fsp',
        payeePartyIdType: 'MSISDN',
        payeePartyIdentifier: '+2348087654321',
        status: 'pending',
        transactionType: 'property_purchase',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await cancelPayment(cancelTxnId, 'User requested cancellation');
      const transaction = getOfflineMojaloopTransaction(cancelTxnId);
      expect(transaction?.status).toBe('rejected');
      expect(transaction?.errorDescription).toContain('Cancelled by user');
      return;
    }
    
    await db.insert(mojaloopTransactions).values({
      transactionId: cancelTxnId,
      userId: testUserId,
      amount: 500.00,
      currency: 'USD',
      payerFspId: 'test-fsp',
      payerPartyIdType: 'MSISDN',
      payerPartyIdentifier: '+2348012345678',
      payeeFspId: 'test-fsp',
      payeePartyIdType: 'MSISDN',
      payeePartyIdentifier: '+2348087654321',
      status: 'pending',
      transactionType: 'property_purchase',
    });

    await cancelPayment(cancelTxnId, 'User requested cancellation');

    const transactions = await db
      .select()
      .from(mojaloopTransactions)
      .where(eq(mojaloopTransactions.transactionId, cancelTxnId))
      .limit(1);

    expect(transactions[0].status).toBe('rejected');
    expect(transactions[0].errorDescription).toContain('Cancelled by user');
  });

  it('should reconcile payment with blockchain', async () => {
    const db = await getDb();

    const blockchainTxHash = '0x' + '1'.repeat(64);

    await reconcilePaymentWithEscrow(testTransactionId, blockchainTxHash);

    if (!db) {
      const transaction = getOfflineMojaloopTransaction(testTransactionId);
      expect(transaction?.blockchainTxHash).toBe(blockchainTxHash);
      expect(transaction?.reconciledAt).not.toBeNull();
      return;
    }

    const transactions = await db
      .select()
      .from(mojaloopTransactions)
      .where(eq(mojaloopTransactions.transactionId, testTransactionId))
      .limit(1);

    expect(transactions[0].blockchainTxHash).toBe(blockchainTxHash);
    expect(transactions[0].reconciledAt).not.toBeNull();
  });

  it('should handle non-existent transaction gracefully', async () => {
    const status = await getPaymentStatus('non-existent-txn-id');
    expect(status).toBeNull();
  });

  it('should prevent cancellation of completed payments', async () => {
    const db = await getDb();

    const completedTxnId = `test-completed-${Date.now()}`;
    if (!db) {
      createOfflineMojaloopTransaction({
        transactionId: completedTxnId,
        userId: testUserId,
        amount: 750,
        currency: 'USD',
        payerFspId: 'test-fsp',
        payerPartyIdType: 'MSISDN',
        payerPartyIdentifier: '+2348012345678',
        payeeFspId: 'test-fsp',
        payeePartyIdType: 'MSISDN',
        payeePartyIdentifier: '+2348087654321',
        status: 'completed',
        transactionType: 'property_purchase',
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await expect(
        cancelPayment(completedTxnId, 'Should not be allowed')
      ).rejects.toThrow('Cannot cancel payment in status: completed');
      return;
    }
    
    await db.insert(mojaloopTransactions).values({
      transactionId: completedTxnId,
      userId: testUserId,
      amount: 750.00,
      currency: 'USD',
      payerFspId: 'test-fsp',
      payerPartyIdType: 'MSISDN',
      payerPartyIdentifier: '+2348012345678',
      payeeFspId: 'test-fsp',
      payeePartyIdType: 'MSISDN',
      payeePartyIdentifier: '+2348087654321',
      status: 'completed',
      transactionType: 'property_purchase',
      completedAt: new Date(),
    });

    await expect(
      cancelPayment(completedTxnId, 'Should not be allowed')
    ).rejects.toThrow('Cannot cancel payment in status: completed');
  });

  it('should track payment amounts correctly', async () => {
    const db = await getDb();

    const amounts = [100.50, 250.75, 1000.00, 5000.25];

    for (const amount of amounts) {
      const txnId = `test-amount-${Date.now()}-${amount}`;
      
      if (!db) {
        createOfflineMojaloopTransaction({
          transactionId: txnId,
          userId: testUserId,
          amount,
          currency: 'USD',
          payerFspId: 'test-fsp',
          payerPartyIdType: 'MSISDN',
          payerPartyIdentifier: '+2348012345678',
          payeeFspId: 'test-fsp',
          payeePartyIdType: 'MSISDN',
          payeePartyIdentifier: '+2348087654321',
          status: 'pending',
          transactionType: 'property_purchase',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        await db.insert(mojaloopTransactions).values({
          transactionId: txnId,
          userId: testUserId,
          amount,
          currency: 'USD',
          payerFspId: 'test-fsp',
          payerPartyIdType: 'MSISDN',
          payerPartyIdentifier: '+2348012345678',
          payeeFspId: 'test-fsp',
          payeePartyIdType: 'MSISDN',
          payeePartyIdentifier: '+2348087654321',
          status: 'pending',
          transactionType: 'property_purchase',
        });
      }

      const status = await getPaymentStatus(txnId);
      expect(status?.amount).toBe(amount.toString());
    }
  });
});
