import { router, protectedProcedure } from '../../_core/trpc';
import { z } from 'zod';
import {
  getPipelineMetrics,
  getBrokerPerformance,
  getInvestorROI,
  getComplianceScore,
  getTimeSeriesData,
  exportToCSV,
} from '../../mortgageAnalyticsService';

/**
 * Mortgage Analytics Router
 * Provides endpoints for mortgage analytics and reporting
 */

export const mortgageAnalyticsRouter = router({
  /**
   * Get mortgage pipeline metrics
   */
  getPipelineMetrics: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const dateRange =
        input.startDate && input.endDate
          ? {
              startDate: new Date(input.startDate),
              endDate: new Date(input.endDate),
            }
          : undefined;

      return await getPipelineMetrics(dateRange);
    }),

  /**
   * Get broker performance comparison
   */
  getBrokerPerformance: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const dateRange =
        input.startDate && input.endDate
          ? {
              startDate: new Date(input.startDate),
              endDate: new Date(input.endDate),
            }
          : undefined;

      return await getBrokerPerformance(dateRange);
    }),

  /**
   * Get investor ROI tracking
   */
  getInvestorROI: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const dateRange =
        input.startDate && input.endDate
          ? {
              startDate: new Date(input.startDate),
              endDate: new Date(input.endDate),
            }
          : undefined;

      return await getInvestorROI(dateRange);
    }),

  /**
   * Get compliance score
   */
  getComplianceScore: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const dateRange =
        input.startDate && input.endDate
          ? {
              startDate: new Date(input.startDate),
              endDate: new Date(input.endDate),
            }
          : undefined;

      return await getComplianceScore(dateRange);
    }),

  /**
   * Get time-series data for charts
   */
  getTimeSeriesData: protectedProcedure
    .input(
      z.object({
        metric: z.enum(['applications', 'loan_volume', 'commissions']),
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ input }) => {
      const dateRange = {
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
      };

      return await getTimeSeriesData(input.metric, dateRange);
    }),

  /**
   * Export analytics data to CSV
   */
  exportToCSV: protectedProcedure
    .input(
      z.object({
        dataType: z.enum(['pipeline', 'broker_performance', 'investor_roi', 'compliance']),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const dateRange =
        input.startDate && input.endDate
          ? {
              startDate: new Date(input.startDate),
              endDate: new Date(input.endDate),
            }
          : undefined;

      let data: any[] = [];
      let filename = '';

      switch (input.dataType) {
        case 'pipeline':
          const pipelineMetrics = await getPipelineMetrics(dateRange);
          data = [pipelineMetrics];
          filename = 'pipeline_metrics.csv';
          break;
        case 'broker_performance':
          data = await getBrokerPerformance(dateRange);
          filename = 'broker_performance.csv';
          break;
        case 'investor_roi':
          data = await getInvestorROI(dateRange);
          filename = 'investor_roi.csv';
          break;
        case 'compliance':
          const complianceScore = await getComplianceScore(dateRange);
          data = [complianceScore];
          filename = 'compliance_score.csv';
          break;
      }

      const csv = exportToCSV(data, filename);
      return {
        filename,
        content: csv,
      };
    }),
});
