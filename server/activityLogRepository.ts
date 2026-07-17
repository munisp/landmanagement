import fs from 'fs';
import path from 'path';

export interface ActivityLogRecord {
  id: number;
  userId: number;
  userName: string;
  type: 'parcel' | 'transaction' | 'payment' | 'document' | 'user' | 'system';
  description: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

interface ActivityLogStore {
  nextId: number;
  activities: ActivityLogRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'activity-log-store.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function seededActivities(): ActivityLogRecord[] {
  return [
    {
      id: 1,
      userId: 12,
      userName: 'Registry Officer Amina Bello',
      type: 'parcel',
      description: 'Verified parcel LG-IKJ-2026-001 after cadastral review.',
      metadata: { parcelNumber: 'LG-IKJ-2026-001', action: 'verified' },
      createdAt: '2026-05-13T09:15:00.000Z',
    },
    {
      id: 2,
      userId: 34,
      userName: 'Transaction Clerk Musa Yusuf',
      type: 'transaction',
      description: 'Advanced transfer transaction #4 to payment review.',
      metadata: { transactionId: 4, action: 'request_payment' },
      createdAt: '2026-05-13T10:30:00.000Z',
    },
    {
      id: 3,
      userId: 1,
      userName: 'System Administrator',
      type: 'system',
      description: 'Published updated marketplace continuity configuration.',
      metadata: { module: 'marketplace', action: 'config_update' },
      createdAt: '2026-05-14T08:05:00.000Z',
    },
  ];
}

function defaultStore(): ActivityLogStore {
  const activities = seededActivities();
  return {
    nextId: Math.max(...activities.map((item) => item.id), 0) + 1,
    activities,
  };
}

function loadStore(): ActivityLogStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as ActivityLogStore;
    if (!Array.isArray(parsed.activities) || typeof parsed.nextId !== 'number') {
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

function saveStore(store: ActivityLogStore) {
  ensureDataDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function listActivityLogs(input: { limit?: number }) {
  const limit = input.limit ?? 10;
  return loadStore().activities
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function appendActivityLog(input: Omit<ActivityLogRecord, 'id' | 'createdAt'> & { createdAt?: string }) {
  const store = loadStore();
  const record: ActivityLogRecord = {
    id: store.nextId,
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  store.activities.unshift(record);
  store.nextId += 1;
  saveStore(store);
  return record;
}
