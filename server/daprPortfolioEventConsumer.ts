import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { daprInboxDeliveries, stakeholderJourneyEvents, stakeholderJourneyRuns } from "../drizzle/schema";
import { requireDb } from "./db";

type PortfolioGatewayEventType = "workflow.created" | "workflow.reviewed" | "workflow.closed" | "evidence.recorded";

type PortfolioGatewayEnvelope = {
  idempotencyKey: string;
  publishedAt: string;
  data: {
    eventKey: string;
    accountKey: string;
    productKey: "stakeholder-journey-engine";
    eventType: PortfolioGatewayEventType;
    purpose: string;
    sourceReference: string;
    occurredAt: string;
    payload: { templateCode: string } & Record<string, unknown>;
  };
};

type PortfolioCloudEvent = {
  id: string;
  type: string;
  topic?: string;
  data: PortfolioGatewayEnvelope;
};

const supportedGatewayEventTypes = new Set<PortfolioGatewayEventType>([
  "workflow.created",
  "workflow.reviewed",
  "workflow.closed",
  "evidence.recorded",
]);

function invalid(message: string): never {
  throw new Error(`Portfolio journey event is invalid: ${message}`);
}

function boundedString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string") invalid(`${name} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) invalid(`${name} is out of bounds`);
  return normalized;
}

function validIsoTimestamp(value: unknown, name: string): string {
  const timestamp = boundedString(value, name, 64);
  if (Number.isNaN(Date.parse(timestamp))) invalid(`${name} must be an ISO timestamp`);
  return timestamp;
}

function parsePortfolioCloudEvent(value: unknown): PortfolioCloudEvent {
  if (!value || typeof value !== "object") invalid("CloudEvent body is required");
  const cloudEvent = value as Record<string, unknown>;
  const id = boundedString(cloudEvent.id, "CloudEvent id", 255);
  const type = boundedString(cloudEvent.type, "CloudEvent type", 255);
  if (type !== "portfolio.event.v1") invalid("CloudEvent type is not subscribed");

  const envelope = cloudEvent.data;
  if (!envelope || typeof envelope !== "object") invalid("CloudEvent data is required");
  const rawEnvelope = envelope as Record<string, unknown>;
  const idempotencyKey = boundedString(rawEnvelope.idempotencyKey, "idempotencyKey", 96);
  const publishedAt = validIsoTimestamp(rawEnvelope.publishedAt, "publishedAt");
  const data = rawEnvelope.data;
  if (!data || typeof data !== "object") invalid("portfolio event data is required");
  const rawData = data as Record<string, unknown>;
  const eventKey = boundedString(rawData.eventKey, "eventKey", 96);
  if (eventKey !== idempotencyKey) invalid("idempotencyKey must equal eventKey");
  const accountKey = boundedString(rawData.accountKey, "accountKey", 96);
  const productKey = boundedString(rawData.productKey, "productKey", 96);
  if (productKey !== "stakeholder-journey-engine") invalid("productKey is not subscribed");
  const eventType = boundedString(rawData.eventType, "eventType", 96) as PortfolioGatewayEventType;
  if (!supportedGatewayEventTypes.has(eventType)) invalid("eventType is not subscribed");
  const purpose = boundedString(rawData.purpose, "purpose", 400);
  const sourceReference = boundedString(rawData.sourceReference, "sourceReference", 160);
  if (accountKey !== `JOURNEY-${sourceReference}`) invalid("accountKey does not match sourceReference");
  const occurredAt = validIsoTimestamp(rawData.occurredAt, "occurredAt");
  const payload = rawData.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) invalid("payload is required");
  const payloadRecord = payload as Record<string, unknown>;
  const templateCode = boundedString(payloadRecord.templateCode, "payload.templateCode", 8);
  if (!/^J(?:0[1-9]|1[0-9]|20)$/.test(templateCode)) invalid("payload.templateCode is unsupported");

  return {
    id,
    type,
    topic: typeof cloudEvent.topic === "string" ? cloudEvent.topic : undefined,
    data: {
      idempotencyKey,
      publishedAt,
      data: { eventKey, accountKey, productKey: "stakeholder-journey-engine", eventType, purpose, sourceReference, occurredAt, payload: { templateCode } },
    },
  };
}

/**
 * Idempotently records a successful receipt from the Go portfolio gateway.
 * The originating Temporal activity and database-backed journey run remain
 * authoritative. Incoming Dapr events are telemetry/evidence only and never
 * transition a journey, domain record, right, legal state, or financial state.
 */
export async function consumeStakeholderJourneyPortfolioCloudEvent(eventBody: unknown, topic: string) {
  if (topic !== "portfolio.events") invalid("topic is not subscribed");
  const event = parsePortfolioCloudEvent(eventBody);
  const db = await requireDb();
  const payloadSha256 = createHash("sha256").update(JSON.stringify(eventBody)).digest("hex");

  const [existing] = await db.select().from(daprInboxDeliveries).where(eq(daprInboxDeliveries.cloudEventId, event.id)).limit(1);
  if (existing?.status === "processed") return { duplicate: true, journeyRunKey: event.data.data.sourceReference };
  if (!existing) {
    await db.insert(daprInboxDeliveries).values({
      cloudEventId: event.id,
      topic,
      eventType: event.type,
      payloadSha256,
      status: "received",
    });
  } else if (existing.payloadSha256 !== payloadSha256 || existing.topic !== topic) {
    invalid("CloudEvent id was replayed with a different payload");
  }

  try {
    const [run] = await db.select().from(stakeholderJourneyRuns).where(eq(stakeholderJourneyRuns.runKey, event.data.data.sourceReference)).limit(1);
    if (!run || run.templateCode !== event.data.data.payload.templateCode) invalid("source journey run is unavailable or template does not match");

    const receiptPayload = {
      gatewayEventKey: event.data.data.eventKey,
      gatewayEventType: event.data.data.eventType,
      gatewayPublishedAt: event.data.publishedAt,
      gatewayOccurredAt: event.data.data.occurredAt,
      deliveryTopic: topic,
    };
    const receiptEventKey = `JDP-${createHash("sha256").update(event.id).digest("hex").slice(0, 48).toUpperCase()}`;

    await db.transaction(async (tx) => {
      await tx.insert(stakeholderJourneyEvents).values({
        eventKey: receiptEventKey,
        journeyRunId: run.id,
        eventType: "journey.middleware_delivery_confirmed",
        evidenceHash: createHash("sha256").update(JSON.stringify(receiptPayload)).digest("hex"),
        payload: receiptPayload,
        createdAt: new Date(),
      }).onConflictDoNothing({ target: stakeholderJourneyEvents.eventKey });
      await tx.update(daprInboxDeliveries).set({
        status: "processed",
        workflowId: run.workflowId ?? `journey:${run.runKey}`,
        processedAt: new Date(),
        errorMessage: null,
        updatedAt: new Date(),
      }).where(eq(daprInboxDeliveries.cloudEventId, event.id));
    });
    return { duplicate: false, journeyRunKey: run.runKey };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Portfolio journey delivery could not be recorded";
    await db.update(daprInboxDeliveries).set({ status: "failed", errorMessage: message.slice(0, 2_000), updatedAt: new Date() }).where(eq(daprInboxDeliveries.cloudEventId, event.id));
    throw error;
  }
}
