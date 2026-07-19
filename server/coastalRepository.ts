import fs from 'fs';
import path from 'path';

export interface CoastalZoneRecord {
  id: number;
  parcelId: number;
  erosionRisk: string;
  setbackMeters: number;
  beachAccessPlan: string;
  marineProtectedArea: string;
  developmentPermitStatus: string;
  seaLevelImpactAssessment: string;
  coastalInfrastructure: string;
  createdAt: string;
}

interface CoastalStore {
  nextRecordId: number;
  zones: CoastalZoneRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'coastal-store.json');

function ensureDataDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

function defaultStore(): CoastalStore {
  return {
    nextRecordId: 3,
    zones: [
      { id: 1, parcelId: 1401, erosionRisk: 'moderate seasonal shoreline retreat', setbackMeters: 30, beachAccessPlan: 'Public access boardwalk retained along eastern edge', marineProtectedArea: 'Nearshore turtle nesting buffer', developmentPermitStatus: 'conditional permit review', seaLevelImpactAssessment: '0.35m rise scenario requires elevated utilities and drainage upgrade', coastalInfrastructure: 'revetment and drainage outfall monitoring active', createdAt: '2026-07-17T06:00:00.000Z' },
      { id: 2, parcelId: 1402, erosionRisk: 'low', setbackMeters: 25, beachAccessPlan: 'Shared access corridor maintained', marineProtectedArea: 'none', developmentPermitStatus: 'approved with dune preservation note', seaLevelImpactAssessment: 'Minimal impact under current scenario', coastalInfrastructure: 'stormwater culvert upgrade scheduled', createdAt: '2026-07-17T06:15:00.000Z' },
    ],
  };
}

function loadStore(): CoastalStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as CoastalStore;
    if (!parsed || !Array.isArray(parsed.zones)) {
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

function saveStore(store: CoastalStore) { ensureDataDir(); fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2)); }

export function getCoastalOverview() {
  const store = loadStore();
  return {
    zones: store.zones,
    metrics: {
      trackedZones: store.zones.length,
      averageSetback: Math.round(store.zones.reduce((sum, item) => sum + item.setbackMeters, 0) / Math.max(store.zones.length, 1)),
    },
  };
}

export function createCoastalZone(input: Omit<CoastalZoneRecord, 'id' | 'createdAt'>) {
  const store = loadStore();
  const created: CoastalZoneRecord = { id: store.nextRecordId++, createdAt: new Date().toISOString(), ...input };
  store.zones.unshift(created);
  saveStore(store);
  return created;
}
