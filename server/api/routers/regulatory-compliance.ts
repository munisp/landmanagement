import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../../_core/trpc';
import {
  generateCBNReport,
  generateSECReport,
  generateLoanPerformanceReport,
  generateInvestorDisclosureReport,
  generateServicingTransferNotification,
  exportAuditTrail,
  scheduleReport,
} from '../../regulatoryComplianceService';

export const regulatoryComplianceRouter = router({
  /**
   * Generate CBN compliance report
   */
  generateCBNReport: protectedProcedure
    .input(
      z.object({
        reportType: z.enum(['cbn_monthly', 'cbn_quarterly', 'cbn_annual']),
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      const report = await generateCBNReport(input.reportType, startDate, endDate);
      return report;
    }),

  /**
   * Generate SEC disclosure report
   */
  generateSECReport: protectedProcedure
    .input(
      z.object({
        reportType: z.enum(['sec_quarterly', 'sec_annual']),
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      const report = await generateSECReport(input.reportType, startDate, endDate);
      return report;
    }),

  /**
   * Generate loan performance metrics report
   */
  generateLoanPerformanceReport: protectedProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ input }) => {
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      const report = await generateLoanPerformanceReport(startDate, endDate);
      return report;
    }),

  /**
   * Generate investor disclosure report
   */
  generateInvestorDisclosureReport: protectedProcedure
    .input(
      z.object({
        investorId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const report = await generateInvestorDisclosureReport(input.investorId);
      return report;
    }),

  /**
   * Generate servicing transfer notification
   */
  generateServicingTransferNotification: protectedProcedure
    .input(
      z.object({
        transferId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const notification = await generateServicingTransferNotification(input.transferId);
      return notification;
    }),

  /**
   * Export audit trail
   */
  exportAuditTrail: protectedProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ input }) => {
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      const auditTrail = await exportAuditTrail(startDate, endDate);
      return auditTrail;
    }),

  /**
   * Schedule automated report
   */
  scheduleReport: protectedProcedure
    .input(
      z.object({
        reportType: z.string(),
        frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual']),
      })
    )
    .mutation(async ({ input }) => {
      const schedule = await scheduleReport(input.reportType, input.frequency);
      return schedule;
    }),
});
