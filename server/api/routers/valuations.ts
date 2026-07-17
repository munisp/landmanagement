import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import {
  calculatePropertyValuation,
  getMarketInsights,
  listValuationHistory,
} from '../../valuationService';

export const valuationsRouter = router({
  calculate: protectedProcedure
    .input(
      z.object({
        parcelNumber: z.string().min(3),
        method: z.enum(['comparative', 'income', 'cost', 'avm']),
        purpose: z.enum(['sale', 'mortgage', 'tax', 'insurance', 'legal']),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return calculatePropertyValuation({
        parcelNumber: input.parcelNumber,
        method: input.method,
        purpose: input.purpose,
        requestedByUserId: Number(ctx.user.id),
        requestedByName: ctx.user.name || ctx.user.email || `User ${ctx.user.id}`,
      });
    }),

  history: protectedProcedure
    .input(
      z.object({
        parcelNumber: z.string().optional(),
      }).optional(),
    )
    .query(async ({ input }) => {
      return {
        history: listValuationHistory(input?.parcelNumber),
      };
    }),

  marketInsights: protectedProcedure
    .input(
      z.object({
        parcelNumber: z.string().optional(),
      }).optional(),
    )
    .query(async ({ input }) => {
      return getMarketInsights(input?.parcelNumber);
    }),
});
