import { z } from 'zod';
import { adminProcedure, protectedProcedure, router } from '../../_core/trpc';
import * as registryIntegrityService from '../../registryIntegrityService';

const checkTypeEnum = z.enum([
  'duplicate_parcel',
  'overlapping_geometry',
  'ownership_conflict',
  'valuation_jump',
  'document_fingerprint',
  'timing_anomaly',
]);

export const registryIntegrityRouter = router({
  runScan: adminProcedure.mutation(async () => {
    return registryIntegrityService.runIntegrityScan({ detectedBy: 'api' });
  }),

  findings: protectedProcedure
    .input(
      z.object({
        status: z.enum(['open', 'acknowledged', 'resolved', 'dismissed']).optional(),
        severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(),
        checkType: checkTypeEnum.optional(),
        parcelId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      })
    )
    .query(async ({ input }) => {
      const findings = await registryIntegrityService.listFindings(input);
      return { total: findings.length, findings };
    }),

  acknowledge: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return registryIntegrityService.acknowledgeFinding(input.id, ctx.user.id);
    }),

  resolve: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return registryIntegrityService.resolveFinding(input.id, ctx.user.id, input.notes);
    }),

  dismiss: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return registryIntegrityService.dismissFinding(input.id, ctx.user.id, input.notes);
    }),

  stats: protectedProcedure.query(async () => {
    return registryIntegrityService.getIntegrityStats();
  }),
});
