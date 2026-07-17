import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../../_core/trpc';
import {
  registerBroker,
  approveBroker,
  getBrokerDetails,
  getBrokerByUserId,
  addClient,
  getBrokerClients,
  submitApplicationForClient,
  calculateCommission,
  approveCommission,
  markCommissionPaid,
  getBrokerCommissions,
  getBrokerPerformance,
  updateCommissionStructure,
} from '../../mortgageBrokerService';
import {
  calculateBrokerCommission,
  calculateAllBrokerCommissions,
  generateCommissionStatement,
  generateTaxDocumentation,
  approveCommissions,
  processCommissionPayment,
  runMonthlyCommissionPayout,
  getBrokerCommissionHistory,
  disputeCommission,
} from '../../brokerCommissionAutomation';
export const mortgageBrokerRouter = router({
  /**
   * Register as a mortgage broker
   */
  register: protectedProcedure
    .input(
      z.object({
        companyName: z.string(),
        licenseNumber: z.string(),
        licenseExpiryDate: z.string().transform((val) => new Date(val)),
        businessPhone: z.string(),
        businessEmail: z.string().email(),
        businessAddress: z.string(),
        defaultCommissionRate: z.number().min(0).max(10000), // basis points
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await registerBroker({
        userId: ctx.user.id,
        ...input,
      });
      return result;
    }),

  /**
   * Approve broker registration (admin only)
   */
  approve: protectedProcedure
    .input(
      z.object({
        brokerId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await approveBroker({
        brokerId: input.brokerId,
        approvedBy: ctx.user.id,
      });
      return result;
    }),

  /**
   * Get broker details
   */
  getDetails: protectedProcedure
    .input(z.object({ brokerId: z.string() }))
    .query(async ({ input }) => {
      const result = await getBrokerDetails(input.brokerId);
      return result;
    }),

  /**
   * Get current user's broker profile
   */
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
      const result = await getBrokerByUserId(ctx.user.id);
    return result;
  }),

  /**
   * Add client to portfolio
   */
  addClient: protectedProcedure
    .input(
      z.object({
        brokerId: z.string(),
        clientName: z.string(),
        clientEmail: z.string().email(),
        clientPhone: z.string(),
        clientNIN: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await addClient(input);
      return result;
    }),

  /**
   * Get broker clients
   */
  getClients: protectedProcedure
    .input(z.object({ brokerId: z.string() }))
    .query(async ({ input }) => {
      const result = await getBrokerClients(input.brokerId);
      return result;
    }),

  /**
   * Submit application on behalf of client
   */
  submitApplication: protectedProcedure
    .input(
      z.object({
        brokerId: z.string(),
        clientId: z.number(),
        applicationId: z.number(),
        submissionNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await submitApplicationForClient(input);
      return result;
    }),

  /**
   * Calculate commission for application
   */
  calculateCommission: protectedProcedure
    .input(
      z.object({
        brokerId: z.string(),
        applicationId: z.number(),
        loanAmount: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await calculateCommission(input);
      return result;
    }),

  /**
   * Approve commission (admin only)
   */
  approveCommission: protectedProcedure
    .input(
      z.object({
        commissionId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await approveCommission({
        commissionId: input.commissionId,
        approvedBy: ctx.user.id,
      });
      return result;
    }),

  /**
   * Mark commission as paid (admin only)
   */
  markCommissionPaid: protectedProcedure
    .input(
      z.object({
        commissionId: z.string(),
        paymentReference: z.string(),
      })
    )
    .mutation(async ({ input }) => {
       const result = await markCommissionPaid(input);
      return result;
    }),

  /**
   * Get broker commissions
   */
  getCommissions: protectedProcedure
    .input(
      z.object({
        brokerId: z.string(),
        status: z.enum(['pending', 'approved', 'paid', 'cancelled']).optional(),
      })
    )
    .query(async ({ input }) => {
      const result = await getBrokerCommissions(input);
      return result;
    }),

  /**
   * Get broker performance analytics
   */
  getPerformance: protectedProcedure
    .input(z.object({ brokerId: z.string() }))
    .query(async ({ input }) => {
      const result = await getBrokerPerformance(input.brokerId);
      return result;
    }),

  /**
   * Update commission structure
   */
  updateCommissionStructure: protectedProcedure
    .input(
      z.object({
        brokerId: z.string(),
        tier: z.enum(['standard', 'premium', 'platinum', 'custom']),
        commissionRate: z.number().min(0).max(10000),
        minLoanAmount: z.number(),
        maxLoanAmount: z.number().optional(),
        effectiveFrom: z.string().transform((val) => new Date(val)),
      })
    )
    .mutation(async ({ input }) => {
      const result = await updateCommissionStructure(input);
      return result;
    }),

  /**
   * Calculate broker commission for period
   */
  calculatePeriodCommission: protectedProcedure
    .input(
      z.object({
        brokerId: z.number(),
        startDate: z.string().transform((val) => new Date(val)),
        endDate: z.string().transform((val) => new Date(val)),
      })
    )
    .query(async ({ input }) => {
      const result = await calculateBrokerCommission(
        input.brokerId,
        input.startDate,
        input.endDate
      );
      return result;
    }),

  /**
   * Calculate all broker commissions for period
   */
  calculateAllCommissions: protectedProcedure
    .input(
      z.object({
        startDate: z.string().transform((val) => new Date(val)),
        endDate: z.string().transform((val) => new Date(val)),
      })
    )
    .query(async ({ input }) => {
      const result = await calculateAllBrokerCommissions(
        input.startDate,
        input.endDate
      );
      return result;
    }),

  /**
   * Generate commission statement
   */
  generateStatement: protectedProcedure
    .input(
      z.object({
        brokerId: z.number(),
        startDate: z.string().transform((val) => new Date(val)),
        endDate: z.string().transform((val) => new Date(val)),
      })
    )
    .mutation(async ({ input }) => {
      const calculation = await calculateBrokerCommission(
        input.brokerId,
        input.startDate,
        input.endDate
      );
      if (!calculation) throw new Error('No commission data found');
      const statement = await generateCommissionStatement(calculation);
      return statement;
    }),

  /**
   * Generate tax documentation (1099)
   */
  generateTaxDocs: protectedProcedure
    .input(
      z.object({
        brokerId: z.number(),
        year: z.number(),
      })
    )
    .query(async ({ input }) => {
      const result = await generateTaxDocumentation(input.brokerId, input.year);
      return result;
    }),

  /**
   * Run monthly commission payout
   */
  runMonthlyPayout: protectedProcedure.mutation(async () => {
    const result = await runMonthlyCommissionPayout();
    return result;
  }),

  /**
   * Get commission history
   */
  getCommissionHistory: protectedProcedure
    .input(
      z.object({
        brokerId: z.number(),
        limit: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const result = await getBrokerCommissionHistory(
        input.brokerId,
        input.limit
      );
      return result;
    }),

  /**
   * Dispute commission
   */
  disputeCommission: protectedProcedure
    .input(
      z.object({
        commissionId: z.string(),
        reason: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await disputeCommission(input.commissionId, input.reason);
      return { success: true };
    }),
});
