import { readJsonStore, writeJsonStore } from './jsonStore';

export interface OfflineMojaloopTransaction {
  transactionId: string;
  quoteId?: string | null;
  transferId?: string | null;
  userId: number;
  propertyId?: string | null;
  escrowContractAddress?: string | null;
  amount: number;
  currency: string;
  payerFspId: string;
  payerPartyIdType: string;
  payerPartyIdentifier: string;
  payerName?: string | null;
  payeeFspId: string;
  payeePartyIdType: string;
  payeePartyIdentifier: string;
  status: string;
  quoteAmount?: number | null;
  quoteFees?: number | null;
  quoteExpiration?: Date | null;
  transferCondition?: string | null;
  transferState?: string | null;
  transferFulfilment?: string | null;
  note?: string | null;
  transactionType: string;
  purpose?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  blockchainTxHash?: string | null;
  reconciledAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface OfflineMojaloopStore {
  transactions: OfflineMojaloopTransaction[];
}


function seededStore(): OfflineMojaloopStore {
  return {
    transactions: [
      {
        transactionId: 'offline-seed-mojaloop-1',
        quoteId: 'offline-quote-1',
        transferId: 'offline-transfer-1',
        userId: 1201,
        amount: 1000,
        currency: 'USD',
        payerFspId: 'test-fsp',
        payerPartyIdType: 'MSISDN',
        payerPartyIdentifier: '+2348012345678',
        payerName: 'Offline Payment User',
        payeeFspId: 'test-fsp',
        payeePartyIdType: 'MSISDN',
        payeePartyIdentifier: '+2348087654321',
        status: 'pending',
        quoteAmount: 1000,
        quoteFees: 0,
        quoteExpiration: new Date(Date.now() + 5 * 60 * 1000),
        transferCondition: 'offline-condition',
        transferState: 'RECEIVED',
        transferFulfilment: null,
        note: 'Seed Mojaloop transaction',
        transactionType: 'property_purchase',
        purpose: 'Seed payment',
        createdAt: new Date('2024-01-01T09:00:00.000Z'),
        updatedAt: new Date('2024-01-01T09:00:00.000Z'),
      },
    ],
  };
}

function revive(tx: OfflineMojaloopTransaction): OfflineMojaloopTransaction {
  return {
    ...tx,
    quoteExpiration: tx.quoteExpiration ? new Date(tx.quoteExpiration) : null,
    reconciledAt: tx.reconciledAt ? new Date(tx.reconciledAt) : null,
    completedAt: tx.completedAt ? new Date(tx.completedAt) : null,
    createdAt: new Date(tx.createdAt),
    updatedAt: new Date(tx.updatedAt),
  };
}

async function loadStore(): Promise<OfflineMojaloopStore> {
  return readJsonStore<OfflineMojaloopStore>('mojaloop-transactions', seededStore);
}

async function saveStore(store: OfflineMojaloopStore) {
  await writeJsonStore('mojaloop-transactions', store);
}

export async function createOfflineMojaloopTransaction(tx: OfflineMojaloopTransaction) {
  const store = await loadStore();
  store.transactions.unshift(tx);
  await saveStore(store);
  return tx;
}

export async function getOfflineMojaloopTransaction(transactionId: string) {
  const store = await loadStore();
  return store.transactions.find((tx) => tx.transactionId === transactionId) ?? null;
}

export async function listOfflineMojaloopTransactions(userId: number, limit = 10) {
  const store = await loadStore();
  return store.transactions.filter((tx) => tx.userId === userId).slice(0, limit);
}

export async function updateOfflineMojaloopTransaction(transactionId: string, patch: Partial<OfflineMojaloopTransaction>) {
  const store = await loadStore();
  const tx = store.transactions.find((item) => item.transactionId === transactionId);
  if (!tx) return null;
  Object.assign(tx, patch, { updatedAt: new Date() });
  await saveStore(store);
  return tx;
}
