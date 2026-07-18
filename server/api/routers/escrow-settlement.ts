import { z } from 'zod';
import { adminProcedure, protectedProcedure, router } from '../../_core/trpc';
import * as escrowSettlementService from '../../escrowSettlementService';

export const escrowSettlementRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        transactionId: z.number().int().positive().optional(),
        amount: z.number().positive().optional(),
        currency: z.string().length(3).optional(),
        financed: z.boolean().optional(),
        insured: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return escrowSettlementService.createSettlement({ ...input, createdBy: ctx.user.id });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      return escrowSettlementService.getSettlement(input.id);
    }),

  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['draft', 'pending', 'release_ready', 'released', 'blocked', 'cancelled']).optional(),
        transactionId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
    )
    .query(async ({ input }) => {
      const settlements = await escrowSettlementService.listSettlements(input);
      return { total: settlements.length, settlements };
    }),

  fulfillCheckpoint: protectedProcedure
    .input(
      z.object({
        settlementId: z.number().int().positive(),
        checkpointKey: z.string().min(1),
        evidence: z.record(z.string(), z.any()).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return escrowSettlementService.fulfillCheckpoint(
        input.settlementId,
        input.checkpointKey,
        ctx.user.id,
        input.evidence,
        input.notes
      );
    }),

  waiveCheckpoint: adminProcedure
    .input(
      z.object({
        settlementId: z.number().int().positive(),
        checkpointKey: z.string().min(1),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return escrowSettlementService.waiveCheckpoint(input.settlementId, input.checkpointKey, ctx.user.id, input.notes);
    }),

  failCheckpoint: protectedProcedure
    .input(
      z.object({
        settlementId: z.number().int().positive(),
        checkpointKey: z.string().min(1),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return escrowSettlementService.failCheckpoint(input.settlementId, input.checkpointKey, ctx.user.id, input.notes);
    }),

  recompute: protectedProcedure
    .input(z.object({ settlementId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      return escrowSettlementService.recomputeSettlement(input.settlementId);
    }),

  release: adminProcedure
    .input(z.object({ settlementId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return escrowSettlementService.releaseSettlement(input.settlementId, ctx.user.id);
    }),

  cancel: protectedProcedure
    .input(z.object({ settlementId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      return escrowSettlementService.cancelSettlement(input.settlementId);
    }),

  checkpointTemplate: protectedProcedure
    .input(z.object({ financed: z.boolean().optional(), insured: z.boolean().optional() }))
    .query(async ({ input }) => {
      return escrowSettlementService.defaultCheckpointTemplate({
        financed: input.financed ?? false,
        insured: input.insured ?? false,
      });
    }),
});
