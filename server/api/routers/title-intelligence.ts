import { z } from 'zod';
import { publicProcedure, router } from '../../_core/trpc';
import { getTitleIntelligenceDossier } from '../../titleIntelligenceRepository';

export const titleIntelligenceRouter = router({
  getDossier: publicProcedure
    .input(
      z.object({
        titleId: z.number().int().positive(),
      })
    )
    .query(async ({ input }) => {
      return await getTitleIntelligenceDossier(input.titleId);
    }),
});
