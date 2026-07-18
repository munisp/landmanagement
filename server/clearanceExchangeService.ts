/**
 * Federated Inter-Agency Clearance Exchange (next-generation feature, 2026-07-18)
 *
 * Coordinates land-use approval, tax clearance, identity verification,
 * environmental review, and governor-consent checkpoints across agencies,
 * maintaining a single transaction-wide compliance state instead of operators
 * manually reconciling status across systems.
 *
 * Offline-capable: clearance state persists in memory when PostgreSQL is down.
 */

import { and, eq } from 'drizzle-orm';
import { getDb } from './db';
import { agencyClearances } from '../drizzle/schema';

export type ClearanceAgency =
  | 'firs_tax'
  | 'identity_verification'
  | 'survey'
  | 'land_use'
  | 'environmental'
  | 'governor_consent';

export type ClearanceStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'expired';

export interface AgencyDefinition {
  key: ClearanceAgency;
  label: string;
  required: boolean;
  slaHours: number;
}

export const AGENCY_CATALOG: AgencyDefinition[] = [
  { key: 'firs_tax', label: 'FIRS Tax Clearance', required: true, slaHours: 72 },
  { key: 'identity_verification', label: 'Identity Verification (NIN)', required: true, slaHours: 24 },
  { key: 'survey', label: 'Survey Plan Confirmation', required: true, slaHours: 120 },
  { key: 'land_use', label: 'Land-Use Approval', required: false, slaHours: 168 },
  { key: 'environmental', label: 'Environmental Review', required: false, slaHours: 240 },
  { key: 'governor_consent', label: "Governor's Consent", required: true, slaHours: 336 },
];

export interface ClearanceRecord {
  id: number;
  transactionId: number;
  agency: ClearanceAgency;
  label: string;
  required: boolean;
  status: ClearanceStatus;
  referenceNumber?: string;
  slaDueAt?: string;
  overdue: boolean;
  submittedAt?: string;
  decidedAt?: string;
  decisionNotes?: string;
}

export interface TransactionClearanceState {
  transactionId: number;
  overall: 'cleared' | 'in_progress' | 'blocked' | 'not_initiated';
  requiredTotal: number;
  requiredApproved: number;
  blockingAgencies: string[];
  clearances: ClearanceRecord[];
  evaluatedAt: string;
}

const memoryClearances: Array<Omit<ClearanceRecord, 'overdue' | 'label' | 'required'>> = [];
let memoryId = 1;

function agencyDef(agency: string): AgencyDefinition {
  const def = AGENCY_CATALOG.find((a) => a.key === agency);
  if (!def) throw new Error(`Unknown clearance agency "${agency}"`);
  return def;
}

function decorate(row: any): ClearanceRecord {
  const def = AGENCY_CATALOG.find((a) => a.key === row.agency);
  const slaDueAt = row.slaDueAt ? new Date(row.slaDueAt) : undefined;
  const terminal = row.status === 'approved' || row.status === 'rejected';
  return {
    id: row.id,
    transactionId: row.transactionId,
    agency: row.agency,
    label: def?.label ?? row.agency,
    required: def?.required ?? true,
    status: row.status,
    referenceNumber: row.referenceNumber ?? undefined,
    slaDueAt: slaDueAt?.toISOString(),
    overdue: Boolean(slaDueAt && !terminal && slaDueAt.getTime() < Date.now()),
    submittedAt: row.submittedAt ? new Date(row.submittedAt).toISOString() : undefined,
    decidedAt: row.decidedAt ? new Date(row.decidedAt).toISOString() : undefined,
    decisionNotes: row.decisionNotes ?? undefined,
  };
}

/** Initiate clearance requests for a transaction (idempotent per agency). */
export async function initiateClearances(params: {
  transactionId: number;
  agencies?: ClearanceAgency[];
}): Promise<ClearanceRecord[]> {
  const agencyKeys = params.agencies ?? AGENCY_CATALOG.map((a) => a.key);
  const now = new Date();
  const results: ClearanceRecord[] = [];
  const db = await getDb();

  for (const agencyKey of agencyKeys) {
    const def = agencyDef(agencyKey);
    const existing = (await getClearances(params.transactionId)).find((c) => c.agency === agencyKey && c.status !== 'expired');
    if (existing) {
      results.push(existing);
      continue;
    }
    const slaDueAt = new Date(now.getTime() + def.slaHours * 3600 * 1000);
    if (db) {
      try {
        const inserted = await db
          .insert(agencyClearances)
          .values({
            transactionId: params.transactionId,
            agency: agencyKey,
            status: 'pending',
            slaDueAt,
          })
          .returning();
        results.push(decorate(inserted[0]));
        continue;
      } catch (error) {
        console.warn('[ClearanceExchange] Initiate failed, using memory fallback:', (error as Error).message);
      }
    }
    const record = {
      id: memoryId++,
      transactionId: params.transactionId,
      agency: agencyKey,
      status: 'pending' as ClearanceStatus,
      slaDueAt: slaDueAt.toISOString(),
    };
    memoryClearances.push(record);
    results.push(decorate(record));
  }
  return results;
}

/** List clearance records for a transaction. */
export async function getClearances(transactionId: number): Promise<ClearanceRecord[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.select().from(agencyClearances).where(eq(agencyClearances.transactionId, transactionId));
      return (rows as any[]).map(decorate);
    } catch (error) {
      console.warn('[ClearanceExchange] Read failed, using memory fallback:', (error as Error).message);
    }
  }
  return memoryClearances.filter((c) => c.transactionId === transactionId).map(decorate);
}

/** Mark a clearance as submitted to the external agency. */
export async function submitClearance(params: {
  transactionId: number;
  agency: ClearanceAgency;
  referenceNumber?: string;
}): Promise<ClearanceRecord> {
  return transition(params.transactionId, params.agency, 'submitted', { referenceNumber: params.referenceNumber });
}

/** Record an agency decision (approve / reject). */
export async function decideClearance(params: {
  transactionId: number;
  agency: ClearanceAgency;
  decision: 'approved' | 'rejected';
  notes?: string;
  referenceNumber?: string;
}): Promise<ClearanceRecord> {
  return transition(params.transactionId, params.agency, params.decision, {
    notes: params.notes,
    referenceNumber: params.referenceNumber,
  });
}

/** Expire an overdue clearance so it can be re-initiated. */
export async function expireClearance(transactionId: number, agency: ClearanceAgency): Promise<ClearanceRecord> {
  return transition(transactionId, agency, 'expired', {});
}

async function transition(
  transactionId: number,
  agency: ClearanceAgency,
  status: ClearanceStatus,
  extra: { notes?: string; referenceNumber?: string }
): Promise<ClearanceRecord> {
  agencyDef(agency);
  const now = new Date();
  const patch: Record<string, any> = { status, updatedAt: now };
  if (status === 'submitted') patch.submittedAt = now;
  if (status === 'approved' || status === 'rejected') patch.decidedAt = now;
  if (extra.notes) patch.decisionNotes = extra.notes;
  if (extra.referenceNumber) patch.referenceNumber = extra.referenceNumber;

  const db = await getDb();
  if (db) {
    try {
      const updated = await db
        .update(agencyClearances)
        .set(patch)
        .where(and(eq(agencyClearances.transactionId, transactionId), eq(agencyClearances.agency, agency)))
        .returning();
      if (!updated.length) throw new Error(`No clearance found for transaction ${transactionId} / agency ${agency}`);
      return decorate(updated[0]);
    } catch (error) {
      if ((error as Error).message.includes('No clearance found')) throw error;
      console.warn('[ClearanceExchange] Transition failed, using memory fallback:', (error as Error).message);
    }
  }
  const record = memoryClearances.find((c) => c.transactionId === transactionId && c.agency === agency);
  if (!record) throw new Error(`No clearance found for transaction ${transactionId} / agency ${agency}`);
  Object.assign(record, patch, {
    submittedAt: patch.submittedAt?.toISOString?.(),
    decidedAt: patch.decidedAt?.toISOString?.(),
  });
  return decorate(record);
}

/** Unified transaction-wide compliance state. */
export async function getClearanceState(transactionId: number): Promise<TransactionClearanceState> {
  const clearances = await getClearances(transactionId);
  const required = clearances.filter((c) => c.required);
  const approved = required.filter((c) => c.status === 'approved');
  const blockingAgencies = required
    .filter((c) => c.status === 'rejected' || c.status === 'expired')
    .map((c) => c.label);

  let overall: TransactionClearanceState['overall'] = 'not_initiated';
  if (clearances.length > 0) {
    overall = blockingAgencies.length > 0
      ? 'blocked'
      : approved.length === required.length && required.length > 0
        ? 'cleared'
        : 'in_progress';
  }

  return {
    transactionId,
    overall,
    requiredTotal: required.length,
    requiredApproved: approved.length,
    blockingAgencies,
    clearances,
    evaluatedAt: new Date().toISOString(),
  };
}
