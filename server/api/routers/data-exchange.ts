import { z } from 'zod';
import { adminProcedure, protectedProcedure, router } from '../../_core/trpc';
import * as dataExchangeGatewayService from '../../dataExchangeGatewayService';

export const dataExchangeRouter = router({
  authorize: protectedProcedure
    .input(
      z.object({
        subjectUserId: z.number().int().positive(),
        requestorRole: z.string().min(1),
        purpose: z.string().min(1),
        jurisdiction: z.string().length(2).optional(),
        dataCategories: z.array(z.string().min(1)).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return dataExchangeGatewayService.authorizeExchange({
        ...input,
        requestorUserId: ctx.user.id,
      });
    }),

  audits: adminProcedure
    .input(
      z.object({
        subjectUserId: z.number().int().positive().optional(),
        decision: z.enum(['allowed', 'denied', 'conditional']).optional(),
        purpose: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
    )
    .query(async ({ input }) => {
      const audits = await dataExchangeGatewayService.listExchangeAudits(input);
      return { total: audits.length, audits };
    }),

  policies: protectedProcedure.query(async () => {
    return dataExchangeGatewayService.getPurposePolicies();
  }),
});
