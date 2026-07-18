/**
 * Registry transaction repository — PostgreSQL-backed.
 *
 * Persists to the `registry_transactions` table (migration 0012). The workflow
 * state machine (submit → request_payment → approve → complete / reject) is
 * unchanged from the previous implementation; only the storage engine changed.
 * There is no in-memory or file-store fallback.
 */

import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { registryTransactions, type RegistryTransaction } from '../drizzle/schema';
import { requireDb } from './db';

export type TransactionStatus =
  | 'draft'
  | 'pending_approval'
  | 'pending_payment'
  | 'in_review'
  | 'registered'
  | 'completed'
  | 'rejected';

export interface TransactionRecord {
  id: number;
  type: string;
  parcelId: number;
  initiatorId: number;
  initiatorName: string;
  counterpartyName?: string;
  titleId?: number;
  status: TransactionStatus;
  considerationAmount: number;
  workflowStage: string;
  paymentStatus: 'unpaid' | 'pending' | 'paid';
  documentStatus: 'pending' | 'submitted' | 'verified';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : value;
}

function toRecord(row: RegistryTransaction): TransactionRecord {
  return {
    id: row.id,
    type: row.type,
    parcelId: row.parcelId,
    initiatorId: row.initiatorId,
    initiatorName: row.initiatorName,
    counterpartyName: row.counterpartyName ?? undefined,
    titleId: row.titleId ?? undefined,
    status: row.status as TransactionStatus,
    considerationAmount: row.considerationAmount,
    workflowStage: row.workflowStage,
    paymentStatus: row.paymentStatus as TransactionRecord['paymentStatus'],
    documentStatus: row.documentStatus as TransactionRecord['documentStatus'],
    notes: row.notes ?? undefined,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export async function listTransactions(input: { status?: string; type?: string; page?: number; limit?: number }) {
  const db = await requireDb();
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;

  const conditions: SQL[] = [];
  if (input.status) conditions.push(eq(registryTransactions.status, input.status));
  if (input.type) conditions.push(eq(registryTransactions.type, input.type));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(registryTransactions)
    .where(where);

  const rows = await db
    .select()
    .from(registryTransactions)
    .where(where)
    .orderBy(desc(registryTransactions.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    transactions: rows.map(toRecord),
    total: count,
    page,
    limit,
  };
}

export async function getTransactionById(id: number): Promise<TransactionRecord | null> {
  const db = await requireDb();
  const rows = await db.select().from(registryTransactions).where(eq(registryTransactions.id, id)).limit(1);
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function createTransaction(input: {
  type: string;
  parcelId: number;
  initiatorId: number;
  initiatorName: string;
  counterpartyName?: string;
  titleId?: number;
  considerationAmount: number;
  notes?: string;
}): Promise<TransactionRecord> {
  const db = await requireDb();
  const inserted = await db
    .insert(registryTransactions)
    .values({
      type: input.type,
      parcelId: input.parcelId,
      initiatorId: input.initiatorId,
      initiatorName: input.initiatorName,
      counterpartyName: input.counterpartyName,
      titleId: input.titleId,
      status: 'pending_approval',
      considerationAmount: input.considerationAmount,
      workflowStage: 'submission',
      paymentStatus: 'unpaid',
      documentStatus: 'pending',
      notes: input.notes,
    })
    .returning();
  return toRecord(inserted[0]);
}

export async function createImportedTransaction(input: {
  externalReference: string;
  type: string;
  parcelId: number;
  initiatorId: number;
  initiatorName: string;
  counterpartyName?: string;
  considerationAmount: number;
  status: TransactionRecord['status'];
  workflowStage: TransactionRecord['workflowStage'];
  paymentStatus: TransactionRecord['paymentStatus'];
  documentStatus: TransactionRecord['documentStatus'];
  notes?: string;
  createdAt?: string;
}): Promise<TransactionRecord> {
  const db = await requireDb();
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();
  const inserted = await db
    .insert(registryTransactions)
    .values({
      externalReference: input.externalReference,
      type: input.type,
      parcelId: input.parcelId,
      initiatorId: input.initiatorId,
      initiatorName: input.initiatorName,
      counterpartyName: input.counterpartyName,
      status: input.status,
      workflowStage: input.workflowStage,
      paymentStatus: input.paymentStatus,
      documentStatus: input.documentStatus,
      considerationAmount: input.considerationAmount,
      notes: input.notes ?? `Imported transaction ${input.externalReference}`,
      createdAt,
      updatedAt: createdAt,
    })
    .returning();
  return toRecord(inserted[0]);
}

const ADVANCE_ACTIONS: Record<
  'submit' | 'request_payment' | 'approve' | 'complete' | 'reject',
  Partial<typeof registryTransactions.$inferInsert>
> = {
  submit: { status: 'pending_approval', workflowStage: 'registry_review' },
  request_payment: { status: 'pending_payment', workflowStage: 'fee_collection', paymentStatus: 'pending' },
  approve: { status: 'registered', workflowStage: 'registry_completed', documentStatus: 'verified' },
  complete: { status: 'completed', workflowStage: 'closed', paymentStatus: 'paid', documentStatus: 'verified' },
  reject: { status: 'rejected', workflowStage: 'exception' },
};

export async function advanceTransaction(
  id: number,
  action: 'submit' | 'request_payment' | 'approve' | 'complete' | 'reject',
): Promise<TransactionRecord> {
  const db = await requireDb();

  const existing = await db.select().from(registryTransactions).where(eq(registryTransactions.id, id)).limit(1);
  if (!existing[0]) {
    throw new Error('Transaction not found');
  }

  const patch: Partial<typeof registryTransactions.$inferInsert> = {
    ...ADVANCE_ACTIONS[action],
    updatedAt: new Date(),
  };

  // 'submit' promotes document status pending → submitted but never demotes.
  if (action === 'submit' && existing[0].documentStatus === 'pending') {
    patch.documentStatus = 'submitted';
  }

  const updated = await db
    .update(registryTransactions)
    .set(patch)
    .where(eq(registryTransactions.id, id))
    .returning();
  return toRecord(updated[0]);
}
