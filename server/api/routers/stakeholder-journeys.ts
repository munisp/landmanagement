import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import {
  applyJourneyIntervention,
  attachJourneyWorkflow,
  cancelStakeholderJourneyRun,
  createStakeholderJourneyRun,
  getPendingJourneyInterventions,
  getStakeholderJourneyCoverage,
  getStakeholderJourneyRun,
  listJourneyTemplates,
  listStakeholderJourneyRuns,
  markJourneyStartFailure,
  retryStakeholderJourneyRun,
} from "../../stakeholderJourneyService";
import {
  getStakeholderJourneyWorkflowState,
  signalStakeholderJourneyCancellation,
  signalStakeholderJourneyIntervention,
  startStakeholderJourneyWorkflow,
} from "../../temporalClient";

const templateCode = z.string().regex(/^J(0[1-9]|1[0-9]|20)$/);
const subjectKind = z.enum([
  "parcel", "mortgage_application", "registry_case", "collateral_case", "conveyancing_matter", "field_assignment", "row_corridor", "tax_case", "acquisition_dataroom", "exposure_portfolio", "rural_case", "service_request", "property_api_client", "rollout_jurisdiction", "marketplace_listing",
]);
const runKey = z.string().regex(/^JRN-[A-Z0-9]{24}$/);
const interventionKey = z.string().regex(/^JIV-[A-Z0-9]{24}$/);

async function dispatchRun(runKeyValue: string) {
  try {
    const temporal = await startStakeholderJourneyWorkflow({ runKey: runKeyValue });
    await attachJourneyWorkflow({ runKey: runKeyValue, workflowId: temporal.workflowId, temporalRunId: temporal.runId === "existing" ? undefined : temporal.runId });
    return { dispatched: true, workflowId: temporal.workflowId, orchestrationBlocked: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Temporal journey orchestration is unavailable";
    await markJourneyStartFailure({ runKey: runKeyValue, reason });
    return { dispatched: false, workflowId: null, orchestrationBlocked: true, reason: "Journey request is recorded, but orchestration is unavailable. An authorized operator must restore Temporal readiness and retry the journey." };
  }
}

export const stakeholderJourneysRouter = router({
  templates: protectedProcedure.query(async ({ ctx }) => listJourneyTemplates(ctx.user.role)),

  start: protectedProcedure.input(z.object({
    templateCode,
    subjectKind,
    subjectReference: z.string().trim().min(1).max(160),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{12,128}$/),
    context: z.record(z.string(), z.unknown()).default({}),
  })).mutation(async ({ ctx, input }) => {
    const result = await createStakeholderJourneyRun({ ...input, actorId: ctx.user.id, actorRole: ctx.user.role });
    if (!result.created && result.run.workflowId) return { run: result.run, created: false, dispatched: true, workflowId: result.run.workflowId, orchestrationBlocked: false };
    const dispatch = await dispatchRun(result.run.runKey);
    return { run: result.run, created: result.created, ...dispatch };
  }),

  listMine: protectedProcedure.input(z.object({ includeAll: z.boolean().default(false) })).query(async ({ ctx, input }) => {
    return listStakeholderJourneyRuns({ id: ctx.user.id, role: ctx.user.role, includeAll: input.includeAll });
  }),

  get: protectedProcedure.input(z.object({ runKey })).query(async ({ ctx, input }) => {
    return getStakeholderJourneyRun(input.runKey, { id: ctx.user.id, role: ctx.user.role });
  }),

  pendingInterventions: protectedProcedure.query(async ({ ctx }) => getPendingJourneyInterventions({ id: ctx.user.id, role: ctx.user.role })),

  resolveIntervention: protectedProcedure.input(z.object({
    runKey,
    interventionKey,
    decision: z.enum(["continued", "blocked", "cancelled"]),
    note: z.string().trim().max(2000).optional(),
  })).mutation(async ({ ctx, input }) => {
    const result = await applyJourneyIntervention({ ...input, actorId: ctx.user.id, actorRole: ctx.user.role });
    const run = await getStakeholderJourneyRun(input.runKey, { id: ctx.user.id, role: ctx.user.role });
    if (!run.run.workflowId) return { ...result, signalDelivered: false, reason: "The intervention is recorded; Temporal orchestration is not attached and requires an authorized retry." };
    try {
      if (input.decision === "continued") await signalStakeholderJourneyIntervention({ workflowId: run.run.workflowId, interventionKey: input.interventionKey });
      else await signalStakeholderJourneyCancellation(run.run.workflowId);
      return { ...result, signalDelivered: true };
    } catch {
      return { ...result, signalDelivered: false, reason: "The intervention is recorded; Temporal signal delivery requires operational recovery." };
    }
  }),

  cancel: protectedProcedure.input(z.object({ runKey, note: z.string().trim().max(2000).optional() })).mutation(async ({ ctx, input }) => {
    const run = await cancelStakeholderJourneyRun({ ...input, actorId: ctx.user.id, actorRole: ctx.user.role });
    if (run.workflowId) {
      try { await signalStakeholderJourneyCancellation(run.workflowId); } catch { /* Cancellation is durable in PostgreSQL; worker recovery can observe it. */ }
    }
    return run;
  }),

  retry: protectedProcedure.input(z.object({ runKey })).mutation(async ({ ctx, input }) => {
    const run = await retryStakeholderJourneyRun({ ...input, actorId: ctx.user.id, actorRole: ctx.user.role });
    const dispatch = await dispatchRun(run.runKey);
    return { run, ...dispatch };
  }),

  workflowState: protectedProcedure.input(z.object({ runKey })).query(async ({ ctx, input }) => {
    const journey = await getStakeholderJourneyRun(input.runKey, { id: ctx.user.id, role: ctx.user.role });
    if (!journey.run.workflowId) return { available: false, reason: "No Temporal workflow is attached to this journey run." };
    try {
      return { available: true, state: await getStakeholderJourneyWorkflowState(journey.run.workflowId) };
    } catch {
      return { available: false, reason: "Temporal workflow state is currently unavailable." };
    }
  }),

  coverage: protectedProcedure.query(async ({ ctx }) => {
    if (!["admin", "registrar"].includes(ctx.user.role)) throw new Error("Journey coverage is restricted to authorized operators");
    return getStakeholderJourneyCoverage();
  }),
});
