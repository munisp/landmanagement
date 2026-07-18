import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import * as titleRiskService from '../../titleRiskService';

export const titleRiskRouter = router({
  assess: protectedProcedure
    .input(
      z.object({
        parcelId: z.number().int().positive(),
        transactionId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return titleRiskService.assessTitleRisk({
        parcelId: input.parcelId,
        transactionId: input.transactionId,
        assessedBy: ctx.user.id,
      });
    }),

  list: protectedProcedure
    .input(
      z.object({
        parcelId: z.number().int().positive().optional(),
        riskBand: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
    )
    .query(async ({ input }) => {
      const assessments = await titleRiskService.listRiskAssessments(input);
      return { total: assessments.length, assessments };
    }),

  portfolioSummary: protectedProcedure.query(async () => {
    return titleRiskService.getPortfolioRiskSummary();
  }),
});
