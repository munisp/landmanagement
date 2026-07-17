import fs from 'fs';
import path from 'path';
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

interface PaymentStore {
  payments: PaymentRecord[];
  nextId: number;
}

const dataDir = path.join(process.cwd(), 'server', 'data');
const storePath = path.join(dataDir, 'payment-store.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function calculateFee(amount: number) {
  const raw = amount * 0.0325;
  return Math.max(2500, Math.min(raw, 5000000));
}

function buildReference(prefix: string, id: number) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(id).padStart(5, '0')}`;
}

function buildSeedStore(): PaymentStore {
  const completedAt = '2024-02-20T15:30:00.000Z';
  const amount = 120000000;
  const feeAmount = calculateFee(amount);

  return {
    payments: [
      {
        id: 1,
        transactionId: 2,
        payerId: 4,
        amount,
        feeAmount,
        totalAmount: amount + feeAmount,
        currency: 'NGN',
        method: 'bank_transfer',
        status: 'completed',
        reference: 'PAY-20240220-00001',
        receiptNumber: 'RCP-20240220-00001',
        channelReference: 'BANK-UNITY-20240220-4411',
        bankName: 'First Bank of Nigeria',
        bankAccountName: 'IDLR-PTS Collections',
        bankAccountNumber: '1234567890',
        paidAt: completedAt,
        createdAt: completedAt,
        updatedAt: completedAt,
      },
    ],
    nextId: 2,
  };
}

function loadStore(): PaymentStore {
  ensureDataDir();
  if (!fs.existsSync(storePath)) {
    const initial = buildSeedStore();
    fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
    return initial;
  }

  const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as PaymentStore;
  if (!Array.isArray(parsed.payments)) {
    const initial = buildSeedStore();
    fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
    return initial;
  }

  return parsed;
}

function saveStore(store: PaymentStore) {
  ensureDataDir();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export function listPaymentsByTransaction(transactionId: number) {
  return loadStore().payments.filter((payment) => payment.transactionId === transactionId);
}

export function getPaymentById(id: number) {
  return loadStore().payments.find((payment) => payment.id === id) ?? null;
}

export function getLatestPaymentForTransaction(transactionId: number) {
  const payments = listPaymentsByTransaction(transactionId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return payments[0] ?? null;
}

export function processPaymentRecord(input: {
  transactionId: number;
  payerId: number;
  amount: number;
  currency?: string;
  method: PaymentMethod;
}) {
  const transaction = getTransactionById(input.transactionId);
  if (!transaction) {
    throw new Error('Transaction not found');
  }

  const store = loadStore();
  const existingCompleted = store.payments.find(
    (payment) => payment.transactionId === input.transactionId && payment.status === 'completed',
  );
  if (existingCompleted) {
    return existingCompleted;
  }

  const id = store.nextId;
  const now = new Date().toISOString();
  const feeAmount = calculateFee(input.amount);
  const reference = buildReference('PAY', id);
  const receiptNumber = buildReference('RCP', id);
  const methodStatus: PaymentStatus = input.method === 'bank_transfer' ? 'pending' : 'completed';

  const payment: PaymentRecord = {
    id,
    transactionId: input.transactionId,
    payerId: input.payerId,
    amount: input.amount,
    feeAmount,
    totalAmount: input.amount + feeAmount,
    currency: input.currency || 'NGN',
    method: input.method,
    status: methodStatus,
    reference,
    receiptNumber: methodStatus === 'completed' ? receiptNumber : undefined,
    channelReference: input.method === 'mojaloop'
      ? buildReference('MOJA', id)
      : input.method === 'tigerbeetle'
        ? buildReference('LEDGER', id)
        : input.method === 'card'
          ? buildReference('CARD', id)
          : input.method === 'ussd'
            ? buildReference('USSD', id)
            : buildReference('BANK', id),
    bankName: 'First Bank of Nigeria',
    bankAccountName: 'IDLR-PTS Collections',
    bankAccountNumber: '1234567890',
    ussdCode: input.method === 'ussd' ? `*737*000*${id}#` : undefined,
    paidAt: methodStatus === 'completed' ? now : undefined,
    createdAt: now,
    updatedAt: now,
  };

  store.payments.unshift(payment);
  store.nextId += 1;
  saveStore(store);

  if (methodStatus === 'completed' && transaction.status !== 'completed') {
    try {
      advanceTransaction(input.transactionId, 'complete');
    } catch (error) {
      // Ignore transaction advancement failures to preserve payment continuity.
    }
  }

  return payment;
}

export function confirmPaymentRecord(id: number) {
  const store = loadStore();
  const payment = store.payments.find((item) => item.id === id);
  if (!payment) {
    throw new Error('Payment not found');
  }

  if (payment.status === 'completed') {
    return payment;
  }

  payment.status = 'completed';
  payment.receiptNumber = payment.receiptNumber || buildReference('RCP', payment.id);
  payment.paidAt = new Date().toISOString();
  payment.updatedAt = payment.paidAt;
  saveStore(store);

  try {
    const transaction = getTransactionById(payment.transactionId);
    if (transaction && transaction.status !== 'completed') {
      advanceTransaction(payment.transactionId, 'complete');
    }
  } catch (error) {
    // Preserve payment state even if transaction advancement fails.
  }

  return payment;
}

export function buildPaymentReceipt(transactionId: number) {
  const payment = getLatestPaymentForTransaction(transactionId);
  const transaction = getTransactionById(transactionId);

  if (!payment || !transaction) {
    throw new Error('Receipt data not found');
  }

  return {
    payment,
    transaction,
    issuedAt: new Date().toISOString(),
    remittanceBank: payment.bankName || 'First Bank of Nigeria',
    remittanceAccountName: payment.bankAccountName || 'IDLR-PTS Collections',
    remittanceAccountNumber: payment.bankAccountNumber || '1234567890',
  };
}
