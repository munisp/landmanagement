/**
 * Continuous Registry Integrity Monitoring (next-generation feature, 2026-07-18)
 *
 * Formal anomaly-detection service watching for duplicate parcel identity,
 * overlapping geometry, conflicting ownership states, suspicious valuation
 * jumps, repeated document fingerprints, and abnormal transaction timing.
 * Findings land in an operator review queue (open → acknowledged → resolved).
 *
 * Offline-capable: uses in-memory repositories when PostgreSQL is unavailable.
 */

import { createHash } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { requireDb } from './db';
import { registryIntegrityFindings } from '../drizzle/schema';
import * as parcelRepository from './parcelRepository';
import * as disputeRepository from './disputeRepository';
import * as documentRepository from './documentRepository';
import * as transactionRepository from './transactionRepository';

export type IntegrityCheckType =
  | 'duplicate_parcel'
  | 'overlapping_geometry'
  | 'ownership_conflict'
  | 'valuation_jump'
  | 'document_fingerprint'
  | 'timing_anomaly';

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type FindingStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

export interface IntegrityFinding {
  id?: number;
  checkType: IntegrityCheckType;
  severity: FindingSeverity;
  status: FindingStatus;
  parcelId?: number;
  relatedEntityType?: string;
  relatedEntityId?: number;
  description: string;
  evidence?: Record<string, any>;
  detectedBy: string;
  scanRunId?: string;
  detectedAt: string;
}

export interface ScanSummary {
  scanRunId: string;
  parcelsScanned: number;
  transactionsScanned: number;
  documentsScanned: number;
  newFindings: number;
  deduplicated: number;
  byCheckType: Record<string, number>;
  startedAt: string;
  finishedAt: string;
}

const OPEN_DISPUTE_STATUSES = new Set(['pending', 'filed', 'mediation', 'in_review', 'hearing_scheduled', 'escalated']);
const VALUATION_JUMP_FACTOR = 3;
const TIMING_WINDOW_DAYS = 30;
const TIMING_ALERT_COUNT = 3;
const OVERLAP_DISTANCE_METERS = 25;


function fingerprint(f: IntegrityFinding): string {
  return createHash('sha256')
    .update(`${f.checkType}|${f.parcelId ?? ''}|${f.relatedEntityId ?? ''}|${f.description}`)
    .digest('hex')
    .slice(0, 24);
}

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function persistFindings(findings: IntegrityFinding[]): Promise<{ inserted: number; deduplicated: number }> {
  let inserted = 0;
  let deduplicated = 0;
  const db = await requireDb();

  for (const finding of findings) {
    // Deduplicate against identical open findings (same check, parcel, description)
    const existing = await listFindings({ checkType: finding.checkType, status: 'open', parcelId: finding.parcelId, limit: 500 });
    const fp = fingerprint(finding);
    if (existing.some((e) => fingerprint(e) === fp)) {
      deduplicated += 1;
      continue;
    }

    try {
      await db.insert(registryIntegrityFindings).values({
        checkType: finding.checkType,
        severity: finding.severity,
        status: 'open',
        parcelId: finding.parcelId ?? null,
        relatedEntityType: finding.relatedEntityType ?? null,
        relatedEntityId: finding.relatedEntityId ?? null,
        description: finding.description,
        evidence: finding.evidence ?? null,
        detectedBy: finding.detectedBy,
        scanRunId: finding.scanRunId ?? null,
      });
      inserted += 1;
    } catch (err: any) {
      // FK violation: parcel_id from in-memory store not yet persisted to DB.
      // Retry without the FK-constrained parcel_id, storing it in relatedEntityId instead.
      // Drizzle wraps the PG error; check both err and err.cause for the FK code.
      const pgErr = err?.cause ?? err;
      const isFkViolation = (pgErr?.code === '23503' || err?.code === '23503') &&
        (String(pgErr?.constraint ?? err?.constraint ?? '').includes('parcel_id') ||
         String(pgErr?.detail ?? err?.detail ?? '').includes('parcel_id'));
      if (isFkViolation) {
        await db.insert(registryIntegrityFindings).values({
          checkType: finding.checkType,
          severity: finding.severity,
          status: 'open',
          parcelId: null,
          relatedEntityType: finding.relatedEntityType ?? 'parcel',
          relatedEntityId: finding.parcelId ?? null,
          description: finding.description,
          evidence: finding.evidence ?? null,
          detectedBy: finding.detectedBy,
          scanRunId: finding.scanRunId ?? null,
        });
        inserted += 1;
      } else {
        throw err;
      }
    }
  }
  return { inserted, deduplicated };
}

/** Run a full registry integrity scan; returns a summary and persists findings. */
export async function runIntegrityScan(opts: { detectedBy?: string } = {}): Promise<ScanSummary> {
  const startedAt = new Date();
  const scanRunId = `SCAN-${startedAt.getTime()}`;
  const detectedBy = opts.detectedBy ?? 'manual';

  const parcels = (await parcelRepository.searchParcels({ limit: 10000 } as any)).parcels as parcelRepository.ParcelRecord[];
  const transactions = (await transactionRepository.listTransactions({ limit: 10000 })).transactions as any[];
  const documents = ((await documentRepository.listAllDocuments?.()) ?? []) as any[];
  const disputes = (await disputeRepository.listDisputes({ limit: 10000 })).disputes as any[];

  const findings: IntegrityFinding[] = [];
  const base = { detectedBy, scanRunId, status: 'open' as FindingStatus, detectedAt: startedAt.toISOString() };

  // 1) Duplicate parcel identity (parcel number or survey plan number)
  const byNumber = new Map<string, parcelRepository.ParcelRecord[]>();
  for (const p of parcels) {
    for (const key of [p.parcelNumber, p.surveyPlanNumber].filter(Boolean) as string[]) {
      const list = byNumber.get(key) ?? [];
      list.push(p);
      byNumber.set(key, list);
    }
  }
  for (const [key, list] of byNumber) {
    if (list.length > 1) {
      findings.push({
        ...base,
        checkType: 'duplicate_parcel',
        severity: 'critical',
        parcelId: list[0].id,
        relatedEntityType: 'parcel',
        relatedEntityId: list[1].id,
        description: `Duplicate parcel identity "${key}" across parcel records ${list.map((p: parcelRepository.ParcelRecord) => p.id).join(', ')}`,
        evidence: { key, parcelIds: list.map((p: parcelRepository.ParcelRecord) => p.id) },
      });
    }
  }

  // 2) Overlapping geometry (coordinate proximity heuristic)
  for (let i = 0; i < parcels.length; i++) {
    for (let j = i + 1; j < parcels.length; j++) {
      const a = parcels[i];
      const b = parcels[j];
      if (!a.coordinates || !b.coordinates) continue;
      if (a.state !== b.state || a.lga !== b.lga) continue;
      const distance = metersBetween(a.coordinates, b.coordinates);
      if (distance <= OVERLAP_DISTANCE_METERS) {
        findings.push({
          ...base,
          checkType: 'overlapping_geometry',
          severity: 'high',
          parcelId: a.id,
          relatedEntityType: 'parcel',
          relatedEntityId: b.id,
          description: `Parcels ${a.parcelNumber} and ${b.parcelNumber} are ${distance.toFixed(1)}m apart — possible overlapping geometry`,
          evidence: { distanceMeters: Number(distance.toFixed(1)), a: a.parcelNumber, b: b.parcelNumber },
        });
      }
    }
  }

  // 3) Ownership conflicts (disputed parcels with open ownership disputes)
  for (const dispute of disputes) {
    if (!dispute.parcelId || !OPEN_DISPUTE_STATUSES.has(String(dispute.status))) continue;
    const typeText = `${dispute.type ?? ''} ${dispute.description ?? ''}`.toLowerCase();
    if (typeText.includes('ownership') || typeText.includes('title') || typeText.includes('boundary')) {
      findings.push({
        ...base,
        checkType: 'ownership_conflict',
        severity: 'high',
        parcelId: dispute.parcelId,
        relatedEntityType: 'dispute',
        relatedEntityId: dispute.id,
        description: `Open ${dispute.type ?? 'ownership'} dispute ${dispute.caseNumber ?? ''} indicates conflicting ownership claims`,
        evidence: { disputeId: dispute.id, status: dispute.status },
      });
    }
  }

  // 4) Valuation jumps (vs state median)
  const stateMedians = new Map<string, number>();
  const byState = new Map<string, number[]>();
  for (const p of parcels) {
    if (!p.estimatedValue) continue;
    byState.set(p.state, [...(byState.get(p.state) ?? []), p.estimatedValue]);
  }
  for (const [state, values] of byState) stateMedians.set(state, median(values));
  for (const p of parcels) {
    const stateMedian = stateMedians.get(p.state) ?? 0;
    if (stateMedian > 0 && p.estimatedValue > stateMedian * VALUATION_JUMP_FACTOR) {
      findings.push({
        ...base,
        checkType: 'valuation_jump',
        severity: 'medium',
        parcelId: p.id,
        description: `Parcel ${p.parcelNumber} valued at ${(p.estimatedValue / stateMedian).toFixed(1)}x the ${p.state} median`,
        evidence: { estimatedValue: p.estimatedValue, stateMedian, factor: Number((p.estimatedValue / stateMedian).toFixed(2)) },
      });
    }
  }

  // 5) Repeated document fingerprints across parcels
  const byFingerprint = new Map<string, any[]>();
  for (const doc of documents) {
    const fpKey = doc.fileHash ?? doc.checksum ?? doc.fileName;
    if (!fpKey) continue;
    byFingerprint.set(fpKey, [...(byFingerprint.get(fpKey) ?? []), doc]);
  }
  for (const [fpKey, docs] of byFingerprint) {
    const parcelIds = new Set(docs.map((d: any) => d.parcelId).filter(Boolean));
    if (parcelIds.size > 1) {
      findings.push({
        ...base,
        checkType: 'document_fingerprint',
        severity: 'high',
        relatedEntityType: 'document',
        relatedEntityId: docs[0].id,
        description: `Document fingerprint "${String(fpKey).slice(0, 32)}" reused across ${parcelIds.size} parcels`,
        evidence: { fingerprint: String(fpKey), parcelIds: [...parcelIds] },
      });
    }
  }

  // 6) Abnormal transaction timing
  const byParcel = new Map<number, any[]>();
  for (const tx of transactions) {
    if (!tx.parcelId) continue;
    byParcel.set(tx.parcelId, [...(byParcel.get(tx.parcelId) ?? []), tx]);
  }
  const now = new Date();
  for (const [parcelId, txs] of byParcel) {
    const recent = txs.filter((tx: any) => {
      const when = new Date(tx.createdAt ?? tx.initiatedAt ?? now);
      return Math.abs(now.getTime() - when.getTime()) / 86400000 <= TIMING_WINDOW_DAYS;
    });
    if (recent.length >= TIMING_ALERT_COUNT) {
      findings.push({
        ...base,
        checkType: 'timing_anomaly',
        severity: 'medium',
        parcelId,
        description: `${recent.length} transactions on the same parcel within ${TIMING_WINDOW_DAYS} days`,
        evidence: { transactionIds: recent.map((t: any) => t.id), windowDays: TIMING_WINDOW_DAYS },
      });
    }
  }

  const { inserted, deduplicated } = await persistFindings(findings);
  const byCheckType: Record<string, number> = {};
  for (const f of findings) byCheckType[f.checkType] = (byCheckType[f.checkType] ?? 0) + 1;

  return {
    scanRunId,
    parcelsScanned: parcels.length,
    transactionsScanned: transactions.length,
    documentsScanned: documents.length,
    newFindings: inserted,
    deduplicated,
    byCheckType,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

/** List findings with filters (operator review queue). */
export async function listFindings(filter: {
  status?: FindingStatus;
  severity?: FindingSeverity;
  checkType?: IntegrityCheckType;
  parcelId?: number;
  limit?: number;
}): Promise<IntegrityFinding[]> {
  const limit = filter.limit ?? 100;
  const db = await requireDb();
  const conditions = [] as any[];
  if (filter.status) conditions.push(eq(registryIntegrityFindings.status, filter.status));
  if (filter.severity) conditions.push(eq(registryIntegrityFindings.severity, filter.severity));
  if (filter.checkType) conditions.push(eq(registryIntegrityFindings.checkType, filter.checkType));
  if (filter.parcelId) conditions.push(eq(registryIntegrityFindings.parcelId, filter.parcelId));
  const rows = await db
    .select()
    .from(registryIntegrityFindings)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(registryIntegrityFindings.detectedAt))
    .limit(limit);
  return rows.map((row: any) => ({
    id: row.id,
    checkType: row.checkType,
    severity: row.severity,
    status: row.status,
    parcelId: row.parcelId ?? undefined,
    relatedEntityType: row.relatedEntityType ?? undefined,
    relatedEntityId: row.relatedEntityId ?? undefined,
    description: row.description,
    evidence: row.evidence ?? undefined,
    detectedBy: row.detectedBy,
    scanRunId: row.scanRunId ?? undefined,
    detectedAt: row.detectedAt?.toISOString?.() ?? String(row.detectedAt),
  }));
}

async function updateFindingStatus(id: number, status: FindingStatus, userId: number, notes?: string) {
  const db = await requireDb();
  const patch: Record<string, any> = { status };
  if (status === 'acknowledged') {
    patch.acknowledgedBy = userId;
    patch.acknowledgedAt = new Date();
  }
  if (status === 'resolved' || status === 'dismissed') {
    patch.resolvedBy = userId;
    patch.resolvedAt = new Date();
    if (notes) patch.resolutionNotes = notes;
  }
  await db.update(registryIntegrityFindings).set(patch).where(eq(registryIntegrityFindings.id, id));
  return { success: true };
}

export const acknowledgeFinding = (id: number, userId: number) => updateFindingStatus(id, 'acknowledged', userId);
export const resolveFinding = (id: number, userId: number, notes?: string) => updateFindingStatus(id, 'resolved', userId, notes);
export const dismissFinding = (id: number, userId: number, notes?: string) => updateFindingStatus(id, 'dismissed', userId, notes);

/** Queue statistics for dashboards. */
export async function getIntegrityStats() {
  const all = await listFindings({ limit: 1000 });
  const byStatus: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byCheckType: Record<string, number> = {};
  for (const f of all) {
    byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCheckType[f.checkType] = (byCheckType[f.checkType] ?? 0) + 1;
  }
  return { total: all.length, byStatus, bySeverity, byCheckType, generatedAt: new Date().toISOString() };
}
