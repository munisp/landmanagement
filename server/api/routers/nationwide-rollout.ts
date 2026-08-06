import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import {
  addStagingRecord,
  attestRolloutGate,
  createAssistedServiceCase,
  completeRecoveryDrill,
  createImportBatch,
  createRolloutJurisdiction,
  finalizeImportBatch,
  getRolloutJurisdictionOverview,
  listRolloutJurisdictions,
  openReconciliationCase,
  recordRecoveryDrill,
  resolveReconciliationCase,
  rolloutGateCodes,
  setJurisdictionStatus,
} from '../../nationwideRolloutService';

const operatorRoles = new Set(['admin', 'registrar']);

function requireRolloutOperator(role: string) {
  if (!operatorRoles.has(role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Nationwide rollout controls require a registry officer or administrator role' });
  }
}

const sha256 = z.string().regex(/^[a-fA-F0-9]{64}$/, 'Expected SHA-256 hex digest');
const httpsReference = z.string().url().refine((value) => value.startsWith('https://'), 'Evidence must use HTTPS');

export const nationwideRolloutRouter = router({
  listJurisdictions: protectedProcedure.query(async ({ ctx }) => {
    requireRolloutOperator(ctx.user.role);
    return listRolloutJurisdictions();
  }),

  getJurisdiction: protectedProcedure.input(z.object({ jurisdictionId: z.number().int().positive() })).query(async ({ input, ctx }) => {
    requireRolloutOperator(ctx.user.role);
    return getRolloutJurisdictionOverview(input.jurisdictionId);
  }),

  createJurisdiction: protectedProcedure.input(z.object({
    code: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/),
    name: z.string().trim().min(2).max(255),
    administrativeLevel: z.enum(['national', 'state', 'lga', 'ward', 'customary_area']),
    parentJurisdictionId: z.number().int().positive().optional(),
    country: z.string().trim().min(2).max(128).optional(),
    authoritativeRecordStatement: z.string().trim().min(16).max(5000),
    legalMandateReference: z.string().trim().url().optional(),
    serviceFallbackDescription: z.string().trim().min(16).max(5000),
  })).mutation(async ({ input, ctx }) => {
    requireRolloutOperator(ctx.user.role);
    return createRolloutJurisdiction({ ...input, createdBy: ctx.user.id });
  }),

  attestGate: protectedProcedure.input(z.object({
    jurisdictionId: z.number().int().positive(),
    gateCode: z.enum(rolloutGateCodes),
    status: z.enum(['evidence_submitted', 'approved', 'rejected']),
    evidenceReference: httpsReference.optional(),
    evidenceSha256: sha256.optional(),
    expiresAt: z.coerce.date().optional(),
    reviewerNotes: z.string().trim().max(5000).optional(),
  })).mutation(async ({ input, ctx }) => {
    requireRolloutOperator(ctx.user.role);
    return attestRolloutGate({ ...input, actorId: ctx.user.id });
  }),

  setJurisdictionStatus: protectedProcedure.input(z.object({
    jurisdictionId: z.number().int().positive(),
    status: z.enum(['planned', 'rehearsal', 'shadow_register', 'paused', 'retired']),
    pausedReason: z.string().trim().min(8).max(2000).optional(),
  })).mutation(async ({ input, ctx }) => {
    requireRolloutOperator(ctx.user.role);
    return setJurisdictionStatus(input);
  }),

  createImportBatch: protectedProcedure.input(z.object({
    jurisdictionId: z.number().int().positive(),
    sourceSystem: z.string().trim().min(2).max(255),
    sourceExportReference: httpsReference,
    sourceExtractSha256: sha256,
    sourceRecordCount: z.number().int().min(0).max(10_000_000),
  })).mutation(async ({ input, ctx }) => {
    requireRolloutOperator(ctx.user.role);
    return createImportBatch({ ...input, submittedBy: ctx.user.id });
  }),

  finalizeImportBatch: protectedProcedure.input(z.object({
    importBatchId: z.number().int().positive(),
  })).mutation(async ({ input, ctx }) => {
    requireRolloutOperator(ctx.user.role);
    return finalizeImportBatch({ ...input, actorId: ctx.user.id });
  }),

  addStagingRecord: protectedProcedure.input(z.object({
    importBatchId: z.number().int().positive(),
    sourceRecordId: z.string().trim().min(1).max(255),
    sourceRecordSha256: sha256,
    parcelIdentifier: z.string().trim().max(128).optional(),
    titleIdentifier: z.string().trim().max(128).optional(),
    geometryGeojson: z.record(z.string(), z.unknown()).optional(),
    normalizedAttributes: z.record(z.string(), z.unknown()).default({}),
    qualityFlags: z.array(z.string().regex(/^[a-z0-9_.-]{1,96}$/i)).max(50).default([]),
  })).mutation(async ({ input, ctx }) => {
    requireRolloutOperator(ctx.user.role);
    return addStagingRecord(input);
  }),

  openReconciliationCase: protectedProcedure.input(z.object({
    jurisdictionId: z.number().int().positive(),
    stagingRecordId: z.number().int().positive(),
    issueCode: z.string().regex(/^[a-z0-9_.-]{2,96}$/i),
    issueSummary: z.string().trim().min(8).max(5000),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  })).mutation(async ({ input, ctx }) => {
    requireRolloutOperator(ctx.user.role);
    return openReconciliationCase({ ...input, actorId: ctx.user.id });
  }),

  resolveReconciliationCase: protectedProcedure.input(z.object({
    reconciliationCaseId: z.number().int().positive(),
    nextStatus: z.enum(['matched', 'rejected', 'escalated', 'withdrawn']),
    canonicalParcelId: z.number().int().positive().optional(),
    evidenceReference: httpsReference.optional(),
    note: z.string().trim().max(5000).optional(),
  })).mutation(async ({ input, ctx }) => {
    requireRolloutOperator(ctx.user.role);
    return resolveReconciliationCase({ ...input, actorId: ctx.user.id });
  }),

  recordRecoveryDrill: protectedProcedure.input(z.object({
    jurisdictionId: z.number().int().positive().optional(),
    drillType: z.enum(['backup_restore', 'point_in_time_restore', 'regional_failover', 'queue_replay', 'identity_recovery', 'full_service_recovery']),
    plannedAt: z.coerce.date(),
    status: z.enum(['planned', 'running', 'failed', 'cancelled']),
    measuredRpoSeconds: z.number().int().min(0).max(31_536_000).optional(),
    measuredRtoSeconds: z.number().int().min(0).max(31_536_000).optional(),
    evidenceReference: httpsReference.optional(),
    evidenceSha256: sha256.optional(),
    reviewNotes: z.string().trim().max(5000).optional(),
  })).mutation(async ({ input, ctx }) => {
    requireRolloutOperator(ctx.user.role);
    return recordRecoveryDrill({
      ...input,
      executedBy: input.status === 'running' ? ctx.user.id : undefined,
      reviewedBy: undefined,
    });
  }),

  completeRecoveryDrill: protectedProcedure.input(z.object({
    drillId: z.number().int().positive(),
    evidenceReference: httpsReference,
    evidenceSha256: sha256,
    measuredRpoSeconds: z.number().int().min(0).max(31_536_000),
    measuredRtoSeconds: z.number().int().min(0).max(31_536_000),
    reviewNotes: z.string().trim().max(5000).optional(),
  })).mutation(async ({ input, ctx }) => {
    requireRolloutOperator(ctx.user.role);
    return completeRecoveryDrill({ ...input, reviewedBy: ctx.user.id });
  }),

  createAssistedServiceCase: protectedProcedure.input(z.object({
    jurisdictionId: z.number().int().positive(),
    requesterReference: z.string().trim().min(4).max(128),
    serviceChannel: z.enum(['in_person', 'phone', 'community_kiosk', 'accessibility_assistance', 'mobile_outreach']),
    requestedService: z.string().trim().min(3).max(128),
  })).mutation(async ({ input, ctx }) => {
    requireRolloutOperator(ctx.user.role);
    return createAssistedServiceCase({ ...input, openedBy: ctx.user.id });
  }),
});
