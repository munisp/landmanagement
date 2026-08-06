import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  acquisitionDatarooms,
  commercialAccountMembers,
  conveyancingMatters,
  exposurePortfolios,
  fieldSurveyAssignments,
  lenderCollateralCases,
  marketplaceListings,
  mortgageApplications,
  parcels,
  propertyApiClients,
  registryOperationCases,
  rolloutJurisdictions,
  rowCorridors,
  ruralServiceCases,
  serviceRequests,
  stakeholderJourneyEvents,
  stakeholderJourneyInterventions,
  stakeholderJourneyRuns,
  stakeholderJourneySteps,
  taxAssessmentCases,
} from "../drizzle/schema";
import { requireDb } from "./db";
import { executeJourneyLakehouseRequest, executeJourneySpatialRequest, publishStakeholderJourneyEvent } from "./stakeholderJourneyMiddleware";
import {
  getStakeholderJourneyTemplate,
  listStakeholderJourneyTemplatesForRole,
  type JourneyActorRole,
  type JourneySubjectKind,
  type JourneyTemplate,
} from "./stakeholderJourneyTemplates";

export type JourneyRunStatus = "pending" | "running" | "awaiting_intervention" | "blocked" | "completed" | "cancelled" | "failed";
export type JourneyStepStatus = "pending" | "running" | "awaiting_intervention" | "completed" | "blocked" | "failed" | "skipped";
export type JourneyInterventionDecision = "continued" | "blocked" | "cancelled";

export interface StartStakeholderJourneyInput {
  actorId: number;
  actorRole: string;
  templateCode: string;
  subjectKind: JourneySubjectKind;
  subjectReference: string;
  idempotencyKey: string;
  context?: Record<string, unknown>;
}

export interface JourneyStepExecutionResult {
  outcome: "continue" | "awaiting_intervention" | "completed" | "blocked" | "cancelled";
  stepKey?: string;
  interventionKey?: string;
  reason?: string;
}

const MAX_CONTEXT_BYTES = 12_000;
const activeStatuses = new Set<JourneyRunStatus>(["pending", "running", "awaiting_intervention", "blocked"]);

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function key(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase()}`;
}

function normaliseContext(value: Record<string, unknown> | undefined): Record<string, unknown> {
  const context = value ?? {};
  const encoded = JSON.stringify(context);
  if (encoded.length > MAX_CONTEXT_BYTES) throw new Error("Journey context exceeds the supported bounded size");
  if (Object.keys(context).some((name) => /password|secret|token|authorization|raw_document|biometric/i.test(name))) {
    throw new Error("Journey context must not contain credentials, raw verification data, or sensitive provider payloads");
  }
  return context;
}

function requireTemplateRole(template: JourneyTemplate, actorRole: string) {
  if (!template.allowedRoles.includes(actorRole as JourneyActorRole)) {
    throw new Error("Your platform role is not eligible to start this stakeholder journey");
  }
}

function requireReference(reference: string): string {
  const trimmed = reference.trim();
  if (!trimmed || trimmed.length > 160) throw new Error("Journey subject reference must be between 1 and 160 characters");
  return trimmed;
}

function requireIdempotencyKey(value: string): string {
  const keyValue = value.trim();
  if (!/^[A-Za-z0-9._:-]{12,128}$/.test(keyValue)) {
    throw new Error("Journey idempotency key must be 12-128 URL-safe characters");
  }
  return keyValue;
}

async function recordEvent(input: {
  runId: number;
  stepId?: number;
  type: string;
  actorId?: number;
  payload: Record<string, unknown>;
}) {
  const db = await requireDb();
  const safePayload = normaliseContext(input.payload);
  await db.insert(stakeholderJourneyEvents).values({
    eventKey: key("JEV"),
    journeyRunId: input.runId,
    journeyStepId: input.stepId,
    eventType: input.type,
    actorId: input.actorId,
    evidenceHash: hash({ type: input.type, payload: safePayload }),
    payload: safePayload,
    createdAt: new Date(),
  });
}

/**
 * Probe the real record used by a journey. This intentionally returns only a
 * generic existence/ownership result; it never returns protected domain data.
 */
export async function validateJourneySubject(input: {
  actorId: number;
  actorRole: string;
  subjectKind: JourneySubjectKind;
  subjectReference: string;
}): Promise<{ exists: true; ownershipChecked: boolean }> {
  const db = await requireDb();
  const reference = requireReference(input.subjectReference);
  const privileged = input.actorRole === "admin" || input.actorRole === "registrar";

  const assertCommercialMembership = async (accountId: number) => {
    if (privileged) return;
    const [membership] = await db.select({ id: commercialAccountMembers.id }).from(commercialAccountMembers).where(and(
      eq(commercialAccountMembers.accountId, accountId),
      eq(commercialAccountMembers.userId, input.actorId),
    )).limit(1);
    if (!membership) throw new Error("You are not authorized to start a journey for this organization record");
  };

  const owned = async (row: { ownerId?: number | null; applicantId?: number | null; createdBy?: number | null } | undefined) => {
    if (!row) throw new Error("The selected journey subject is unavailable");
    const owner = row.ownerId ?? row.applicantId ?? row.createdBy ?? null;
    if (!privileged && owner !== null && owner !== input.actorId) throw new Error("You are not authorized to start a journey for this subject");
    return { exists: true as const, ownershipChecked: owner !== null };
  };

  switch (input.subjectKind) {
    case "parcel": {
      const [row] = await db.select({ ownerId: parcels.ownerId }).from(parcels).where(eq(parcels.parcelId, reference)).limit(1);
      return owned(row);
    }
    case "mortgage_application": {
      const [row] = await db.select({ applicantId: mortgageApplications.applicantId }).from(mortgageApplications).where(eq(mortgageApplications.applicationId, reference)).limit(1);
      return owned(row);
    }
    case "registry_case": {
      const [row] = await db.select({ id: registryOperationCases.id }).from(registryOperationCases).where(eq(registryOperationCases.caseKey, reference)).limit(1);
      if (!row) throw new Error("The selected journey subject is unavailable");
      return { exists: true, ownershipChecked: false };
    }
    case "collateral_case": {
      const [row] = await db.select({ id: lenderCollateralCases.id, accountId: lenderCollateralCases.accountId }).from(lenderCollateralCases).where(eq(lenderCollateralCases.caseKey, reference)).limit(1);
      if (!row) throw new Error("The selected journey subject is unavailable");
      await assertCommercialMembership(row.accountId);
      return { exists: true, ownershipChecked: true };
    }
    case "conveyancing_matter": {
      const [row] = await db.select({ id: conveyancingMatters.id, accountId: conveyancingMatters.accountId }).from(conveyancingMatters).where(eq(conveyancingMatters.matterKey, reference)).limit(1);
      if (!row) throw new Error("The selected journey subject is unavailable");
      await assertCommercialMembership(row.accountId);
      return { exists: true, ownershipChecked: true };
    }
    case "field_assignment": {
      const [row] = await db.select({ id: fieldSurveyAssignments.id, accountId: fieldSurveyAssignments.accountId }).from(fieldSurveyAssignments).where(eq(fieldSurveyAssignments.assignmentKey, reference)).limit(1);
      if (!row) throw new Error("The selected journey subject is unavailable");
      await assertCommercialMembership(row.accountId);
      return { exists: true, ownershipChecked: true };
    }
    case "row_corridor": {
      const [row] = await db.select({ id: rowCorridors.id, accountId: rowCorridors.accountId }).from(rowCorridors).where(eq(rowCorridors.corridorKey, reference)).limit(1);
      if (!row) throw new Error("The selected journey subject is unavailable");
      await assertCommercialMembership(row.accountId);
      return { exists: true, ownershipChecked: true };
    }
    case "tax_case": {
      const [row] = await db.select({ id: taxAssessmentCases.id, accountId: taxAssessmentCases.accountId }).from(taxAssessmentCases).where(eq(taxAssessmentCases.caseKey, reference)).limit(1);
      if (!row) throw new Error("The selected journey subject is unavailable");
      await assertCommercialMembership(row.accountId);
      return { exists: true, ownershipChecked: true };
    }
    case "acquisition_dataroom": {
      const [row] = await db.select({ id: acquisitionDatarooms.id, accountId: acquisitionDatarooms.accountId }).from(acquisitionDatarooms).where(eq(acquisitionDatarooms.dataroomKey, reference)).limit(1);
      if (!row) throw new Error("The selected journey subject is unavailable");
      await assertCommercialMembership(row.accountId);
      return { exists: true, ownershipChecked: true };
    }
    case "exposure_portfolio": {
      const [row] = await db.select({ id: exposurePortfolios.id, accountId: exposurePortfolios.accountId }).from(exposurePortfolios).where(eq(exposurePortfolios.portfolioKey, reference)).limit(1);
      if (!row) throw new Error("The selected journey subject is unavailable");
      await assertCommercialMembership(row.accountId);
      return { exists: true, ownershipChecked: true };
    }
    case "rural_case": {
      const [row] = await db.select({ id: ruralServiceCases.id, accountId: ruralServiceCases.accountId }).from(ruralServiceCases).where(eq(ruralServiceCases.caseKey, reference)).limit(1);
      if (!row) throw new Error("The selected journey subject is unavailable");
      await assertCommercialMembership(row.accountId);
      return { exists: true, ownershipChecked: true };
    }
    case "service_request": {
      const [row] = await db.select({ id: serviceRequests.id, accountId: serviceRequests.accountId }).from(serviceRequests).where(eq(serviceRequests.requestKey, reference)).limit(1);
      if (!row) throw new Error("The selected journey subject is unavailable");
      await assertCommercialMembership(row.accountId);
      return { exists: true, ownershipChecked: true };
    }
    case "property_api_client": {
      const [row] = await db.select({ id: propertyApiClients.id, accountId: propertyApiClients.accountId }).from(propertyApiClients).where(eq(propertyApiClients.clientKey, reference)).limit(1);
      if (!row) throw new Error("The selected journey subject is unavailable");
      await assertCommercialMembership(row.accountId);
      return { exists: true, ownershipChecked: true };
    }
    case "rollout_jurisdiction": {
      const id = Number(reference);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Rollout jurisdiction references must be numeric IDs");
      const [row] = await db.select({ id: rolloutJurisdictions.id }).from(rolloutJurisdictions).where(eq(rolloutJurisdictions.id, id)).limit(1);
      if (!row) throw new Error("The selected journey subject is unavailable");
      return { exists: true, ownershipChecked: false };
    }
    case "marketplace_listing": {
      const id = Number(reference);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Marketplace listing references must be numeric IDs");
      const [row] = await db.select({ id: marketplaceListings.id, ownerId: marketplaceListings.sellerId }).from(marketplaceListings).where(eq(marketplaceListings.id, id)).limit(1);
      return owned(row);
    }
  }
}

export async function listJourneyTemplates(actorRole: string) {
  return listStakeholderJourneyTemplatesForRole(actorRole).map((template) => ({
    code: template.code,
    title: template.title,
    stakeholder: template.stakeholder,
    description: template.description,
    domain: template.domain,
    subjectKinds: template.subjectKinds,
    launchRoute: template.launchRoute,
    mobileRoute: template.mobileRoute,
    decisionBoundary: template.decisionBoundary,
  }));
}

export async function createStakeholderJourneyRun(input: StartStakeholderJourneyInput) {
  const template = getStakeholderJourneyTemplate(input.templateCode);
  requireTemplateRole(template, input.actorRole);
  if (!template.subjectKinds.includes(input.subjectKind)) throw new Error("This journey does not support the selected subject type");
  const subjectReference = requireReference(input.subjectReference);
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const context = normaliseContext(input.context);
  await validateJourneySubject({ actorId: input.actorId, actorRole: input.actorRole, subjectKind: input.subjectKind, subjectReference });

  const db = await requireDb();
  const [existing] = await db.select().from(stakeholderJourneyRuns).where(and(
    eq(stakeholderJourneyRuns.actorId, input.actorId),
    eq(stakeholderJourneyRuns.templateCode, template.code),
    eq(stakeholderJourneyRuns.idempotencyKey, idempotencyKey),
  )).limit(1);
  if (existing) return { run: existing, created: false, template };

  const now = new Date();
  const runKey = key("JRN");
  try {
    const [run] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(stakeholderJourneyRuns).values({
        runKey,
        templateCode: template.code,
        actorId: input.actorId,
        subjectKind: input.subjectKind,
        subjectReference,
        idempotencyKey,
        status: "pending",
        inputHash: hash({ templateCode: template.code, subjectKind: input.subjectKind, subjectReference, context }),
        context,
        createdAt: now,
        updatedAt: now,
      }).returning();
      const steps = template.adapters.map((adapterKey, index) => ({
        journeyRunId: created.id,
        stepKey: `${String(index + 1).padStart(2, "0")}_${adapterKey}`,
        adapterKey,
        sequenceNo: index + 1,
        status: "pending" as const,
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      }));
      await tx.insert(stakeholderJourneySteps).values(steps);
      await tx.insert(stakeholderJourneyEvents).values({
        eventKey: key("JEV"),
        journeyRunId: created.id,
        eventType: "journey.requested",
        actorId: input.actorId,
        evidenceHash: hash({ templateCode: template.code, subjectKind: input.subjectKind, subjectReference, context }),
        payload: { templateCode: template.code, subjectKind: input.subjectKind, subjectReference, domain: template.domain },
        createdAt: now,
      });
      return [created] as const;
    });
    return { run, created: true, template };
  } catch (error) {
    const [raceWinner] = await db.select().from(stakeholderJourneyRuns).where(and(
      eq(stakeholderJourneyRuns.actorId, input.actorId),
      eq(stakeholderJourneyRuns.templateCode, template.code),
      eq(stakeholderJourneyRuns.idempotencyKey, idempotencyKey),
    )).limit(1);
    if (raceWinner) return { run: raceWinner, created: false, template };
    throw error;
  }
}

export async function attachJourneyWorkflow(input: { runKey: string; workflowId: string; temporalRunId?: string }) {
  const db = await requireDb();
  const [run] = await db.update(stakeholderJourneyRuns).set({
    workflowId: input.workflowId,
    temporalRunId: input.temporalRunId ?? null,
    status: "running",
    updatedAt: new Date(),
  }).where(eq(stakeholderJourneyRuns.runKey, input.runKey)).returning();
  if (!run) throw new Error("Journey run was not found");
  await recordEvent({ runId: run.id, type: "journey.workflow_started", payload: { workflowId: input.workflowId } });
  return run;
}

export async function markJourneyStartFailure(input: { runKey: string; reason: string }) {
  const db = await requireDb();
  const [run] = await db.update(stakeholderJourneyRuns).set({
    status: "blocked",
    blockedReason: input.reason.slice(0, 2000),
    updatedAt: new Date(),
  }).where(eq(stakeholderJourneyRuns.runKey, input.runKey)).returning();
  if (run) await recordEvent({ runId: run.id, type: "journey.orchestration_blocked", payload: { reason: run.blockedReason ?? "orchestration unavailable" } });
  return run;
}

export async function prepareJourneyRun(runKey: string): Promise<{ runId: number; templateCode: string; status: JourneyRunStatus }> {
  const db = await requireDb();
  const [run] = await db.select().from(stakeholderJourneyRuns).where(eq(stakeholderJourneyRuns.runKey, runKey)).limit(1);
  if (!run) throw new Error("Journey run was not found");
  if (!activeStatuses.has(run.status as JourneyRunStatus)) return { runId: run.id, templateCode: run.templateCode, status: run.status as JourneyRunStatus };
  if (run.status !== "running") {
    await db.update(stakeholderJourneyRuns).set({ status: "running", blockedReason: null, updatedAt: new Date() }).where(eq(stakeholderJourneyRuns.id, run.id));
  }
  return { runId: run.id, templateCode: run.templateCode, status: "running" };
}

export async function executeJourneyStep(runKey: string): Promise<JourneyStepExecutionResult> {
  const db = await requireDb();
  const [run] = await db.select().from(stakeholderJourneyRuns).where(eq(stakeholderJourneyRuns.runKey, runKey)).limit(1);
  if (!run) throw new Error("Journey run was not found");
  if (run.status === "cancelled") return { outcome: "cancelled", reason: "Journey was cancelled" };
  if (["completed", "failed"].includes(run.status)) return { outcome: run.status === "completed" ? "completed" : "blocked", reason: run.blockedReason ?? undefined };

  const [step] = await db.select().from(stakeholderJourneySteps).where(and(
    eq(stakeholderJourneySteps.journeyRunId, run.id),
    eq(stakeholderJourneySteps.status, "pending"),
  )).orderBy(asc(stakeholderJourneySteps.sequenceNo)).limit(1);

  if (!step) {
    const [waiting] = await db.select().from(stakeholderJourneyInterventions).where(and(
      eq(stakeholderJourneyInterventions.journeyRunId, run.id),
      eq(stakeholderJourneyInterventions.status, "requested"),
    )).orderBy(asc(stakeholderJourneyInterventions.requestedAt)).limit(1);
    if (waiting) return { outcome: "awaiting_intervention", interventionKey: waiting.interventionKey, reason: waiting.reason };
    await db.update(stakeholderJourneyRuns).set({ status: "completed", completedAt: new Date(), currentStepKey: null, updatedAt: new Date() }).where(eq(stakeholderJourneyRuns.id, run.id));
    await recordEvent({ runId: run.id, type: "journey.completed", payload: { templateCode: run.templateCode } });
    return { outcome: "completed" };
  }

  const template = getStakeholderJourneyTemplate(run.templateCode);
  const now = new Date();
  await db.update(stakeholderJourneySteps).set({ status: "running", attemptCount: step.attemptCount + 1, startedAt: now, updatedAt: now }).where(eq(stakeholderJourneySteps.id, step.id));
  await db.update(stakeholderJourneyRuns).set({ status: "running", currentStepKey: step.stepKey, updatedAt: now }).where(eq(stakeholderJourneyRuns.id, run.id));
  await recordEvent({ runId: run.id, stepId: step.id, type: "journey.step_started", payload: { stepKey: step.stepKey, adapterKey: step.adapterKey } });

  try {
    if (step.adapterKey === "validate_subject") {
      const result = await validateJourneySubject({ actorId: run.actorId, actorRole: "admin", subjectKind: run.subjectKind as JourneySubjectKind, subjectReference: run.subjectReference });
      await completeJourneyStep({ runId: run.id, stepId: step.id, stepKey: step.stepKey, output: { subjectValidated: result.exists, ownershipChecked: result.ownershipChecked } });
      return { outcome: "continue", stepKey: step.stepKey };
    }

    if (step.adapterKey === "domain_handoff") {
      const context = (run.context ?? {}) as Record<string, unknown>;
      const middlewareRequired = process.env.NODE_ENV === "production" || process.env.JOURNEY_MIDDLEWARE_REQUIRED === "true";
      const gatewayConfigured = Boolean(process.env.PORTFOLIO_INTEGRATION_GATEWAY_URL?.trim());
      const gatewayEvent = (middlewareRequired || gatewayConfigured)
        ? await publishStakeholderJourneyEvent({
          runKey: run.runKey,
          templateCode: run.templateCode,
          eventType: "workflow.created",
          payload: { domain: template.domain, subjectKind: run.subjectKind, subjectReference: run.subjectReference },
        })
        : null;
      const spatial = Object.prototype.hasOwnProperty.call(context, "spatialRequest")
        ? await executeJourneySpatialRequest({ templateCode: run.templateCode, context })
        : null;
      const lakehouse = Object.prototype.hasOwnProperty.call(context, "lakehouseRequest")
        ? await executeJourneyLakehouseRequest({ templateCode: run.templateCode, context })
        : null;
      await completeJourneyStep({ runId: run.id, stepId: step.id, stepKey: step.stepKey, output: {
        domain: template.domain,
        subjectKind: run.subjectKind,
        subjectReference: run.subjectReference,
        launchRoute: template.launchRoute,
        decisionBoundary: template.decisionBoundary,
        gatewayEventKey: gatewayEvent?.eventKey ?? null,
        crossLanguage: { spatial: spatial ? "completed" : "not_requested", lakehouse: lakehouse ? "completed" : "not_requested" },
      } });
      return { outcome: "continue", stepKey: step.stepKey };
    }

    if (step.adapterKey === "human_intervention") {
      const interventionKey = key("JIV");
      await db.transaction(async (tx) => {
        await tx.update(stakeholderJourneySteps).set({ status: "awaiting_intervention", updatedAt: new Date() }).where(eq(stakeholderJourneySteps.id, step.id));
        await tx.update(stakeholderJourneyRuns).set({ status: "awaiting_intervention", currentStepKey: step.stepKey, updatedAt: new Date() }).where(eq(stakeholderJourneyRuns.id, run.id));
        await tx.insert(stakeholderJourneyInterventions).values({
          interventionKey,
          journeyRunId: run.id,
          journeyStepId: step.id,
          requestedRole: template.interventionRole,
          reason: `Authorized ${template.interventionRole} review is required before this journey can continue.`,
          status: "requested",
          requestedAt: new Date(),
        });
      });
      await recordEvent({ runId: run.id, stepId: step.id, type: "journey.intervention_requested", payload: { interventionKey, requestedRole: template.interventionRole } });
      return { outcome: "awaiting_intervention", stepKey: step.stepKey, interventionKey, reason: "Authorized intervention required" };
    }

    if (step.adapterKey === "completion_evidence") {
      await completeJourneyStep({ runId: run.id, stepId: step.id, stepKey: step.stepKey, output: { completionRecorded: true, decisionBoundary: template.decisionBoundary } });
      return { outcome: "continue", stepKey: step.stepKey };
    }

    throw new Error("Journey template contains an unsupported adapter");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Journey step failed";
    await db.update(stakeholderJourneySteps).set({ status: "blocked", failureCode: "adapter_failure", failureDetail: reason.slice(0, 2000), completedAt: new Date(), updatedAt: new Date() }).where(eq(stakeholderJourneySteps.id, step.id));
    await db.update(stakeholderJourneyRuns).set({ status: "blocked", blockedReason: reason.slice(0, 2000), updatedAt: new Date() }).where(eq(stakeholderJourneyRuns.id, run.id));
    await recordEvent({ runId: run.id, stepId: step.id, type: "journey.step_blocked", payload: { stepKey: step.stepKey, reason } });
    return { outcome: "blocked", stepKey: step.stepKey, reason };
  }
}

async function completeJourneyStep(input: { runId: number; stepId: number; stepKey: string; output: Record<string, unknown> }) {
  const db = await requireDb();
  const safeOutput = normaliseContext(input.output);
  await db.update(stakeholderJourneySteps).set({
    status: "completed",
    output: safeOutput,
    outputHash: hash(safeOutput),
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(stakeholderJourneySteps.id, input.stepId));
  await recordEvent({ runId: input.runId, stepId: input.stepId, type: "journey.step_completed", payload: { stepKey: input.stepKey, output: safeOutput } });
}

export async function applyJourneyIntervention(input: {
  runKey: string;
  interventionKey: string;
  decision: JourneyInterventionDecision;
  actorId: number;
  actorRole: string;
  note?: string;
}): Promise<{ outcome: JourneyInterventionDecision }> {
  const db = await requireDb();
  const [intervention] = await db.select({ intervention: stakeholderJourneyInterventions, run: stakeholderJourneyRuns }).from(stakeholderJourneyInterventions)
    .innerJoin(stakeholderJourneyRuns, eq(stakeholderJourneyRuns.id, stakeholderJourneyInterventions.journeyRunId))
    .where(and(eq(stakeholderJourneyInterventions.interventionKey, input.interventionKey), eq(stakeholderJourneyRuns.runKey, input.runKey))).limit(1);
  if (!intervention) throw new Error("Journey intervention was not found");
  if (intervention.intervention.status !== "requested") return { outcome: intervention.intervention.status as JourneyInterventionDecision };
  if (input.actorRole !== intervention.intervention.requestedRole && input.actorRole !== "admin") {
    throw new Error("Your role is not authorized to resolve this journey intervention");
  }
  const note = input.note?.trim().slice(0, 2000) || null;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(stakeholderJourneyInterventions).set({ status: input.decision, resolvedAt: now, resolvedBy: input.actorId, resolutionNote: note }).where(eq(stakeholderJourneyInterventions.id, intervention.intervention.id));
    if (input.decision === "continued") {
      await tx.update(stakeholderJourneySteps).set({ status: "completed", output: { intervention: "continued" }, outputHash: hash({ intervention: "continued" }), completedAt: now, updatedAt: now }).where(eq(stakeholderJourneySteps.id, intervention.intervention.journeyStepId));
      await tx.update(stakeholderJourneyRuns).set({ status: "running", blockedReason: null, updatedAt: now }).where(eq(stakeholderJourneyRuns.id, intervention.run.id));
    } else {
      await tx.update(stakeholderJourneySteps).set({ status: input.decision === "cancelled" ? "skipped" : "blocked", failureCode: input.decision === "blocked" ? "human_blocked" : null, failureDetail: note, completedAt: now, updatedAt: now }).where(eq(stakeholderJourneySteps.id, intervention.intervention.journeyStepId));
      await tx.update(stakeholderJourneyRuns).set({ status: input.decision === "cancelled" ? "cancelled" : "blocked", blockedReason: note ?? `Journey ${input.decision} by authorized reviewer`, cancelledAt: input.decision === "cancelled" ? now : null, updatedAt: now }).where(eq(stakeholderJourneyRuns.id, intervention.run.id));
    }
  });
  await recordEvent({ runId: intervention.run.id, stepId: intervention.intervention.journeyStepId, actorId: input.actorId, type: "journey.intervention_resolved", payload: { interventionKey: input.interventionKey, decision: input.decision, note } });
  return { outcome: input.decision };
}

export async function cancelStakeholderJourneyRun(input: { runKey: string; actorId: number; actorRole: string; note?: string }) {
  const db = await requireDb();
  const [run] = await db.select().from(stakeholderJourneyRuns).where(eq(stakeholderJourneyRuns.runKey, input.runKey)).limit(1);
  if (!run) throw new Error("Journey run was not found");
  if (run.actorId !== input.actorId && input.actorRole !== "admin" && input.actorRole !== "registrar") throw new Error("You are not authorized to cancel this journey");
  if (["completed", "cancelled"].includes(run.status)) return run;
  const [updated] = await db.update(stakeholderJourneyRuns).set({ status: "cancelled", cancelledAt: new Date(), blockedReason: input.note?.trim().slice(0, 2000) ?? "Cancelled by authorized actor", updatedAt: new Date() }).where(eq(stakeholderJourneyRuns.id, run.id)).returning();
  await recordEvent({ runId: run.id, actorId: input.actorId, type: "journey.cancelled", payload: { note: updated.blockedReason ?? "Cancelled" } });
  return updated;
}

export async function getStakeholderJourneyRun(runKey: string, requester: { id: number; role: string }) {
  const db = await requireDb();
  const [run] = await db.select().from(stakeholderJourneyRuns).where(eq(stakeholderJourneyRuns.runKey, runKey)).limit(1);
  if (!run) throw new Error("Journey run was not found");
  if (run.actorId !== requester.id && !["admin", "registrar"].includes(requester.role)) throw new Error("You are not authorized to view this journey");
  const [steps, events, interventions] = await Promise.all([
    db.select().from(stakeholderJourneySteps).where(eq(stakeholderJourneySteps.journeyRunId, run.id)).orderBy(asc(stakeholderJourneySteps.sequenceNo)),
    db.select().from(stakeholderJourneyEvents).where(eq(stakeholderJourneyEvents.journeyRunId, run.id)).orderBy(asc(stakeholderJourneyEvents.createdAt)),
    db.select().from(stakeholderJourneyInterventions).where(eq(stakeholderJourneyInterventions.journeyRunId, run.id)).orderBy(desc(stakeholderJourneyInterventions.requestedAt)),
  ]);
  return { run, template: getStakeholderJourneyTemplate(run.templateCode), steps, events, interventions };
}

export async function listStakeholderJourneyRuns(requester: { id: number; role: string; includeAll?: boolean }) {
  const db = await requireDb();
  const all = requester.includeAll === true && ["admin", "registrar"].includes(requester.role);
  const rows = all
    ? await db.select().from(stakeholderJourneyRuns).orderBy(desc(stakeholderJourneyRuns.updatedAt)).limit(250)
    : await db.select().from(stakeholderJourneyRuns).where(eq(stakeholderJourneyRuns.actorId, requester.id)).orderBy(desc(stakeholderJourneyRuns.updatedAt)).limit(100);
  return rows.map((run) => ({ ...run, template: getStakeholderJourneyTemplate(run.templateCode) }));
}

export async function getPendingJourneyInterventions(requester: { id: number; role: string }) {
  const db = await requireDb();
  const rows = await db.select({ intervention: stakeholderJourneyInterventions, run: stakeholderJourneyRuns })
    .from(stakeholderJourneyInterventions)
    .innerJoin(stakeholderJourneyRuns, eq(stakeholderJourneyRuns.id, stakeholderJourneyInterventions.journeyRunId))
    .where(eq(stakeholderJourneyInterventions.status, "requested"))
    .orderBy(asc(stakeholderJourneyInterventions.requestedAt));
  return rows.filter(({ intervention }) => requester.role === "admin" || intervention.requestedRole === requester.role);
}

export async function getStakeholderJourneyCoverage() {
  const db = await requireDb();
  const counts = await db.select({ templateCode: stakeholderJourneyRuns.templateCode, status: stakeholderJourneyRuns.status }).from(stakeholderJourneyRuns);
  const byTemplate = Object.fromEntries(stakeholderJourneyTemplatesForCoverage().map((template) => [template.code, { started: 0, completed: 0, blocked: 0, awaitingIntervention: 0 }]));
  for (const row of counts) {
    const entry = byTemplate[row.templateCode];
    if (!entry) continue;
    entry.started += 1;
    if (row.status === "completed") entry.completed += 1;
    if (row.status === "blocked" || row.status === "failed") entry.blocked += 1;
    if (row.status === "awaiting_intervention") entry.awaitingIntervention += 1;
  }
  return { registeredTemplates: stakeholderJourneyTemplatesForCoverage().length, byTemplate };
}

function stakeholderJourneyTemplatesForCoverage() {
  return listStakeholderJourneyTemplatesForRole("admin").map((template) => getStakeholderJourneyTemplate(template.code));
}


export async function retryStakeholderJourneyRun(input: { runKey: string; actorId: number; actorRole: string }) {
  const db = await requireDb();
  const [run] = await db.select().from(stakeholderJourneyRuns).where(eq(stakeholderJourneyRuns.runKey, input.runKey)).limit(1);
  if (!run) throw new Error("Journey run was not found");
  if (run.actorId !== input.actorId && !["admin", "registrar"].includes(input.actorRole)) throw new Error("You are not authorized to retry this journey");
  if (!["blocked", "failed"].includes(run.status)) throw new Error("Only blocked or failed journeys can be retried");
  const now = new Date();
  const [updated] = await db.transaction(async (tx) => {
    await tx.update(stakeholderJourneySteps).set({
      status: "pending",
      failureCode: null,
      failureDetail: null,
      startedAt: null,
      completedAt: null,
      updatedAt: now,
    }).where(and(eq(stakeholderJourneySteps.journeyRunId, run.id), eq(stakeholderJourneySteps.status, "blocked")));
    const result = await tx.update(stakeholderJourneyRuns).set({
      status: "pending",
      currentStepKey: null,
      workflowId: null,
      temporalRunId: null,
      blockedReason: null,
      updatedAt: now,
    }).where(eq(stakeholderJourneyRuns.id, run.id)).returning();
    return result;
  });
  await recordEvent({ runId: updated.id, actorId: input.actorId, type: "journey.retry_requested", payload: { priorStatus: run.status } });
  return updated;
}
