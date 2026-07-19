import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import { getGeospatialPortfolioHotspots, getParcelGeospatialWorkbench } from '../../geospatialIntelligenceService';
import { getGeospatialRuntimeStatus } from '../../lakehouseClient';
import { PropertyPhotoAIService } from '../../propertyPhotoAIService';

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

  runtimeStatus: protectedProcedure.query(async () => {
    return await getGeospatialRuntimeStatus();
  }),

  analyzeSurveyPhotoSet: protectedProcedure
    .input(
      z.object({
        imageUrls: z.array(z.string().url()).min(1).max(12),
      })
    )
    .mutation(async ({ input }) => {
      return await PropertyPhotoAIService.analyzeSurveyPhotoSet(input.imageUrls);
    }),
});
