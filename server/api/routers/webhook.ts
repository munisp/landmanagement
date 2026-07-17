import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import {
  registerWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookEndpoints,
  getWebhookEndpoint,
  getWebhookDeliveryLogs,
  getWebhookStats,
  testWebhookEndpoint,
  triggerWebhookEvent,
  WebhookEventType,
} from '../../webhookService';

const webhookEventTypeEnum = z.enum([
  'report_generated',
  'schedule_created',
  'schedule_updated',
  'schedule_deleted',
]);

export const webhookRouter = router({
  /**
   * Register a new webhook endpoint
   */
  register: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
        eventTypes: z.array(webhookEventTypeEnum),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await registerWebhookEndpoint({
        userId: ctx.user.id,
        name: `Webhook ${Date.now()}`,
        url: input.url,
        events: input.eventTypes as WebhookEventType[],
        description: input.description,
      });
    }),

  /**
   * Update webhook endpoint
   */
  update: protectedProcedure
    .input(
      z.object({
        endpointId: z.number(),
        url: z.string().url().optional(),
        eventTypes: z.array(webhookEventTypeEnum).optional(),
        description: z.string().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await updateWebhookEndpoint(input.endpointId, {
        url: input.url,
        events: input.eventTypes as WebhookEventType[] | undefined,
        description: input.description,
        status: input.active === false ? 'inactive' : input.active === true ? 'active' : undefined,
      });
    }),

  /**
   * Delete webhook endpoint
   */
  delete: protectedProcedure
    .input(z.object({ endpointId: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteWebhookEndpoint(input.endpointId);
    }),

  /**
   * Get all webhook endpoints
   */
  list: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      return await getWebhookEndpoints(ctx.user.id, input.activeOnly || false);
    }),

  /**
   * Get webhook endpoint by ID
   */
  get: protectedProcedure
    .input(z.object({ endpointId: z.number() }))
    .query(async ({ input }) => {
      return await getWebhookEndpoint(input.endpointId);
    }),

  /**
   * Get webhook delivery logs
   */
  deliveryLogs: protectedProcedure
    .input(
      z.object({
        endpointId: z.number(),
        limit: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      return await getWebhookDeliveryLogs(input.endpointId, input.limit || 50);
    }),

  /**
   * Get webhook statistics
   */
  stats: protectedProcedure
    .input(z.object({ endpointId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      return await getWebhookStats(ctx.user.id, input.endpointId);
    }),

  /**
   * Test webhook endpoint
   */
  test: protectedProcedure
    .input(z.object({ endpointId: z.number() }))
    .mutation(async ({ input }) => {
      return await testWebhookEndpoint(input.endpointId);
    }),

  /**
   * Trigger a webhook event manually (for testing)
   */
  triggerEvent: protectedProcedure
    .input(
      z.object({
        eventType: webhookEventTypeEnum,
        eventId: z.string(),
        data: z.record(z.string(), z.any()),
      })
    )
    .mutation(async ({ input }) => {
      await triggerWebhookEvent({
        eventType: input.eventType as WebhookEventType,
        eventId: input.eventId,
        timestamp: new Date().toISOString(),
        data: input.data,
      });
      return { success: true };
    }),

  // processRetries removed - webhook retries are handled automatically by the service
});
