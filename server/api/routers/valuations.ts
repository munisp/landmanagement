import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import {
  calculatePropertyValuation,
  getMarketInsights,
  listValuationHistory,
} from '../../valuationService';
import { createDispute } from '../../disputeRepository';
import { getParcelByNumber } from '../../parcelRepository';

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

  createDispute: protectedProcedure
    .input(
      z.object({
        parcelNumber: z.string().min(3),
        description: z.string().min(20),
        requestedRelief: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const parcel = getParcelByNumber(input.parcelNumber);
      const actor = ctx.user.name || ctx.user.email || `User ${ctx.user.id}`;
      const dispute = createDispute({
        parcelNumber: input.parcelNumber,
        parcelId: parcel?.id,
        type: 'other',
        state: parcel?.state || 'Unknown',
        lga: parcel?.lga || 'Unknown',
        filedBy: actor,
        filedByUserId: Number(ctx.user.id),
        respondent: 'Valuation Office',
        description: input.description,
        requestedRelief: input.requestedRelief || 'Independent review of the recorded property valuation.',
      });

      return {
        success: true,
        dispute,
      };
    }),
});
