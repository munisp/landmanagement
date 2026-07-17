import fs from 'fs';
import path from 'path';

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

interface TransactionStore {
  transactions: TransactionRecord[];
  nextId: number;
}

const dataDir = path.join(process.cwd(), 'server', 'data');
const storePath = path.join(dataDir, 'transaction-store.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function seededTransactions(): TransactionRecord[] {
  return [
    {
      id: 1,
      type: 'transfer',
      parcelId: 1,
      initiatorId: 1,
      initiatorName: 'Amina Bello',
      counterpartyName: 'Femi Adeyemi',
      titleId: 1,
      status: 'pending_approval',
      considerationAmount: 175000000,
      workflowStage: 'registry_review',
      paymentStatus: 'pending',
      documentStatus: 'verified',
      notes: 'Awaiting registrar approval before payment release.',
      createdAt: '2024-03-10T09:00:00.000Z',
      updatedAt: '2024-03-12T14:00:00.000Z',
    },
    {
      id: 2,
      type: 'mortgage_registration',
      parcelId: 4,
      initiatorId: 4,
      initiatorName: 'Industrial Assets Limited',
      counterpartyName: 'Unity Commercial Bank',
      titleId: 4,
      status: 'registered',
      considerationAmount: 120000000,
      workflowStage: 'registry_completed',
      paymentStatus: 'paid',
      documentStatus: 'verified',
      notes: 'Mortgage interest fully noted on title.',
      createdAt: '2024-02-15T09:00:00.000Z',
      updatedAt: '2024-02-20T15:00:00.000Z',
    },
    {
      id: 3,
      type: 'title_perfection',
      parcelId: 3,
      initiatorId: 3,
      initiatorName: 'Musa Garba Farms',
      titleId: 3,
      status: 'in_review',
      considerationAmount: 3500000,
      workflowStage: 'governor_consent',
      paymentStatus: 'paid',
      documentStatus: 'submitted',
      notes: 'Consent package submitted to state land bureau.',
      createdAt: '2024-03-05T10:00:00.000Z',
      updatedAt: '2024-03-09T12:00:00.000Z',
    },
  ];
}

function initialStore(): TransactionStore {
  const transactions = seededTransactions();
  return {
    transactions,
    nextId: transactions.length + 1,
  };
}

function loadStore(): TransactionStore {
  ensureDataDir();
  if (!fs.existsSync(storePath)) {
    const initial = initialStore();
    fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
    return initial;
  }

  const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as TransactionStore;
  if (!parsed.transactions?.length) {
    const initial = initialStore();
    fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
    return initial;
  }

  return parsed;
}

function saveStore(store: TransactionStore) {
  ensureDataDir();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export function listTransactions(input: { status?: string; type?: string; page?: number; limit?: number }) {
  const store = loadStore();
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const filtered = store.transactions.filter((transaction) => {
    if (input.status && transaction.status !== input.status) return false;
    if (input.type && transaction.type !== input.type) return false;
    return true;
  });
  const start = (page - 1) * limit;
  return {
    transactions: filtered.slice(start, start + limit),
    total: filtered.length,
    page,
    limit,
  };
}

export function getTransactionById(id: number) {
  return loadStore().transactions.find((transaction) => transaction.id === id) ?? null;
}

export function createTransaction(input: {
  type: string;
  parcelId: number;
  initiatorId: number;
  initiatorName: string;
  counterpartyName?: string;
  titleId?: number;
  considerationAmount: number;
  notes?: string;
}) {
  const store = loadStore();
  const id = store.nextId;
  const now = new Date().toISOString();
  const record: TransactionRecord = {
    id,
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
    createdAt: now,
    updatedAt: now,
  };
  store.transactions.unshift(record);
  store.nextId += 1;
  saveStore(store);
  return record;
}

export function createImportedTransaction(input: {
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
}) {
  const store = loadStore();
  const id = store.nextId;
  const now = input.createdAt ?? new Date().toISOString();
  const record: TransactionRecord = {
    id,
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
    createdAt: now,
    updatedAt: now,
  };
  store.transactions.unshift(record);
  store.nextId += 1;
  saveStore(store);
  return record;
}

export function advanceTransaction(id: number, action: 'submit' | 'request_payment' | 'approve' | 'complete' | 'reject') {
  const store = loadStore();
  const transaction = store.transactions.find((item) => item.id === id);
  if (!transaction) {
    throw new Error('Transaction not found');
  }

  switch (action) {
    case 'submit':
      transaction.status = 'pending_approval';
      transaction.workflowStage = 'registry_review';
      transaction.documentStatus = transaction.documentStatus === 'pending' ? 'submitted' : transaction.documentStatus;
      break;
    case 'request_payment':
      transaction.status = 'pending_payment';
      transaction.workflowStage = 'fee_collection';
      transaction.paymentStatus = 'pending';
      break;
    case 'approve':
      transaction.status = 'registered';
      transaction.workflowStage = 'registry_completed';
      transaction.documentStatus = 'verified';
      break;
    case 'complete':
      transaction.status = 'completed';
      transaction.workflowStage = 'closed';
      transaction.paymentStatus = 'paid';
      transaction.documentStatus = 'verified';
      break;
    case 'reject':
      transaction.status = 'rejected';
      transaction.workflowStage = 'exception';
      break;
  }

  transaction.updatedAt = new Date().toISOString();
  saveStore(store);
  return transaction;
}
