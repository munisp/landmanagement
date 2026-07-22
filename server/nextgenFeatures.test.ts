import { describe, expect, it } from 'vitest';
import * as titleRiskService from './titleRiskService';
import * as registryIntegrityService from './registryIntegrityService';
import * as escrowSettlementService from './escrowSettlementService';
import * as mortgageExplainabilityService from './mortgageExplainabilityService';
import * as dataExchangeGatewayService from './dataExchangeGatewayService';
import * as clearanceExchangeService from './clearanceExchangeService';

/**
 * Next-generation feature services — regression coverage against real
 * PostgreSQL (PGlite fixture with the production migration chain).
 */

describe('Title Risk Copilot', () => {
  it('assesses a known parcel and returns a banded score with factors', async () => {
    const result = await titleRiskService.assessTitleRisk({ parcelId: 1 });
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(['low', 'medium', 'high', 'critical']).toContain(result.riskBand);
    expect(result.factors.length).toBe(6);
    const weightSum = result.factors.reduce((sum, f) => sum + f.weight, 0);
    expect(weightSum).toBe(100);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('rejects unknown parcels', async () => {
    await expect(titleRiskService.assessTitleRisk({ parcelId: 999999 })).rejects.toThrow();
  });

  it('lists assessments and summarizes the portfolio', async () => {
    await titleRiskService.assessTitleRisk({ parcelId: 1 });
    await titleRiskService.assessTitleRisk({ parcelId: 2 });
    const list = await titleRiskService.listRiskAssessments({ limit: 10 });
    expect(list.length).toBeGreaterThanOrEqual(2);
    const summary = await titleRiskService.getPortfolioRiskSummary();
    expect(summary.totalAssessments).toBeGreaterThanOrEqual(2);
    expect(summary.averageScore).toBeGreaterThanOrEqual(0);
  });
});

describe('Registry Integrity Monitoring', () => {
  it('runs a scan and produces a structured summary', async () => {
    const summary = await registryIntegrityService.runIntegrityScan({ detectedBy: 'test' });
    expect(summary.scanRunId).toMatch(/^SCAN-/);
    expect(summary.parcelsScanned).toBeGreaterThan(0);
    expect(summary.newFindings + summary.deduplicated).toBeGreaterThanOrEqual(0);
    expect(typeof summary.byCheckType).toBe('object');
  });

  it('supports the operator review queue lifecycle', async () => {
    await registryIntegrityService.runIntegrityScan({ detectedBy: 'test' });
    const open = await registryIntegrityService.listFindings({ status: 'open', limit: 10 });
    expect(Array.isArray(open)).toBe(true);
    if (open.length > 0 && open[0].id) {
      const ack = await registryIntegrityService.acknowledgeFinding(open[0].id, 1);
      expect(ack.success).toBe(true);
      const res = await registryIntegrityService.resolveFinding(open[0].id, 1, 'verified false positive');
      expect(res.success).toBe(true);
    }
  });

  it('reports queue statistics', async () => {
    const stats = await registryIntegrityService.getIntegrityStats();
    expect(stats.total).toBeGreaterThanOrEqual(0);
    expect(stats.byStatus).toBeDefined();
  });
});

describe('Programmable Escrow Settlement Orchestrator', () => {
  it('creates a settlement with the default checkpoint template', async () => {
    const settlement = await escrowSettlementService.createSettlement({
      transactionId: 1,
      amount: 25000000,
      financed: true,
    });
    expect(settlement.settlementRef).toMatch(/^STL-/);
    expect(settlement.status).toBe('pending');
    expect(settlement.checkpoints.map((c) => c.checkpointKey)).toContain('mortgage_approved');
    expect(settlement.blockingReasons.length).toBeGreaterThan(0);
  });

  it('transitions deterministically from pending to release_ready', async () => {
    const settlement = await escrowSettlementService.createSettlement({ amount: 5000000 });
    for (const cp of settlement.checkpoints) {
      await escrowSettlementService.fulfillCheckpoint(settlement.id, cp.checkpointKey, 1, { ref: 'test' });
    }
    const recomputed = await escrowSettlementService.recomputeSettlement(settlement.id);
    expect(recomputed.status).toBe('release_ready');
    expect(recomputed.blockingReasons.length).toBe(0);
  });

  it('blocks release when required checkpoints fail', async () => {
    const settlement = await escrowSettlementService.createSettlement({ amount: 1000000 });
    await escrowSettlementService.failCheckpoint(settlement.id, 'title_verified', 1, 'title defect found');
    const recomputed = await escrowSettlementService.recomputeSettlement(settlement.id);
    expect(recomputed.status).toBe('blocked');
    await expect(escrowSettlementService.releaseSettlement(settlement.id, 1)).rejects.toThrow();
  });

  it('releases only when release-ready and records the release', async () => {
    const settlement = await escrowSettlementService.createSettlement({ amount: 7500000 });
    for (const cp of settlement.checkpoints) {
      await escrowSettlementService.fulfillCheckpoint(settlement.id, cp.checkpointKey, 1);
    }
    const released = await escrowSettlementService.releaseSettlement(settlement.id, 1);
    expect(released.status).toBe('released');
    expect(released.releasedAt).toBeDefined();
    await expect(escrowSettlementService.cancelSettlement(settlement.id)).rejects.toThrow();
  });
});

describe('Explainable Mortgage Decisioning', () => {
  it('produces factor-level explanations for a real application', async () => {
    const apps = await import('./mortgageApplicationRepository');
    // Create a real application (no auto-seeding anywhere in the platform).
    const created = await apps.createMortgageApplication({
      userId: 1,
      propertyId: 1,
      loanAmount: 25_000_000,
      interestRate: 18.5,
      loanTerm: 240,
      monthlyIncome: 1_500_000,
      employmentStatus: 'employed',
      creditScore: 720,
    });
    const explanation = await mortgageExplainabilityService.explainApplication({
      applicationId: created.id,
    });
    expect(explanation.factors.length).toBe(6);
    expect(['approve', 'approve_with_conditions', 'manual_review', 'decline']).toContain(explanation.recommendation);
    const weightSum = explanation.factors.reduce((sum, f) => sum + f.weight, 0);
    expect(weightSum).toBe(100);
    for (const factor of explanation.factors) {
      expect(factor.explanation.length).toBeGreaterThan(0);
      expect(['positive', 'neutral', 'negative']).toContain(factor.impact);
    }
  });
});

describe('Privacy-Aware Data Exchange Gateway', () => {
  it('denies unknown purposes and records an audit id', async () => {
    const result = await dataExchangeGatewayService.authorizeExchange({
      subjectUserId: 1,
      requestorRole: 'admin',
      purpose: 'not_a_real_purpose',
      dataCategories: ['identity'],
    });
    expect(result.decision).toBe('denied');
    expect(result.reasons[0]).toContain('not a recognized exchange purpose');
    expect(result.auditId).toBeDefined();
  });

  it('denies unauthorized roles for a known purpose', async () => {
    const result = await dataExchangeGatewayService.authorizeExchange({
      subjectUserId: 1,
      requestorRole: 'random_citizen',
      purpose: 'mortgage_underwriting',
      dataCategories: ['identity'],
    });
    expect(result.decision).toBe('denied');
    expect(result.reasons.join(' ')).toContain('not authorized');
  });

  it('flags out-of-scope categories as conditional conditions', async () => {
    const result = await dataExchangeGatewayService.authorizeExchange({
      subjectUserId: 1,
      requestorRole: 'admin',
      purpose: 'statistical_reporting',
      dataCategories: ['property', 'biometrics'],
    });
    expect(['conditional', 'allowed']).toContain(result.decision);
    if (result.decision === 'conditional') {
      expect(result.conditions.join(' ')).toContain('biometrics');
    }
  });

  it('exposes purpose policies', () => {
    const policies = dataExchangeGatewayService.getPurposePolicies();
    expect(Object.keys(policies)).toContain('mortgage_underwriting');
  });
});


let clearanceFixtureSequence = 0;

async function createTestRegistryTransaction(): Promise<number> {
  const [{ createTransaction }, { requireDb }, { users, parcels }] = await Promise.all([
    import('./transactionRepository'),
    import('./db'),
    import('../drizzle/schema'),
  ]);
  const db = await requireDb();
  const sequence = ++clearanceFixtureSequence;
  const [user] = await db.insert(users).values({
    openId: `clearance-test-user-${sequence}`,
    name: 'Clearance Test Initiator',
    email: `clearance-test-${sequence}@example.test`,
    role: 'registrar',
  }).returning();
  const [parcel] = await db.insert(parcels).values({
    parcelId: `CLR-TEST-${sequence}`,
    parcelNumber: `CLR-TEST-${sequence}`,
    surveyPlanNumber: `SP-CLR-${sequence}`,
    ownerId: user.id,
    country: 'Nigeria',
    state: 'Lagos',
    lga: 'Eti-Osa',
    area: 1000,
    landUse: 'residential',
    latitude: '6.4281',
    longitude: '3.4219',
    status: 'draft',
  }).returning();
  const tx = await createTransaction({
    type: 'transfer',
    parcelId: parcel.id,
    initiatorId: user.id,
    initiatorName: user.name ?? 'Clearance Test Initiator',
    considerationAmount: 1000000,
  });
  return tx.id;
}

describe('Federated Inter-Agency Clearance Exchange', () => {
  it('initiates the full agency catalog idempotently', async () => {
    const txId = await createTestRegistryTransaction();
    const first = await clearanceExchangeService.initiateClearances({ transactionId: txId });
    expect(first.length).toBe(clearanceExchangeService.AGENCY_CATALOG.length);
    const second = await clearanceExchangeService.initiateClearances({ transactionId: txId });
    expect(second.length).toBe(first.length); // idempotent, no duplicates
  });

  it('tracks unified state from in_progress to cleared', async () => {
    const txId = await createTestRegistryTransaction();
    await clearanceExchangeService.initiateClearances({ transactionId: txId });
    let state = await clearanceExchangeService.getClearanceState(txId);
    expect(state.overall).toBe('in_progress');

    for (const agency of clearanceExchangeService.AGENCY_CATALOG) {
      await clearanceExchangeService.submitClearance({ transactionId: txId, agency: agency.key });
      await clearanceExchangeService.decideClearance({ transactionId: txId, agency: agency.key, decision: 'approved' });
    }
    state = await clearanceExchangeService.getClearanceState(txId);
    expect(state.overall).toBe('cleared');
    expect(state.requiredApproved).toBe(state.requiredTotal);
  });

  it('marks rejected required agencies as blocking', async () => {
    const txId = await createTestRegistryTransaction();
    await clearanceExchangeService.initiateClearances({ transactionId: txId });
    await clearanceExchangeService.decideClearance({
      transactionId: txId,
      agency: 'firs_tax',
      decision: 'rejected',
      notes: 'outstanding tax liability',
    });
    const state = await clearanceExchangeService.getClearanceState(txId);
    expect(state.overall).toBe('blocked');
    expect(state.blockingAgencies.join(' ')).toContain('Tax');
  });
});
