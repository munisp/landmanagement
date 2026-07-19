import fs from 'fs';
import path from 'path';

export interface ForestReserveRecord {
  id: number;
  reserveName: string;
  boundaryDescription: string;
  deforestationStatus: string;
  loggingPermitStatus: string;
  reforestationPlan: string;
  carbonCreditEstimate: number;
  wildlifeCorridor: string;
  fireRiskLevel: string;
  createdAt: string;
}

interface ForestStore {
  nextRecordId: number;
  reserves: ForestReserveRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'forest-store.json');

function ensureDataDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

function defaultStore(): ForestStore {
  return {
    nextRecordId: 3,
    reserves: [
      { id: 1, reserveName: 'North Basin Forest Reserve', boundaryDescription: 'Northern ridge to floodplain buffer corridor', deforestationStatus: 'satellite review shows stable canopy with minor western-edge pressure', loggingPermitStatus: 'selective logging permit under monitored quota', reforestationPlan: 'native species enrichment planting on 14 hectares', carbonCreditEstimate: 4200, wildlifeCorridor: 'elephant and antelope migration corridor protected', fireRiskLevel: 'moderate dry-season risk', createdAt: '2026-07-17T05:30:00.000Z' },
      { id: 2, reserveName: 'Greenbelt Community Forest', boundaryDescription: 'Peri-urban reserve ring and watershed fringe', deforestationStatus: 'high roadside encroachment risk under review', loggingPermitStatus: 'logging suspended', reforestationPlan: 'community nursery and rapid replanting program', carbonCreditEstimate: 2800, wildlifeCorridor: 'avian corridor retained across stream buffer', fireRiskLevel: 'high dry-season risk', createdAt: '2026-07-17T05:45:00.000Z' },
    ],
  };
}

function loadStore(): ForestStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as ForestStore;
    if (!parsed || !Array.isArray(parsed.reserves)) {
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

function saveStore(store: ForestStore) { ensureDataDir(); fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2)); }

export function getForestOverview() {
  const store = loadStore();
  return {
    reserves: store.reserves,
    metrics: {
      trackedReserves: store.reserves.length,
      averageCarbonCreditEstimate: Math.round(store.reserves.reduce((sum, item) => sum + item.carbonCreditEstimate, 0) / Math.max(store.reserves.length, 1)),
    },
  };
}

export function createForestReserve(input: Omit<ForestReserveRecord, 'id' | 'createdAt'>) {
  const store = loadStore();
  const created: ForestReserveRecord = { id: store.nextRecordId++, createdAt: new Date().toISOString(), ...input };
  store.reserves.unshift(created);
  saveStore(store);
  return created;
}
