import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure, router } from "../../_core/trpc";
import {
  addGeoAnalysisArtifact,
  approveGeoArcgisOperation,
  attachGeoAnalysisWorkflow,
  completeGeoAnalysisRun,
  createGeoAnalysisRun,
  failGeoAnalysisRun,
  getGeoAnalysisRun,
  listGeoAnalysisRuns,
  listGeoAssets,
  markGeoAnalysisRunning,
  queueGeoAnalysisRun,
  recordGeoAnalysisCheckpoint,
  recordGeoModelEvidence,
  registerGeoAsset,
  requestGeoArcgisOperation,
  reviewGeoAnalysisRun,
} from "../../geoaiEvidenceService";
import { startGeoAiAnalysisWorkflow } from "../../temporalClient";
import { geoAnalysisManifestSchema, geoAssetReferenceSchema } from "../../geoaiPolicy";
import { evaluateSuitability as evaluateGeoAiSuitability, suitabilityRequestSchema } from "../../geoaiDecisionSupportService";
import {
  executeApprovedGeoArcgisOperation,
  getGeoArcgisOperation,
  listGeoArcgisOperations,
  refreshGeoArcgisOperation,
} from "../../geoaiArcgisControlService";
import { buildGeoAiEvidenceReport, buildGeoAiPresentation } from "../../geoaiPresentationService";

const recordSchema = z.record(z.string(), z.unknown());

function asTrpcError(error: unknown): never {
  const message = error instanceof Error ? error.message : "GeoAI operation failed";
  if (message.includes("preflight") || message.includes("required") || message.includes("cannot") || message.includes("must")) {
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

export const geoaiRouter = router({
  registerAsset: authorizedProcedure("geo_analysis", "create")
    .input(z.object({
      asset: geoAssetReferenceSchema,
      parcelId: z.number().int().positive().optional(),
      evidenceStatus: z.enum(["verified", "provisional", "insufficient_evidence", "rejected"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await registerGeoAsset({
          asset: input.asset,
          parcelId: input.parcelId,
          registeredBy: ctx.user.id,
          evidenceStatus: input.evidenceStatus,
        });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  createRun: authorizedProcedure("geo_analysis", "create")
    .input(z.object({ manifest: geoAnalysisManifestSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await createGeoAnalysisRun({ manifest: input.manifest, requestedBy: ctx.user.id });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  getRun: authorizedProcedure("geo_analysis", "view")
    .input(z.object({ runId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const run = await getGeoAnalysisRun(input.runId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "GeoAI analysis run was not found" });
      return run;
    }),

  listRuns: authorizedProcedure("geo_analysis", "view")
    .input(z.object({ parcelId: z.number().int().positive().optional(), limit: z.number().int().positive().max(200).optional() }))
    .query(async ({ input }) => listGeoAnalysisRuns(input)),

  listAssets: authorizedProcedure("geo_analysis", "view")
    .input(z.object({
      parcelId: z.number().int().positive().optional(),
      assetTypes: z.array(geoAssetReferenceSchema.shape.assetType).max(20).optional(),
      limit: z.number().int().positive().max(200).optional(),
    }))
    .query(async ({ input }) => listGeoAssets(input)),

  getPresentation: authorizedProcedure("geo_analysis", "view")
    .input(z.object({ runId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        return await buildGeoAiPresentation(input.runId);
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  getEvidenceReport: authorizedProcedure("geo_analysis", "view")
    .input(z.object({ runId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        return await buildGeoAiEvidenceReport(input.runId);
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  queueRun: authorizedProcedure("geo_analysis", "update")
    .input(z.object({ runId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      let queued = false;
      try {
        await queueGeoAnalysisRun(input.runId);
        queued = true;
        const workflow = await startGeoAiAnalysisWorkflow({ runId: input.runId });
        return await attachGeoAnalysisWorkflow(input.runId, workflow.workflowId);
      } catch (error) {
        if (queued) {
          const message = error instanceof Error ? error.message : "Unable to start the configured GeoAI Temporal workflow";
          await failGeoAnalysisRun(input.runId, message).catch(() => undefined);
        }
        return asTrpcError(error);
      }
    }),

  markRunning: authorizedProcedure("geo_analysis", "update")
    .input(z.object({ runId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await markGeoAnalysisRunning(input.runId);
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  recordCheckpoint: authorizedProcedure("geo_analysis", "update")
    .input(z.object({
      runId: z.number().int().positive(),
      checkpointKey: z.string().min(2).max(96),
      status: z.enum(["passed", "failed", "waived"]),
      evidence: recordSchema,
      notes: z.string().max(4000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await recordGeoAnalysisCheckpoint({ ...input, fulfilledBy: ctx.user.id });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  addArtifact: authorizedProcedure("geo_analysis", "update")
    .input(z.object({
      runId: z.number().int().positive(),
      assetId: z.string().min(6).max(128).optional(),
      artifactType: z.string().min(2).max(64),
      uri: z.string().min(6).max(2000),
      checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
      mediaType: z.string().min(2).max(128).optional(),
      isPrimary: z.boolean().optional(),
      metadata: recordSchema.optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        return await addGeoAnalysisArtifact(input);
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  completeRun: authorizedProcedure("geo_analysis", "update")
    .input(z.object({ runId: z.number().int().positive(), resultSummary: recordSchema, uncertaintySummary: recordSchema }))
    .mutation(async ({ input }) => {
      try {
        return await completeGeoAnalysisRun(input);
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  failRun: authorizedProcedure("geo_analysis", "update")
    .input(z.object({ runId: z.number().int().positive(), failureReason: z.string().min(2).max(4000) }))
    .mutation(async ({ input }) => {
      try {
        return await failGeoAnalysisRun(input.runId, input.failureReason);
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  reviewRun: authorizedProcedure("geo_analysis", "approve")
    .input(z.object({
      runId: z.number().int().positive(),
      decision: z.enum(["verified", "rejected"]),
      reviewNotes: z.string().max(4000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await reviewGeoAnalysisRun({ ...input, reviewerId: ctx.user.id });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  recordModelEvidence: authorizedProcedure("geo_analysis", "update")
    .input(z.object({
      runId: z.number().int().positive().optional(),
      modelName: z.string().min(2).max(128),
      modelVersion: z.string().min(2).max(128),
      modelRunId: z.number().int().positive().optional(),
      trainingManifest: recordSchema,
      splitManifest: recordSchema,
      baselineMetrics: recordSchema,
      evaluationMetrics: recordSchema,
      uncertaintyMetrics: recordSchema,
      errorArtifactUri: z.string().min(6).max(2000).optional(),
      geographicTransferArtifactUri: z.string().min(6).max(2000).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        return await recordGeoModelEvidence(input);
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  evaluateSuitability: authorizedProcedure("geo_analysis", "update")
    .input(z.object({ runId: z.number().int().positive(), request: suitabilityRequestSchema }))
    .mutation(async ({ input }) => {
      try {
        const stored = await getGeoAnalysisRun(input.runId);
        if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "GeoAI suitability run was not found" });
        if (stored.run.analysisType !== "suitability_analysis") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The requested GeoAI run is not a suitability analysis" });
        }
        await markGeoAnalysisRunning(input.runId);
        const result = evaluateGeoAiSuitability(input.request);
        const run = await completeGeoAnalysisRun({
          runId: input.runId,
          resultSummary: result,
          uncertaintySummary: {
            status: "decision_sensitivity_recorded",
            leaderStableAcrossSingleCriterionPerturbations: result.sensitivity.leaderStableAcrossSingleCriterionPerturbations,
            scenarios: result.sensitivity.scenarios,
          },
        });
        return { run, result };
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  requestArcgisOperation: authorizedProcedure("geo_arcgis_operation", "create")
    .input(z.object({
      runId: z.number().int().positive().optional(),
      operationType: z.string().min(2).max(96),
      operationPlan: recordSchema,
      recoveryPlan: recordSchema,
      targetWorkspaceUri: z.string().min(6).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await requestGeoArcgisOperation({ ...input, requestedBy: ctx.user.id });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  getArcgisOperation: authorizedProcedure("geo_arcgis_operation", "view")
    .input(z.object({ operationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const operation = await getGeoArcgisOperation(input.operationId);
      if (!operation) throw new TRPCError({ code: "NOT_FOUND", message: "GeoAI ArcGIS operation was not found" });
      return operation;
    }),

  listArcgisOperations: authorizedProcedure("geo_arcgis_operation", "view")
    .input(z.object({ limit: z.number().int().positive().max(200).optional() }))
    .query(async ({ input }) => listGeoArcgisOperations(input.limit)),

  approveArcgisOperation: authorizedProcedure("geo_arcgis_operation", "approve")
    .input(z.object({ operationId: z.number().int().positive(), externalJobId: z.string().min(2).max(255).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await approveGeoArcgisOperation({ ...input, approvedBy: ctx.user.id });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  executeArcgisOperation: authorizedProcedure("geo_arcgis_operation", "manage")
    .input(z.object({ operationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await executeApprovedGeoArcgisOperation({ operationId: input.operationId, executedBy: ctx.user.id });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  refreshArcgisOperation: authorizedProcedure("geo_arcgis_operation", "manage")
    .input(z.object({ operationId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await refreshGeoArcgisOperation(input.operationId);
      } catch (error) {
        return asTrpcError(error);
      }
    }),
});
