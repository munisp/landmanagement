import { getDb } from './db';
import {
  webhook_endpoints,
  webhook_delivery_log,
  WebhookEndpoint,
  InsertWebhookEndpoint,
  WebhookDeliveryLog,
} from '../drizzle/schema';
import { eq, and, lte, sql } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Webhook Integration Service
 * Manages webhook endpoints, event delivery, and retry logic
 */

export type WebhookEventType =
  | 'report_generated'
  | 'schedule_created'
  | 'schedule_updated'
  | 'schedule_deleted';

export interface WebhookEvent {
  eventType: WebhookEventType;
  eventId: string;
  timestamp: string;
  data: Record<string, any>;
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = generateSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Register a new webhook endpoint
 */
export async function registerWebhookEndpoint(data: {
  userId: number;
  name: string;
  url: string;
  events: WebhookEventType[];
  description?: string;
}): Promise<WebhookEndpoint> {
  // Generate secure random secret
  const secret = crypto.randomBytes(32).toString('hex');

  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [endpoint] = await db
    .insert(webhook_endpoints)
    .values({
      userId: data.userId,
      name: data.name,
      url: data.url,
      secret,
      events: JSON.stringify(data.events),
      description: data.description,
      status: 'active',
    })
    .returning();

  return endpoint;
}

/**
 * Update webhook endpoint
 */
export async function updateWebhookEndpoint(
  endpointId: number,
  data: {
    name?: string;
    url?: string;
    events?: WebhookEventType[];
    description?: string;
    status?: 'active' | 'inactive' | 'failed';
  }
): Promise<WebhookEndpoint | null> {
  const updates: any = { updatedAt: new Date() };
  if (data.name) updates.name = data.name;
  if (data.url) updates.url = data.url;
  if (data.events) updates.events = JSON.stringify(data.events);
  if (data.description !== undefined) updates.description = data.description;
  if (data.status) updates.status = data.status;

  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [updated] = await db
    .update(webhook_endpoints)
    .set(updates)
    .where(eq(webhook_endpoints.id, endpointId))
    .returning();

  return updated || null;
}

/**
 * Delete webhook endpoint
 */
export async function deleteWebhookEndpoint(endpointId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  await db
    .delete(webhook_endpoints)
    .where(eq(webhook_endpoints.id, endpointId));

  return true;
}

/**
 * Get all webhook endpoints for a user
 */
export async function getWebhookEndpoints(userId: number, activeOnly: boolean = false): Promise<WebhookEndpoint[]> {
  const db = await getDb();
  if (!db) return [];
  
  if (activeOnly) {
    return await db
      .select()
      .from(webhook_endpoints)
      .where(
        and(
          eq(webhook_endpoints.userId, userId),
          eq(webhook_endpoints.status, 'active')
        )
      );
  }
  return await db
    .select()
    .from(webhook_endpoints)
    .where(eq(webhook_endpoints.userId, userId));
}

/**
 * Get webhook endpoint by ID
 */
export async function getWebhookEndpoint(endpointId: number): Promise<WebhookEndpoint | null> {
  const db = await getDb();
  if (!db) return null;
  
  const [endpoint] = await db
    .select()
    .from(webhook_endpoints)
    .where(eq(webhook_endpoints.id, endpointId));

  return endpoint || null;
}

/**
 * Deliver webhook event with retry logic
 */
async function deliverWebhook(
  endpoint: WebhookEndpoint,
  event: WebhookEvent,
  logId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const payload = JSON.stringify(event);
  const signature = generateSignature(payload, endpoint.secret || '');

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event-Type': event.eventType,
        'X-Webhook-Event-Id': event.eventId,
      },
      body: payload,
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    const responseBody = await response.text();

    if (response.ok) {
      // Success
      await db
        .update(webhook_delivery_log)
        .set({
          status: 'success',
          responseStatus: response.status,
          responseBody,
        })
        .where(eq(webhook_delivery_log.id, logId));

      // Update endpoint stats
      await db
        .update(webhook_endpoints)
        .set({
          lastSuccessAt: new Date(),
          retryCount: 0,
        })
        .where(eq(webhook_endpoints.id, endpoint.id));
    } else {
      throw new Error(`HTTP ${response.status}: ${responseBody}`);
    }
  } catch (error: any) {
    // Get current attempt count
    const [log] = await db
      .select()
      .from(webhook_delivery_log)
      .where(eq(webhook_delivery_log.id, logId));

    const attemptNumber = (log?.attemptNumber || 0) + 1;
    const maxRetries = endpoint.maxRetries || 3;

    if (attemptNumber >= maxRetries) {
      // Max retries reached, mark as failed
      await db
        .update(webhook_delivery_log)
        .set({
          status: 'failed',
          errorMessage: error.message,
          attemptNumber,
        })
        .where(eq(webhook_delivery_log.id, logId));

      // Update endpoint stats
      await db
        .update(webhook_endpoints)
        .set({
          status: 'failed',
          lastFailureAt: new Date(),
          lastFailureReason: error.message,
          retryCount: sql`${webhook_endpoints.retryCount} + 1`,
        })
        .where(eq(webhook_endpoints.id, endpoint.id));
    } else {
      // Retry will be handled by next delivery attempt
      await db
        .update(webhook_delivery_log)
        .set({
          status: 'pending',
          errorMessage: error.message,
          attemptNumber,
        })
        .where(eq(webhook_delivery_log.id, logId));
    }
  }
}

/**
 * Trigger webhook event
 */
export async function triggerWebhookEvent(event: WebhookEvent): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  // Get all active endpoints subscribed to this event type
  const endpoints = await db
    .select()
    .from(webhook_endpoints)
    .where(eq(webhook_endpoints.status, 'active'));

  const subscribedEndpoints = endpoints.filter((endpoint) => {
    const events = JSON.parse(endpoint.events) as WebhookEventType[];
    return events.includes(event.eventType);
  });

  // Create delivery logs and trigger deliveries
  for (const endpoint of subscribedEndpoints) {
    const [log] = await db
      .insert(webhook_delivery_log)
      .values({
        webhookId: endpoint.id,
        event: event.eventType,
        payload: JSON.stringify(event),
        status: 'pending',
        attemptNumber: 0,
      })
      .returning();

    // Update endpoint last triggered time
    await db
      .update(webhook_endpoints)
      .set({ lastTriggeredAt: new Date() })
      .where(eq(webhook_endpoints.id, endpoint.id));

    // Deliver webhook (async, don't await)
    deliverWebhook(endpoint, event, log.id).catch((error) => {
      console.error(`Failed to deliver webhook ${log.id}:`, error);
    });
  }
}

/**
 * Get webhook delivery logs for an endpoint
 */
export async function getWebhookDeliveryLogs(
  webhookId: number,
  limit: number = 50
): Promise<WebhookDeliveryLog[]> {
  const db = await getDb();
  if (!db) return [];
  
  return await db
    .select()
    .from(webhook_delivery_log)
    .where(eq(webhook_delivery_log.webhookId, webhookId))
    .orderBy(sql`${webhook_delivery_log.deliveredAt} DESC`)
    .limit(limit);
}

/**
 * Get webhook delivery statistics
 */
export async function getWebhookStats(userId: number, webhookId?: number): Promise<any> {
  const db = await getDb();
  if (!db) return null;
  
  if (webhookId) {
    const [endpoint] = await db
      .select()
      .from(webhook_endpoints)
      .where(
        and(
          eq(webhook_endpoints.id, webhookId),
          eq(webhook_endpoints.userId, userId)
        )
      );

    if (!endpoint) return null;

    // Get delivery stats from logs
    const logs = await db
      .select()
      .from(webhook_delivery_log)
      .where(eq(webhook_delivery_log.webhookId, webhookId));

    const totalDeliveries = logs.length;
    const successfulDeliveries = logs.filter(l => l.status === 'success').length;
    const failedDeliveries = logs.filter(l => l.status === 'failed').length;

    return {
      webhookId: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      status: endpoint.status,
      totalDeliveries,
      successfulDeliveries,
      failedDeliveries,
      successRate:
        totalDeliveries > 0
          ? (successfulDeliveries / totalDeliveries) * 100
          : 0,
      lastTriggeredAt: endpoint.lastTriggeredAt,
      lastSuccessAt: endpoint.lastSuccessAt,
      lastFailureAt: endpoint.lastFailureAt,
    };
  }

  // Global stats for user
  const endpoints = await db
    .select()
    .from(webhook_endpoints)
    .where(eq(webhook_endpoints.userId, userId));

  const allLogs = await db
    .select()
    .from(webhook_delivery_log)
    .where(
      sql`${webhook_delivery_log.webhookId} IN (SELECT id FROM ${webhook_endpoints} WHERE user_id = ${userId})`
    );

  const totalDeliveries = allLogs.length;
  const successfulDeliveries = allLogs.filter(l => l.status === 'success').length;
  const failedDeliveries = allLogs.filter(l => l.status === 'failed').length;

  return {
    totalEndpoints: endpoints.length,
    activeEndpoints: endpoints.filter(e => e.status === 'active').length,
    totalDeliveries,
    successfulDeliveries,
    failedDeliveries,
    successRate: totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) * 100 : 0,
  };
}

/**
 * Test webhook endpoint
 */
export async function testWebhookEndpoint(endpointId: number): Promise<{
  success: boolean;
  message: string;
  httpStatus?: number;
}> {
  const endpoint = await getWebhookEndpoint(endpointId);
  if (!endpoint) {
    return { success: false, message: 'Endpoint not found' };
  }

  const testEvent: WebhookEvent = {
    eventType: 'report_generated',
    eventId: `test-${Date.now()}`,
    timestamp: new Date().toISOString(),
    data: {
      test: true,
      message: 'This is a test webhook delivery',
    },
  };

  const payload = JSON.stringify(testEvent);
  const signature = generateSignature(payload, endpoint.secret || '');

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event-Type': testEvent.eventType,
        'X-Webhook-Event-Id': testEvent.eventId,
      },
      body: payload,
      signal: AbortSignal.timeout(30000),
    });

    return {
      success: response.ok,
      message: response.ok ? 'Test delivery successful' : `HTTP ${response.status}`,
      httpStatus: response.status,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    };
  }
}
