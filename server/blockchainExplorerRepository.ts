import { listTransactions } from './transactionRepository';
import { listAllDocuments } from './documentRepository';

export interface ExplorerTransactionRecord {
  txHash: string;
  blockNumber: number;
  timestamp: string;
  type: 'PROPERTY_TRANSFER' | 'PARCEL_REGISTRATION' | 'TITLE_ISSUANCE';
  parcelId: string;
  from: string;
  to: string;
  status: 'confirmed' | 'pending';
  confirmations: number;
  data: Record<string, string>;
}

async function seedTransactions(): Promise<ExplorerTransactionRecord[]> {
  const transactions = (await listTransactions({ limit: 3 })).transactions;
  const documents = await listAllDocuments();

  return transactions.slice(0, 3).map((tx: any, index: number) => ({
    txHash: tx.blockchainTxHash || `0x${String(tx.id).padStart(6, '0')}${'a'.repeat(58)}`,
    blockNumber: 1234500 + index,
    timestamp: tx.createdAt || new Date().toISOString(),
    type: index === 0 ? 'PROPERTY_TRANSFER' : index === 1 ? 'PARCEL_REGISTRATION' : 'TITLE_ISSUANCE',
    parcelId: tx.parcelId || `PARCEL-${tx.id}`,
    from: `0xfrom${String(tx.id).padStart(4, '0')}`,
    to: `0xto${String(tx.id).padStart(4, '0')}`,
    status: tx.status === 'completed' ? 'confirmed' : 'pending',
    confirmations: tx.status === 'completed' ? 240 - index * 12 : 3 + index,
    data: {
      parcelNumber: tx.parcelId || `PARCEL-${tx.id}`,
      transferAmount: `₦${Number(tx.amount || 0).toLocaleString()}`,
      titleNumber: `TN-${new Date(tx.createdAt || Date.now()).getFullYear()}-${String(tx.id).padStart(3, '0')}`,
      supportingDocument: documents[index]?.title || 'Registry supporting document',
    },
  }));
}

export async function getBlockchainExplorerState() {
  const transactions = await seedTransactions();
  return {
    latestBlock: Math.max(...transactions.map((tx) => tx.blockNumber)),
    totalTransactions: transactions.length,
    verifiedParcels: new Set(transactions.map((tx) => tx.parcelId)).size,
    uptime: '99.98%',
    transactions,
  };
}

export async function findBlockchainTransaction(query: string) {
  const state = await getBlockchainExplorerState();
  const normalized = query.trim().toLowerCase();
  return state.transactions.find((tx) => tx.txHash.toLowerCase().includes(normalized) || tx.parcelId.toLowerCase().includes(normalized)) || null;
}

export async function verifyBlockchainTransaction(hash: string) {
  const transaction = await findBlockchainTransaction(hash);
  if (!transaction) {
    return {
      verified: false,
      hash,
      message: 'Transaction not found on blockchain',
    };
  }

  return {
    verified: true,
    hash: transaction.txHash,
    blockNumber: transaction.blockNumber,
    timestamp: transaction.timestamp,
    parcelId: transaction.parcelId,
    transactionType: transaction.type.toLowerCase(),
    metadata: transaction.data,
    confirmations: transaction.confirmations,
    status: transaction.status,
  };
}
