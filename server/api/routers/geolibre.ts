import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import { getGeoLibreLaunchContext } from '../../geolibreIntegrationRepository';

export const geolibreRouter = router({
  launchContext: protectedProcedure
    .input(
      z.object({
        parcelId: z.number().int().positive(),
      })
    )
    .query(async ({ input }) => {
      return await getGeoLibreLaunchContext(input.parcelId);
    }),
});
