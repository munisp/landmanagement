import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import {
  listIntegrationRegistry,
  listIntegrationSyncRuns,
  recordIntegrationSyncRun,
  seedIntegrationRegistry,
  updateIntegrationRegistryStatus,
} from '../../integrationRegistryRepository';
import { checkAllIntegrations } from '../../_core/integrations';

export const integrationRegistryRouter = router({
  seed: protectedProcedure.mutation(async () => {
    const records = await seedIntegrationRegistry();
    return {
      success: true,
      total: records.length,
      records,
    };
  }),

  list: protectedProcedure.query(async () => {
    const records = await listIntegrationRegistry();
    return {
      total: records.length,
      records,
    };
  }),

  refreshStatuses: protectedProcedure.mutation(async () => {
    const health = await checkAllIntegrations();

    for (const service of health.services) {
      const normalizedKey = service.name === 'hyperledger_fabric'
        ? null
        : service.name === 'mojaloop'
          ? null
          : service.name;

      if (!normalizedKey) {
        continue;
      }

      await updateIntegrationRegistryStatus(normalizedKey as any, {
        healthStatus: service.status,
        status:
          service.status === 'up'
            ? 'active'
            : service.status === 'degraded'
              ? 'degraded'
              : service.status === 'not_configured'
                ? 'draft'
                : 'failed',
        lastCheckedAt: new Date(service.lastChecked),
        lastHealthyAt: service.status === 'up' ? new Date(service.lastChecked) : undefined,
        endpoint: typeof service.details?.endpoint === 'string' ? service.details.endpoint : undefined,
        capabilities: service.details ?? undefined,
      });
    }

    return {
      success: true,
      health,
    };
  }),

  update: protectedProcedure
    .input(
      z.object({
        integrationKey: z.enum(['keycloak', 'permify', 'apisix', 'dapr', 'fluvio', 'openappsec', 'lakehouse', 'tigerbeetle', 'temporal', 'redis', 'postgres']),
        status: z.enum(['draft', 'configured', 'active', 'degraded', 'failed', 'disabled']).optional(),
        endpoint: z.string().optional(),
        namespace: z.string().optional(),
        version: z.string().optional(),
        healthStatus: z.string().optional(),
        configuration: z.record(z.string(), z.any()).optional(),
        capabilities: z.record(z.string(), z.any()).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const updated = await updateIntegrationRegistryStatus(input.integrationKey, {
        ...input,
      } as any);

      return {
        success: !!updated,
        record: updated,
      };
    }),

  recordSyncRun: protectedProcedure
    .input(
      z.object({
        integrationId: z.number(),
        operation: z.string(),
        status: z.enum(['pending', 'running', 'succeeded', 'failed', 'partial', 'skipped']),
        correlationId: z.string().optional(),
        requestPayload: z.record(z.string(), z.any()).optional(),
        responsePayload: z.record(z.string(), z.any()).optional(),
        errorMessage: z.string().optional(),
        recordsProcessed: z.number().int().nonnegative().default(0),
      })
    )
    .mutation(async ({ input }) => {
      const run = await recordIntegrationSyncRun({
        integrationId: input.integrationId,
        operation: input.operation,
        status: input.status,
        correlationId: input.correlationId,
        requestPayload: input.requestPayload,
        responsePayload: input.responsePayload,
        errorMessage: input.errorMessage,
        recordsProcessed: input.recordsProcessed,
      } as any);

      return {
        success: true,
        run,
      };
    }),

  listSyncRuns: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(200).default(50) }).optional())
    .query(async ({ input }) => {
      const runs = await listIntegrationSyncRuns(input?.limit ?? 50);
      return {
        total: runs.length,
        runs,
      };
    }),
});
