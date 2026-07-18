import { z } from 'zod';
import { adminProcedure, protectedProcedure, router } from '../../_core/trpc';
import * as operationalEventStreamService from '../../operationalEventStreamService';

const topicEnum = z.enum([
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
]);

export const operationalEventsRouter = router({
  publish: protectedProcedure
    .input(
      z.object({
        topic: topicEnum,
        aggregateType: z.string().optional(),
        aggregateId: z.union([z.string(), z.number()]).optional(),
        payload: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return operationalEventStreamService.publishEvent({ ...input, actorId: ctx.user.id });
    }),

  stream: protectedProcedure
    .input(
      z.object({
        topics: z.array(topicEnum).optional(),
        aggregateType: z.string().optional(),
        aggregateId: z.string().optional(),
        sinceId: z.number().int().optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      })
    )
    .query(async ({ input }) => {
      const events = await operationalEventStreamService.getStream(input);
      return { total: events.length, events };
    }),

  stats: protectedProcedure.query(async () => {
    return operationalEventStreamService.getStreamStats();
  }),

  checkpoint: adminProcedure
    .input(z.object({ consumerGroup: z.string().min(1), topic: z.string().min(1) }))
    .query(async ({ input }) => {
      return operationalEventStreamService.getConsumerCheckpoint(input.consumerGroup, input.topic);
    }),

  advanceCheckpoint: adminProcedure
    .input(
      z.object({
        consumerGroup: z.string().min(1),
        topic: z.string().min(1),
        lastEventId: z.number().int().nonnegative(),
      })
    )
    .mutation(async ({ input }) => {
      return operationalEventStreamService.advanceConsumerCheckpoint(input);
    }),
});
