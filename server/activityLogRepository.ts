import { readJsonStore, writeJsonStore } from './jsonStore';

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

async function loadStore(): Promise<ActivityLogStore> {
  return readJsonStore<ActivityLogStore>('activity-log-store', defaultStore);
}

async function saveStore(store: ActivityLogStore) {
  await writeJsonStore('activity-log-store', store);
}

export async function listActivityLogs(input: { limit?: number }) {
  const limit = input.limit ?? 10;
  return (await loadStore()).activities
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function appendActivityLog(input: Omit<ActivityLogRecord, 'id' | 'createdAt'> & { createdAt?: string }) {
  const store = await loadStore();
  const record: ActivityLogRecord = {
    id: store.nextId,
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  store.activities.unshift(record);
  store.nextId += 1;
  await saveStore(store);
  return record;
}
