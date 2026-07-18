import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import * as caseConciergeService from '../../caseConciergeService';

export const caseConciergeRouter = router({
  start: protectedProcedure
    .input(
      z.object({
        caseType: z.enum(['dispute_filing', 'document_submission', 'verification_request', 'payment_issue', 'general_inquiry']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return caseConciergeService.startSession({ userId: ctx.user.id, caseType: input.caseType });
    }),

  answer: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        stepId: z.string().min(1),
        answer: z.any(),
      })
    )
    .mutation(async ({ input }) => {
      return caseConciergeService.answerStep(input);
    }),

  get: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(async ({ input }) => {
      return caseConciergeService.getSession(input.sessionId);
    }),

  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['in_progress', 'completed', 'abandoned']).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const sessions = caseConciergeService.listSessions({ userId: ctx.user.id, status: input.status, limit: input.limit });
      return { total: sessions.length, sessions };
    }),
});
