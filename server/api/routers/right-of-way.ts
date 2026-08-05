import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { captureRowFieldConfirmation, createAccessAgreement, createCorridor, createParcelFinding, createRowAccount, getRightOfWayDashboard, reviewParcelFinding, transitionAccessAgreement } from "../../rightOfWayService";
const accountKey = z.string().regex(/^ROW-[A-Z0-9]{20}$/);
const corridorKey = z.string().regex(/^COR-[A-Z0-9]{20}$/);
const findingKey = z.string().regex(/^RFD-[A-Z0-9]{20}$/);
const agreementKey = z.string().regex(/^RAG-[A-Z0-9]{20}$/);
const geometry = z.object({ type: z.enum(["LineString", "MultiLineString", "Polygon", "MultiPolygon"]), coordinates: z.unknown() });
export const rightOfWayRouter = router({
  createAccount: protectedProcedure.input(z.object({ legalName: z.string().trim().min(2).max(255), billingEmail: z.string().trim().email().max(320) })).mutation(({ ctx, input }) => createRowAccount({ actorId: ctx.user.id, ...input })),
  dashboard: protectedProcedure.input(z.object({ accountKey })).query(({ ctx, input }) => getRightOfWayDashboard({ actorId: ctx.user.id, ...input })),
  createCorridor: protectedProcedure.input(z.object({ accountKey, name: z.string().trim().min(2).max(200), purpose: z.string().trim().min(2).max(96), geometryGeojson: geometry })).mutation(({ ctx, input }) => createCorridor({ actorId: ctx.user.id, ...input })),
  createFinding: protectedProcedure.input(z.object({ accountKey, corridorKey, parcelId: z.number().int().positive(), overlapMethod: z.string().trim().min(2).max(64), overlapSummary: z.string().trim().min(8).max(4000), sourceReference: z.string().trim().min(2).max(160) })).mutation(({ ctx, input }) => createParcelFinding({ actorId: ctx.user.id, ...input })),
  reviewFinding: protectedProcedure.input(z.object({ accountKey, findingKey, nextStatus: z.enum(["verified", "resolved", "dismissed"]) })).mutation(({ ctx, input }) => reviewParcelFinding({ actorId: ctx.user.id, ...input })),
  createAgreement: protectedProcedure.input(z.object({ accountKey, findingKey, agreementReference: z.string().trim().min(2).max(160), termsReference: z.string().trim().min(2).max(160), effectiveOn: z.string().date().optional(), expiresOn: z.string().date().optional() })).mutation(({ ctx, input }) => createAccessAgreement({ actorId: ctx.user.id, ...input })),
  transitionAgreement: protectedProcedure.input(z.object({ accountKey, agreementKey, nextStatus: z.enum(["proposed", "under_review", "executed", "expired", "terminated"]) })).mutation(({ ctx, input }) => transitionAccessAgreement({ actorId: ctx.user.id, ...input })),
  captureFieldConfirmation: protectedProcedure.input(z.object({ accountKey, findingKey, latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), observedAt: z.string().datetime(), evidenceReference: z.string().trim().min(2).max(160), note: z.string().trim().min(3).max(4000) })).mutation(({ ctx, input }) => captureRowFieldConfirmation({ actorId: ctx.user.id, ...input })),
});
