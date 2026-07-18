import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import * as mortgageExplainabilityService from '../../mortgageExplainabilityService';

export const mortgageExplainabilityRouter = router({
  explain: protectedProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return mortgageExplainabilityService.explainApplication({
        applicationId: input.applicationId,
        generatedBy: ctx.user.id,
      });
    }),

  list: protectedProcedure
    .input(
      z.object({
        applicationId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .query(async ({ input }) => {
      const explanations = await mortgageExplainabilityService.listExplanations(input);
      return { total: explanations.length, explanations };
    }),
});
