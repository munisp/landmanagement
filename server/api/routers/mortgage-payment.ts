import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import {
  calculateEarlyPayoffOffline,
  calculateRefinancingOptionsOffline,
  createMandateForApplication,
  generateScheduleForApplication,
  getMandateForApplication,
  getPaymentStatsForApplication,
  getScheduleForApplication,
  getUpcomingPaymentsForApplication,
  listAllMandatesOffline,
  listPaymentHistoryForApplication,
  makeExtraPrincipalPaymentOffline,
  makeManualPaymentRecord,
  processAutomaticDebitsOffline,
  processEarlyPayoffOffline,
  reactivateMandateRecord,
  submitRefinancingApplicationOffline,
  suspendMandateRecord,
} from '../../mortgagePaymentRepository';

export const mortgagePaymentRouter = router({
  /**
   * Generate payment schedule for an approved or disbursed mortgage application
   */
  generateSchedule: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .mutation(async ({ input }) => {
      return generateScheduleForApplication(input.applicationId);
    }),

  /**
   * Get payment schedule for an application
   */
  getSchedule: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      return getScheduleForApplication(input.applicationId);
    }),

  /**
   * Create auto-debit mandate
   */
  createMandate: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        accountNumber: z.string(),
        accountName: z.string(),
        bankCode: z.string(),
        bankName: z.string(),
        gatewayProvider: z.enum(['paystack', 'flutterwave']),
      })
    )
    .mutation(async ({ input }) => {
      return createMandateForApplication(input);
    }),

  /**
   * Get mandate details
   */
  getMandate: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      return getMandateForApplication(input.applicationId);
    }),

  /**
   * Suspend auto-debit mandate
   */
  suspendMandate: protectedProcedure
    .input(z.object({ mandateId: z.string(), reason: z.string() }))
    .mutation(async ({ input }) => {
      return suspendMandateRecord(input.mandateId, input.reason);
    }),

  /**
   * Reactivate auto-debit mandate
   */
  reactivateMandate: protectedProcedure
    .input(z.object({ mandateId: z.string() }))
    .mutation(async ({ input }) => {
      return reactivateMandateRecord(input.mandateId);
    }),

  /**
   * Process manual payment
   */
  makePayment: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        amount: z.number().positive(),
        paymentMethod: z.string(),
        paymentGateway: z.string().optional(),
        gatewayReference: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return makeManualPaymentRecord(input);
    }),

  /**
   * Get payment history
   */
  getPaymentHistory: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      return listPaymentHistoryForApplication(input.applicationId);
    }),

  /**
   * Get payment statistics
   */
  getPaymentStats: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      return getPaymentStatsForApplication(input.applicationId);
    }),

  /**
   * Get upcoming payments
   */
  getUpcomingPayments: protectedProcedure
    .input(z.object({ applicationId: z.number(), limit: z.number().default(5) }))
    .query(async ({ input }) => {
      return getUpcomingPaymentsForApplication(input.applicationId, input.limit);
    }),

  /**
   * Admin: Process automatic debits (scheduled job)
   */
  processAutoDebits: protectedProcedure.mutation(async () => {
    return processAutomaticDebitsOffline();
  }),

  /**
   * Admin: Get all mandates
   */
  getAllMandates: protectedProcedure
    .input(
      z.object({
        status: z.enum(['pending', 'active', 'suspended', 'cancelled', 'expired']).optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      return listAllMandatesOffline({ status: input.status, limit: input.limit });
    }),

  /**
   * Calculate early payoff amount
   */
  calculateEarlyPayoff: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      return calculateEarlyPayoffOffline(input.applicationId);
    }),

  /**
   * Process early payoff
   */
  processEarlyPayoff: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        paymentMethod: z.string(),
        paymentGateway: z.string().optional(),
        gatewayReference: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return processEarlyPayoffOffline(input);
    }),

  /**
   * Make extra principal payment
   */
  makeExtraPayment: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        amount: z.number().positive(),
        paymentMethod: z.string(),
        paymentGateway: z.string().optional(),
        gatewayReference: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return makeExtraPrincipalPaymentOffline(input);
    }),

  /**
   * Calculate refinancing options
   */
  calculateRefinancing: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      return calculateRefinancingOptionsOffline(input.applicationId);
    }),

  /**
   * Submit refinancing application
   */
  submitRefinancing: protectedProcedure
    .input(
      z.object({
        originalApplicationId: z.number(),
        newRate: z.string(),
        newTerm: z.number().positive(),
        reason: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      return submitRefinancingApplicationOffline(input);
    }),
});
