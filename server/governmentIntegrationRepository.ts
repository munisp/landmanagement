import fs from 'fs';
import path from 'path';

export interface GovernmentIntegrationStatusRecord {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'active' | 'maintenance';
  endpoint: string;
  lastSync: string;
}

export interface GovernmentVerificationRecord {
  id: number;
  type: 'NIN Verification' | 'BVN Verification' | 'CAC Verification' | 'Tax Verification';
  identifier: string;
  name: string;
  status: 'verified' | 'failed';
  timestamp: string;
}

interface GovernmentIntegrationStore {
  integrations: GovernmentIntegrationStatusRecord[];
  recentVerifications: GovernmentVerificationRecord[];
  nextId: number;
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'government-integration-store.json');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function defaultStore(): GovernmentIntegrationStore {
  return {
    integrations: [
      { id: 'npc', name: 'National Population Commission (NPC)', description: 'Verify citizen identity using NIN', icon: 'Users', status: 'active', endpoint: '/api/gov/npc/verify', lastSync: '2026-05-14T10:00:00.000Z' },
      { id: 'firs', name: 'Federal Inland Revenue Service (FIRS)', description: 'Tax verification and compliance checks', icon: 'CreditCard', status: 'active', endpoint: '/api/gov/firs/verify', lastSync: '2026-05-14T11:00:00.000Z' },
      { id: 'cac', name: 'Corporate Affairs Commission (CAC)', description: 'Business registry and company verification', icon: 'Building2', status: 'active', endpoint: '/api/gov/cac/verify', lastSync: '2026-05-14T11:30:00.000Z' },
      { id: 'nipost', name: 'Nigerian Postal Service (NIPOST)', description: 'Address verification and validation', icon: 'MapPin', status: 'active', endpoint: '/api/gov/nipost/verify', lastSync: '2026-05-14T10:45:00.000Z' },
      { id: 'inec', name: 'Independent National Electoral Commission (INEC)', description: 'Voter registration verification', icon: 'Vote', status: 'active', endpoint: '/api/gov/inec/verify', lastSync: '2026-05-14T09:00:00.000Z' },
      { id: 'frsc', name: 'Federal Road Safety Corps (FRSC)', description: "Driver's license verification", icon: 'Shield', status: 'maintenance', endpoint: '/api/gov/frsc/verify', lastSync: '2026-05-13T12:00:00.000Z' },
    ],
    recentVerifications: [
      { id: 1, type: 'NIN Verification', identifier: '12345678901', name: 'Amina Bello', status: 'verified', timestamp: '2026-05-14T14:30:00.000Z' },
      { id: 2, type: 'BVN Verification', identifier: '22334455667', name: 'Ifeanyi Okafor', status: 'verified', timestamp: '2026-05-14T13:15:00.000Z' },
      { id: 3, type: 'CAC Verification', identifier: 'RC1234567', name: 'Crest Holdings Limited', status: 'verified', timestamp: '2026-05-14T12:00:00.000Z' },
      { id: 4, type: 'Tax Verification', identifier: '12345678-0001', name: 'Northern Estates Consortium', status: 'failed', timestamp: '2026-05-14T11:45:00.000Z' },
    ],
    nextId: 5,
  };
}

function loadStore(): GovernmentIntegrationStore {
  ensureDir();
  if (!fs.existsSync(STORE_PATH)) {
    const seeded = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(seeded, null, 2));
    return seeded;
  }
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as GovernmentIntegrationStore;
  } catch {
    const seeded = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(seeded, null, 2));
    return seeded;
  }
}

function writeStore(store: GovernmentIntegrationStore) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function getGovernmentIntegrationState() {
  return loadStore();
}

export function recordGovernmentVerification(input: Omit<GovernmentVerificationRecord, 'id' | 'timestamp'>) {
  const store = loadStore();
  const record: GovernmentVerificationRecord = {
    id: store.nextId++,
    timestamp: new Date().toISOString(),
    ...input,
  };
  store.recentVerifications.unshift(record);
  store.recentVerifications = store.recentVerifications.slice(0, 20);
  writeStore(store);
  return record;
}

export function verifyCacRegistration(cacNumber: string) {
  const normalized = cacNumber.trim().toUpperCase();
  const valid = /^RC\d{7}$/.test(normalized);
  const companyName = valid ? 'Verified Corporate Entity' : 'Unknown Entity';
  const record = recordGovernmentVerification({
    type: 'CAC Verification',
    identifier: normalized,
    name: companyName,
    status: valid ? 'verified' : 'failed',
  });

  return {
    valid,
    companyName,
    status: record.status,
    verification: record,
  };
}
