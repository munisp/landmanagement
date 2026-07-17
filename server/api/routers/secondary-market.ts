import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../../_core/trpc';
import {
  createLoanPool,
  addLoanToPool,
  closeLoanPool,
  getLoanPoolDetails,
  getAvailableLoanPools,
  registerInvestor,
  getInvestorDetails,
  getInvestorByUserId,
  createInvestment,
  createDistribution,
  getInvestmentDistributions,
  createServicingRightsTransfer,
  approveServicingRightsTransfer,
  completeServicingRightsTransfer,
  getInvestorPerformanceReport,
} from '../../secondaryMarketService';
import {
  runAutomatedPooling,
  getEligibleLoans,
  monitorPoolPerformance,
} from '../../loanPoolingEngine';
import {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  updateSchedulerConfig,
  triggerManualPooling,
  getSchedulerLogs,
} from '../../automatedPoolingScheduler';

export const secondaryMarketRouter = router({
  /**
   * Create loan pool
   */
  createPool: protectedProcedure
    .input(
      z.object({
        poolName: z.string(),
        description: z.string().optional(),
        riskTier: z.enum(['aaa', 'aa', 'a', 'bbb', 'bb', 'b']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createLoanPool({
        ...input,
        createdBy: ctx.user.id,
      });
      return result;
    }),

  /**
   * Add loan to pool
   */
  addLoanToPool: protectedProcedure
    .input(
      z.object({
        poolId: z.string(),
        applicationId: z.number(),
        principalAmount: z.number(),
        interestRate: z.number(),
        remainingTerm: z.number(),
        creditScore: z.number().optional(),
        loanToValue: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await addLoanToPool(input);
      return result;
    }),

  /**
   * Close loan pool
   */
  closePool: protectedProcedure
    .input(z.object({ poolId: z.string() }))
    .mutation(async ({ input }) => {
      const result = await closeLoanPool(input.poolId);
      return result;
    }),

  /**
   * Get loan pool details
   */
  getPoolDetails: protectedProcedure
    .input(z.object({ poolId: z.string() }))
    .query(async ({ input }) => {
      const result = await getLoanPoolDetails(input.poolId);
      return result;
    }),

  /**
   * Get available loan pools
   */
  getAvailablePools: protectedProcedure
    .input(
      z
        .object({
          riskTier: z.enum(['aaa', 'aa', 'a', 'bbb', 'bb', 'b']).optional(),
          minAmount: z.number().optional(),
          maxAmount: z.number().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const result = await getAvailableLoanPools(input);
      return result;
    }),

  /**
   * Register as investor
   */
  registerInvestor: protectedProcedure
    .input(
      z.object({
        investorName: z.string(),
        investorType: z.enum(['institutional', 'individual', 'fund', 'bank']),
        contactEmail: z.string().email(),
        contactPhone: z.string(),
        minInvestmentAmount: z.number(),
        maxInvestmentAmount: z.number().optional(),
        preferredRiskTiers: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await registerInvestor({
        userId: ctx.user.id,
        ...input,
      });
      return result;
    }),

  /**
   * Get investor details
   */
  getInvestorDetails: protectedProcedure
    .input(z.object({ investorId: z.string() }))
    .query(async ({ input }) => {
      const result = await getInvestorDetails(input.investorId);
      return result;
    }),

  /**
   * Get current user's investor profile
   */
  getMyInvestorProfile: protectedProcedure.query(async ({ ctx }) => {
    const result = await getInvestorByUserId(ctx.user.id);
    return result;
  }),

  /**
   * Create investment
   */
  createInvestment: protectedProcedure
    .input(
      z.object({
        investorId: z.string(),
        poolId: z.string(),
        investmentAmount: z.number(),
        expectedReturnRate: z.number(),
        maturityMonths: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await createInvestment(input);
      return result;
    }),

  /**
   * Create distribution
   */
  createDistribution: protectedProcedure
    .input(
      z.object({
        investmentId: z.string(),
        distributionType: z.enum(['interest', 'principal', 'fee']),
        amount: z.number(),
        distributionDate: z.string().transform((val) => new Date(val)),
        paymentReference: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await createDistribution(input);
      return result;
    }),

  /**
   * Get investment distributions
   */
  getDistributions: protectedProcedure
    .input(z.object({ investmentId: z.string() }))
    .query(async ({ input }) => {
      const result = await getInvestmentDistributions(input.investmentId);
      return result;
    }),

  /**
   * Create servicing rights transfer
   */
  createServicingRightsTransfer: protectedProcedure
    .input(
      z.object({
        poolId: z.string(),
        fromServicer: z.string(),
        toServicer: z.string(),
        transferDate: z.string().transform((val) => new Date(val)),
        transferFee: z.number(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await createServicingRightsTransfer(input);
      return result;
    }),

  /**
   * Approve servicing rights transfer
   */
  approveServicingRightsTransfer: protectedProcedure
    .input(z.object({ transferId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const result = await approveServicingRightsTransfer({
        transferId: input.transferId,
        approvedBy: ctx.user.id,
      });
      return result;
    }),

  /**
   * Complete servicing rights transfer
   */
  completeServicingRightsTransfer: protectedProcedure
    .input(z.object({ transferId: z.string() }))
    .mutation(async ({ input }) => {
      const result = await completeServicingRightsTransfer(input.transferId);
      return result;
    }),

  /**
   * Get investor performance report
   */
  getPerformanceReport: protectedProcedure
    .input(z.object({ investorId: z.string() }))
    .query(async ({ input }) => {
      const result = await getInvestorPerformanceReport(input.investorId);
      return result;
    }),

  /**
   * Run automated loan pooling
   */
  runAutomatedPooling: protectedProcedure
    .input(
      z.object({
        strategy: z.enum(['riskBased', 'maturityBased', 'balanced']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await runAutomatedPooling(
        input.strategy || 'balanced',
        ctx.user.id
      );
      return result;
    }),

  /**
   * Get eligible loans for pooling
   */
  getEligibleLoans: protectedProcedure.query(async () => {
    const result = await getEligibleLoans();
    return result;
  }),

  /**
   * Monitor pool performance
   */
  monitorPoolPerformance: protectedProcedure.query(async () => {
    const result = await monitorPoolPerformance();
    return result;
  }),

  /**
   * Get scheduler status
   */
  getSchedulerStatus: protectedProcedure.query(async () => {
    const status = getSchedulerStatus();
    return status;
  }),

  /**
   * Update scheduler configuration
   */
  updateSchedulerConfig: protectedProcedure
    .input(
      z.object({
        enabled: z.boolean().optional(),
        strategy: z.enum(['riskBased', 'maturityBased', 'balanced']).optional(),
        frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
        dayOfWeek: z.number().min(0).max(6).optional(),
        dayOfMonth: z.number().min(1).max(31).optional(),
        hour: z.number().min(0).max(23).optional(),
        minute: z.number().min(0).max(59).optional(),
        notifyAdmins: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      updateSchedulerConfig(input);
      return { success: true };
    }),

  /**
   * Start scheduler
   */
  startScheduler: protectedProcedure.mutation(async () => {
    startScheduler();
    return { success: true };
  }),

  /**
   * Stop scheduler
   */
  stopScheduler: protectedProcedure.mutation(async () => {
    stopScheduler();
    return { success: true };
  }),

  /**
   * Trigger manual pooling
   */
  triggerManualPooling: protectedProcedure
    .input(
      z.object({
        strategy: z.enum(['riskBased', 'maturityBased', 'balanced']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await triggerManualPooling(input.strategy, ctx.user.id.toString());
      return result;
    }),

  /**
   * Get scheduler logs
   */
  getSchedulerLogs: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ input }) => {
      const logs = getSchedulerLogs(input.limit);
      return logs;
    }),
});
