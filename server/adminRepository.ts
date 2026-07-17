import fs from 'fs';
import path from 'path';

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

const dataDir = path.join(process.cwd(), 'server', 'data');
const storePath = path.join(dataDir, 'admin-store.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
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
  for (const key of keys) {
    if (record[key]) record[key] = new Date(record[key]);
  }
  return record;
}

function loadStore(): OfflineAdminStore {
  ensureDataDir();
  if (!fs.existsSync(storePath)) {
    const seeded = seededStore();
    fs.writeFileSync(storePath, JSON.stringify(seeded, null, 2));
    return seeded;
  }

  const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as OfflineAdminStore;
  parsed.users = parsed.users.map((user) =>
    reviveDate(user, ['suspendedAt', 'createdAt', 'updatedAt', 'lastActive', 'lastSignedIn']),
  );
  parsed.activityLogs = parsed.activityLogs.map((log) => reviveDate(log, ['timestamp']));
  return parsed;
}

function saveStore(store: OfflineAdminStore) {
  ensureDataDir();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export function listOfflineAdminUsers(page = 1, limit = 50) {
  const store = loadStore();
  const sorted = [...store.users].sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
  const start = (page - 1) * limit;
  return {
    users: sorted.slice(start, start + limit),
    total: sorted.length,
    page,
    limit,
  };
}

export function updateOfflineUserRole(userId: number, role: OfflineAdminUser['role'], adminId: number) {
  const store = loadStore();
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
  saveStore(store);
  return { success: true as const, user };
}

export function suspendOfflineUser(userId: number, reason: string, adminId: number) {
  const store = loadStore();
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
  saveStore(store);
  return { success: true as const, user };
}

export function activateOfflineUser(userId: number, adminId: number) {
  const store = loadStore();
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
  saveStore(store);
  return { success: true as const, user };
}

export function listOfflineUserActivityLogs(userId?: number, limit = 50) {
  const store = loadStore();
  const filtered = userId ? store.activityLogs.filter((log) => log.userId === userId) : store.activityLogs;
  return filtered.slice(0, limit);
}

export function getOfflineUserStats() {
  const store = loadStore();
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

export function getOfflineAdminUser(userId: number) {
  const store = loadStore();
  return store.users.find((user) => user.id === userId) ?? null;
}
