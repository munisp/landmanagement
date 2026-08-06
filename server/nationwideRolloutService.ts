import { and, desc, eq } from 'drizzle-orm';
import {
  assistedServiceCases,
  parcels,
  rolloutGateAttestations,
  rolloutImportBatches,
  rolloutJurisdictions,
  rolloutReconciliationCases,
  rolloutReconciliationEvents,
  rolloutRecoveryDrills,
  rolloutStagingRecords,
} from '../drizzle/schema';
import { requireDb } from './db';

const REQUIRED_GATES = [
  'release_provenance',
  'legal_authority',
  'privacy',
  'security',
  'identity_authorization',
  'data_inventory',
  'data_reconciliation',
  'backup_recovery',
  'capacity',
  'accessibility',
  'support_training',
  'independent_assurance',
] as const;

const PILOT_READY_GATES = [
  'release_provenance',
  'legal_authority',
  'privacy',
  'security',
  'identity_authorization',
  'data_inventory',
  'backup_recovery',
  'accessibility',
  'support_training',
] as const;

type GateCode = (typeof REQUIRED_GATES)[number];
type JurisdictionStatus = 'planned' | 'rehearsal' | 'shadow_register' | 'limited_authoritative' | 'expanded' | 'paused' | 'retired';
type ReconciliationStatus = 'open' | 'matched' | 'rejected' | 'escalated' | 'withdrawn';

function assertHash(value: string, label: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new Error(`${label} must be a SHA-256 hex digest`);
}

function assertEvidenceReference(value: string, label: string) {
  if (!/^https:\/\/.{1,500}$/.test(value)) throw new Error(`${label} must be a HTTPS evidence reference`);
}

function assertGateCode(value: string): asserts value is GateCode {
  if (!REQUIRED_GATES.includes(value as GateCode)) throw new Error('Unsupported rollout gate');
}

async function getJurisdictionOrThrow(jurisdictionId: number) {
  const db = await requireDb();
  const [jurisdiction] = await db.select().from(rolloutJurisdictions).where(eq(rolloutJurisdictions.id, jurisdictionId)).limit(1);
  if (!jurisdiction) throw new Error('Rollout jurisdiction not found');
  return jurisdiction;
}

async function gateMap(jurisdictionId: number) {
  const db = await requireDb();
  const gates = await db.select().from(rolloutGateAttestations).where(eq(rolloutGateAttestations.jurisdictionId, jurisdictionId));
  return new Map(gates.map((gate) => [gate.gateCode, gate]));
}

async function readinessFor(jurisdictionId: number) {
  const gates = await gateMap(jurisdictionId);
  const now = Date.now();
  const blockers = PILOT_READY_GATES.filter((code) => {
    const gate = gates.get(code);
    return !gate || gate.status !== 'approved' || (gate.expiresAt ? gate.expiresAt.getTime() <= now : false);
  });
  return {
    readyForShadowRegister: blockers.length === 0,
    blockers,
    gates: REQUIRED_GATES.map((code) => {
      const gate = gates.get(code);
      const expired = Boolean(gate?.expiresAt && gate.expiresAt.getTime() <= now);
      return { code, status: expired && gate?.status === 'approved' ? 'expired' : gate?.status ?? 'not_started', expiresAt: gate?.expiresAt ?? null };
    }),
  };
}

export async function createRolloutJurisdiction(input: {
  code: string;
  name: string;
  administrativeLevel: 'national' | 'state' | 'lga' | 'ward' | 'customary_area';
  parentJurisdictionId?: number;
  country?: string;
  authoritativeRecordStatement: string;
  legalMandateReference?: string;
  serviceFallbackDescription: string;
  createdBy: number;
}) {
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(input.code)) throw new Error('Jurisdiction code must use uppercase letters, digits, underscores, or hyphens');
  if (!input.authoritativeRecordStatement.trim() || !input.serviceFallbackDescription.trim()) {
    throw new Error('Authoritative record and fallback service statements are required');
  }
  const db = await requireDb();
  const [jurisdiction] = await db.insert(rolloutJurisdictions).values({
    code: input.code,
    name: input.name.trim(),
    administrativeLevel: input.administrativeLevel,
    parentJurisdictionId: input.parentJurisdictionId ?? null,
    country: input.country?.trim() || 'Nigeria',
    authoritativeRecordStatement: input.authoritativeRecordStatement.trim(),
    legalMandateReference: input.legalMandateReference?.trim() || null,
    serviceFallbackDescription: input.serviceFallbackDescription.trim(),
    createdBy: input.createdBy,
  }).returning();
  if (!jurisdiction) throw new Error('Could not create rollout jurisdiction');

  await db.insert(rolloutGateAttestations).values(REQUIRED_GATES.map((gateCode) => ({
    jurisdictionId: jurisdiction.id,
    gateCode,
    status: 'not_started' as const,
  })));
  return getRolloutJurisdictionOverview(jurisdiction.id);
}

export async function attestRolloutGate(input: {
  jurisdictionId: number;
  gateCode: string;
  status: 'evidence_submitted' | 'approved' | 'rejected';
  evidenceReference?: string;
  evidenceSha256?: string;
  expiresAt?: Date;
  reviewerNotes?: string;
  actorId: number;
}) {
  assertGateCode(input.gateCode);
  await getJurisdictionOrThrow(input.jurisdictionId);
  if (input.status === 'approved') {
    if (!input.evidenceReference || !input.evidenceSha256) throw new Error('Approved gates require evidence reference and SHA-256');
    assertEvidenceReference(input.evidenceReference, 'Gate evidence');
    assertHash(input.evidenceSha256, 'Gate evidence hash');
  }
  if (input.evidenceReference) assertEvidenceReference(input.evidenceReference, 'Gate evidence');
  if (input.evidenceSha256) assertHash(input.evidenceSha256, 'Gate evidence hash');

  const db = await requireDb();
  const values = {
    status: input.status,
    evidenceReference: input.evidenceReference?.trim() || null,
    evidenceSha256: input.evidenceSha256?.toLowerCase() || null,
    attestedBy: input.status === 'approved' ? input.actorId : null,
    attestedAt: input.status === 'approved' ? new Date() : null,
    expiresAt: input.expiresAt ?? null,
    reviewerNotes: input.reviewerNotes?.trim() || null,
    updatedAt: new Date(),
  } as const;
  await db.update(rolloutGateAttestations).set(values).where(and(
    eq(rolloutGateAttestations.jurisdictionId, input.jurisdictionId),
    eq(rolloutGateAttestations.gateCode, input.gateCode),
  ));
  return getRolloutJurisdictionOverview(input.jurisdictionId);
}

export async function setJurisdictionStatus(input: {
  jurisdictionId: number;
  status: JurisdictionStatus;
  pausedReason?: string;
}) {
  const jurisdiction = await getJurisdictionOrThrow(input.jurisdictionId);
  if (input.status === 'paused' && !input.pausedReason?.trim()) throw new Error('A paused jurisdiction requires a reason');
  if (input.status === 'shadow_register') {
    const readiness = await readinessFor(jurisdiction.id);
    if (!readiness.readyForShadowRegister) throw new Error(`Shadow-register transition blocked by gates: ${readiness.blockers.join(', ')}`);
  }
  if (input.status === 'limited_authoritative' || input.status === 'expanded') {
    throw new Error('Authoritative rollout stages require statutory approval outside this platform and cannot be set through an application mutation');
  }
  const db = await requireDb();
  await db.update(rolloutJurisdictions).set({
    status: input.status,
    pilotEnabled: input.status === 'shadow_register',
    pausedReason: input.status === 'paused' ? input.pausedReason!.trim() : null,
    updatedAt: new Date(),
  }).where(eq(rolloutJurisdictions.id, input.jurisdictionId));
  return getRolloutJurisdictionOverview(input.jurisdictionId);
}

export async function createImportBatch(input: {
  jurisdictionId: number;
  sourceSystem: string;
  sourceExportReference: string;
  sourceExtractSha256: string;
  sourceRecordCount: number;
  submittedBy: number;
}) {
  const jurisdiction = await getJurisdictionOrThrow(input.jurisdictionId);
  if (!['rehearsal', 'shadow_register'].includes(jurisdiction.status)) throw new Error('Imports are allowed only in rehearsal or shadow-register jurisdictions');
  if (!input.sourceSystem.trim() || !input.sourceExportReference.trim()) throw new Error('Source system and export reference are required');
  assertEvidenceReference(input.sourceExportReference, 'Source export');
  assertHash(input.sourceExtractSha256, 'Source extract hash');
  if (!Number.isInteger(input.sourceRecordCount) || input.sourceRecordCount < 0 || input.sourceRecordCount > 10_000_000) throw new Error('Source record count is invalid');
  const db = await requireDb();
  const [batch] = await db.insert(rolloutImportBatches).values({
    jurisdictionId: input.jurisdictionId,
    sourceSystem: input.sourceSystem.trim(),
    sourceExportReference: input.sourceExportReference.trim(),
    sourceExtractSha256: input.sourceExtractSha256.toLowerCase(),
    sourceRecordCount: input.sourceRecordCount,
    status: 'submitted',
    submittedBy: input.submittedBy,
    submittedAt: new Date(),
  }).returning();
  if (!batch) throw new Error('Could not create import batch');
  return batch;
}

export async function addStagingRecord(input: {
  importBatchId: number;
  sourceRecordId: string;
  sourceRecordSha256: string;
  parcelIdentifier?: string;
  titleIdentifier?: string;
  geometryGeojson?: Record<string, unknown>;
  normalizedAttributes: Record<string, unknown>;
  qualityFlags: string[];
}) {
  if (!input.sourceRecordId.trim() || input.sourceRecordId.length > 255) throw new Error('Source record identifier is required');
  assertHash(input.sourceRecordSha256, 'Source record hash');
  if (input.qualityFlags.length > 50 || input.qualityFlags.some((flag) => !/^[a-z0-9_.-]{1,96}$/i.test(flag))) throw new Error('Quality flags are invalid');
  const db = await requireDb();
  const [batch] = await db.select().from(rolloutImportBatches).where(eq(rolloutImportBatches.id, input.importBatchId)).limit(1);
  if (!batch || !['submitted', 'validating', 'reconciliation_required'].includes(batch.status)) throw new Error('Import batch is not open for staging records');
  const requiresReconciliation = input.qualityFlags.length > 0;
  const [record] = await db.insert(rolloutStagingRecords).values({
    importBatchId: input.importBatchId,
    sourceRecordId: input.sourceRecordId.trim(),
    sourceRecordSha256: input.sourceRecordSha256.toLowerCase(),
    parcelIdentifier: input.parcelIdentifier?.trim() || null,
    titleIdentifier: input.titleIdentifier?.trim() || null,
    geometryGeojson: input.geometryGeojson ?? null,
    normalizedAttributes: input.normalizedAttributes,
    qualityFlags: input.qualityFlags,
    status: requiresReconciliation ? 'reconciliation_required' : 'validated',
  }).returning();
  if (!record) throw new Error('Could not add staging record');
  return record;
}

export async function openReconciliationCase(input: {
  jurisdictionId: number;
  stagingRecordId: number;
  issueCode: string;
  issueSummary: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  actorId: number;
}) {
  if (!/^[a-z0-9_.-]{2,96}$/i.test(input.issueCode) || !input.issueSummary.trim()) throw new Error('Issue code and summary are required');
  const db = await requireDb();
  const [staging] = await db.select().from(rolloutStagingRecords).where(eq(rolloutStagingRecords.id, input.stagingRecordId)).limit(1);
  if (!staging) throw new Error('Staging record not found');
  const [batch] = await db.select().from(rolloutImportBatches).where(eq(rolloutImportBatches.id, staging.importBatchId)).limit(1);
  if (!batch || batch.jurisdictionId !== input.jurisdictionId) throw new Error('Staging record does not belong to the specified jurisdiction');

  const [reconciliationCase] = await db.insert(rolloutReconciliationCases).values({
    jurisdictionId: input.jurisdictionId,
    stagingRecordId: input.stagingRecordId,
    issueCode: input.issueCode,
    issueSummary: input.issueSummary.trim(),
    riskLevel: input.riskLevel,
    status: 'open',
  }).returning();
  if (!reconciliationCase) throw new Error('Could not create reconciliation case');
  await db.update(rolloutStagingRecords).set({ status: 'reconciliation_required', updatedAt: new Date() }).where(eq(rolloutStagingRecords.id, input.stagingRecordId));
  await db.update(rolloutImportBatches).set({ status: 'reconciliation_required', updatedAt: new Date() }).where(eq(rolloutImportBatches.id, batch.id));
  await db.insert(rolloutReconciliationEvents).values({
    reconciliationCaseId: reconciliationCase.id,
    actorId: input.actorId,
    action: 'opened',
    nextStatus: 'open',
    note: input.issueSummary.trim(),
  });
  return reconciliationCase;
}

export async function resolveReconciliationCase(input: {
  reconciliationCaseId: number;
  nextStatus: Extract<ReconciliationStatus, 'matched' | 'rejected' | 'escalated' | 'withdrawn'>;
  canonicalParcelId?: number;
  evidenceReference?: string;
  note?: string;
  actorId: number;
}) {
  const db = await requireDb();
  const [reconciliationCase] = await db.select().from(rolloutReconciliationCases).where(eq(rolloutReconciliationCases.id, input.reconciliationCaseId)).limit(1);
  if (!reconciliationCase) throw new Error('Reconciliation case not found');
  if (!['open', 'escalated'].includes(reconciliationCase.status)) throw new Error('Only open or escalated cases can be resolved');
  if (input.nextStatus === 'matched' && !input.canonicalParcelId) throw new Error('A matched case requires a canonical parcel');
  if (['matched', 'rejected', 'withdrawn'].includes(input.nextStatus) && !input.evidenceReference) throw new Error('A final reconciliation decision requires evidence');
  if (input.evidenceReference) assertEvidenceReference(input.evidenceReference, 'Reconciliation evidence');
  if (input.canonicalParcelId) {
    const [parcel] = await db.select({ id: parcels.id }).from(parcels).where(eq(parcels.id, input.canonicalParcelId)).limit(1);
    if (!parcel) throw new Error('Canonical parcel does not exist');
  }

  const finalStatus = ['matched', 'rejected', 'withdrawn'].includes(input.nextStatus);
  await db.update(rolloutReconciliationCases).set({
    status: input.nextStatus,
    canonicalParcelId: input.canonicalParcelId ?? null,
    resolvedBy: finalStatus ? input.actorId : null,
    resolutionReference: input.evidenceReference?.trim() || null,
    resolvedAt: finalStatus ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(rolloutReconciliationCases.id, input.reconciliationCaseId));
  await db.update(rolloutStagingRecords).set({
    status: input.nextStatus === 'matched' ? 'accepted' : input.nextStatus === 'rejected' || input.nextStatus === 'withdrawn' ? 'rejected' : 'reconciliation_required',
    updatedAt: new Date(),
  }).where(eq(rolloutStagingRecords.id, reconciliationCase.stagingRecordId));
  await db.insert(rolloutReconciliationEvents).values({
    reconciliationCaseId: input.reconciliationCaseId,
    actorId: input.actorId,
    action: input.nextStatus,
    priorStatus: reconciliationCase.status,
    nextStatus: input.nextStatus,
    evidenceReference: input.evidenceReference?.trim() || null,
    note: input.note?.trim() || null,
  });
  return getRolloutJurisdictionOverview(reconciliationCase.jurisdictionId);
}

export async function recordRecoveryDrill(input: {
  jurisdictionId?: number;
  drillType: 'backup_restore' | 'point_in_time_restore' | 'regional_failover' | 'queue_replay' | 'identity_recovery' | 'full_service_recovery';
  plannedAt: Date;
  status: 'planned' | 'running' | 'passed' | 'failed' | 'cancelled';
  measuredRpoSeconds?: number;
  measuredRtoSeconds?: number;
  evidenceReference?: string;
  evidenceSha256?: string;
  executedBy?: number;
  reviewedBy?: number;
  reviewNotes?: string;
}) {
  if (input.status === 'running' && !input.executedBy) throw new Error('A running recovery drill requires an executor');
  if (input.status === 'passed') {
    if (!input.evidenceReference || !input.evidenceSha256 || !input.executedBy || !input.reviewedBy) throw new Error('Passed recovery drills require independent evidence, executor, and reviewer');
    if (input.executedBy === input.reviewedBy) throw new Error('A passed recovery drill requires an independent reviewer');
    assertEvidenceReference(input.evidenceReference, 'Recovery drill evidence');
    assertHash(input.evidenceSha256, 'Recovery drill evidence hash');
  }
  const db = await requireDb();
  const [drill] = await db.insert(rolloutRecoveryDrills).values({
    jurisdictionId: input.jurisdictionId ?? null,
    drillType: input.drillType,
    plannedAt: input.plannedAt,
    status: input.status,
    startedAt: input.status === 'planned' ? null : new Date(),
    completedAt: input.status === 'passed' || input.status === 'failed' || input.status === 'cancelled' ? new Date() : null,
    measuredRpoSeconds: input.measuredRpoSeconds ?? null,
    measuredRtoSeconds: input.measuredRtoSeconds ?? null,
    evidenceReference: input.evidenceReference?.trim() || null,
    evidenceSha256: input.evidenceSha256?.toLowerCase() || null,
    executedBy: input.executedBy ?? null,
    reviewedBy: input.reviewedBy ?? null,
    reviewNotes: input.reviewNotes?.trim() || null,
  }).returning();
  if (!drill) throw new Error('Could not record recovery drill');
  return drill;
}

export async function createAssistedServiceCase(input: {
  jurisdictionId: number;
  requesterReference: string;
  serviceChannel: 'in_person' | 'phone' | 'community_kiosk' | 'accessibility_assistance' | 'mobile_outreach';
  requestedService: string;
  openedBy: number;
}) {
  await getJurisdictionOrThrow(input.jurisdictionId);
  if (!input.requesterReference.trim() || !input.requestedService.trim()) throw new Error('Requester reference and requested service are required');
  const db = await requireDb();
  const [serviceCase] = await db.insert(assistedServiceCases).values({
    jurisdictionId: input.jurisdictionId,
    requesterReference: input.requesterReference.trim(),
    serviceChannel: input.serviceChannel,
    requestedService: input.requestedService.trim(),
    consentRecordedAt: new Date(),
    openedBy: input.openedBy,
  }).returning();
  if (!serviceCase) throw new Error('Could not open assisted service case');
  return serviceCase;
}

export async function getRolloutJurisdictionOverview(jurisdictionId: number) {
  const jurisdiction = await getJurisdictionOrThrow(jurisdictionId);
  const db = await requireDb();
  const [imports, reconciliations, drills, assistedCases, readiness] = await Promise.all([
    db.select().from(rolloutImportBatches).where(eq(rolloutImportBatches.jurisdictionId, jurisdictionId)).orderBy(desc(rolloutImportBatches.createdAt)),
    db.select().from(rolloutReconciliationCases).where(eq(rolloutReconciliationCases.jurisdictionId, jurisdictionId)).orderBy(desc(rolloutReconciliationCases.createdAt)),
    db.select().from(rolloutRecoveryDrills).where(eq(rolloutRecoveryDrills.jurisdictionId, jurisdictionId)).orderBy(desc(rolloutRecoveryDrills.createdAt)).limit(10),
    db.select().from(assistedServiceCases).where(eq(assistedServiceCases.jurisdictionId, jurisdictionId)).orderBy(desc(assistedServiceCases.createdAt)).limit(25),
    readinessFor(jurisdictionId),
  ]);
  return {
    jurisdiction,
    readiness,
    metrics: {
      importBatches: imports.length,
      openReconciliations: reconciliations.filter((item) => ['open', 'escalated'].includes(item.status)).length,
      passedRecoveryDrills: drills.filter((item) => item.status === 'passed').length,
      openAssistedServiceCases: assistedCases.filter((item) => !['resolved', 'closed'].includes(item.status)).length,
    },
    imports,
    reconciliations,
    drills,
    assistedCases,
  };
}

export async function listRolloutJurisdictions() {
  const db = await requireDb();
  const jurisdictions = await db.select().from(rolloutJurisdictions).orderBy(rolloutJurisdictions.country, rolloutJurisdictions.name);
  return Promise.all(jurisdictions.map((jurisdiction) => getRolloutJurisdictionOverview(jurisdiction.id)));
}

export const rolloutGateCodes = REQUIRED_GATES;


export async function finalizeImportBatch(input: { importBatchId: number; actorId: number }) {
  const db = await requireDb();
  const [batch] = await db.select().from(rolloutImportBatches).where(eq(rolloutImportBatches.id, input.importBatchId)).limit(1);
  if (!batch) throw new Error('Import batch not found');
  if (!['submitted', 'validating', 'reconciliation_required'].includes(batch.status)) throw new Error('Import batch is not eligible for finalization');
  const readiness = await readinessFor(batch.jurisdictionId);
  const requiredDataGates = readiness.gates.filter((gate) => ['data_inventory', 'data_reconciliation'].includes(gate.code));
  if (requiredDataGates.some((gate) => gate.status !== 'approved')) throw new Error('Import finalization requires approved data inventory and reconciliation gates');

  const staging = await db.select().from(rolloutStagingRecords).where(eq(rolloutStagingRecords.importBatchId, batch.id));
  if (staging.length !== batch.sourceRecordCount) throw new Error('Every declared source record must have a staged lineage record before finalization');
  if (staging.some((record) => ['pending', 'reconciliation_required'].includes(record.status))) throw new Error('All staging records must be validated or explicitly rejected before finalization');

  const reconciliationCases = await db.select().from(rolloutReconciliationCases).where(eq(rolloutReconciliationCases.jurisdictionId, batch.jurisdictionId));
  const stagingIds = new Set(staging.map((record) => record.id));
  if (reconciliationCases.some((item) => stagingIds.has(item.stagingRecordId) && ['open', 'escalated'].includes(item.status))) {
    throw new Error('Open reconciliation cases block import finalization');
  }

  const acceptedRecordCount = staging.filter((record) => record.status === 'accepted' || record.status === 'validated').length;
  const rejectedRecordCount = staging.filter((record) => record.status === 'rejected').length;
  const reconciliationRequiredCount = reconciliationCases.filter((item) => stagingIds.has(item.stagingRecordId)).length;
  await db.update(rolloutImportBatches).set({
    status: 'accepted',
    acceptedRecordCount,
    rejectedRecordCount,
    reconciliationRequiredCount,
    approvedBy: input.actorId,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(rolloutImportBatches.id, batch.id));

  return {
    importBatchId: batch.id,
    status: 'accepted' as const,
    acceptedRecordCount,
    rejectedRecordCount,
    reconciliationRequiredCount,
    authorityBoundary: 'Accepted imports remain non-authoritative migration evidence until a legally authorised registry officer completes the separate statutory record process.',
  };
}


export async function completeRecoveryDrill(input: {
  drillId: number;
  evidenceReference: string;
  evidenceSha256: string;
  measuredRpoSeconds: number;
  measuredRtoSeconds: number;
  reviewNotes?: string;
  reviewedBy: number;
}) {
  assertEvidenceReference(input.evidenceReference, 'Recovery drill evidence');
  assertHash(input.evidenceSha256, 'Recovery drill evidence hash');
  if (!Number.isInteger(input.measuredRpoSeconds) || !Number.isInteger(input.measuredRtoSeconds) || input.measuredRpoSeconds < 0 || input.measuredRtoSeconds < 0) {
    throw new Error('Measured RPO and RTO must be non-negative integers');
  }
  const db = await requireDb();
  const [drill] = await db.select().from(rolloutRecoveryDrills).where(eq(rolloutRecoveryDrills.id, input.drillId)).limit(1);
  if (!drill) throw new Error('Recovery drill not found');
  if (drill.status !== 'running') throw new Error('Only a running recovery drill can be independently completed');
  if (!drill.executedBy) throw new Error('Recovery drill has no recorded executor');
  if (drill.executedBy === input.reviewedBy) throw new Error('Recovery drill reviewer must be independent from executor');

  await db.update(rolloutRecoveryDrills).set({
    status: 'passed',
    completedAt: new Date(),
    measuredRpoSeconds: input.measuredRpoSeconds,
    measuredRtoSeconds: input.measuredRtoSeconds,
    evidenceReference: input.evidenceReference,
    evidenceSha256: input.evidenceSha256.toLowerCase(),
    reviewedBy: input.reviewedBy,
    reviewNotes: input.reviewNotes?.trim() || null,
    updatedAt: new Date(),
  }).where(and(eq(rolloutRecoveryDrills.id, input.drillId), eq(rolloutRecoveryDrills.status, 'running')));
  return { drillId: drill.id, jurisdictionId: drill.jurisdictionId, status: 'passed' as const };
}
