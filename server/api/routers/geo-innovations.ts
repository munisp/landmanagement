import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure, router } from "../../_core/trpc";
import {
  acknowledgeChangeAlert,
  approvePublicRelease,
  createGeoMonitor,
  createPublicRelease,
  createStacCollection,
  createStacItem,
  getOgcFeatureCollection,
  listChangeAlerts,
  listGeoMonitors,
  listPublicReleases,
  listStacCollections,
  publishPublicRelease,
  revokePublicRelease,
  resolveChangeAlert,
  searchStacItems,
  setGeoMonitorStatus,
} from "../../geoInnovationService";
import { getGeoAnalysisRun } from "../../geoaiEvidenceService";

const evidenceStatusSchema = z.enum(["verified", "provisional", "insufficient_evidence", "rejected"]);
const recordSchema = z.record(z.string(), z.unknown());
const geometrySchema = z.object({
  type: z.string().min(2).max(64),
  coordinates: z.unknown(),
}).passthrough();

function domainError(error: unknown): never {
  const message = error instanceof Error ? error.message : "Geospatial innovation operation failed";
  if (/not found|only a|only an|requires|must|invalid|cannot|missing|not a/.test(message.toLowerCase())) {
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

export const geoInnovationsRouter = router({
  // Innovation 4: STAC-compatible catalog metadata
  createStacCollection: authorizedProcedure("geo_analysis", "create")
    .input(z.object({
      collectionKey: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
      title: z.string().min(2).max(255),
      description: z.string().min(8).max(8000),
      license: z.string().min(2).max(255),
      spatialExtent: recordSchema,
      temporalExtent: recordSchema,
      providers: z.array(z.unknown()).max(32).optional(),
      keywords: z.array(z.string().min(1).max(96)).max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try { return await createStacCollection(input, ctx.user.id); } catch (error) { return domainError(error); }
    }),

  createStacItem: authorizedProcedure("geo_analysis", "update")
    .input(z.object({
      itemKey: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
      collectionId: z.number().int().positive(),
      assetId: z.string().min(6).max(128).optional(),
      parcelId: z.number().int().positive().optional(),
      geometryGeojson: geometrySchema.optional(),
      bbox: z.array(z.number().finite()).min(4).max(6),
      itemDatetime: z.string().datetime().optional(),
      startDatetime: z.string().datetime().optional(),
      endDatetime: z.string().datetime().optional(),
      properties: recordSchema.optional(),
      links: z.array(z.unknown()).max(128).optional(),
      evidenceStatus: evidenceStatusSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await createStacItem({
          ...input,
          itemDatetime: input.itemDatetime ? new Date(input.itemDatetime) : undefined,
          startDatetime: input.startDatetime ? new Date(input.startDatetime) : undefined,
          endDatetime: input.endDatetime ? new Date(input.endDatetime) : undefined,
        }, ctx.user.id);
      } catch (error) { return domainError(error); }
    }),

  listStacCollections: authorizedProcedure("geo_analysis", "view")
    .query(async () => listStacCollections()),

  searchStacItems: authorizedProcedure("geo_analysis", "view")
    .input(z.object({
      collectionId: z.number().int().positive().optional(),
      parcelId: z.number().int().positive().optional(),
      evidenceStatus: evidenceStatusSchema.optional(),
      startDatetime: z.string().datetime().optional(),
      endDatetime: z.string().datetime().optional(),
      limit: z.number().int().positive().max(200).default(50),
    }))
    .query(async ({ input }) => searchStacItems({
      ...input,
      startDatetime: input.startDatetime ? new Date(input.startDatetime) : undefined,
      endDatetime: input.endDatetime ? new Date(input.endDatetime) : undefined,
    })),

  // Innovation 5: OGC API Features-inspired protected collection endpoint.
  getParcelFeatureCollection: authorizedProcedure("geo_analysis", "view")
    .input(z.object({
      bbox: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)]).optional(),
      state: z.string().min(1).max(128).optional(),
      lga: z.string().min(1).max(128).optional(),
      status: z.enum(["draft", "pending_verification", "verified", "registered", "transferred", "disputed", "archived"]).optional(),
      limit: z.number().int().positive().max(200).default(100),
    }))
    .query(async ({ input }) => getOgcFeatureCollection(input)),

  // Innovations 6–9: authorized recurring monitors and evidence alerts.
  createMonitor: authorizedProcedure("geo_analysis", "create")
    .input(z.object({
      parcelId: z.number().int().positive().optional(),
      innovationType: z.enum(["change_vectorization", "hazard_profile", "field_geofence", "zonal_statistics"]),
      scheduleHint: z.string().min(3).max(128),
      settings: recordSchema,
      nextEvaluationAt: z.string().datetime().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await createGeoMonitor({
          ...input,
          nextEvaluationAt: input.nextEvaluationAt ? new Date(input.nextEvaluationAt) : undefined,
        }, ctx.user.id);
      } catch (error) { return domainError(error); }
    }),

  listMonitors: authorizedProcedure("geo_analysis", "view")
    .input(z.object({ parcelId: z.number().int().positive().optional(), includeAll: z.boolean().optional() }))
    .query(async ({ ctx, input }) => listGeoMonitors({ userId: ctx.user.id, ...input })),

  setMonitorStatus: authorizedProcedure("geo_analysis", "update")
    .input(z.object({ subscriptionId: z.number().int().positive(), status: z.enum(["active", "paused", "disabled"]) }))
    .mutation(async ({ input }) => {
      try { return await setGeoMonitorStatus(input.subscriptionId, input.status); } catch (error) { return domainError(error); }
    }),

  listChangeAlerts: authorizedProcedure("geo_analysis", "view")
    .input(z.object({
      parcelId: z.number().int().positive().optional(),
      runId: z.number().int().positive().optional(),
      status: z.enum(["open", "acknowledged", "investigating", "resolved", "dismissed"]).optional(),
      limit: z.number().int().positive().max(200).default(50),
    }))
    .query(async ({ input }) => listChangeAlerts(input)),

  acknowledgeChangeAlert: authorizedProcedure("geo_analysis", "update")
    .input(z.object({ alertId: z.number().int().positive(), status: z.enum(["acknowledged", "investigating"]) }))
    .mutation(async ({ ctx, input }) => {
      try { return await acknowledgeChangeAlert(input.alertId, ctx.user.id, input.status); } catch (error) { return domainError(error); }
    }),

  resolveChangeAlert: authorizedProcedure("geo_analysis", "approve")
    .input(z.object({
      alertId: z.number().int().positive(),
      status: z.enum(["resolved", "dismissed"]),
      resolutionNotes: z.string().min(8).max(4000),
    }))
    .mutation(async ({ ctx, input }) => {
      try { return await resolveChangeAlert(input.alertId, ctx.user.id, input.status, input.resolutionNotes); } catch (error) { return domainError(error); }
    }),

  // Innovation 10: prepared, approved, published, and revocable privacy releases.
  requestPublicRelease: authorizedProcedure("geo_analysis", "create")
    .input(z.object({ runId: z.number().int().positive(), parcelId: z.number().int().positive().optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const stored = await getGeoAnalysisRun(input.runId);
        if (!stored) throw new Error("GeoAI analysis run was not found");
        if (stored.run.analysisType !== "privacy_release" || stored.run.status !== "completed") {
          throw new Error("Public release requires a completed privacy_release analysis run");
        }
        const result = stored.run.resultSummary as Record<string, unknown> | null;
        const feature = result?.feature;
        const parameters = result?.privacy_parameters;
        if (!feature || !parameters || typeof result?.privacy_method !== "string" || typeof result?.license !== "string" || typeof result?.legal_notice !== "string") {
          throw new Error("Completed privacy release run does not contain a governed release feature");
        }
        return await createPublicRelease({
          parcelId: input.parcelId ?? stored.run.parcelId ?? undefined,
          sourceRunId: input.runId,
          privacyMethod: result.privacy_method,
          privacyParameters: parameters as Record<string, unknown>,
          releasedFeature: feature as Record<string, unknown>,
          license: result.license,
          legalNotice: result.legal_notice,
        }, ctx.user.id);
      } catch (error) { return domainError(error); }
    }),

  listPublicReleases: authorizedProcedure("geo_analysis", "view")
    .input(z.object({ status: z.enum(["draft", "approved", "published", "revoked"]).optional(), limit: z.number().int().positive().max(200).default(50) }))
    .query(async ({ input }) => listPublicReleases(input)),

  approvePublicRelease: authorizedProcedure("geo_analysis", "approve")
    .input(z.object({ releaseId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try { return await approvePublicRelease(input.releaseId, ctx.user.id); } catch (error) { return domainError(error); }
    }),

  publishPublicRelease: authorizedProcedure("geo_analysis", "approve")
    .input(z.object({ releaseId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try { return await publishPublicRelease(input.releaseId, ctx.user.id); } catch (error) { return domainError(error); }
    }),

  revokePublicRelease: authorizedProcedure("geo_analysis", "approve")
    .input(z.object({ releaseId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try { return await revokePublicRelease(input.releaseId); } catch (error) { return domainError(error); }
    }),
});
