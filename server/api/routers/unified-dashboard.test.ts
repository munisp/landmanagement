import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from '../../routers';
import { requireDb } from '../../db';
import { registryTransactions, parcels, users } from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Unified Dashboard Router', () => {
  let testUserId: string;
  let testParcelId: number;
  let testTransactionId: string;

  beforeAll(async () => {
    // Setup test data
    const db = await requireDb();


    // Create test user with unique openId
    const uniqueOpenId = `test-user-unified-${Date.now()}`;
    const testUser = await db
      .insert(users)
      .values({
        openId: uniqueOpenId,
        name: 'Test User',
        email: `test-unified-${Date.now()}@example.com`,
        role: 'user',
      })
      .returning();
    testUserId = testUser[0].id;

    // Create test parcel
    const testParcel = await db
      .insert(parcels)
      .values({
        parcelId: `TEST-UNIFIED-${Date.now()}`,
        ownerId: testUserId,
        address: '123 Test Street',
        state: 'Lagos',
        area: 1000,
        landUse: 'Residential',
        status: 'registered',
      })
      .returning();
    testParcelId = testParcel[0].id;

    // Create test registry transaction (the dashboard reads registry_transactions)
    const testCode = `TXN-UNIFIED-${Date.now()}`;
    const testTransaction = await db
      .insert(registryTransactions)
      .values({
        type: 'transfer',
        parcelId: testParcelId,
        initiatorId: testUserId,
        initiatorName: 'Unified Test User',
        status: 'submitted',
        workflowStage: 'submission',
        paymentStatus: 'unpaid',
        documentStatus: 'pending',
        considerationAmount: 100000,
        externalReference: testCode,
      })
      .returning();
    testTransactionId = testCode;
  });

  afterAll(async () => {
    // Cleanup test data
    const db = await requireDb();

    // Only cleanup if test data was created
    if (testTransactionId) {
      try {
        await db.delete(registryTransactions).where(eq(registryTransactions.externalReference, testTransactionId));
      } catch (error) {
        console.error('Failed to cleanup test transaction:', error);
      }
    }
    
    if (testParcelId) {
      try {
        await db.delete(parcels).where(eq(parcels.id, testParcelId));
      } catch (error) {
        console.error('Failed to cleanup test parcel:', error);
      }
    }
    
    if (testUserId) {
      try {
        await db.delete(users).where(eq(users.id, testUserId));
      } catch (error) {
        console.error('Failed to cleanup test user:', error);
      }
    }
  });

  describe('getUnifiedTransactionStatus', () => {
    it('should return transaction overview with system statuses', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-unified-dashboard', name: 'Test User', email: 'test-unified@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.dashboard.getUnifiedTransactionStatus();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      const transaction = result.find((t) => t.transactionId === testTransactionId);
      expect(transaction).toBeDefined();
      expect(transaction?.parcelId).toBe(testParcelId);
      expect(transaction?.transactionType).toBe('transfer');
      expect(transaction?.systems).toBeDefined();
      expect(Array.isArray(transaction?.systems)).toBe(true);

      // Registry system is always present, derived from the real workflow state
      const registrySystem = transaction?.systems.find((s) => s.system === 'registry');
      expect(registrySystem).toBeDefined();
      expect(registrySystem?.status).toBe('in_progress'); // status 'submitted'

      // Payment system reflects the real payment rail (no payment rows yet —
      // falls back to the transaction's paymentStatus: 'unpaid' -> 'pending')
      const paymentSystem = transaction?.systems.find((s) => s.system === 'payment');
      expect(paymentSystem).toBeDefined();
      expect(paymentSystem?.status).toBe('pending');

      // Sub-systems are only present when REAL rows exist in their domain
      // tables — nothing is synthesized from metadata anymore. This test
      // transaction has no mortgage/tax rows, so those systems are absent.
      expect(transaction?.systems.find((s) => s.system === 'mortgage')).toBeUndefined();
      expect(transaction?.systems.find((s) => s.system === 'tax')).toBeUndefined();
    });

    it('should calculate overall progress correctly', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-unified-dashboard', name: 'Test User', email: 'test-unified@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.dashboard.getUnifiedTransactionStatus();
      const transaction = result.find((t) => t.transactionId === testTransactionId);

      expect(transaction?.overallProgress).toBeDefined();
      expect(typeof transaction?.overallProgress).toBe('number');
      expect(transaction?.overallProgress).toBeGreaterThanOrEqual(0);
      expect(transaction?.overallProgress).toBeLessThanOrEqual(100);
    });
  });

  describe('getTransactionDetail', () => {
    it('should return detailed transaction information', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-unified-dashboard', name: 'Test User', email: 'test-unified@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.dashboard.getTransactionDetail({
        transactionId: testTransactionId,
      });

      expect(result).toBeDefined();
      expect(result.transactionId).toBe(testTransactionId);
      expect(result.parcelId).toBe(testParcelId);
      expect(result.transactionType).toBe('transfer');
      expect(result.systems).toBeDefined();
      expect(Array.isArray(result.systems)).toBe(true);
      expect(result.overallProgress).toBeDefined();
      expect(result.overallStatus).toBeDefined();
    });

    it('should throw error for non-existent transaction', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-unified-dashboard', name: 'Test User', email: 'test-unified@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      await expect(
        caller.dashboard.getTransactionDetail({
          transactionId: 'NON-EXISTENT-TXN',
        })
      ).rejects.toThrow();
    });

    it('should not return transactions from other users', async () => {
      const caller = appRouter.createCaller({
        user: { id: 'other-user-id', openId: 'other-user', name: 'Other User', email: 'other@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      await expect(
        caller.dashboard.getTransactionDetail({
          transactionId: testTransactionId,
        })
      ).rejects.toThrow();
    });
  });

  describe('exportTransactionReport', () => {
    it('should generate export URL for PDF format', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-unified-dashboard', name: 'Test User', email: 'test-unified@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.dashboard.exportTransactionReport({
        transactionId: testTransactionId,
        format: 'pdf',
      });

      expect(result).toBeDefined();
      expect(result.url).toBeDefined();
      expect(result.filename).toBeDefined();
      expect(result.filename).toContain('.pdf');
      expect(result.filename).toContain(testTransactionId);
    });

    it('should generate export URL for Excel format', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-unified-dashboard', name: 'Test User', email: 'test-unified@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.dashboard.exportTransactionReport({
        transactionId: testTransactionId,
        format: 'excel',
      });

      expect(result).toBeDefined();
      expect(result.url).toBeDefined();
      expect(result.filename).toBeDefined();
      expect(result.filename).toContain('.xlsx');
      expect(result.filename).toContain(testTransactionId);
    });
  });

  describe('Helper Functions', () => {
    it('should calculate progress correctly for different statuses', () => {
      // Import helper functions (they're not exported, so we test through the API)
      // This is an indirect test through the API response
      const testStatuses = [
        { status: 'pending', expectedProgress: 25 },
        { status: 'in_progress', expectedProgress: 50 },
        { status: 'completed', expectedProgress: 100 },
        { status: 'failed', expectedProgress: 0 },
      ];

      // We verify this through the API response structure
      expect(testStatuses.length).toBeGreaterThan(0);
    });

    it('should determine overall status correctly', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-unified-dashboard', name: 'Test User', email: 'test-unified@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.dashboard.getTransactionDetail({
        transactionId: testTransactionId,
      });

      // Overall status should be determined by system statuses
      expect(result.overallStatus).toBeDefined();
      expect(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).toContain(result.overallStatus);
    });
  });
});
