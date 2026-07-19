import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../../_core/trpc';
import {
  calculateRequiredCoverage,
  calculateInsurancePremium,
  createInsurancePolicy,
  createEscrowAccount,
  processEscrowDeposit,
  processInsurancePaymentFromEscrow,
  getPoliciesRequiringRenewal,
  renewInsurancePolicy,
  getEscrowAccountSummary,
  processAutomaticInsurancePayments,
} from '../../mortgageInsuranceService';
import { requireDb } from '../../db';
import {
  mortgageInsurancePolicies,
  escrowAccounts,
  escrowTransactions,
} from '../../../drizzle/schema';
import { eq, and, desc } from 'drizzle-orm';

export const mortgageInsuranceRouter = router({
  /**
   * Calculate required insurance coverage
   */
  calculateCoverage: protectedProcedure
    .input(
      z.object({
        loanAmount: z.number(),
        propertyValue: z.number(),
      })
    )
    .query(async ({ input }) => {
      const result = calculateRequiredCoverage(input.loanAmount, input.propertyValue);
      return result;
    }),

  /**
   * Calculate insurance premium
   */
  calculatePremium: protectedProcedure
    .input(
      z.object({
        coverageAmount: z.number(),
        propertyValue: z.number(),
        propertyType: z.string(),
        location: z.string(),
      })
    )
    .query(async ({ input }) => {
      const result = calculateInsurancePremium(input);
      return result;
    }),

  /**
   * Create insurance policy
   */
  createPolicy: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        insuranceProvider: z.string(),
        policyType: z.string(),
        coverageAmount: z.number(),
        annualPremium: z.number(),
        effectiveDate: z.date(),
        expirationDate: z.date(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await createInsurancePolicy(input);
      return result;
    }),

  /**
   * Get policies for application
   */
  getPolicies: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();

      const policies = await db
        .select()
        .from(mortgageInsurancePolicies)
        .where(eq(mortgageInsurancePolicies.applicationId, input.applicationId))
        .orderBy(desc(mortgageInsurancePolicies.createdAt));

      return policies;
    }),

  /**
   * Create escrow account
   */
  createEscrowAccount: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        monthlyInsurancePremium: z.number(),
        annualPropertyTax: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await createEscrowAccount(input);
      return result;
    }),

  /**
   * Get escrow account for application
   */
  getEscrowAccount: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();

      const [account] = await db
        .select()
        .from(escrowAccounts)
        .where(eq(escrowAccounts.applicationId, input.applicationId));

      return account || null;
    }),

  /**
   * Process escrow deposit
   */
  processDeposit: protectedProcedure
    .input(
      z.object({
        escrowAccountId: z.number(),
        amount: z.number(),
        description: z.string(),
        paymentTransactionId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await processEscrowDeposit(input);
      return result;
    }),

  /**
   * Process insurance payment from escrow
   */
  processInsurancePayment: protectedProcedure
    .input(
      z.object({
        escrowAccountId: z.number(),
        policyId: z.number(),
        amount: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await processInsurancePaymentFromEscrow(input);
      return result;
    }),

  /**
   * Get escrow account summary
   */
  getEscrowSummary: protectedProcedure
    .input(z.object({ escrowAccountId: z.number() }))
    .query(async ({ input }) => {
      const result = await getEscrowAccountSummary(input.escrowAccountId);
      return result;
    }),

  /**
   * Get escrow transactions
   */
  getEscrowTransactions: protectedProcedure
    .input(
      z.object({
        escrowAccountId: z.number(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await requireDb();

      const transactions = await db
        .select()
        .from(escrowTransactions)
        .where(eq(escrowTransactions.escrowAccountId, input.escrowAccountId))
        .orderBy(desc(escrowTransactions.createdAt))
        .limit(input.limit);

      return transactions;
    }),

  /**
   * Get policies requiring renewal
   */
  getPoliciesRequiringRenewal: protectedProcedure
    .input(z.object({ daysAhead: z.number().default(30) }))
    .query(async ({ input }) => {
      const result = await getPoliciesRequiringRenewal(input.daysAhead);
      return result;
    }),

  /**
   * Renew insurance policy
   */
  renewPolicy: protectedProcedure
    .input(
      z.object({
        policyId: z.number(),
        newExpirationDate: z.date(),
        newAnnualPremium: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await renewInsurancePolicy(input);
      return result;
    }),

  /**
   * Admin: Process automatic insurance payments
   */
  processAutomaticPayments: protectedProcedure.mutation(async () => {
    const result = await processAutomaticInsurancePayments();
    return result;
  }),
});
