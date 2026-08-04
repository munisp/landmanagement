import { randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  geoAnalysisArtifacts,
  geoAnalysisCheckpoints,
  geoAnalysisRuns,
  geoArcgisOperationRequests,
  geoAssetCatalog,
  geoModelEvidence,
} from "../drizzle/schema";
import { requireDb } from "./db";
import { queueEvent } from "./eventBus";
import { grantPlatformResourceAccess } from "./permifyService";
import {
  defaultGeoCheckpoints,
  deriveEvidenceStatus,
  geoAnalysisManifestSchema,
  geoAssetReferenceSchema,
  type GeoAnalysisManifest,
  type GeoAssetReference,
  type GeoEvidenceStatus,
  GEOAI_POLICY_VERSION,
  validateGeoAnalysisManifest,
} from "./geoaiPolicy";

function runKey() {
  return `geoai-${randomUUID()}`;
}

function operationKey() {
  return `arcgis-${randomUUID()}`;
}

async function publishLifecycleEvent(eventType: string, runId: number, payload: Record<string, unknown>) {
  await queueEvent({
    backend: "dapr_pubsub",
    topic: "geoai-analysis",
    eventType,
    aggregateType: "geo_analysis",
    aggregateId: String(runId),
    partitionKey: String(runId),
    payload,
    deliveryStatus: "pending",
    availableAt: new Date(),
  });
}

function validateUri(uri: string, label: string) {
  if (!/^(https|s3|ipfs|gs):\/\//i.test(uri)) {
    throw new Error(`${label} must use an HTTPS, S3, IPFS, or GCS URI`);
  }
}

export async function registerGeoAsset(params: {
  asset: GeoAssetReference;
  parcelId?: number;
  registeredBy: number;
  evidenceStatus?: GeoEvidenceStatus;
}) {
  const asset = geoAssetReferenceSchema.parse(params.asset);
  validateUri(asset.uri, "GeoAI source asset URI");
  const db = await requireDb();

  const inserted = await db
    .insert(geoAssetCatalog)
    .values({
      assetId: asset.assetId,
      parcelId: params.parcelId ?? null,
      assetType: asset.assetType,
      uri: asset.uri,
      checksumSha256: asset.checksumSha256 ?? null,
      mediaType: null,
      dataSource: asset.dataSource,
      acquiredAt: asset.acquiredAt ? new Date(asset.acquiredAt) : null,
      sourceCrs: asset.sourceCrs ?? null,
      verticalCrs: asset.verticalCrs ?? null,
      coverageGeojson: null,
      qualityMetadata: asset.qualityMetadata,
      provenance: asset.provenance,
      evidenceStatus: params.evidenceStatus ?? "insufficient_evidence",
      registeredBy: params.registeredBy,
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) return inserted[0];

  const existing = await db
    .select()
    .from(geoAssetCatalog)
    .where(eq(geoAssetCatalog.assetId, asset.assetId))
    .limit(1);
  if (!existing[0]) throw new Error(`GeoAI source asset ${asset.assetId} could not be registered`);

  const record = existing[0];
  if (record.uri !== asset.uri || record.checksumSha256 !== (asset.checksumSha256 ?? null)) {
    throw new Error(`GeoAI source asset ${asset.assetId} already exists with a different immutable URI or checksum`);
  }
  return record;
}

export async function createGeoAnalysisRun(params: {
  manifest: unknown;
  requestedBy: number;
}) {
  const manifest = validateGeoAnalysisManifest(params.manifest);
  const db = await requireDb();

  const result = await db.transaction(async (tx) => {
    for (const sourceAsset of manifest.sourceAssets) {
      await tx
        .insert(geoAssetCatalog)
        .values({
          assetId: sourceAsset.assetId,
          parcelId: manifest.parcelId ?? null,
          assetType: sourceAsset.assetType,
          uri: sourceAsset.uri,
          checksumSha256: sourceAsset.checksumSha256 ?? null,
          dataSource: sourceAsset.dataSource,
          acquiredAt: sourceAsset.acquiredAt ? new Date(sourceAsset.acquiredAt) : null,
          sourceCrs: sourceAsset.sourceCrs ?? null,
          verticalCrs: sourceAsset.verticalCrs ?? null,
          qualityMetadata: sourceAsset.qualityMetadata,
          provenance: sourceAsset.provenance,
          evidenceStatus: "insufficient_evidence",
          registeredBy: params.requestedBy,
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
    }

    const sourceAssetIds = manifest.sourceAssets.map((asset) => asset.assetId);
    const assets = await tx
      .select()
      .from(geoAssetCatalog)
      .where(inArray(geoAssetCatalog.assetId, sourceAssetIds));
    if (assets.length !== sourceAssetIds.length) {
      throw new Error("One or more GeoAI source assets were not registered");
    }
    if (assets.some((asset) => asset.evidenceStatus === "rejected")) {
      throw new Error("A rejected GeoAI source asset cannot be used in a new analysis run");
    }

    const [run] = await tx
      .insert(geoAnalysisRuns)
      .values({
        runKey: runKey(),
        parcelId: manifest.parcelId ?? null,
        analysisType: manifest.analysisType,
        title: manifest.title,
        purpose: manifest.purpose,
        policyVersion: GEOAI_POLICY_VERSION,
        status: "draft",
        evidenceStatus: "insufficient_evidence",
        requestedBy: params.requestedBy,
        inputManifest: manifest,
        provenance: {
          sourceAssetIds,
          policyVersion: GEOAI_POLICY_VERSION,
          createdBy: params.requestedBy,
          createdAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .returning();

    const definitions = defaultGeoCheckpoints(manifest);
    const checkpoints = definitions.length
      ? await tx
          .insert(geoAnalysisCheckpoints)
          .values(definitions.map((definition) => ({
            runId: run.id,
            checkpointKey: definition.key,
            checkpointName: definition.name,
            required: definition.required,
            status: "pending" as const,
          })))
          .returning()
      : [];

    return { run, checkpoints };
  });

  try {
    await grantPlatformResourceAccess({
      resourceType: "geo_analysis",
      resourceId: String(result.run.id),
      userId: params.requestedBy,
      userRelation: "requester",
    });
  } catch (error) {
    await db.update(geoAnalysisRuns)
      .set({ status: "failed", failureReason: "Authorization policy initialization failed", updatedAt: new Date() })
      .where(eq(geoAnalysisRuns.id, result.run.id));
    throw error;
  }

  await publishLifecycleEvent("geoai.analysis.created.v1", result.run.id, {
    runId: result.run.id,
    runKey: result.run.runKey,
    analysisType: result.run.analysisType,
    parcelId: result.run.parcelId,
    policyVersion: result.run.policyVersion,
  });
  return result;
}

export async function queueGeoAnalysisRun(runId: number, workflowId?: string) {
  const db = await requireDb();
  const updated = await db
    .update(geoAnalysisRuns)
    .set({ status: "queued", workflowId: workflowId ?? null, failureReason: null, updatedAt: new Date() })
    .where(and(eq(geoAnalysisRuns.id, runId), inArray(geoAnalysisRuns.status, ["draft", "failed", "cancelled"])))
    .returning();
  if (!updated[0]) throw new Error(`GeoAI run ${runId} cannot be queued from its current state`);

  await publishLifecycleEvent("geoai.analysis.queued.v1", runId, {
    runId,
    runKey: updated[0].runKey,
    analysisType: updated[0].analysisType,
    workflowId: updated[0].workflowId,
  });
  return updated[0];
}

export async function attachGeoAnalysisWorkflow(runId: number, workflowId: string) {
  if (!workflowId.trim()) throw new Error("GeoAI workflow ID is required");
  const db = await requireDb();
  const updated = await db
    .update(geoAnalysisRuns)
    .set({ workflowId, updatedAt: new Date() })
    .where(eq(geoAnalysisRuns.id, runId))
    .returning();
  if (!updated[0]) throw new Error(`GeoAI run ${runId} was not found`);
  await publishLifecycleEvent("geoai.analysis.workflow_attached.v1", runId, { runId, workflowId, runKey: updated[0].runKey });
  return updated[0];
}

export async function markGeoAnalysisRunning(runId: number) {
  const db = await requireDb();
  const updated = await db
    .update(geoAnalysisRuns)
    .set({ status: "running", startedAt: new Date(), failureReason: null, updatedAt: new Date() })
    .where(eq(geoAnalysisRuns.id, runId))
    .returning();
  if (!updated[0]) throw new Error(`GeoAI run ${runId} was not found`);
  await publishLifecycleEvent("geoai.analysis.running.v1", runId, { runId, runKey: updated[0].runKey });
  return updated[0];
}

export async function recordGeoAnalysisCheckpoint(params: {
  runId: number;
  checkpointKey: string;
  status: "passed" | "failed" | "waived";
  evidence: Record<string, unknown>;
  fulfilledBy: number;
  notes?: string;
}) {
  const db = await requireDb();
  const updated = await db
    .update(geoAnalysisCheckpoints)
    .set({
      status: params.status,
      evidence: params.evidence,
      fulfilledBy: params.fulfilledBy,
      fulfilledAt: new Date(),
      notes: params.notes ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(geoAnalysisCheckpoints.runId, params.runId), eq(geoAnalysisCheckpoints.checkpointKey, params.checkpointKey)))
    .returning();
  if (!updated[0]) throw new Error(`GeoAI checkpoint ${params.checkpointKey} was not found for run ${params.runId}`);

  await publishLifecycleEvent("geoai.checkpoint.recorded.v1", params.runId, {
    runId: params.runId,
    checkpointKey: params.checkpointKey,
    status: params.status,
  });
  return updated[0];
}

export async function addGeoAnalysisArtifact(params: {
  runId: number;
  assetId?: string;
  artifactType: string;
  uri: string;
  checksumSha256?: string;
  mediaType?: string;
  isPrimary?: boolean;
  metadata?: Record<string, unknown>;
}) {
  if (!params.artifactType.trim()) throw new Error("GeoAI artifactType is required");
  validateUri(params.uri, "GeoAI artifact URI");
  if (params.checksumSha256 && !/^[a-fA-F0-9]{64}$/.test(params.checksumSha256)) {
    throw new Error("GeoAI artifact checksumSha256 must be a SHA-256 digest");
  }
  const db = await requireDb();
  const inserted = await db
    .insert(geoAnalysisArtifacts)
    .values({
      runId: params.runId,
      assetId: params.assetId ?? null,
      artifactType: params.artifactType.trim(),
      uri: params.uri,
      checksumSha256: params.checksumSha256 ?? null,
      mediaType: params.mediaType ?? null,
      isPrimary: params.isPrimary ?? false,
      metadata: params.metadata ?? {},
    })
    .returning();
  return inserted[0];
}

export async function completeGeoAnalysisRun(params: {
  runId: number;
  resultSummary: Record<string, unknown>;
  uncertaintySummary: Record<string, unknown>;
}) {
  const db = await requireDb();
  const checkpoints = await db.select().from(geoAnalysisCheckpoints).where(eq(geoAnalysisCheckpoints.runId, params.runId));
  const provisionalStatus = deriveEvidenceStatus(checkpoints, false);
  const updated = await db
    .update(geoAnalysisRuns)
    .set({
      status: "awaiting_review",
      evidenceStatus: provisionalStatus,
      resultSummary: params.resultSummary,
      uncertaintySummary: params.uncertaintySummary,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(geoAnalysisRuns.id, params.runId))
    .returning();
  if (!updated[0]) throw new Error(`GeoAI run ${params.runId} was not found`);

  await publishLifecycleEvent("geoai.analysis.awaiting_review.v1", params.runId, {
    runId: params.runId,
    runKey: updated[0].runKey,
    evidenceStatus: provisionalStatus,
  });
  return updated[0];
}

export async function failGeoAnalysisRun(runId: number, failureReason: string) {
  const db = await requireDb();
  const updated = await db
    .update(geoAnalysisRuns)
    .set({ status: "failed", evidenceStatus: "insufficient_evidence", failureReason, completedAt: new Date(), updatedAt: new Date() })
    .where(eq(geoAnalysisRuns.id, runId))
    .returning();
  if (!updated[0]) throw new Error(`GeoAI run ${runId} was not found`);
  await publishLifecycleEvent("geoai.analysis.failed.v1", runId, { runId, failureReason });
  return updated[0];
}

export async function reviewGeoAnalysisRun(params: {
  runId: number;
  reviewerId: number;
  decision: "verified" | "rejected";
  reviewNotes?: string;
}) {
  const db = await requireDb();
  const [run] = await db.select().from(geoAnalysisRuns).where(eq(geoAnalysisRuns.id, params.runId)).limit(1);
  if (!run) throw new Error(`GeoAI run ${params.runId} was not found`);
  if (run.status !== "awaiting_review") throw new Error("Only completed GeoAI analysis runs can be reviewed");

  const checkpoints = await db.select().from(geoAnalysisCheckpoints).where(eq(geoAnalysisCheckpoints.runId, params.runId));
  const derived = deriveEvidenceStatus(checkpoints, params.decision === "verified");
  if (params.decision === "verified" && derived !== "verified") {
    throw new Error("Required GeoAI verification checkpoints have not passed; the run cannot be marked verified");
  }

  const updated = await db
    .update(geoAnalysisRuns)
    .set({
      status: "completed",
      evidenceStatus: params.decision === "verified" ? "verified" : "rejected",
      reviewedBy: params.reviewerId,
      reviewedAt: new Date(),
      reviewNotes: params.reviewNotes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(geoAnalysisRuns.id, params.runId))
    .returning();

  await publishLifecycleEvent("geoai.analysis.reviewed.v1", params.runId, {
    runId: params.runId,
    runKey: updated[0].runKey,
    decision: params.decision,
    reviewerId: params.reviewerId,
  });
  return updated[0];
}

export async function getGeoAnalysisRun(runId: number) {
  const db = await requireDb();
  const [run] = await db.select().from(geoAnalysisRuns).where(eq(geoAnalysisRuns.id, runId)).limit(1);
  if (!run) return null;
  const [checkpoints, artifacts] = await Promise.all([
    db.select().from(geoAnalysisCheckpoints).where(eq(geoAnalysisCheckpoints.runId, runId)),
    db.select().from(geoAnalysisArtifacts).where(eq(geoAnalysisArtifacts.runId, runId)).orderBy(desc(geoAnalysisArtifacts.createdAt)),
  ]);
  return { run, checkpoints, artifacts };
}

export async function listGeoAnalysisRuns(params: { parcelId?: number; limit?: number }) {
  const db = await requireDb();
  const query = db.select().from(geoAnalysisRuns).orderBy(desc(geoAnalysisRuns.createdAt)).limit(Math.min(params.limit ?? 50, 200));
  return params.parcelId ? query.where(eq(geoAnalysisRuns.parcelId, params.parcelId)) : query;
}

export async function recordGeoModelEvidence(params: {
  runId?: number;
  modelName: string;
  modelVersion: string;
  modelRunId?: number;
  trainingManifest: Record<string, unknown>;
  splitManifest: Record<string, unknown>;
  baselineMetrics: Record<string, unknown>;
  evaluationMetrics: Record<string, unknown>;
  uncertaintyMetrics: Record<string, unknown>;
  errorArtifactUri?: string;
  geographicTransferArtifactUri?: string;
}) {
  if (!params.modelName.trim() || !params.modelVersion.trim()) throw new Error("GeoAI model name and version are required");
  if (params.errorArtifactUri) validateUri(params.errorArtifactUri, "GeoAI error artifact URI");
  if (params.geographicTransferArtifactUri) validateUri(params.geographicTransferArtifactUri, "GeoAI geographic-transfer artifact URI");
  const db = await requireDb();
  const inserted = await db.insert(geoModelEvidence).values({
    runId: params.runId ?? null,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    modelRunId: params.modelRunId ?? null,
    trainingManifest: params.trainingManifest,
    splitManifest: params.splitManifest,
    baselineMetrics: params.baselineMetrics,
    evaluationMetrics: params.evaluationMetrics,
    uncertaintyMetrics: params.uncertaintyMetrics,
    errorArtifactUri: params.errorArtifactUri ?? null,
    geographicTransferArtifactUri: params.geographicTransferArtifactUri ?? null,
    evidenceStatus: "insufficient_evidence",
  }).returning();
  return inserted[0];
}

export async function requestGeoArcgisOperation(params: {
  runId?: number;
  requestedBy: number;
  operationType: string;
  operationPlan: Record<string, unknown>;
  recoveryPlan: Record<string, unknown>;
  targetWorkspaceUri: string;
}) {
  if (!params.operationType.trim()) throw new Error("GeoAI ArcGIS operation type is required");
  validateUri(params.targetWorkspaceUri, "GeoAI ArcGIS target workspace URI");
  const db = await requireDb();
  const inserted = await db.insert(geoArcgisOperationRequests).values({
    operationKey: operationKey(),
    runId: params.runId ?? null,
    requestedBy: params.requestedBy,
    operationType: params.operationType.trim(),
    operationPlan: params.operationPlan,
    recoveryPlan: params.recoveryPlan,
    targetWorkspaceUri: params.targetWorkspaceUri,
    status: "requested",
  }).returning();
  const operation = inserted[0];
  try {
    await grantPlatformResourceAccess({
      resourceType: "geo_arcgis_operation",
      resourceId: String(operation.id),
      userId: params.requestedBy,
      userRelation: "requester",
    });
  } catch (error) {
    await db.update(geoArcgisOperationRequests)
      .set({ status: "failed", failureReason: "Authorization policy initialization failed" })
      .where(eq(geoArcgisOperationRequests.id, operation.id));
    throw error;
  }
  return operation;
}

export async function approveGeoArcgisOperation(params: { operationId: number; approvedBy: number; externalJobId?: string }) {
  const db = await requireDb();
  const updated = await db
    .update(geoArcgisOperationRequests)
    .set({ status: "approved", approvedBy: params.approvedBy, approvedAt: new Date(), externalJobId: params.externalJobId ?? null })
    .where(and(eq(geoArcgisOperationRequests.id, params.operationId), eq(geoArcgisOperationRequests.status, "requested")))
    .returning();
  if (!updated[0]) throw new Error("GeoAI ArcGIS operation was not found or is no longer awaiting approval");
  if (updated[0].runId) {
    await publishLifecycleEvent("geoai.arcgis.approved.v1", updated[0].runId, {
      operationId: params.operationId,
      operationKey: updated[0].operationKey,
      approvedBy: params.approvedBy,
      externalJobId: updated[0].externalJobId,
    });
  }
  return updated[0];
}

export function parseGeoAnalysisManifest(value: unknown): GeoAnalysisManifest {
  return geoAnalysisManifestSchema.parse(value);
}
