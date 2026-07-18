import { getBlockchainExplorerState } from './blockchainExplorerRepository';
import { readJsonStore, writeJsonStore } from './jsonStore';

type BlockchainTxStatus = 'pending' | 'confirmed' | 'failed';
type BlockchainTxType =
  | 'property_transfer'
  | 'escrow_creation'
  | 'escrow_deposit'
  | 'escrow_release';

export interface BlockchainTransactionRecord {
  id: number;
  transaction_hash: string;
  transaction_type: BlockchainTxType;
  parcel_id: number | null;
  status: BlockchainTxStatus;
  block_number: number | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface EscrowRecord {
  escrowId: number;
  parcelId: number;
  sellerAddress: string;
  buyerAddress: string;
  amount: string;
  status: 'created' | 'funded' | 'released';
  createdAt: string;
}

interface BlockchainTransactionsState {
  nextId: number;
  nextEscrowId: number;
  transactions: BlockchainTransactionRecord[];
  escrows: EscrowRecord[];
}

async function createSeedState(): Promise<BlockchainTransactionsState> {
  const explorer = await getBlockchainExplorerState();
  const transactions: BlockchainTransactionRecord[] = explorer.transactions.map((tx: any, index: number) => ({
    id: index + 1,
    transaction_hash: tx.txHash,
    transaction_type:
      tx.type === 'PROPERTY_TRANSFER'
        ? 'property_transfer'
        : tx.type === 'TITLE_ISSUANCE'
          ? 'escrow_release'
          : 'escrow_creation',
    parcel_id: Number.parseInt(tx.parcelId.replace(/\D/g, ''), 10) || index + 100,
    status: tx.status,
    block_number: tx.blockNumber,
    created_at: tx.timestamp,
    metadata: tx.data,
  }));

  return {
    nextId: transactions.length + 1,
    nextEscrowId: 1001,
    transactions,
    escrows: [],
  };
}

function getState(): Promise<BlockchainTransactionsState> {
  return readJsonStore<BlockchainTransactionsState>('blockchain-transactions-store', createSeedState);
}

function createHash(prefix: string, seed: number): string {
  return `0x${prefix}${String(seed).padStart(62 - prefix.length, 'a')}`;
}

export async function listBlockchainTransactions(input?: { parcelId?: number; limit?: number }) {
  const state = await getState();
  let items = [...state.transactions].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  if (typeof input?.parcelId === 'number') {
    items = items.filter((item) => item.parcel_id === input.parcelId);
  }
  if (typeof input?.limit === 'number') {
    items = items.slice(0, input.limit);
  }
  return items;
}

export async function createOfflinePropertyTransfer(input: {
  parcelId: number;
  newOwnerAddress: string;
  documentHash: string;
}) {
  const state = await getState();
  const transaction_hash = createHash('pt', state.nextId);
  state.transactions.unshift({
    id: state.nextId++,
    transaction_hash,
    transaction_type: 'property_transfer',
    parcel_id: input.parcelId,
    status: 'pending',
    block_number: null,
    created_at: new Date().toISOString(),
    metadata: {
      newOwnerAddress: input.newOwnerAddress,
      documentHash: input.documentHash,
      source: 'offline-continuity',
    },
  });
  await writeJsonStore('blockchain-transactions-store', state);
  return transaction_hash;
}

export async function createOfflineEscrow(input: {
  parcelId: number;
  sellerAddress: string;
  buyerAddress: string;
  amount: string;
}) {
  const state = await getState();
  const escrowId = state.nextEscrowId++;
  state.escrows.unshift({
    escrowId,
    parcelId: input.parcelId,
    sellerAddress: input.sellerAddress,
    buyerAddress: input.buyerAddress,
    amount: input.amount,
    status: 'created',
    createdAt: new Date().toISOString(),
  });
  state.transactions.unshift({
    id: state.nextId++,
    transaction_hash: createHash('es', escrowId),
    transaction_type: 'escrow_creation',
    parcel_id: input.parcelId,
    status: 'pending',
    block_number: null,
    created_at: new Date().toISOString(),
    metadata: {
      escrowId,
      sellerAddress: input.sellerAddress,
      buyerAddress: input.buyerAddress,
      amount: input.amount,
      source: 'offline-continuity',
    },
  });
  await writeJsonStore('blockchain-transactions-store', state);
  return escrowId;
}

export function estimateOfflineGas(transactionType: string) {
  const baseByType: Record<string, string> = {
    property_transfer: '210000000000000',
    escrow_create: '175000000000000',
    escrow_deposit: '95000000000000',
    escrow_release: '110000000000000',
  };
  return baseByType[transactionType] ?? '100000000000000';
}
