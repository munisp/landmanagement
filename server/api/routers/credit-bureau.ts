import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../../_core/trpc';
import {
  fetchCreditReports,
  calculateRiskBasedInterestRate,
  storeCreditReport,
  getStoredCreditReport,
  refreshCreditReport,
} from '../../creditBureauService';

export const creditBureauRouter = router({
  /**
   * Fetch credit reports from multiple bureaus
   */
  fetchCreditReports: protectedProcedure
    .input(
      z.object({
        nin: z.string(),
        bvn: z.string(),
        fullName: z.string(),
        dateOfBirth: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await fetchCreditReports(input);
      return result;
    }),

  /**
   * Calculate risk-based interest rate
   */
  calculateRiskBasedRate: protectedProcedure
    .input(
      z.object({
        baseRate: z.number(),
        creditScore: z.number(),
        loanAmount: z.number(),
        loanTerm: z.number(),
        downPaymentPercentage: z.number(),
      })
    )
    .query(async ({ input }) => {
      const result = calculateRiskBasedInterestRate(input);
      return result;
    }),

  /**
   * Store credit report in application
   */
  storeCreditReport: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        creditReports: z.object({
          reports: z.array(z.any()),
          averageScore: z.number(),
          riskCategory: z.string(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      await storeCreditReport(input.applicationId, input.creditReports);
      return { success: true };
    }),

  /**
   * Get stored credit report
   */
  getStoredCreditReport: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      const result = await getStoredCreditReport(input.applicationId);
      return result;
    }),

  /**
   * Refresh credit report (fetch new and update stored)
   */
  refreshCreditReport: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        nin: z.string(),
        bvn: z.string(),
        fullName: z.string(),
        dateOfBirth: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await refreshCreditReport(input);
      return result;
    }),
});
