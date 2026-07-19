import fs from 'fs';
import path from 'path';

export interface AgriculturalParcelRecord {
  id: number;
  parcelId: number;
  cropType: string;
  soilQuality: string;
  irrigationSystem: string;
  subsidyProgram: string;
  extensionOfficer: string;
  productivityIndex: number;
  weatherOutlook: string;
  createdAt: string;
}

interface AgriculturalStore {
  nextRecordId: number;
  parcels: AgriculturalParcelRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'agricultural-store.json');

function ensureDataDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

function defaultStore(): AgriculturalStore {
  return {
    nextRecordId: 3,
    parcels: [
      { id: 1, parcelId: 1201, cropType: 'maize', soilQuality: 'loamy, good organic content', irrigationSystem: 'solar drip line', subsidyProgram: 'Climate Smart Inputs Grant', extensionOfficer: 'Officer T. Abubakar', productivityIndex: 78, weatherOutlook: 'Stable rainfall over next 14 days', createdAt: '2026-07-17T07:00:00.000Z' },
      { id: 2, parcelId: 1202, cropType: 'cassava', soilQuality: 'sandy loam, moderate fertility', irrigationSystem: 'surface canal', subsidyProgram: 'Community Irrigation Support', extensionOfficer: 'Officer L. Okonkwo', productivityIndex: 69, weatherOutlook: 'High temperature period expected; irrigation advised', createdAt: '2026-07-17T07:20:00.000Z' },
    ],
  };
}

function loadStore(): AgriculturalStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as AgriculturalStore;
    if (!parsed || !Array.isArray(parsed.parcels)) {
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

function saveStore(store: AgriculturalStore) { ensureDataDir(); fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2)); }

export function getAgriculturalOverview() {
  const store = loadStore();
  return {
    parcels: store.parcels,
    metrics: {
      trackedParcels: store.parcels.length,
      averageProductivity: Math.round(store.parcels.reduce((sum, item) => sum + item.productivityIndex, 0) / Math.max(store.parcels.length, 1)),
      subsidyCoverage: store.parcels.filter((item) => item.subsidyProgram && item.subsidyProgram !== 'none').length,
    },
  };
}

export function createAgriculturalParcel(input: Omit<AgriculturalParcelRecord, 'id' | 'createdAt'>) {
  const store = loadStore();
  const created: AgriculturalParcelRecord = { id: store.nextRecordId++, createdAt: new Date().toISOString(), ...input };
  store.parcels.unshift(created);
  saveStore(store);
  return created;
}
