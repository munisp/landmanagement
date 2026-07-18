import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import * as parcelDigitalTwinService from '../../parcelDigitalTwinService';

const scenarioInput = z.object({
  name: z.string().optional(),
  valuationChangePct: z.number().min(-50).max(100).optional(),
  floodRiskLevel: z.enum(['none', 'low', 'moderate', 'high', 'severe']).optional(),
  solarIrradianceKwhM2Day: z.number().min(0).max(8).optional(),
  zoningTarget: z.enum(['residential', 'commercial', 'industrial', 'agricultural', 'mixed']).optional(),
  infrastructureInvestmentPct: z.number().min(0).max(50).optional(),
  interestRatePct: z.number().min(0).max(40).optional(),
});

export const parcelDigitalTwinRouter = router({
  twin: protectedProcedure
    .input(z.object({ parcelId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return parcelDigitalTwinService.buildDigitalTwin(input.parcelId);
    }),

  runScenario: protectedProcedure
    .input(z.object({ parcelId: z.number().int().positive(), scenario: scenarioInput.optional() }))
    .mutation(async ({ input }) => {
      return parcelDigitalTwinService.runScenario(input.parcelId, input.scenario ?? {});
    }),

  compareScenarios: protectedProcedure
    .input(z.object({ parcelId: z.number().int().positive(), scenarios: z.array(scenarioInput).min(2).max(6) }))
    .mutation(async ({ input }) => {
      return parcelDigitalTwinService.compareScenarios(input.parcelId, input.scenarios);
    }),
});
