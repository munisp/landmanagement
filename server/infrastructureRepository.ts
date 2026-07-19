import fs from 'fs';
import path from 'path';

export interface InfrastructureProjectRecord {
  id: number;
  projectName: string;
  roadNetworkSegment: string;
  rightOfWayStatus: string;
  projectTrackingStatus: string;
  utilityCorridor: string;
  landAcquisitionStatus: string;
  compensationEstimate: number;
  impactAssessment: string;
  createdAt: string;
}

interface InfrastructureStore {
  nextRecordId: number;
  projects: InfrastructureProjectRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'infrastructure-store.json');

function ensureDataDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

function defaultStore(): InfrastructureStore {
  return {
    nextRecordId: 3,
    projects: [
      { id: 1, projectName: 'East Ring Road Expansion', roadNetworkSegment: 'Ring Road Section A-B', rightOfWayStatus: 'surveyed with partial encroachment clearance', projectTrackingStatus: 'procurement and land-acquisition phase', utilityCorridor: 'dual water-power corridor coordination in progress', landAcquisitionStatus: '42 of 55 parcels negotiated', compensationEstimate: 285000000, impactAssessment: 'Moderate resettlement and traffic-diversion impact requiring staged mitigation.', createdAt: '2026-07-17T05:00:00.000Z' },
      { id: 2, projectName: 'Northern Rail Spur Utility Corridor', roadNetworkSegment: 'Rail reserve kilometer 12-18', rightOfWayStatus: 'protected corridor established', projectTrackingStatus: 'detailed design', utilityCorridor: 'telecom and drainage co-location approved', landAcquisitionStatus: 'corridor acquisition complete', compensationEstimate: 94000000, impactAssessment: 'Low environmental impact with wet-season drainage watch.', createdAt: '2026-07-17T05:10:00.000Z' },
    ],
  };
}

function loadStore(): InfrastructureStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as InfrastructureStore;
    if (!parsed || !Array.isArray(parsed.projects)) {
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

function saveStore(store: InfrastructureStore) { ensureDataDir(); fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2)); }

export function getInfrastructureOverview() {
  const store = loadStore();
  return {
    projects: store.projects,
    metrics: {
      trackedProjects: store.projects.length,
      totalCompensationEstimate: store.projects.reduce((sum, item) => sum + item.compensationEstimate, 0),
    },
  };
}

export function createInfrastructureProject(input: Omit<InfrastructureProjectRecord, 'id' | 'createdAt'>) {
  const store = loadStore();
  const created: InfrastructureProjectRecord = { id: store.nextRecordId++, createdAt: new Date().toISOString(), ...input };
  store.projects.unshift(created);
  saveStore(store);
  return created;
}
