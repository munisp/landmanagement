import { readJsonStore, writeJsonStore } from './jsonStore';

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

async function loadStore(): Promise<GovernmentIntegrationStore> {
  return readJsonStore<GovernmentIntegrationStore>('government-integration-store', defaultStore);
}

async function writeStore(store: GovernmentIntegrationStore) {
  await writeJsonStore('government-integration-store', store);
}

export async function getGovernmentIntegrationState() {
  return await loadStore();
}

export async function recordGovernmentVerification(input: Omit<GovernmentVerificationRecord, 'id' | 'timestamp'>) {
  const store = await loadStore();
  const record: GovernmentVerificationRecord = {
    id: store.nextId++,
    timestamp: new Date().toISOString(),
    ...input,
  };
  store.recentVerifications.unshift(record);
  store.recentVerifications = store.recentVerifications.slice(0, 20);
  await writeStore(store);
  return record;
}

export async function verifyCacRegistration(cacNumber: string) {
  const normalized = cacNumber.trim().toUpperCase();
  const valid = /^RC\d{7}$/.test(normalized);
  const companyName = valid ? 'Verified Corporate Entity' : 'Unknown Entity';
  const record = await recordGovernmentVerification({
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
