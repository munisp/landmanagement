/**
 * Payment repository — PostgreSQL-backed.
 *
 * Persists to the `payments` table (migration 0012).
 *
 * Honest payment lifecycle: every payment is created with status 'pending'.
 * A payment reaches 'completed' ONLY through confirmPaymentRecord(), which is
 * the reconciliation path invoked by provider webhooks (Mojaloop transfer
 * confirmation, card processor callback, bank statement matching) or by a
 * registrar confirming manual settlement. No method auto-completes at
 * creation time — the previous instant-completion behaviour was a simulation
 * and has been removed.
 */

import { desc, eq } from 'drizzle-orm';
import { payments, type Payment } from '../drizzle/schema';
import { requireDb } from './db';
import { generateTransactionId } from './mojaloopClient';
import { advanceTransaction, getTransactionById } from './transactionRepository';

export type PaymentMethod = 'mojaloop' | 'tigerbeetle' | 'card' | 'bank_transfer' | 'ussd';
export type PaymentStatus = 'initiated' | 'pending' | 'completed' | 'failed';

export interface PaymentRecord {
  id: number;
  transactionId: number;
  payerId: number;
  amount: number;
  feeAmount: number;
  totalAmount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string;
  receiptNumber?: string;
  channelReference?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  ussdCode?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

const SETTLEMENT_BANK = {
  bankName: 'First Bank of Nigeria',
  bankAccountName: 'IDLR-PTS Collections',
  bankAccountNumber: '1234567890',
} as const;

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function toRecord(row: Payment): PaymentRecord {
  return {
    id: row.id,
    transactionId: row.transactionId,
    payerId: row.payerId,
    amount: row.amount,
    feeAmount: row.feeAmount,
    totalAmount: row.totalAmount,
    currency: row.currency,
    method: row.method as PaymentMethod,
    status: row.status as PaymentStatus,
    reference: row.reference,
    receiptNumber: row.receiptNumber ?? undefined,
    channelReference: row.channelReference ?? undefined,
    bankName: row.bankName ?? undefined,
    bankAccountName: row.bankAccountName ?? undefined,
    bankAccountNumber: row.bankAccountNumber ?? undefined,
    ussdCode: row.ussdCode ?? undefined,
    paidAt: toIso(row.paidAt),
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

function calculateFee(amount: number) {
  const raw = amount * 0.0325;
  return Math.max(2500, Math.min(raw, 5000000));
}

function buildReference(prefix: string, id: number) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(id).padStart(5, '0')}`;
}

function buildChannelReference(method: PaymentMethod, id: number): string {
  switch (method) {
    case 'mojaloop':
      // Real Mojaloop transaction id from the platform's FSPIOP client.
      return generateTransactionId();
    case 'tigerbeetle':
      // TigerBeetle transfer id — the ledger posting is created by the
      // TigerBeetle bridge when the transfer is submitted for clearing.
      return crypto.randomUUID();
    case 'card':
      return buildReference('CARD', id);
    case 'ussd':
      return buildReference('USSD', id);
    default:
      return buildReference('BANK', id);
  }
}

export async function listPaymentsByTransaction(transactionId: number): Promise<PaymentRecord[]> {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.transactionId, transactionId))
    .orderBy(desc(payments.createdAt));
  return rows.map(toRecord);
}

export async function getPaymentById(id: number): Promise<PaymentRecord | null> {
  const db = await requireDb();
  const rows = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function getLatestPaymentForTransaction(transactionId: number): Promise<PaymentRecord | null> {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.transactionId, transactionId))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function processPaymentRecord(input: {
  transactionId: number;
  payerId: number;
  amount: number;
  currency?: string;
  method: PaymentMethod;
}): Promise<PaymentRecord> {
  const db = await requireDb();

  const transaction = await getTransactionById(input.transactionId);
  if (!transaction) {
    throw new Error('Transaction not found');
  }

  const existingPayments = await db
    .select()
    .from(payments)
    .where(eq(payments.transactionId, input.transactionId));
  const completed = existingPayments.find((payment) => payment.status === 'completed');
  if (completed) {
    return toRecord(completed);
  }

  const feeAmount = calculateFee(input.amount);

  // Insert with a placeholder unique reference, then assign the canonical
  // reference derived from the identity id, all in one transaction.
  const record = await db.transaction(async (tx) => {
    const tempReference = `PENDING-${crypto.randomUUID()}`;
    const inserted = await tx
      .insert(payments)
      .values({
        transactionId: input.transactionId,
        payerId: input.payerId,
        amount: input.amount,
        feeAmount,
        totalAmount: input.amount + feeAmount,
        currency: input.currency || 'NGN',
        method: input.method,
        status: 'pending',
        reference: tempReference,
        bankName: SETTLEMENT_BANK.bankName,
        bankAccountName: SETTLEMENT_BANK.bankAccountName,
        bankAccountNumber: SETTLEMENT_BANK.bankAccountNumber,
      })
      .returning();

    const row = inserted[0];
    const reference = buildReference('PAY', row.id);
    const updated = await tx
      .update(payments)
      .set({
        reference,
        channelReference: buildChannelReference(input.method, row.id),
        ussdCode: input.method === 'ussd' ? `*737*000*${row.id}#` : null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, row.id))
      .returning();

    return updated[0];
  });

  return toRecord(record);
}

export async function confirmPaymentRecord(id: number): Promise<PaymentRecord> {
  const db = await requireDb();

  const existing = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  if (!existing[0]) {
    throw new Error('Payment not found');
  }
  if (existing[0].status === 'completed') {
    return toRecord(existing[0]);
  }

  const now = new Date();
  const receiptNumber = existing[0].receiptNumber || buildReference('RCP', existing[0].id);
  const updated = await db
    .update(payments)
    .set({ status: 'completed', receiptNumber, paidAt: now, updatedAt: now })
    .where(eq(payments.id, id))
    .returning();

  try {
    const transaction = await getTransactionById(existing[0].transactionId);
    if (transaction && transaction.status !== 'completed') {
      await advanceTransaction(existing[0].transactionId, 'complete');
    }
  } catch {
    // Preserve payment state even if transaction advancement fails.
  }

  return toRecord(updated[0]);
}

export async function buildPaymentReceipt(transactionId: number) {
  const payment = await getLatestPaymentForTransaction(transactionId);
  const transaction = await getTransactionById(transactionId);

  if (!payment || !transaction) {
    throw new Error('Receipt data not found');
  }

  return {
    payment,
    transaction,
    issuedAt: new Date().toISOString(),
    remittanceBank: payment.bankName || SETTLEMENT_BANK.bankName,
    remittanceAccountName: payment.bankAccountName || SETTLEMENT_BANK.bankAccountName,
    remittanceAccountNumber: payment.bankAccountNumber || SETTLEMENT_BANK.bankAccountNumber,
  };
}
