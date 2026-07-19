import { and, asc, eq } from 'drizzle-orm';
import { eventOutbox, type InsertEventOutboxRecord, type EventOutboxRecord } from '../drizzle/schema';
import { requireDb } from './db';
import { externalClients } from './_core/externalClients';


async function publishViaKafka(record: EventOutboxRecord) {
  const producer = externalClients.kafka?.getProducer();
  if (!producer) {
    throw new Error('Kafka producer not initialized');
  }

  await producer.send({
    topic: record.topic,
    messages: [
      {
        key: record.partitionKey ?? record.aggregateId ?? undefined,
        value: JSON.stringify(record.payload),
        headers: record.headers ? Object.fromEntries(Object.entries(record.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)])) : undefined,
      },
    ],
  });
}

async function publishViaDapr(record: EventOutboxRecord) {
  const baseUrl = process.env.DAPR_HTTP_URL;
  const pubsubName = process.env.DAPR_PUBSUB_NAME || 'pubsub';
  if (!baseUrl) {
    throw new Error('DAPR_HTTP_URL not configured');
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1.0/publish/${pubsubName}/${record.topic}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(record.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(record.payload),
  });

  if (!response.ok) {
    throw new Error(`Dapr publish failed with status ${response.status}`);
  }
}

async function publishViaFluvio(record: EventOutboxRecord) {
  const baseUrl = process.env.FLUVIO_API_URL;
  if (!baseUrl) {
    throw new Error('FLUVIO_API_URL not configured');
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/topics/${encodeURIComponent(record.topic)}/records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key: record.partitionKey ?? record.aggregateId,
      value: record.payload,
      headers: record.headers,
    }),
  });

  if (!response.ok) {
    throw new Error(`Fluvio publish failed with status ${response.status}`);
  }
}

export async function queueEvent(input: InsertEventOutboxRecord): Promise<EventOutboxRecord> {
  const db = await requireDb();


  const inserted = await db.insert(eventOutbox).values(input).returning();
  return inserted[0];
}

export async function publishQueuedEvent(record: EventOutboxRecord): Promise<EventOutboxRecord> {
  const backend = record.backend;
  const db = await requireDb();

  try {
    if (backend === 'kafka') {
      await publishViaKafka(record);
    } else if (backend === 'dapr_pubsub') {
      await publishViaDapr(record);
    } else if (backend === 'fluvio') {
      await publishViaFluvio(record);
    }



    const updated = await db
      .update(eventOutbox)
      .set({
        deliveryStatus: 'published',
        publishedAt: new Date(),
        attemptCount: (record.attemptCount ?? 0) + 1,
        errorMessage: null,
      })
      .where(eq(eventOutbox.id, record.id))
      .returning();

    return updated[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Event publish failed';


    const updated = await db
      .update(eventOutbox)
      .set({
        deliveryStatus: 'failed',
        errorMessage: message,
        attemptCount: (record.attemptCount ?? 0) + 1,
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
    .where(and(eq(eventOutbox.deliveryStatus, 'pending')))
    .orderBy(asc(eventOutbox.availableAt))
    .limit(limit);

  const results: EventOutboxRecord[] = [];
  for (const record of pending) {
    results.push(await publishQueuedEvent(record));
  }
  return results;
}
