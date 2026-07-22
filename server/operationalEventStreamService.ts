/*
 * Field-to-Registry Operational Event Stream
 *
 * Events are durably written to the Fluvio-backed event outbox before any
 * consumer observes them. PostgreSQL outages are surfaced to callers; no
 * process-local event buffer is used because it would lose audit evidence and
 * produce divergent streams across application replicas.
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

const STREAM_BACKEND = 'fluvio' as const;

/** Publish an operational event to the durable event outbox. */
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

  const db = await requireDb();
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
  if (!row) throw new Error('Event outbox insert returned no row');

  return {
    id: row.id,
    topic: params.topic,
    aggregateType: row.aggregateType ?? undefined,
    aggregateId: row.aggregateId ?? undefined,
    actorId: params.actorId,
    payload: row.payload ?? {},
    occurredAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

/** Replay the durable stream with dashboard and reconciliation filters. */
export async function getStream(filter: {
  topics?: OperationalTopic[];
  aggregateType?: string;
  aggregateId?: string;
  sinceId?: number;
  limit?: number;
} = {}): Promise<OperationalEvent[]> {
  const limit = Math.min(1000, Math.max(1, filter.limit ?? 100));
  const db = await requireDb();
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
    topic: row.topic as OperationalTopic,
    aggregateType: row.aggregateType ?? undefined,
    aggregateId: row.aggregateId ?? undefined,
    actorId: row.payload?.actorId ?? undefined,
    payload: row.payload ?? {},
    occurredAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
  }));
}

/** Durable stream statistics for observability. */
export async function getStreamStats() {
  const events = await getStream({ limit: 1000 });
  const byTopic: Record<string, number> = {};
  const byHour: Record<string, number> = {};
  for (const event of events) {
    byTopic[event.topic] = (byTopic[event.topic] ?? 0) + 1;
    const hour = event.occurredAt.slice(0, 13);
    byHour[hour] = (byHour[hour] ?? 0) + 1;
  }
  return {
    totalEvents: events.length,
    // Compatibility alias retained for existing dashboards; this now counts
    // durable outbox events rather than a process-local buffer.
    totalBuffered: events.length,
    byTopic,
    byHour,
    topics: OPERATIONAL_TOPICS,
    generatedAt: new Date().toISOString(),
  };
}

/** Read the durable checkpoint for a consumer group. */
export async function getConsumerCheckpoint(consumerGroup: string, topic: string) {
  if (!consumerGroup.trim() || !topic.trim()) throw new Error('consumerGroup and topic are required');
  const db = await requireDb();
  const rows = await db
    .select()
    .from(streamConsumerCheckpoints)
    .where(and(
      eq(streamConsumerCheckpoints.consumerGroup, consumerGroup),
      eq(streamConsumerCheckpoints.topic, topic),
      eq(streamConsumerCheckpoints.backend, STREAM_BACKEND),
    ));
  return rows[0] ?? null;
}

/** Advance a consumer group checkpoint after successful processing. */
export async function advanceConsumerCheckpoint(params: {
  consumerGroup: string;
  topic: string;
  lastEventId: number;
}): Promise<{ success: true }> {
  if (!params.consumerGroup.trim() || !params.topic.trim() || !Number.isInteger(params.lastEventId) || params.lastEventId < 1) {
    throw new Error('consumerGroup, topic, and a positive integer lastEventId are required');
  }
  const db = await requireDb();
  const existing = await getConsumerCheckpoint(params.consumerGroup, params.topic);
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
}
