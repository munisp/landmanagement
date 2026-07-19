import fs from 'fs';
import path from 'path';

export interface UtilityConnectionRecord {
  id: number;
  parcelId: number;
  utilityType: 'electricity' | 'water' | 'sewage' | 'gas' | 'telecom';
  providerName: string;
  accountReference: string;
  status: 'pending' | 'active' | 'suspended' | 'closed';
  serviceAddress: string;
  createdAt: string;
  updatedAt: string;
}

export interface UtilityPaymentRecord {
  id: number;
  connectionId: number;
  amount: number;
  paymentMethod: 'bank_transfer' | 'card' | 'wallet';
  reference: string;
  paidAt: string;
}

export interface UtilityClearanceRecord {
  id: number;
  parcelId: number;
  certificateId: string;
  utilityTypes: string[];
  status: 'issued' | 'pending_review';
  issuedAt: string;
}

interface UtilityStore {
  nextConnectionId: number;
  nextPaymentId: number;
  nextClearanceId: number;
  connections: UtilityConnectionRecord[];
  payments: UtilityPaymentRecord[];
  clearances: UtilityClearanceRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'utility-store.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function defaultStore(): UtilityStore {
  return {
    nextConnectionId: 6,
    nextPaymentId: 4,
    nextClearanceId: 3,
    connections: [
      { id: 1, parcelId: 1101, utilityType: 'electricity', providerName: 'National Grid Distribution', accountReference: 'ELEC-1101-A', status: 'active', serviceAddress: 'Parcel 1101, Central District', createdAt: '2026-07-17T10:00:00.000Z', updatedAt: '2026-07-17T10:00:00.000Z' },
      { id: 2, parcelId: 1101, utilityType: 'water', providerName: 'Metro Water Board', accountReference: 'WTR-1101-A', status: 'active', serviceAddress: 'Parcel 1101, Central District', createdAt: '2026-07-17T10:05:00.000Z', updatedAt: '2026-07-17T10:05:00.000Z' },
      { id: 3, parcelId: 1102, utilityType: 'sewage', providerName: 'Urban Sanitation Authority', accountReference: 'SEW-1102-B', status: 'pending', serviceAddress: 'Parcel 1102, West Corridor', createdAt: '2026-07-17T10:10:00.000Z', updatedAt: '2026-07-17T10:10:00.000Z' },
      { id: 4, parcelId: 1103, utilityType: 'gas', providerName: 'City Gas Networks', accountReference: 'GAS-1103-C', status: 'active', serviceAddress: 'Parcel 1103, Commerce Avenue', createdAt: '2026-07-17T10:15:00.000Z', updatedAt: '2026-07-17T10:15:00.000Z' },
      { id: 5, parcelId: 1104, utilityType: 'telecom', providerName: 'FiberLink Infrastructure', accountReference: 'TEL-1104-D', status: 'active', serviceAddress: 'Parcel 1104, Innovation Park', createdAt: '2026-07-17T10:20:00.000Z', updatedAt: '2026-07-17T10:20:00.000Z' },
    ],
    payments: [
      { id: 1, connectionId: 1, amount: 185000, paymentMethod: 'bank_transfer', reference: 'PAY-UTIL-001', paidAt: '2026-07-17T11:00:00.000Z' },
      { id: 2, connectionId: 2, amount: 62000, paymentMethod: 'card', reference: 'PAY-UTIL-002', paidAt: '2026-07-17T11:10:00.000Z' },
      { id: 3, connectionId: 5, amount: 240000, paymentMethod: 'wallet', reference: 'PAY-UTIL-003', paidAt: '2026-07-17T11:15:00.000Z' },
    ],
    clearances: [
      { id: 1, parcelId: 1101, certificateId: 'UTIL-CLR-1101', utilityTypes: ['electricity', 'water'], status: 'issued', issuedAt: '2026-07-17T11:20:00.000Z' },
      { id: 2, parcelId: 1104, certificateId: 'UTIL-CLR-1104', utilityTypes: ['telecom'], status: 'pending_review', issuedAt: '2026-07-17T11:25:00.000Z' },
    ],
  };
}

function loadStore(): UtilityStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as UtilityStore;
    if (!parsed || !Array.isArray(parsed.connections) || !Array.isArray(parsed.payments) || !Array.isArray(parsed.clearances)) {
      const store = defaultStore();
      fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
      return store;
    }
    return parsed;
  } catch {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }
}

function saveStore(store: UtilityStore) {
  ensureDataDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function getUtilityOverview() {
  const store = loadStore();
  return {
    connections: store.connections,
    payments: store.payments.slice().sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()),
    clearances: store.clearances.slice().sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()),
    metrics: {
      activeConnections: store.connections.filter((item) => item.status === 'active').length,
      pendingConnections: store.connections.filter((item) => item.status === 'pending').length,
      issuedClearances: store.clearances.filter((item) => item.status === 'issued').length,
      totalPayments: store.payments.reduce((sum, payment) => sum + payment.amount, 0),
    },
  };
}

export function createUtilityConnection(input: Omit<UtilityConnectionRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  const store = loadStore();
  const now = new Date().toISOString();
  const created: UtilityConnectionRecord = { id: store.nextConnectionId++, createdAt: now, updatedAt: now, ...input };
  store.connections.unshift(created);
  saveStore(store);
  return created;
}

export function createUtilityClearance(input: { parcelId: number; utilityTypes: string[] }) {
  const store = loadStore();
  const created: UtilityClearanceRecord = {
    id: store.nextClearanceId++,
    parcelId: input.parcelId,
    certificateId: `UTIL-CLR-${input.parcelId}-${store.nextClearanceId}`,
    utilityTypes: input.utilityTypes,
    status: 'issued',
    issuedAt: new Date().toISOString(),
  };
  store.clearances.unshift(created);
  saveStore(store);
  return created;
}

export function recordUtilityPayment(input: { connectionId: number; amount: number; paymentMethod: UtilityPaymentRecord['paymentMethod'] }) {
  const store = loadStore();
  const created: UtilityPaymentRecord = {
    id: store.nextPaymentId++,
    connectionId: input.connectionId,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    reference: `PAY-UTIL-${String(store.nextPaymentId).padStart(4, '0')}`,
    paidAt: new Date().toISOString(),
  };
  store.payments.unshift(created);
  saveStore(store);
  return created;
}
