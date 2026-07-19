import fs from 'fs';
import path from 'path';

export interface MiningRightRecord {
  id: number;
  parcelId: number;
  licenseName: string;
  mineralType: string;
  demarcationStatus: string;
  royaltyRate: number;
  environmentalCompliance: string;
  closurePlan: string;
  transferWorkflowStatus: string;
  createdAt: string;
}

interface MiningStore {
  nextRecordId: number;
  rights: MiningRightRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'mining-store.json');

function ensureDataDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

function defaultStore(): MiningStore {
  return {
    nextRecordId: 3,
    rights: [
      { id: 1, parcelId: 1301, licenseName: 'Sand Extraction Permit A', mineralType: 'silica sand', demarcationStatus: 'surveyed and beaconed', royaltyRate: 4.5, environmentalCompliance: 'Quarterly reclamation monitoring active', closurePlan: 'Progressive restoration and water-body stabilization', transferWorkflowStatus: 'inactive', createdAt: '2026-07-17T06:30:00.000Z' },
      { id: 2, parcelId: 1302, licenseName: 'Granite Quarry Lease B', mineralType: 'granite', demarcationStatus: 'demarcation review pending', royaltyRate: 6.2, environmentalCompliance: 'Dust and blasting controls under review', closurePlan: 'Bench restoration and vegetation recovery plan filed', transferWorkflowStatus: 'draft transfer review', createdAt: '2026-07-17T06:45:00.000Z' },
    ],
  };
}

function loadStore(): MiningStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as MiningStore;
    if (!parsed || !Array.isArray(parsed.rights)) {
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

function saveStore(store: MiningStore) { ensureDataDir(); fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2)); }

export function getMiningOverview() {
  const store = loadStore();
  return {
    rights: store.rights,
    metrics: {
      activeLicenses: store.rights.length,
      averageRoyaltyRate: Number((store.rights.reduce((sum, item) => sum + item.royaltyRate, 0) / Math.max(store.rights.length, 1)).toFixed(2)),
    },
  };
}

export function createMiningRight(input: Omit<MiningRightRecord, 'id' | 'createdAt'>) {
  const store = loadStore();
  const created: MiningRightRecord = { id: store.nextRecordId++, createdAt: new Date().toISOString(), ...input };
  store.rights.unshift(created);
  saveStore(store);
  return created;
}
