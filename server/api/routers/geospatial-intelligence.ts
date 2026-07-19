import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import { getGeospatialPortfolioHotspots, getParcelGeospatialWorkbench } from '../../geospatialIntelligenceService';

export const geospatialIntelligenceRouter = router({
  parcelWorkbench: protectedProcedure
    .input(
      z.object({
        parcelId: z.number().int().positive(),
      })
    )
    .query(async ({ input }) => {
      return await getParcelGeospatialWorkbench(input.parcelId);
    }),

  portfolioHotspots: protectedProcedure.query(async () => {
    return await getGeospatialPortfolioHotspots();
  }),
});
