import { createHash, randomUUID } from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  sedonaSpatialJobEvents,
  sedonaSpatialJobs,
  sedonaSpatialJobStatusEnum,
  sedonaSpatialOperationEnum,
} from "../drizzle/schema";
import { requireDb } from "./db";
import { queueEvent } from "./eventBus";

export type SedonaOperation = (typeof sedonaSpatialOperationEnum.enumValues)[number];
export type SedonaJobStatus = (typeof sedonaSpatialJobStatusEnum.enumValues)[number];

type JsonRecord = Record<string, unknown>;
type SedonaJobRecord = typeof sedonaSpatialJobs.$inferSelect;

const TERMINAL_STATUSES: ReadonlySet<SedonaJobStatus> = new Set(["succeeded", "failed", "cancelled"]);
const ACTIVE_STATUSES: ReadonlySet<SedonaJobStatus> = new Set(["queued", "claimed", "running", "cancel_requested"]);

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function assertPositiveId(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
}

function assertSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(`${label} must be a SHA-256 hexadecimal digest`);
}

function assertInternalObjectStoreUri(value: string): void {
  if (!value.startsWith("s3://")) throw new Error("Sedona output URIs must use a private s3:// warehouse path");
  const warehouse = process.env.ICEBERG_WAREHOUSE_PATH?.replace(/\/$/, "");
  if (!warehouse || !value.startsWith(`${warehouse}/`)) {
    throw new Error("Sedona output URI must remain under ICEBERG_WAREHOUSE_PATH");
  }
}

async function appendEvent(params: {
  jobId: number;
  eventType: string;
  status: SedonaJobStatus;
  attempt: number;
  actorType: "user" | "worker" | "system";
  actorId?: string;
  payload?: JsonRecord;
}) {
  const db = await requireDb();
  const [event] = await db.insert(sedonaSpatialJobEvents).values({
    jobId: params.jobId,
    eventType: params.eventType,
    status: params.status,
    attempt: params.attempt,
    actorType: params.actorType,
    actorId: params.actorId ?? null,
    payload: params.payload ?? {},
  }).returning();
  return event;
}

async function publishJobEvent(eventType: string, job: SedonaJobRecord, payload: JsonRecord): Promise<void> {
  await queueEvent({
    backend: "dapr_pubsub",
    topic: "lakehouse-sedona-jobs",
    eventType,
    aggregateType: "sedona_spatial_job",
    aggregateId: String(job.id),
    partitionKey: job.parcelId ? String(job.parcelId) : String(job.id),
    payload: {
      jobId: job.id,
      jobKey: job.jobKey,
      operation: job.operation,
      status: job.status,
      analysisRunId: job.analysisRunId,
      parcelId: job.parcelId,
      ...payload,
    },
    deliveryStatus: "pending",
    availableAt: new Date(),
  });
}

export async function createSedonaJob(params: {
  requestedBy: number;
  operation: SedonaOperation;
  analysisRunId?: number;
  parcelId?: number;
  inputManifest: JsonRecord;
  maxAttempts?: number;
}) {
  assertPositiveId(params.requestedBy, "requestedBy");
  if (params.analysisRunId !== undefined) assertPositiveId(params.analysisRunId, "analysisRunId");
  if (params.parcelId !== undefined) assertPositiveId(params.parcelId, "parcelId");
  const maxAttempts = params.maxAttempts ?? 3;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error("maxAttempts must be an integer from 1 to 10");
  }
  const immutableManifest = JSON.parse(stableJson(params.inputManifest)) as JsonRecord;
  const inputChecksumSha256 = sha256(immutableManifest);
  const requestFingerprintSha256 = sha256({
    requestedBy: params.requestedBy,
    operation: params.operation,
    analysisRunId: params.analysisRunId ?? null,
    parcelId: params.parcelId ?? null,
    inputManifest: immutableManifest,
  });
  const db = await requireDb();
  const [job] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(sedonaSpatialJobs).values({
      jobKey: `sedona-${randomUUID()}`,
      requestFingerprintSha256,
      operation: params.operation,
      status: "queued",
      requestedBy: params.requestedBy,
      analysisRunId: params.analysisRunId ?? null,
      parcelId: params.parcelId ?? null,
      inputManifest: immutableManifest,
      inputChecksumSha256,
      maxAttempts,
      updatedAt: new Date(),
    }).returning();
    await tx.insert(sedonaSpatialJobEvents).values({
      jobId: created.id,
      eventType: "sedona.job.queued.v1",
      status: "queued",
      attempt: 0,
      actorType: "user",
      actorId: String(params.requestedBy),
      payload: { inputChecksumSha256, requestFingerprintSha256 },
    });
    return [created] as const;
  });
  await publishJobEvent("sedona.job.queued.v1", job, { inputChecksumSha256, requestFingerprintSha256 });
  return job;
}

export async function getSedonaJob(jobId: number) {
  assertPositiveId(jobId, "jobId");
  const db = await requireDb();
  const [job] = await db.select().from(sedonaSpatialJobs).where(eq(sedonaSpatialJobs.id, jobId)).limit(1);
  return job ?? null;
}

export async function getSedonaJobByKey(jobKey: string) {
  if (!/^sedona-[a-f0-9-]{36}$/i.test(jobKey)) throw new Error("jobKey is malformed");
  const db = await requireDb();
  const [job] = await db.select().from(sedonaSpatialJobs).where(eq(sedonaSpatialJobs.jobKey, jobKey)).limit(1);
  return job ?? null;
}

export async function listSedonaJobs(params: { parcelId?: number; analysisRunId?: number; limit?: number }) {
  const limit = params.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error("limit must be an integer from 1 to 200");
  const predicates = [];
  if (params.parcelId !== undefined) {
    assertPositiveId(params.parcelId, "parcelId");
    predicates.push(eq(sedonaSpatialJobs.parcelId, params.parcelId));
  }
  if (params.analysisRunId !== undefined) {
    assertPositiveId(params.analysisRunId, "analysisRunId");
    predicates.push(eq(sedonaSpatialJobs.analysisRunId, params.analysisRunId));
  }
  const db = await requireDb();
  return db.select().from(sedonaSpatialJobs)
    .where(predicates.length ? and(...predicates) : undefined)
    .orderBy(desc(sedonaSpatialJobs.createdAt))
    .limit(limit);
}

export async function listSedonaJobEvents(jobId: number, limit = 200) {
  assertPositiveId(jobId, "jobId");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error("limit must be an integer from 1 to 500");
  const db = await requireDb();
  return db.select().from(sedonaSpatialJobEvents)
    .where(eq(sedonaSpatialJobEvents.jobId, jobId))
    .orderBy(desc(sedonaSpatialJobEvents.createdAt))
    .limit(limit);
}

export async function requestSedonaJobCancellation(params: { jobId: number; requestedBy: number }) {
  assertPositiveId(params.jobId, "jobId");
  assertPositiveId(params.requestedBy, "requestedBy");
  const db = await requireDb();
  const [job] = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(sedonaSpatialJobs).where(eq(sedonaSpatialJobs.id, params.jobId)).limit(1);
    if (!current) throw new Error(`Sedona job ${params.jobId} was not found`);
    if (TERMINAL_STATUSES.has(current.status)) throw new Error(`Sedona job ${params.jobId} is already terminal`);
    const nextStatus: SedonaJobStatus = current.status === "queued" ? "cancelled" : "cancel_requested";
    const completedAt = nextStatus === "cancelled" ? new Date() : null;
    const [updated] = await tx.update(sedonaSpatialJobs)
      .set({ status: nextStatus, cancelRequestedAt: new Date(), cancelRequestedBy: params.requestedBy, completedAt, updatedAt: new Date() })
      .where(and(eq(sedonaSpatialJobs.id, params.jobId), inArray(sedonaSpatialJobs.status, [...ACTIVE_STATUSES])))
      .returning();
    if (!updated) throw new Error(`Sedona job ${params.jobId} could not be cancelled from its current state`);
    await tx.insert(sedonaSpatialJobEvents).values({
      jobId: updated.id,
      eventType: nextStatus === "cancelled" ? "sedona.job.cancelled.v1" : "sedona.job.cancel_requested.v1",
      status: updated.status,
      attempt: updated.attempt,
      actorType: "user",
      actorId: String(params.requestedBy),
      payload: {},
    });
    return [updated] as const;
  });
  await publishJobEvent(job.status === "cancelled" ? "sedona.job.cancelled.v1" : "sedona.job.cancel_requested.v1", job, {});
  return job;
}

/**
 * Atomically claim one queueable or stale active job. This is intentionally a
 * low-level worker boundary: only the trusted Lakehouse runner invokes it.
 */
export async function claimNextSedonaJob(params: { workerId: string; staleAfterSeconds?: number }) {
  if (!/^[a-zA-Z0-9._:-]{3,128}$/.test(params.workerId)) throw new Error("workerId is malformed");
  const staleAfterSeconds = params.staleAfterSeconds ?? 300;
  if (!Number.isSafeInteger(staleAfterSeconds) || staleAfterSeconds < 60 || staleAfterSeconds > 86_400) {
    throw new Error("staleAfterSeconds must be an integer from 60 to 86400");
  }
  const db = await requireDb();
  const result = await db.transaction(async (tx): Promise<SedonaJobRecord | null> => {
    const claimed = await tx.execute(sql`
      WITH candidate AS (
        SELECT id
        FROM sedona_spatial_jobs
        WHERE attempt < max_attempts
          AND (
            status = 'queued'
            OR (status IN ('claimed', 'running') AND heartbeat_at < NOW() - (${staleAfterSeconds} * INTERVAL '1 second'))
          )
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE sedona_spatial_jobs AS job
      SET status = 'claimed',
          worker_id = ${params.workerId},
          attempt = job.attempt + 1,
          heartbeat_at = NOW(),
          started_at = COALESCE(job.started_at, NOW()),
          updated_at = NOW(),
          failure_code = NULL,
          failure_reason = NULL
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.*
    `);
    const job = (claimed as unknown as SedonaJobRecord[])[0];
    if (!job) return null;
    await tx.insert(sedonaSpatialJobEvents).values({
      jobId: job.id,
      eventType: "sedona.job.claimed.v1",
      status: "claimed",
      attempt: job.attempt,
      actorType: "worker",
      actorId: params.workerId,
      payload: { staleAfterSeconds },
    });
    return job;
  });
  if (result) await publishJobEvent("sedona.job.claimed.v1", result, { workerId: params.workerId });
  return result;
}

export async function markSedonaJobRunning(params: { jobId: number; workerId: string; sparkApplicationId?: string }) {
  assertPositiveId(params.jobId, "jobId");
  if (!/^[a-zA-Z0-9._:-]{3,128}$/.test(params.workerId)) throw new Error("workerId is malformed");
  if (params.sparkApplicationId && !/^[a-zA-Z0-9._:-]{3,255}$/.test(params.sparkApplicationId)) {
    throw new Error("sparkApplicationId is malformed");
  }
  const db = await requireDb();
  const [job] = await db.update(sedonaSpatialJobs)
    .set({ status: "running", workerId: params.workerId, sparkApplicationId: params.sparkApplicationId ?? null, heartbeatAt: new Date(), updatedAt: new Date() })
    .where(and(eq(sedonaSpatialJobs.id, params.jobId), eq(sedonaSpatialJobs.status, "claimed"), eq(sedonaSpatialJobs.workerId, params.workerId)))
    .returning();
  if (!job) throw new Error(`Sedona job ${params.jobId} is not claimed by ${params.workerId}`);
  await appendEvent({ jobId: job.id, eventType: "sedona.job.running.v1", status: "running", attempt: job.attempt, actorType: "worker", actorId: params.workerId, payload: { sparkApplicationId: job.sparkApplicationId ?? null } });
  await publishJobEvent("sedona.job.running.v1", job, { workerId: params.workerId, sparkApplicationId: job.sparkApplicationId ?? null });
  return job;
}

export async function heartbeatSedonaJob(params: { jobId: number; workerId: string }) {
  assertPositiveId(params.jobId, "jobId");
  const db = await requireDb();
  const [job] = await db.update(sedonaSpatialJobs)
    .set({ heartbeatAt: new Date(), updatedAt: new Date() })
    .where(and(eq(sedonaSpatialJobs.id, params.jobId), eq(sedonaSpatialJobs.workerId, params.workerId), inArray(sedonaSpatialJobs.status, ["claimed", "running", "cancel_requested"])))
    .returning();
  if (!job) throw new Error(`Sedona job ${params.jobId} is not active for worker ${params.workerId}`);
  return job;
}

export async function completeSedonaJob(params: {
  jobId: number;
  workerId: string;
  resultSummary: JsonRecord;
  outputUri: string;
  outputChecksumSha256: string;
}) {
  assertPositiveId(params.jobId, "jobId");
  assertInternalObjectStoreUri(params.outputUri);
  assertSha256(params.outputChecksumSha256, "outputChecksumSha256");
  const db = await requireDb();
  const [job] = await db.update(sedonaSpatialJobs)
    .set({
      status: "succeeded",
      resultSummary: JSON.parse(stableJson(params.resultSummary)),
      outputUri: params.outputUri,
      outputChecksumSha256: params.outputChecksumSha256.toLowerCase(),
      heartbeatAt: new Date(),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(sedonaSpatialJobs.id, params.jobId), eq(sedonaSpatialJobs.workerId, params.workerId), eq(sedonaSpatialJobs.status, "running")))
    .returning();
  if (!job) throw new Error(`Sedona job ${params.jobId} cannot complete from its current state`);
  await appendEvent({ jobId: job.id, eventType: "sedona.job.succeeded.v1", status: "succeeded", attempt: job.attempt, actorType: "worker", actorId: params.workerId, payload: { outputUri: job.outputUri, outputChecksumSha256: job.outputChecksumSha256 } });
  await publishJobEvent("sedona.job.succeeded.v1", job, { outputUri: job.outputUri ?? "", outputChecksumSha256: job.outputChecksumSha256 ?? "" });
  return job;
}

export async function failSedonaJob(params: { jobId: number; workerId: string; failureCode: string; failureReason: string }) {
  assertPositiveId(params.jobId, "jobId");
  if (!/^[A-Z0-9_]{3,96}$/.test(params.failureCode)) throw new Error("failureCode must use uppercase alphanumeric underscore format");
  if (!params.failureReason.trim() || params.failureReason.length > 4_000) throw new Error("failureReason is required and must be no more than 4000 characters");
  const db = await requireDb();
  const [current] = await db.select().from(sedonaSpatialJobs).where(eq(sedonaSpatialJobs.id, params.jobId)).limit(1);
  if (!current) throw new Error(`Sedona job ${params.jobId} was not found`);
  if (current.workerId !== params.workerId || !["claimed", "running", "cancel_requested"].includes(current.status)) {
    throw new Error(`Sedona job ${params.jobId} is not active for worker ${params.workerId}`);
  }
  const status: SedonaJobStatus = current.status === "cancel_requested" ? "cancelled" : "failed";
  const [job] = await db.update(sedonaSpatialJobs)
    .set({ status, failureCode: params.failureCode, failureReason: params.failureReason.trim(), heartbeatAt: new Date(), completedAt: new Date(), updatedAt: new Date() })
    .where(eq(sedonaSpatialJobs.id, params.jobId))
    .returning();
  await appendEvent({ jobId: job.id, eventType: status === "cancelled" ? "sedona.job.cancelled.v1" : "sedona.job.failed.v1", status, attempt: job.attempt, actorType: "worker", actorId: params.workerId, payload: { failureCode: job.failureCode, failureReason: job.failureReason } });
  await publishJobEvent(status === "cancelled" ? "sedona.job.cancelled.v1" : "sedona.job.failed.v1", job, { failureCode: job.failureCode ?? "", failureReason: job.failureReason ?? "" });
  return job;
}

export function isSedonaJobTerminal(status: SedonaJobStatus) {
  return TERMINAL_STATUSES.has(status);
}
