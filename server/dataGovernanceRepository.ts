import fs from 'fs';
import path from 'path';

export interface DataGovernanceRecord {
  id: number;
  domain: string;
  qualityScore: number;
  cleansingStatus: string;
  lineagePath: string;
  masterRecord: string;
  catalogEntry: string;
  governancePolicy: string;
  createdAt: string;
}

interface DataGovernanceStore {
  nextRecordId: number;
  records: DataGovernanceRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'data-governance-store.json');

function ensureDataDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

function defaultStore(): DataGovernanceStore {
  return {
    nextRecordId: 3,
    records: [
      { id: 1, domain: 'parcel_registry', qualityScore: 92, cleansingStatus: 'duplicate parcel aliases normalized', lineagePath: 'survey intake → parcel validation → title issuance → analytics export', masterRecord: 'parcel master record LG-VI-2024-001', catalogEntry: 'Registry parcel canonical dataset', governancePolicy: 'Parcel records require source traceability, steward approval, and retention tags.', createdAt: '2026-07-17T04:40:00.000Z' },
      { id: 2, domain: 'transaction_ledger', qualityScore: 88, cleansingStatus: 'status inconsistencies flagged for steward review', lineagePath: 'transaction intake → workflow approvals → payment reconciliation → reporting warehouse', masterRecord: 'transaction master workflow sequence', catalogEntry: 'Operational transaction canonical stream', governancePolicy: 'Transaction records must preserve audit lineage and reconciliation state.', createdAt: '2026-07-17T04:55:00.000Z' },
    ],
  };
}

function loadStore(): DataGovernanceStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as DataGovernanceStore;
    if (!parsed || !Array.isArray(parsed.records)) {
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

function saveStore(store: DataGovernanceStore) { ensureDataDir(); fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2)); }

export function getDataGovernanceOverview() {
  const store = loadStore();
  return {
    records: store.records,
    metrics: {
      governedDomains: store.records.length,
      averageQualityScore: Math.round(store.records.reduce((sum, item) => sum + item.qualityScore, 0) / Math.max(store.records.length, 1)),
    },
  };
}

export function createDataGovernanceRecord(input: Omit<DataGovernanceRecord, 'id' | 'createdAt'>) {
  const store = loadStore();
  const created: DataGovernanceRecord = { id: store.nextRecordId++, createdAt: new Date().toISOString(), ...input };
  store.records.unshift(created);
  saveStore(store);
  return created;
}
