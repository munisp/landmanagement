/**
 * Programmable Escrow & Multi-Party Settlement Orchestrator
 * (next-generation feature, 2026-07-18)
 *
 * Disbursement conditions are assembled from title verification, tax
 * clearance, mortgage approval, insurance readiness, and document validation
 * checkpoints. Release decisions are deterministic, reviewable, and audited.
 *
 * Offline-capable: falls back to in-memory settlement state when PostgreSQL
 * is unavailable.
 */

import { asc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { escrowSettlements, settlementCheckpoints } from '../drizzle/schema';

export type SettlementStatus = 'draft' | 'pending' | 'release_ready' | 'released' | 'blocked' | 'cancelled';
export type CheckpointStatus = 'pending' | 'fulfilled' | 'waived' | 'failed';

export interface CheckpointTemplateItem {
  key: string;
  label: string;
  required: boolean;
}

export interface SettlementView {
  id: number;
  settlementRef: string;
  transactionId?: number;
  amount?: string | number;
  currency: string;
  status: SettlementStatus;
  checkpoints: Array<{
    id: number;
    checkpointKey: string;
    label: string;
    required: boolean;
    status: CheckpointStatus;
    evidence?: Record<string, any>;
    fulfilledBy?: number;
    fulfilledAt?: string;
    notes?: string;
  }>;
  blockingReasons: string[];
  releaseDecision?: Record<string, any>;
  releasedAt?: string;
  releasedBy?: number;
  createdAt: string;
  updatedAt: string;
}

/** Standard checkpoint template for land transaction settlement. */
export function defaultCheckpointTemplate(opts: { financed: boolean; insured: boolean }): CheckpointTemplateItem[] {
  const template: CheckpointTemplateItem[] = [
    { key: 'title_verified', label: 'Title verification completed', required: true },
    { key: 'tax_cleared', label: 'Tax clearance certificate issued', required: true },
    { key: 'documents_validated', label: 'Transaction documents validated', required: true },
    { key: 'payment_confirmed', label: 'Purchase payment confirmed in escrow', required: true },
  ];
  if (opts.financed) template.push({ key: 'mortgage_approved', label: 'Mortgage approval confirmed by lender', required: true });
  if (opts.insured) template.push({ key: 'insurance_ready', label: 'Title/property insurance bound', required: false });
  return template;
}

interface MemorySettlement extends SettlementView {}
const memorySettlements: MemorySettlement[] = [];
let memorySettlementId = 1;
let memoryCheckpointId = 1;
let memoryRefSeq = 1;

function generateRef(): string {
  const year = new Date().getFullYear();
  return `STL-${year}-${String(memoryRefSeq++).padStart(5, '0')}`;
}

function computeBlockingReasons(checkpoints: SettlementView['checkpoints']): string[] {
  const reasons: string[] = [];
  for (const cp of checkpoints) {
    if (cp.required && cp.status === 'pending') reasons.push(`Pending: ${cp.label}`);
    if (cp.required && cp.status === 'failed') reasons.push(`Failed: ${cp.label}`);
  }
  return reasons;
}

function statusFromCheckpoints(checkpoints: SettlementView['checkpoints']): SettlementStatus {
  if (checkpoints.some((cp) => cp.required && cp.status === 'failed')) return 'blocked';
  if (checkpoints.every((cp) => !cp.required || cp.status === 'fulfilled' || cp.status === 'waived')) return 'release_ready';
  return 'pending';
}

/** Create a settlement envelope with its checkpoint template. */
export async function createSettlement(params: {
  transactionId?: number;
  amount?: number;
  currency?: string;
  financed?: boolean;
  insured?: boolean;
  createdBy?: number;
}): Promise<SettlementView> {
  const settlementRef = generateRef();
  const template = defaultCheckpointTemplate({ financed: params.financed ?? false, insured: params.insured ?? false });
  const now = new Date();
  const db = await getDb();

  if (db) {
    try {
      const inserted = await db
        .insert(escrowSettlements)
        .values({
          settlementRef,
          transactionId: params.transactionId ?? null,
          amount: params.amount != null ? String(params.amount) : null,
          currency: params.currency ?? 'NGN',
          status: 'pending',
          createdBy: params.createdBy ?? null,
        })
        .returning();
      const settlementId = inserted[0].id;
      await db.insert(settlementCheckpoints).values(
        template.map((item) => ({
          settlementId,
          checkpointKey: item.key,
          label: item.label,
          required: item.required,
          status: 'pending' as const,
        }))
      );
      return getSettlement(settlementId) as Promise<SettlementView>;
    } catch (error) {
      console.warn('[EscrowSettlement] Create failed, using memory fallback:', (error as Error).message);
    }
  }

  const view: MemorySettlement = {
    id: memorySettlementId++,
    settlementRef,
    transactionId: params.transactionId,
    amount: params.amount,
    currency: params.currency ?? 'NGN',
    status: 'pending',
    checkpoints: template.map((item) => ({
      id: memoryCheckpointId++,
      checkpointKey: item.key,
      label: item.label,
      required: item.required,
      status: 'pending',
    })),
    blockingReasons: template.map((item) => `Pending: ${item.label}`),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  memorySettlements.push(view);
  return view;
}

/** Fetch a settlement with checkpoints. */
export async function getSettlement(settlementId: number): Promise<SettlementView | null> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.select().from(escrowSettlements).where(eq(escrowSettlements.id, settlementId));
      if (!rows.length) return null;
      const cps = await db
        .select()
        .from(settlementCheckpoints)
        .where(eq(settlementCheckpoints.settlementId, settlementId))
        .orderBy(asc(settlementCheckpoints.id));
      const s = rows[0] as any;
      return {
        id: s.id,
        settlementRef: s.settlementRef,
        transactionId: s.transactionId ?? undefined,
        amount: s.amount ?? undefined,
        currency: s.currency,
        status: s.status,
        checkpoints: cps.map((cp: any) => ({
          id: cp.id,
          checkpointKey: cp.checkpointKey,
          label: cp.label,
          required: cp.required,
          status: cp.status,
          evidence: cp.evidence ?? undefined,
          fulfilledBy: cp.fulfilledBy ?? undefined,
          fulfilledAt: cp.fulfilledAt?.toISOString?.() ?? undefined,
          notes: cp.notes ?? undefined,
        })),
        blockingReasons: (s.blockingReasons as string[]) ?? [],
        releaseDecision: s.releaseDecision ?? undefined,
        releasedAt: s.releasedAt?.toISOString?.() ?? undefined,
        releasedBy: s.releasedBy ?? undefined,
        createdAt: s.createdAt?.toISOString?.() ?? String(s.createdAt),
        updatedAt: s.updatedAt?.toISOString?.() ?? String(s.updatedAt),
      };
    } catch (error) {
      console.warn('[EscrowSettlement] Read failed, using memory fallback:', (error as Error).message);
    }
  }
  return memorySettlements.find((s) => s.id === settlementId) ?? null;
}

/** List settlements, newest first. */
export async function listSettlements(filter: { status?: SettlementStatus; transactionId?: number; limit?: number } = {}) {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.select().from(escrowSettlements);
      const views = (await Promise.all(rows.map((r: any) => getSettlement(r.id)))).filter(Boolean) as SettlementView[];
      return views
        .filter((v) => (!filter.status || v.status === filter.status) && (!filter.transactionId || v.transactionId === filter.transactionId))
        .slice(0, filter.limit ?? 100);
    } catch (error) {
      console.warn('[EscrowSettlement] List failed, using memory fallback:', (error as Error).message);
    }
  }
  return memorySettlements
    .filter((v) => (!filter.status || v.status === filter.status) && (!filter.transactionId || v.transactionId === filter.transactionId))
    .slice(0, filter.limit ?? 100);
}

async function applyCheckpointUpdate(
  settlementId: number,
  checkpointKey: string,
  status: CheckpointStatus,
  actor: { userId?: number; notes?: string; evidence?: Record<string, any> }
): Promise<SettlementView> {
  const db = await getDb();
  const now = new Date();

  if (db) {
    try {
      const cps = await db
        .select()
        .from(settlementCheckpoints)
        .where(eq(settlementCheckpoints.settlementId, settlementId));
      const target = (cps as any[]).find((cp) => cp.checkpointKey === checkpointKey);
      if (!target) throw new Error(`Checkpoint "${checkpointKey}" not found on settlement ${settlementId}`);
      await db
        .update(settlementCheckpoints)
        .set({
          status,
          notes: actor.notes ?? target.notes,
          evidence: actor.evidence ?? target.evidence,
          fulfilledBy: status === 'fulfilled' ? actor.userId ?? null : status === 'waived' ? target.waivedBy : target.fulfilledBy,
          fulfilledAt: status === 'fulfilled' ? now : target.fulfilledAt,
          waivedBy: status === 'waived' ? actor.userId ?? null : target.waivedBy,
          updatedAt: now,
        })
        .where(eq(settlementCheckpoints.id, target.id));
      return recomputeSettlement(settlementId);
    } catch (error) {
      if ((error as Error).message.includes('not found')) throw error;
      console.warn('[EscrowSettlement] Checkpoint update failed, using memory fallback:', (error as Error).message);
    }
  }

  const settlement = memorySettlements.find((s) => s.id === settlementId);
  if (!settlement) throw new Error(`Settlement ${settlementId} not found`);
  const cp = settlement.checkpoints.find((c) => c.checkpointKey === checkpointKey);
  if (!cp) throw new Error(`Checkpoint "${checkpointKey}" not found on settlement ${settlementId}`);
  cp.status = status;
  cp.notes = actor.notes ?? cp.notes;
  cp.evidence = actor.evidence ?? cp.evidence;
  if (status === 'fulfilled') {
    cp.fulfilledBy = actor.userId;
    cp.fulfilledAt = now.toISOString();
  }
  settlement.blockingReasons = computeBlockingReasons(settlement.checkpoints);
  settlement.status = statusFromCheckpoints(settlement.checkpoints);
  settlement.updatedAt = now.toISOString();
  return settlement;
}

/** Recompute settlement status from checkpoint states (deterministic). */
export async function recomputeSettlement(settlementId: number): Promise<SettlementView> {
  const view = await getSettlement(settlementId);
  if (!view) throw new Error(`Settlement ${settlementId} not found`);
  if (view.status === 'released' || view.status === 'cancelled') return view;

  const blockingReasons = computeBlockingReasons(view.checkpoints);
  const status = statusFromCheckpoints(view.checkpoints);
  const releaseDecision = {
    evaluatedAt: new Date().toISOString(),
    decision: status === 'release_ready' ? 'release_ready' : status === 'blocked' ? 'blocked' : 'pending',
    requiredTotal: view.checkpoints.filter((c) => c.required).length,
    requiredSatisfied: view.checkpoints.filter((c) => c.required && (c.status === 'fulfilled' || c.status === 'waived')).length,
  };

  const db = await getDb();
  if (db) {
    try {
      await db
        .update(escrowSettlements)
        .set({ status, blockingReasons, releaseDecision, updatedAt: new Date() })
        .where(eq(escrowSettlements.id, settlementId));
      return (await getSettlement(settlementId)) as SettlementView;
    } catch (error) {
      console.warn('[EscrowSettlement] Recompute persist failed:', (error as Error).message);
    }
  }

  const settlement = memorySettlements.find((s) => s.id === settlementId);
  if (settlement) {
    settlement.status = status;
    settlement.blockingReasons = blockingReasons;
    settlement.releaseDecision = releaseDecision;
    settlement.updatedAt = new Date().toISOString();
  }
  return (await getSettlement(settlementId)) as SettlementView;
}

export const fulfillCheckpoint = (settlementId: number, key: string, userId?: number, evidence?: Record<string, any>, notes?: string) =>
  applyCheckpointUpdate(settlementId, key, 'fulfilled', { userId, evidence, notes });

export const waiveCheckpoint = (settlementId: number, key: string, userId?: number, notes?: string) =>
  applyCheckpointUpdate(settlementId, key, 'waived', { userId, notes });

export const failCheckpoint = (settlementId: number, key: string, userId?: number, notes?: string) =>
  applyCheckpointUpdate(settlementId, key, 'failed', { userId, notes });

/** Release funds/title once the settlement is release-ready. */
export async function releaseSettlement(settlementId: number, releasedBy?: number): Promise<SettlementView> {
  const view = await recomputeSettlement(settlementId);
  if (view.status !== 'release_ready') {
    throw new Error(`Settlement ${settlementId} is not release-ready (status: ${view.status}). Blocking: ${view.blockingReasons.join('; ')}`);
  }
  const now = new Date();
  const db = await getDb();
  if (db) {
    try {
      await db
        .update(escrowSettlements)
        .set({ status: 'released', releasedAt: now, releasedBy: releasedBy ?? null, updatedAt: now })
        .where(eq(escrowSettlements.id, settlementId));
      return (await getSettlement(settlementId)) as SettlementView;
    } catch (error) {
      console.warn('[EscrowSettlement] Release persist failed:', (error as Error).message);
    }
  }
  const settlement = memorySettlements.find((s) => s.id === settlementId);
  if (settlement) {
    settlement.status = 'released';
    settlement.releasedAt = now.toISOString();
    settlement.releasedBy = releasedBy;
    settlement.updatedAt = now.toISOString();
  }
  return (await getSettlement(settlementId)) as SettlementView;
}

/** Cancel a settlement that has not been released. */
export async function cancelSettlement(settlementId: number): Promise<SettlementView> {
  const view = await getSettlement(settlementId);
  if (!view) throw new Error(`Settlement ${settlementId} not found`);
  if (view.status === 'released') throw new Error('Released settlements cannot be cancelled');
  const db = await getDb();
  if (db) {
    try {
      await db.update(escrowSettlements).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(escrowSettlements.id, settlementId));
      return (await getSettlement(settlementId)) as SettlementView;
    } catch (error) {
      console.warn('[EscrowSettlement] Cancel persist failed:', (error as Error).message);
    }
  }
  const settlement = memorySettlements.find((s) => s.id === settlementId);
  if (settlement) settlement.status = 'cancelled';
  return (await getSettlement(settlementId)) as SettlementView;
}
