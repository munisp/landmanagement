import { describe, it, expect, afterAll } from 'vitest';
import {
  createMortgageApplication,
  getMortgageApplicationById,
  getMortgageApplicationByNumericId,
  listMortgageApplicationsForUser,
  updateMortgageApplication,
  transitionMortgageApplicationStatus,
  getMortgageWorkflow,
  listAllMortgageApplicationRecords,
} from './mortgageApplicationRepository';
import {
  generatePaymentSchedule,
  getScheduleForApplication,
  processManualPayment,
  getPaymentStatsForApplication,
  getPaymentHistory,
} from './mortgagePaymentService';
import { requireDb } from './db';
import { mortgageApplications } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

/**
 * Mortgage consolidation coverage: the domain runs on relational tables with
 * honest business rules — no auto-seeded demo portfolios, no simulated
 * gateway success in production, identity-derived public codes.
 */

const APPLICANT = 101; // seeded user (migration 0015)
const OTHER_USER = 102;
const PARCEL = 1; // seeded parcel (migration 0012)

const PRIME = {
  userId: APPLICANT,
  propertyId: PARCEL,
  loanAmount: 20_000_000,
  interestRate: 18.5,
  loanTerm: 240,
  monthlyIncome: 2_000_000,
  employmentStatus: 'employed' as const,
  creditScore: 780,
};

describe('Mortgage applications — relational, no fabrication', () => {
  it('returns an empty portfolio for a user with no applications (no auto-seed)', async () => {
    const list = await listMortgageApplicationsForUser(OTHER_USER);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(0);
  });

  it('creates an application with an identity-derived public code and workflow events', async () => {
    const created = await createMortgageApplication(PRIME);
    expect(created.applicationId).toMatch(/^MORT-\d{4}-\d{6}$/);
    expect(created.transactionId).toBe(`TXN-MORT-${created.applicationId}`);
    expect(created.applicantId).toBe(APPLICANT);
    expect(created.monthlyPayment).toBeGreaterThan(0);
    expect(created.affordabilityRatio).toBeGreaterThan(0);

    // Prime borrower: low DSR + high credit + employed => auto-approved
    expect(created.status).toBe('approved');
    expect(created.outstandingBalance).toBe(created.loanAmount);

    const workflow = await getMortgageWorkflow(created.applicationId, APPLICANT);
    expect(workflow).not.toBeNull();
    expect(workflow!.events.length).toBeGreaterThanOrEqual(2);
    expect(workflow!.events[0].title).toBe('Application submitted');
  });

  it('auto-rejects applications breaching the 45% debt-service threshold', async () => {
    const created = await createMortgageApplication({
      ...PRIME,
      loanAmount: 400_000_000, // absurd relative to income
      monthlyIncome: 500_000,
    });
    expect(created.status).toBe('rejected');
    expect(created.rejectionReason).toContain('45%');
  });

  it('auto-rejects sub-threshold credit scores', async () => {
    const created = await createMortgageApplication({
      ...PRIME,
      creditScore: 500,
    });
    expect(created.status).toBe('rejected');
    expect(created.rejectionReason).toContain('Credit score');
  });

  it('scopes reads to the owning applicant', async () => {
    const created = await createMortgageApplication(PRIME);
    const other = await getMortgageApplicationById(created.applicationId, OTHER_USER);
    expect(other).toBeNull();
    const own = await getMortgageApplicationById(created.applicationId, APPLICANT);
    expect(own?.applicationId).toBe(created.applicationId);
    const byNumeric = await getMortgageApplicationByNumericId(created.id);
    expect(byNumeric?.applicationId).toBe(created.applicationId);
  });

  it('enforces the lifecycle transition map and rejection-reason rule', async () => {
    const created = await createMortgageApplication({
      ...PRIME,
      creditScore: 700, // solid but not auto-approve band
      monthlyIncome: 1_200_000,
    });
    expect(created.status).toBe('under_review');

    await expect(
      transitionMortgageApplicationStatus({
        applicationId: created.applicationId,
        actorId: 1,
        nextStatus: 'disbursed', // illegal: under_review -> disbursed
      })
    ).rejects.toThrow('Invalid lifecycle transition');

    await expect(
      transitionMortgageApplicationStatus({
        applicationId: created.applicationId,
        actorId: 1,
        nextStatus: 'rejected',
      })
    ).rejects.toThrow('rejection reason is required');

    const rejected = await transitionMortgageApplicationStatus({
      applicationId: created.applicationId,
      actorId: 1,
      nextStatus: 'rejected',
      rejectionReason: 'Incomplete income documentation',
    });
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectionReason).toBe('Incomplete income documentation');

    const workflow = await getMortgageWorkflow(created.applicationId);
    expect(workflow!.events.at(-1)!.status).toBe('rejected');
  });

  it('re-evaluates underwriting on edit and locks approved applications', async () => {
    const created = await createMortgageApplication(PRIME); // auto-approved
    await expect(
      updateMortgageApplication(created.applicationId, APPLICANT, { loanAmount: 30_000_000 })
    ).rejects.toThrow('can no longer be edited');

    const reviewable = await createMortgageApplication({ ...PRIME, creditScore: 700 });
    const edited = await updateMortgageApplication(reviewable.applicationId, APPLICANT, {
      monthlyIncome: 900_000,
    });
    expect(edited.status).toBe('pending'); // returns to pending after edit
    expect(edited.monthlyIncome).toBe(900_000);
  });

  it('lists every application across applicants for admin analytics', async () => {
    const all = await listAllMortgageApplicationRecords();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((a) => a.applicationId.startsWith('MORT-'))).toBe(true);
  });
});

describe('Mortgage payments — real schedule and outstanding-balance sync', () => {
  it('generates an amortization schedule and syncs balance on manual payment', async () => {
    const created = await createMortgageApplication(PRIME); // auto-approved
    await generatePaymentSchedule(created.id);

    const schedule = await getScheduleForApplication(created.id);
    expect(schedule.length).toBe(PRIME.loanTerm);
    expect(schedule[0].isPaid).toBe(false);
    // remaining balance decreases monotonically
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].remainingBalance).toBeLessThanOrEqual(schedule[i - 1].remainingBalance);
    }

    // Pay the first installment manually (registrar-attested payment)
    const first = schedule[0];
    const result = await processManualPayment({
      applicationId: created.id,
      amount: first.totalAmount,
      paymentMethod: 'bank_transfer',
      gatewayReference: 'TEST-BRANCH-RECEIPT-001',
    });
    expect(result.success).toBe(true);
    expect(result.transactionId).toMatch(/^PAY-\d{10}$/);

    // Outstanding balance on the application must reflect the real schedule
    const db = await requireDb();
    const [app] = await db
      .select()
      .from(mortgageApplications)
      .where(eq(mortgageApplications.id, created.id))
      .limit(1);
    // Outstanding = remainingBalance recorded on the most recent paid row
    expect(app.outstandingBalance).toBe(schedule[0].remainingBalance);

    const stats = await getPaymentStatsForApplication(created.id);
    expect(stats.paymentsMade).toBe(1);
    expect(stats.totalPaid).toBe(first.totalAmount);

    const history = await getPaymentHistory(created.id);
    expect(history.length).toBe(1);
    expect(history[0].status).toBe('completed');
  });
});
