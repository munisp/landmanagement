import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from '../../routers';
import { requireDb } from '../../db';
import { 
  mortgageApplications, 
  taxClearances, 
  insurancePolicies,
  legalDocuments,
  cadastralSurveys,
  environmentalAssessments,
  publicNotices,
  landUsePlans,
  parcels, 
  users,
} from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Phase 4 Router', () => {
  let testUserId: number;
  let testParcelId: number;
  let testTransactionId: string;
  let testMortgageId: string;
  let testTaxClearanceId: string;
  let testInsurancePolicyId: string;

  beforeAll(async () => {
    // Setup test data
    const db = await requireDb();


    // Create test user
    const uniqueOpenId = `test-user-phase4-${Date.now()}`;
    const testUser = await db
      .insert(users)
      .values({
        openId: uniqueOpenId,
        name: 'Test User Phase4',
        email: `test-phase4-${Date.now()}@example.com`,
        role: 'user',
      })
      .returning();
    testUserId = testUser[0].id;

    // Create test parcel
    const testParcel = await db
      .insert(parcels)
      .values({
        parcelId: `TEST-PHASE4-${Date.now()}`,
        ownerId: testUserId,
        address: '123 Phase4 Test Street',
        state: 'Lagos',
        area: 1000,
        landUse: 'Residential',
        status: 'registered',
      })
      .returning();
    testParcelId = testParcel[0].id;

    // Sub-system records reference the transaction by public code
    testTransactionId = `TXN-PHASE4-${Date.now()}`;
  });

  afterAll(async () => {
    // Cleanup test data
    const db = await requireDb();

    // Clean up in reverse order of dependencies
    if (testMortgageId) {
      try {
        await db.delete(mortgageApplications).where(eq(mortgageApplications.applicationId, testMortgageId));
      } catch (error) {
        console.error('Failed to cleanup mortgage application:', error);
      }
    }

    if (testTaxClearanceId) {
      try {
        await db.delete(taxClearances).where(eq(taxClearances.clearanceId, testTaxClearanceId));
      } catch (error) {
        console.error('Failed to cleanup tax clearance:', error);
      }
    }

    if (testInsurancePolicyId) {
      try {
        await db.delete(insurancePolicies).where(eq(insurancePolicies.policyId, testInsurancePolicyId));
      } catch (error) {
        console.error('Failed to cleanup insurance policy:', error);
      }
    }

    if (testTransactionId) {
      try {
      } catch (error) {
        console.error('Failed to cleanup transaction:', error);
      }
    }

    if (testParcelId) {
      try {
        await db.delete(parcels).where(eq(parcels.id, testParcelId));
      } catch (error) {
        console.error('Failed to cleanup parcel:', error);
      }
    }

    if (testUserId) {
      try {
        await db.delete(users).where(eq(users.id, testUserId));
      } catch (error) {
        console.error('Failed to cleanup user:', error);
      }
    }
  });

  describe('Mortgage Applications', () => {
    it('should create a mortgage application', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-phase4', name: 'Test User', email: 'test@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.phase4.createMortgageApplication({
        transactionId: testTransactionId,
        parcelId: testParcelId,
        loanAmount: 5000000,
        interestRate: '5.5',
        loanTerm: 240, // 20 years
        monthlyPayment: 34000,
        downPayment: 1000000,
        bankName: 'Test Bank',
        bankBranch: 'Test Branch',
      });

      expect(result).toBeDefined();
      expect(result.applicationId).toBeDefined();
      expect(result.transactionId).toBe(testTransactionId);
      expect(result.loanAmount).toBe(5000000);
      expect(result.status).toBe('pending');

      testMortgageId = result.applicationId;
    });

    it('should get mortgage application by ID', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-phase4', name: 'Test User', email: 'test@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.phase4.getMortgageApplication({
        applicationId: testMortgageId,
      });

      expect(result).toBeDefined();
      expect(result.applicationId).toBe(testMortgageId);
      expect(result.applicantId).toBe(testUserId);
    });

    it('should get my mortgage applications', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-phase4', name: 'Test User', email: 'test@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.phase4.getMyMortgageApplications();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].applicantId).toBe(testUserId);
    });
  });

  describe('Tax Clearances', () => {
    it('should create a tax clearance', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-phase4', name: 'Test User', email: 'test@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.phase4.createTaxClearance({
        transactionId: testTransactionId,
        parcelId: testParcelId,
        taxYear: 2024,
        taxAmount: 500000,
        paidAmount: 500000,
        outstandingAmount: 0,
      });

      expect(result).toBeDefined();
      expect(result.clearanceId).toBeDefined();
      expect(result.transactionId).toBe(testTransactionId);
      expect(result.status).toBe('pending');

      testTaxClearanceId = result.clearanceId;
    });

    it('should get tax clearance by ID', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-phase4', name: 'Test User', email: 'test@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.phase4.getTaxClearance({
        clearanceId: testTaxClearanceId,
      });

      expect(result).toBeDefined();
      expect(result.clearanceId).toBe(testTaxClearanceId);
      expect(result.ownerId).toBe(testUserId);
    });

    it('should get my tax clearances', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-phase4', name: 'Test User', email: 'test@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.phase4.getMyTaxClearances();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].ownerId).toBe(testUserId);
    });
  });

  describe('Insurance Policies', () => {
    it('should create an insurance policy', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-phase4', name: 'Test User', email: 'test@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.phase4.createInsurancePolicy({
        transactionId: testTransactionId,
        parcelId: testParcelId,
        providerName: 'Test Insurance Co.',
        policyType: 'Building',
        coverageAmount: 10000000,
        premiumAmount: 200000,
        effectiveDate: new Date(),
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      });

      expect(result).toBeDefined();
      expect(result.policyId).toBeDefined();
      expect(result.transactionId).toBe(testTransactionId);
      expect(result.status).toBe('pending');

      testInsurancePolicyId = result.policyId;
    });

    it('should get insurance policy by ID', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-phase4', name: 'Test User', email: 'test@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.phase4.getInsurancePolicy({
        policyId: testInsurancePolicyId,
      });

      expect(result).toBeDefined();
      expect(result.policyId).toBe(testInsurancePolicyId);
      expect(result.policyHolderId).toBe(testUserId);
    });

    it('should get insurance policies by parcel', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-phase4', name: 'Test User', email: 'test@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.phase4.getInsurancePoliciesByParcel({
        parcelId: testParcelId,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].parcelId).toBe(testParcelId);
    });
  });

  describe('Unified Status', () => {
    it('should get transaction Phase 4 status', async () => {
      const caller = appRouter.createCaller({
        user: { id: testUserId, openId: 'test-user-phase4', name: 'Test User', email: 'test@example.com', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.phase4.getTransactionPhase4Status({
        transactionId: testTransactionId,
      });

      expect(result).toBeDefined();
      expect(result.mortgage).toBeDefined();
      expect(result.tax).toBeDefined();
      expect(result.insurance).toBeDefined();
      expect(result.legal).toBeDefined();
      expect(result.survey).toBeDefined();
      expect(result.environmental).toBeDefined();
      expect(result.publicNotice).toBeDefined();
      expect(result.landUse).toBeDefined();

      // Verify we have data for the systems we created
      expect(result.mortgage?.applicationId).toBe(testMortgageId);
      expect(result.tax?.clearanceId).toBe(testTaxClearanceId);
      expect(result.insurance?.policyId).toBe(testInsurancePolicyId);
    });
  });
});
