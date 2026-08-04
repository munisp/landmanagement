import { and, desc, eq } from "drizzle-orm";
import { geoArcgisOperationRequests } from "../drizzle/schema";
import { requireDb } from "./db";
import { queueEvent } from "./eventBus";

function config() {
  const baseUrl = process.env.ARCGIS_GEOAI_CONTROL_PLANE_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.ARCGIS_GEOAI_CONTROL_PLANE_API_KEY?.trim();
  if (!baseUrl) throw new Error("ARCGIS_GEOAI_CONTROL_PLANE_URL must be configured before a guarded ArcGIS operation can execute");
  if (!apiKey) throw new Error("ARCGIS_GEOAI_CONTROL_PLANE_API_KEY must be configured before a guarded ArcGIS operation can execute");
  return { baseUrl, apiKey };
}

async function controlPlaneRequest(path: string, init: RequestInit) {
  const { baseUrl, apiKey } = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.ARCGIS_GEOAI_TIMEOUT_MS || 120000));
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-GeoAI-Control-Plane-Key": apiKey,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    const body = await response.text();
    let parsed: unknown = body;
    try { parsed = body ? JSON.parse(body) : {}; } catch { /* preserve raw response */ }
    if (!response.ok) throw new Error(`ArcGIS control plane failed with HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 1000)}`);
    if (!parsed || typeof parsed !== "object") throw new Error("ArcGIS control plane returned a non-object response");
    return parsed as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

async function publishOperationEvent(eventType: string, operation: { id: number; operationKey: string; runId: number | null; status: string; externalJobId: string | null }) {
  if (!operation.runId) return;
  await queueEvent({
    backend: "dapr_pubsub",
    topic: "geoai-arcgis-operation",
    eventType,
    aggregateType: "geo_arcgis_operation",
    aggregateId: String(operation.id),
    partitionKey: String(operation.runId),
    payload: {
      operationId: operation.id,
      operationKey: operation.operationKey,
      runId: operation.runId,
      status: operation.status,
      externalJobId: operation.externalJobId,
    },
    deliveryStatus: "pending",
    availableAt: new Date(),
  });
}

export async function getGeoArcgisOperation(operationId: number) {
  const db = await requireDb();
  const rows = await db.select().from(geoArcgisOperationRequests).where(eq(geoArcgisOperationRequests.id, operationId)).limit(1);
  return rows[0] ?? null;
}

export async function listGeoArcgisOperations(limit = 50) {
  const db = await requireDb();
  return db.select().from(geoArcgisOperationRequests)
    .orderBy(desc(geoArcgisOperationRequests.requestedAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function executeApprovedGeoArcgisOperation(params: { operationId: number; executedBy: number }) {
  const db = await requireDb();
  const [operation] = await db.select().from(geoArcgisOperationRequests)
    .where(and(eq(geoArcgisOperationRequests.id, params.operationId), eq(geoArcgisOperationRequests.status, "approved")))
    .limit(1);
  if (!operation) throw new Error("GeoAI ArcGIS operation was not found or has not been approved");
  if (operation.approvedBy === null) throw new Error("GeoAI ArcGIS operation is missing an approver audit record");
  if (!operation.recoveryPlan || !operation.operationPlan) throw new Error("GeoAI ArcGIS operation lacks a complete operation or recovery plan");

  const [running] = await db.update(geoArcgisOperationRequests)
    .set({ status: "running", failureReason: null })
    .where(eq(geoArcgisOperationRequests.id, operation.id))
    .returning();
  await publishOperationEvent("geoai.arcgis.execution_started.v1", running);

  try {
    const response = await controlPlaneRequest("/geoai/arcgis/operations", {
      method: "POST",
      body: JSON.stringify({
        operation_key: operation.operationKey,
        operation_type: operation.operationType,
        target_workspace_uri: operation.targetWorkspaceUri,
        operation_plan: operation.operationPlan,
        recovery_plan: operation.recoveryPlan,
        requested_by: operation.requestedBy,
        approved_by: operation.approvedBy,
        executed_by: params.executedBy,
      }),
    });
    const externalJobId = typeof response.job_id === "string"
      ? response.job_id
      : typeof response.jobId === "string"
        ? response.jobId
        : undefined;
    if (!externalJobId) throw new Error("ArcGIS control plane did not return a job identifier");
    const completed = response.status === "completed";
    const [updated] = await db.update(geoArcgisOperationRequests)
      .set({
        status: completed ? "completed" : "running",
        externalJobId,
        resultSummary: response,
        completedAt: completed ? new Date() : null,
      })
      .where(eq(geoArcgisOperationRequests.id, operation.id))
      .returning();
    await publishOperationEvent(completed ? "geoai.arcgis.completed.v1" : "geoai.arcgis.submitted.v1", updated);
    return updated;
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "ArcGIS control-plane execution failed";
    const [failed] = await db.update(geoArcgisOperationRequests)
      .set({ status: "failed", failureReason })
      .where(eq(geoArcgisOperationRequests.id, operation.id))
      .returning();
    await publishOperationEvent("geoai.arcgis.failed.v1", failed);
    throw error;
  }
}

export async function refreshGeoArcgisOperation(operationId: number) {
  const db = await requireDb();
  const [operation] = await db.select().from(geoArcgisOperationRequests)
    .where(eq(geoArcgisOperationRequests.id, operationId)).limit(1);
  if (!operation) throw new Error("GeoAI ArcGIS operation was not found");
  if (!operation.externalJobId) throw new Error("GeoAI ArcGIS operation has not been submitted to the configured control plane");
  if (!["running", "approved"].includes(operation.status)) return operation;

  try {
    const response = await controlPlaneRequest(`/geoai/arcgis/operations/${encodeURIComponent(operation.externalJobId)}`, { method: "GET" });
    const status = response.status;
    if (!["running", "completed", "failed", "cancelled"].includes(String(status))) {
      throw new Error("ArcGIS control plane returned an unsupported operation status");
    }
    const [updated] = await db.update(geoArcgisOperationRequests)
      .set({
        status: status as "running" | "completed" | "failed" | "cancelled",
        resultSummary: response,
        failureReason: status === "failed" ? String(response.failure_reason ?? response.detail ?? "ArcGIS control-plane operation failed") : null,
        completedAt: ["completed", "failed", "cancelled"].includes(String(status)) ? new Date() : null,
      })
      .where(eq(geoArcgisOperationRequests.id, operation.id))
      .returning();
    await publishOperationEvent(`geoai.arcgis.${status}.v1`, updated);
    return updated;
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "ArcGIS control-plane status refresh failed";
    const [failed] = await db.update(geoArcgisOperationRequests)
      .set({ status: "failed", failureReason })
      .where(eq(geoArcgisOperationRequests.id, operation.id))
      .returning();
    await publishOperationEvent("geoai.arcgis.failed.v1", failed);
    throw error;
  }
}
