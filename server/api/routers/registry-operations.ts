import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import {
  createRegistryOperationsAccount,
  createRegistryQueue,
  getRegistryOperationsDashboard,
  openRegistryOperationCase,
  transitionRegistryOperationCase,
} from "../../registryOperationsService";

const accountKey = z.string().regex(/^REG-[A-Z0-9]{20}$/);
const caseKey = z.string().regex(/^ROC-[A-Z0-9]{20}$/);
const queueKey = z.string().regex(/^RQU-[A-Z0-9]{20}$/);

export const registryOperationsRouter = router({
  createAccount: protectedProcedure
    .input(z.object({ legalName: z.string().trim().min(2).max(255), billingEmail: z.string().trim().email().max(320) }))
    .mutation(({ ctx, input }) => createRegistryOperationsAccount({ actorId: ctx.user.id, ...input })),
  dashboard: protectedProcedure
    .input(z.object({ accountKey, caseKey: caseKey.optional() }))
    .query(({ ctx, input }) => getRegistryOperationsDashboard({ actorId: ctx.user.id, ...input })),
  createQueue: protectedProcedure
    .input(z.object({ accountKey, name: z.string().trim().min(2).max(160), serviceType: z.string().trim().regex(/^[a-z][a-z0-9_-]{1,63}$/), slaHours: z.number().int().min(1).max(8760) }))
    .mutation(({ ctx, input }) => createRegistryQueue({ actorId: ctx.user.id, ...input })),
  openCase: protectedProcedure
    .input(z.object({ accountKey, queueKey, requestReference: z.string().trim().min(1).max(160), parcelId: z.number().int().positive().optional(), requesterName: z.string().trim().max(255).optional(), requesterContactReference: z.string().trim().max(160).optional(), sourceReference: z.string().trim().max(160).optional() }))
    .mutation(({ ctx, input }) => openRegistryOperationCase({ actorId: ctx.user.id, ...input })),
  transitionCase: protectedProcedure
    .input(z.object({ accountKey, caseKey, nextStatus: z.enum(["triaged", "in_review", "returned", "completed", "withdrawn"]), assignedTo: z.number().int().positive().optional(), outcomeNote: z.string().trim().max(4000).optional() }))
    .mutation(({ ctx, input }) => transitionRegistryOperationCase({ actorId: ctx.user.id, ...input })),
});
