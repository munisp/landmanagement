/**
 * Field-to-Registry Operational Event Stream (next-generation feature, 2026-07-18)
 *
 * Treats field surveys, drone uploads, verification changes, payment
 * milestones, dispute actions, clearance decisions, settlement releases, and
 * integrity findings as ONE shared operational stream for dashboards,
 * notifications, and downstream reconciliation.
 *
 * Durability: events persist to the event_outbox table when PostgreSQL is
 * available; an in-memory ring buffer keeps the stream alive offline.
 * Consumer checkpoints use the stream_consumer_checkpoints table so
 * downstream consumers can reconcile deterministically.
 */

import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { requireDb } from './db';
import { eventOutbox, streamConsumerCheckpoints } from '../drizzle/schema';

export const OPERATIONAL_TOPICS = [
  'field_survey_submitted',
  'drone_upload_completed',
  'verification_status_changed',
  'payment_milestone_reached',
  'dispute_action_taken',
  'parcel_registered',
  'transaction_status_changed',
  'clearance_decided',
  'settlement_released',
  'integrity_finding_detected',
] as const;

export type OperationalTopic = (typeof OPERATIONAL_TOPICS)[number];

export interface OperationalEvent {
  id: number;
  topic: OperationalTopic;
  aggregateType?: string;
  aggregateId?: string;
  actorId?: number;
  payload: Record<string, any>;
  occurredAt: string;
}

const STREAM_BACKEND = 'kafka' as const; // platform default event backbone
const RING_BUFFER_SIZE = 2000;
const ringBuffer: OperationalEvent[] = [];
let ringId = 1;

/** Publish an operational event to the stream. */
export async function publishEvent(params: {
  topic: OperationalTopic;
  aggregateType?: string;
  aggregateId?: string | number;
  actorId?: number;
  payload?: Record<string, any>;
}): Promise<OperationalEvent> {
  if (!OPERATIONAL_TOPICS.includes(params.topic)) {
    throw new Error(`Unknown operational topic "${params.topic}"`);
  }
  const occurredAt = new Date().toISOString();
  const db = await requireDb();

  if (db) {
    try {
      const inserted = await db
        .insert(eventOutbox)
        .values({
          backend: STREAM_BACKEND,
          topic: params.topic,
          eventType: params.topic,
          aggregateType: params.aggregateType ?? null,
          aggregateId: params.aggregateId != null ? String(params.aggregateId) : null,
          payload: { ...(params.payload ?? {}), actorId: params.actorId ?? null },
          deliveryStatus: 'pending',
        })
        .returning();
      const row = inserted[0] as any;
      return {
        id: row.id,
        topic: params.topic,
        aggregateType: row.aggregateType ?? undefined,
        aggregateId: row.aggregateId ?? undefined,
        actorId: params.actorId,
        payload: row.payload ?? {},
        occurredAt: row.createdAt?.toISOString?.() ?? occurredAt,
      };
    } catch (error) {
      console.warn('[EventStream] Persist failed, using ring buffer:', (error as Error).message);
    }
  }

  const event: OperationalEvent = {
    id: ringId++,
    topic: params.topic,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId != null ? String(params.aggregateId) : undefined,
    actorId: params.actorId,
    payload: params.payload ?? {},
    occurredAt,
  };
  ringBuffer.push(event);
  if (ringBuffer.length > RING_BUFFER_SIZE) ringBuffer.splice(0, ringBuffer.length - RING_BUFFER_SIZE);
  return event;
}

/** Replay the stream with filters (dashboards, reconciliation). */
export async function getStream(filter: {
  topics?: OperationalTopic[];
  aggregateType?: string;
  aggregateId?: string;
  sinceId?: number;
  limit?: number;
} = {}): Promise<OperationalEvent[]> {
  const limit = filter.limit ?? 100;
  const db = await requireDb();

  if (db) {
    try {
      const conditions = [eq(eventOutbox.backend, STREAM_BACKEND)];
      if (filter.topics?.length) conditions.push(inArray(eventOutbox.topic, filter.topics));
      if (filter.aggregateType) conditions.push(eq(eventOutbox.aggregateType, filter.aggregateType));
      if (filter.aggregateId) conditions.push(eq(eventOutbox.aggregateId, filter.aggregateId));
      if (filter.sinceId) conditions.push(gte(eventOutbox.id, filter.sinceId));
      const rows = await db
        .select()
        .from(eventOutbox)
        .where(and(...conditions))
        .orderBy(desc(eventOutbox.id))
        .limit(limit);
      return (rows as any[]).map((row) => ({
        id: row.id,
        topic: row.topic,
        aggregateType: row.aggregateType ?? undefined,
        aggregateId: row.aggregateId ?? undefined,
        actorId: row.payload?.actorId ?? undefined,
        payload: row.payload ?? {},
        occurredAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
      }));
    } catch (error) {
      console.warn('[EventStream] Read failed, using ring buffer:', (error as Error).message);
    }
  }

  return ringBuffer
    .filter((e) =>
      (!filter.topics?.length || filter.topics.includes(e.topic)) &&
      (!filter.aggregateType || e.aggregateType === filter.aggregateType) &&
      (!filter.aggregateId || e.aggregateId === filter.aggregateId) &&
      (!filter.sinceId || e.id >= filter.sinceId)
    )
    .slice(-limit)
    .reverse();
}

/** Stream statistics for observability. */
export async function getStreamStats() {
  const events = await getStream({ limit: RING_BUFFER_SIZE });
  const byTopic: Record<string, number> = {};
  const byHour: Record<string, number> = {};
  for (const event of events) {
    byTopic[event.topic] = (byTopic[event.topic] ?? 0) + 1;
    const hour = event.occurredAt.slice(0, 13);
    byHour[hour] = (byHour[hour] ?? 0) + 1;
  }
  return {
    totalBuffered: events.length,
    byTopic,
    byHour,
    topics: OPERATIONAL_TOPICS,
    generatedAt: new Date().toISOString(),
  };
}

/** Read the durable checkpoint for a consumer group. */
export async function getConsumerCheckpoint(consumerGroup: string, topic: string) {
  const db = await requireDb();
  if (db) {
    try {
      const rows = await db
        .select()
        .from(streamConsumerCheckpoints)
        .where(and(
          eq(streamConsumerCheckpoints.consumerGroup, consumerGroup),
          eq(streamConsumerCheckpoints.topic, topic),
          eq(streamConsumerCheckpoints.backend, STREAM_BACKEND)
        ));
      return rows[0] ?? null;
    } catch (error) {
      console.warn('[EventStream] Checkpoint read failed:', (error as Error).message);
    }
  }
  return null;
}

/** Advance a consumer group's checkpoint after successful processing. */
export async function advanceConsumerCheckpoint(params: {
  consumerGroup: string;
  topic: string;
  lastEventId: number;
}): Promise<{ success: boolean }> {
  const db = await requireDb();
  const existing = await getConsumerCheckpoint(params.consumerGroup, params.topic);
  try {
    if (existing) {
      await db
        .update(streamConsumerCheckpoints)
        .set({
          offsetValue: String(params.lastEventId),
          lastMessageKey: String(params.lastEventId),
          lastProcessedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(streamConsumerCheckpoints.id, (existing as any).id));
    } else {
      await db.insert(streamConsumerCheckpoints).values({
        backend: STREAM_BACKEND,
        consumerGroup: params.consumerGroup,
        topic: params.topic,
        offsetValue: String(params.lastEventId),
        lastMessageKey: String(params.lastEventId),
        lastProcessedAt: new Date(),
      });
    }
    return { success: true };
  } catch (error) {
    console.warn('[EventStream] Checkpoint advance failed:', (error as Error).message);
    return { success: false };
  }
}
