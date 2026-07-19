import fs from 'fs';
import path from 'path';

export interface HeritageSiteRecord {
  id: number;
  siteName: string;
  designation: string;
  overlayZone: string;
  archaeologicalRequirement: string;
  monitoringStatus: 'active' | 'review';
  unescoReference: string | null;
  createdAt: string;
}

export interface HeritageClearanceRecord {
  id: number;
  parcelId: number;
  siteName: string;
  impactAssessment: string;
  status: 'pending' | 'approved' | 'conditional';
  createdAt: string;
}

interface HeritageStore {
  nextSiteId: number;
  nextClearanceId: number;
  sites: HeritageSiteRecord[];
  clearances: HeritageClearanceRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'heritage-store.json');

function ensureDataDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

function defaultStore(): HeritageStore {
  return {
    nextSiteId: 3,
    nextClearanceId: 3,
    sites: [
      { id: 1, siteName: 'Old River Settlement', designation: 'National Heritage Monument', overlayZone: 'Buffer Overlay A', archaeologicalRequirement: 'Pre-construction cultural materials review', monitoringStatus: 'active', unescoReference: null, createdAt: '2026-07-17T08:00:00.000Z' },
      { id: 2, siteName: 'Royal Trade Route Corridor', designation: 'Candidate Cultural Landscape', overlayZone: 'Corridor Overlay B', archaeologicalRequirement: 'Field archaeology walkover required', monitoringStatus: 'review', unescoReference: 'UNESCO-TENTATIVE-RT-01', createdAt: '2026-07-17T08:20:00.000Z' },
    ],
    clearances: [
      { id: 1, parcelId: 1130, siteName: 'Old River Settlement', impactAssessment: 'Moderate impact; maintain 30m buffer and interpretation signage.', status: 'conditional', createdAt: '2026-07-17T09:00:00.000Z' },
      { id: 2, parcelId: 1131, siteName: 'Royal Trade Route Corridor', impactAssessment: 'Low impact after route adjustment and heritage-monitoring plan.', status: 'approved', createdAt: '2026-07-17T09:30:00.000Z' },
    ],
  };
}

function loadStore(): HeritageStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as HeritageStore;
    if (!parsed || !Array.isArray(parsed.sites) || !Array.isArray(parsed.clearances)) {
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

function saveStore(store: HeritageStore) { ensureDataDir(); fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2)); }

export function getHeritageOverview() {
  const store = loadStore();
  return {
    sites: store.sites,
    clearances: store.clearances,
    metrics: {
      protectedSites: store.sites.length,
      activeMonitoring: store.sites.filter((item) => item.monitoringStatus === 'active').length,
      unescoLinked: store.sites.filter((item) => Boolean(item.unescoReference)).length,
    },
  };
}

export function createHeritageSite(input: Omit<HeritageSiteRecord, 'id' | 'createdAt'>) {
  const store = loadStore();
  const created: HeritageSiteRecord = { id: store.nextSiteId++, createdAt: new Date().toISOString(), ...input };
  store.sites.unshift(created); saveStore(store); return created;
}

export function createHeritageClearance(input: Omit<HeritageClearanceRecord, 'id' | 'createdAt'>) {
  const store = loadStore();
  const created: HeritageClearanceRecord = { id: store.nextClearanceId++, createdAt: new Date().toISOString(), ...input };
  store.clearances.unshift(created); saveStore(store); return created;
}
