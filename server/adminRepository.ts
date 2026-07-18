import { readJsonStore, writeJsonStore } from './jsonStore';

export interface OfflineAdminUser {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: 'user' | 'surveyor' | 'registrar' | 'admin';
  suspended: boolean;
  suspendedAt: Date | null;
  suspendedBy: number | null;
  suspensionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastActive: Date;
  lastSignedIn: Date;
}

export interface OfflineAdminActivityLog {
  userId: number;
  userName: string | null;
  action: string;
  timestamp: Date;
  details: Record<string, unknown>;
}

interface OfflineAdminStore {
  users: OfflineAdminUser[];
  activityLogs: OfflineAdminActivityLog[];
}


function seededStore(): OfflineAdminStore {
  return {
    users: [
      {
        id: 901,
        openId: 'offline-admin-openid',
        name: 'Offline Admin',
        email: 'admin@offline.local',
        role: 'admin',
        suspended: false,
        suspendedAt: null,
        suspendedBy: null,
        suspensionReason: null,
        createdAt: new Date('2024-01-01T09:00:00.000Z'),
        updatedAt: new Date('2024-01-01T09:00:00.000Z'),
        lastActive: new Date('2024-03-15T09:00:00.000Z'),
        lastSignedIn: new Date('2024-03-15T09:00:00.000Z'),
      },
      {
        id: 902,
        openId: 'offline-user-openid',
        name: 'Offline Test User',
        email: 'user@offline.local',
        role: 'user',
        suspended: false,
        suspendedAt: null,
        suspendedBy: null,
        suspensionReason: null,
        createdAt: new Date('2024-01-02T09:00:00.000Z'),
        updatedAt: new Date('2024-01-02T09:00:00.000Z'),
        lastActive: new Date('2024-03-14T09:00:00.000Z'),
        lastSignedIn: new Date('2024-03-14T09:00:00.000Z'),
      },
      {
        id: 903,
        openId: 'offline-registrar-openid',
        name: 'Offline Registrar',
        email: 'registrar@offline.local',
        role: 'registrar',
        suspended: false,
        suspendedAt: null,
        suspendedBy: null,
        suspensionReason: null,
        createdAt: new Date('2024-01-03T09:00:00.000Z'),
        updatedAt: new Date('2024-01-03T09:00:00.000Z'),
        lastActive: new Date('2024-03-13T09:00:00.000Z'),
        lastSignedIn: new Date('2024-03-13T09:00:00.000Z'),
      },
    ],
    activityLogs: [
      {
        userId: 902,
        userName: 'Offline Test User',
        action: 'login_success',
        timestamp: new Date('2024-03-14T09:00:00.000Z'),
        details: { ip: '127.0.0.1', email: 'user@offline.local' },
      },
      {
        userId: 901,
        userName: 'Offline Admin',
        action: 'login_success',
        timestamp: new Date('2024-03-15T09:00:00.000Z'),
        details: { ip: '127.0.0.1', email: 'admin@offline.local' },
      },
    ],
  };
}

function reviveDate<T extends Record<string, any>>(record: T, keys: string[]) {
  const mutableRecord = record as Record<string, any>;
  for (const key of keys) {
    if (mutableRecord[key]) mutableRecord[key] = new Date(mutableRecord[key]);
  }
  return record;
}

async function loadStore(): Promise<OfflineAdminStore> {
  return readJsonStore<OfflineAdminStore>('admin-store', seededStore);
}

async function saveStore(store: OfflineAdminStore) {
  await writeJsonStore('admin-store', store);
}

export async function listOfflineAdminUsers(page = 1, limit = 50) {
  const store = await loadStore();
  const sorted = [...store.users].sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
  const start = (page - 1) * limit;
  return {
    users: sorted.slice(start, start + limit),
    total: sorted.length,
    page,
    limit,
  };
}

export async function updateOfflineUserRole(userId: number, role: OfflineAdminUser['role'], adminId: number) {
  const store = await loadStore();
  const user = store.users.find((entry) => entry.id === userId);
  if (!user) return { success: false as const };
  user.role = role;
  user.updatedAt = new Date();
  store.activityLogs.unshift({
    userId,
    userName: user.name,
    action: 'role_changed',
    timestamp: new Date(),
    details: { role, adminId },
  });
  await saveStore(store);
  return { success: true as const, user };
}

export async function suspendOfflineUser(userId: number, reason: string, adminId: number) {
  const store = await loadStore();
  const user = store.users.find((entry) => entry.id === userId);
  if (!user) return { success: false as const };
  user.suspended = true;
  user.suspendedAt = new Date();
  user.suspendedBy = adminId;
  user.suspensionReason = reason;
  user.updatedAt = new Date();
  store.activityLogs.unshift({
    userId,
    userName: user.name,
    action: 'user_suspended',
    timestamp: new Date(),
    details: { reason, adminId },
  });
  await saveStore(store);
  return { success: true as const, user };
}

export async function activateOfflineUser(userId: number, adminId: number) {
  const store = await loadStore();
  const user = store.users.find((entry) => entry.id === userId);
  if (!user) return { success: false as const };
  user.suspended = false;
  user.suspendedAt = null;
  user.suspendedBy = null;
  user.suspensionReason = null;
  user.updatedAt = new Date();
  store.activityLogs.unshift({
    userId,
    userName: user.name,
    action: 'user_activated',
    timestamp: new Date(),
    details: { adminId },
  });
  await saveStore(store);
  return { success: true as const, user };
}

export async function listOfflineUserActivityLogs(userId?: number, limit = 50) {
  const store = await loadStore();
  const filtered = userId ? store.activityLogs.filter((log) => log.userId === userId) : store.activityLogs;
  return filtered.slice(0, limit);
}

export async function getOfflineUserStats() {
  const store = await loadStore();
  const total = store.users.length;
  const suspended = store.users.filter((user) => user.suspended).length;
  const byRole: Record<string, number> = {};
  for (const user of store.users) {
    byRole[user.role] = (byRole[user.role] ?? 0) + 1;
  }
  return {
    total,
    active: total - suspended,
    suspended,
    byRole,
  };
}

export async function getOfflineAdminUser(userId: number) {
  const store = await loadStore();
  return store.users.find((user) => user.id === userId) ?? null;
}
