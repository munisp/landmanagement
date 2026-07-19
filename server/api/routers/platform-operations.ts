import { protectedProcedure, router } from '../../_core/trpc';
import { getPlatformOperationsOverview } from '../../platformOperationsRepository';

export const platformOperationsRouter = router({
  overview: protectedProcedure.query(async () => {
    return getPlatformOperationsOverview();
  }),

  syntheticJourneys: protectedProcedure.query(async () => {
    const overview = await getPlatformOperationsOverview();
    return {
      generatedAt: overview.generatedAt,
      overallStatus: overview.overallStatus,
      readinessScore: overview.readinessScore,
      journeys: overview.syntheticJourneys,
    };
  }),
});
