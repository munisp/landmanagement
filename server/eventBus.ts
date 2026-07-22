import Fluvio, { type TopicProducer } from "@fluvio/client";
import { and, asc, eq, lte } from "drizzle-orm";
import { eventOutbox, type InsertEventOutboxRecord, type EventOutboxRecord } from "../drizzle/schema";
import { requireDb } from "./db";
import { externalClients } from "./_core/externalClients";

const MAX_DELIVERY_ATTEMPTS = Number(process.env.EVENT_OUTBOX_MAX_ATTEMPTS || 8);
const BASE_RETRY_DELAY_MS = Number(process.env.EVENT_OUTBOX_RETRY_BASE_MS || 1_000);
const fluvioProducers = new Map<string, Promise<TopicProducer>>();
let fluvioClient: Promise<Fluvio> | undefined;

function parseFluvioAddress(): { host: string; port: number } {
  const configured = process.env.FLUVIO_SC_ADDRESS?.trim();
  if (!configured) {
    throw new Error("FLUVIO_SC_ADDRESS is required for Fluvio event publication");
  }
  const normalized = configured.replace(/^https?:\/\//, "");
  const separator = normalized.lastIndexOf(":");
  if (separator <= 0 || separator === normalized.length - 1) {
    throw new Error("FLUVIO_SC_ADDRESS must be formatted as host:port");
  }
  const host = normalized.slice(0, separator);
  const port = Number(normalized.slice(separator + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("FLUVIO_SC_ADDRESS has an invalid port");
  }
  return { host, port };
}

async function getFluvioProducer(topic: string): Promise<TopicProducer> {
  let producer = fluvioProducers.get(topic);
  if (!producer) {
    producer = (async () => {
      if (!fluvioClient) {
        const { host, port } = parseFluvioAddress();
        fluvioClient = Fluvio.connect({ host, port });
      }
      const client = await fluvioClient;
      return client.topicProducer(topic);
    })();
    fluvioProducers.set(topic, producer);
  }
  return producer;
}

async function publishViaKafka(record: EventOutboxRecord) {
  const producer = externalClients.kafka?.getProducer();
  if (!producer) {
    throw new Error("Kafka producer is not initialized");
  }

  await producer.send({
    topic: record.topic,
    messages: [{
      key: record.partitionKey ?? record.aggregateId ?? undefined,
      value: JSON.stringify(record.payload),
      headers: record.headers
        ? Object.fromEntries(Object.entries(record.headers as Record<string, unknown>).map(([key, value]) => [key, String(value)]))
        : undefined,
    }],
  });
}

async function publishViaDapr(record: EventOutboxRecord) {
  const baseUrl = process.env.DAPR_HTTP_URL?.replace(/\/$/, "");
  const pubsubName = process.env.DAPR_PUBSUB_NAME?.trim();
  if (!baseUrl || !pubsubName) {
    throw new Error("DAPR_HTTP_URL and DAPR_PUBSUB_NAME are required for Dapr event publication");
  }

  const response = await fetch(`${baseUrl}/v1.0/publish/${encodeURIComponent(pubsubName)}/${encodeURIComponent(record.topic)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(record.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify({
      id: String(record.id),
      type: record.eventType,
      source: "landmanagement/event-outbox",
      subject: record.aggregateType && record.aggregateId ? `${record.aggregateType}/${record.aggregateId}` : undefined,
      time: new Date().toISOString(),
      data: record.payload,
    }),
  });
  if (!response.ok) {
    throw new Error(`Dapr publish failed with status ${response.status}: ${await response.text()}`);
  }
}

async function publishViaFluvio(record: EventOutboxRecord) {
  const producer = await getFluvioProducer(record.topic);
  const key = record.partitionKey ?? record.aggregateId ?? String(record.id);
  await producer.send(key, JSON.stringify({
    id: record.id,
    type: record.eventType,
    aggregateType: record.aggregateType,
    aggregateId: record.aggregateId,
    headers: record.headers,
    payload: record.payload,
    createdAt: record.createdAt,
  }));
  await producer.flush();
}

function retryAt(attemptCount: number): Date {
  const exponentialDelay = Math.min(BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attemptCount - 1), 15 * 60 * 1000);
  const jitter = Math.floor(Math.random() * Math.min(1_000, exponentialDelay * 0.1));
  return new Date(Date.now() + exponentialDelay + jitter);
}

export async function queueEvent(input: InsertEventOutboxRecord): Promise<EventOutboxRecord> {
  const db = await requireDb();
  const inserted = await db.insert(eventOutbox).values(input).returning();
  return inserted[0];
}

export async function publishQueuedEvent(record: EventOutboxRecord): Promise<EventOutboxRecord> {
  const db = await requireDb();
  const nextAttempt = (record.attemptCount ?? 0) + 1;

  try {
    if (record.backend === "kafka") {
      await publishViaKafka(record);
    } else if (record.backend === "dapr_pubsub") {
      await publishViaDapr(record);
    } else if (record.backend === "fluvio") {
      await publishViaFluvio(record);
    } else {
      throw new Error(`Unsupported event backend: ${String(record.backend)}`);
    }

    const updated = await db
      .update(eventOutbox)
      .set({
        deliveryStatus: "published",
        publishedAt: new Date(),
        attemptCount: nextAttempt,
        errorMessage: null,
      })
      .where(eq(eventOutbox.id, record.id))
      .returning();
    return updated[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Event publish failed";
    const exhausted = nextAttempt >= MAX_DELIVERY_ATTEMPTS;
    const updated = await db
      .update(eventOutbox)
      .set({
        deliveryStatus: exhausted ? "dead_lettered" : "pending",
        errorMessage: message,
        attemptCount: nextAttempt,
        availableAt: exhausted ? record.availableAt : retryAt(nextAttempt),
      })
      .where(eq(eventOutbox.id, record.id))
      .returning();
    return updated[0];
  }
}

export async function processPendingOutbox(limit = 100): Promise<EventOutboxRecord[]> {
  const db = await requireDb();
  const pending = await db
    .select()
    .from(eventOutbox)
    .where(and(eq(eventOutbox.deliveryStatus, "pending"), lte(eventOutbox.availableAt, new Date())))
    .orderBy(asc(eventOutbox.availableAt), asc(eventOutbox.id))
    .limit(limit);

  const results: EventOutboxRecord[] = [];
  for (const record of pending) {
    results.push(await publishQueuedEvent(record));
  }
  return results;
}
