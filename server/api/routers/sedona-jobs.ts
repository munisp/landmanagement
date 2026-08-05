import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authorizedProcedure, router } from "../../_core/trpc";
import { getGeoAnalysisRun } from "../../geoaiEvidenceService";
import { checkPermifyPermission } from "../../permifyService";
import {
  createSedonaJob,
  getSedonaJob,
  listSedonaJobEvents,
  listSedonaJobs,
  requestSedonaJobCancellation,
  type SedonaOperation,
} from "../../sedonaJobService";
import { validateSedonaJobInput } from "../../sedonaJobPolicy";

const operationSchema = z.enum([
  "geoparquet_export",
  "topology_validation",
  "spatial_workbench",
  "zonal_statistics",
  "viewshed",
]);

function asTrpcError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  const message = error instanceof Error ? error.message : "Sedona Lakehouse operation failed";
  if (/required|must|malformed|match|invalid|not found|cannot|unsupported|authorized|registered/i.test(message)) {
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

async function requireRunPermission(params: {
  user: { id: number; role?: string | null };
  runId: number;
  action: "view" | "update";
}) {
  const stored = await getGeoAnalysisRun(params.runId);
  if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "GeoAI analysis run was not found" });
  const allowed = await checkPermifyPermission({
    user: params.user as never,
    resource: "geo_analysis",
    resourceId: String(params.runId),
    action: params.action,
  });
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "You are not authorized for this GeoAI analysis run" });
  return stored;
}

function assertManifestAssets(runManifest: unknown, input: ReturnType<typeof validateSedonaJobInput>) {
  const manifest = runManifest as { sourceAssets?: Array<{ assetId?: unknown; checksumSha256?: unknown }> };
  const sourceAssets = Array.isArray(manifest.sourceAssets) ? manifest.sourceAssets : [];
  const known = new Map(sourceAssets
    .filter((asset): asset is { assetId: string; checksumSha256?: string } => typeof asset.assetId === "string")
    .map((asset) => [asset.assetId, asset.checksumSha256?.toLowerCase() ?? null]));
  if (!input.sourceAssetIds.every((assetId) => known.has(assetId))) {
    throw new Error("Each Sedona input asset must be registered in the bound GeoAI analysis run");
  }
  if (!input.sourceChecksums.every((checksum) => [...known.values()].includes(checksum.toLowerCase()))) {
    throw new Error("Each Sedona input checksum must match a registered GeoAI analysis asset");
  }
  for (const feature of input.features) {
    if (!feature.sourceAssetId) continue;
    if (!known.has(feature.sourceAssetId)) throw new Error(`Feature ${feature.featureId} refers to an unregistered source asset`);
    const expected = known.get(feature.sourceAssetId);
    if (feature.sourceChecksumSha256 && expected && feature.sourceChecksumSha256.toLowerCase() !== expected) {
      throw new Error(`Feature ${feature.featureId} source checksum does not match the registered GeoAI asset`);
    }
  }
}

async function requireJobPermission(params: {
  user: { id: number; role?: string | null };
  jobId: number;
  action: "view" | "update";
}) {
  const job = await getSedonaJob(params.jobId);
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Sedona job was not found" });
  if (!job.analysisRunId) throw new TRPCError({ code: "FORBIDDEN", message: "Unbound Sedona jobs cannot be accessed through the user API" });
  await requireRunPermission({ user: params.user, runId: job.analysisRunId, action: params.action });
  return job;
}

export const sedonaJobsRouter = router({
  submit: authorizedProcedure("geo_analysis", "update")
    .input(z.object({
      analysisRunId: z.number().int().positive(),
      operation: operationSchema,
      input: z.unknown(),
      maxAttempts: z.number().int().min(1).max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const stored = await requireRunPermission({ user: ctx.user, runId: input.analysisRunId, action: "update" });
        const jobInput = validateSedonaJobInput(input.operation as SedonaOperation, input.input);
        assertManifestAssets(stored.run.inputManifest, jobInput);
        if (stored.run.parcelId && jobInput.features.some((feature) => !feature.sourceAssetId)) {
          throw new Error("Parcel-scoped Sedona features must identify their registered source asset");
        }
        return await createSedonaJob({
          requestedBy: ctx.user.id,
          operation: input.operation,
          analysisRunId: stored.run.id,
          parcelId: stored.run.parcelId ?? undefined,
          inputManifest: jobInput,
          maxAttempts: input.maxAttempts,
        });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  get: authorizedProcedure("geo_analysis", "view")
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => requireJobPermission({ user: ctx.user, jobId: input.jobId, action: "view" })),

  listForRun: authorizedProcedure("geo_analysis", "view")
    .input(z.object({ analysisRunId: z.number().int().positive(), limit: z.number().int().min(1).max(200).optional() }))
    .query(async ({ ctx, input }) => {
      await requireRunPermission({ user: ctx.user, runId: input.analysisRunId, action: "view" });
      return listSedonaJobs({ analysisRunId: input.analysisRunId, limit: input.limit });
    }),

  events: authorizedProcedure("geo_analysis", "view")
    .input(z.object({ jobId: z.number().int().positive(), limit: z.number().int().min(1).max(500).optional() }))
    .query(async ({ ctx, input }) => {
      await requireJobPermission({ user: ctx.user, jobId: input.jobId, action: "view" });
      return listSedonaJobEvents(input.jobId, input.limit);
    }),

  cancel: authorizedProcedure("geo_analysis", "update")
    .input(z.object({ jobId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await requireJobPermission({ user: ctx.user, jobId: input.jobId, action: "update" });
        return await requestSedonaJobCancellation({ jobId: input.jobId, requestedBy: ctx.user.id });
      } catch (error) {
        return asTrpcError(error);
      }
    }),
});
