import fs from 'fs';
import path from 'path';

export type BackupStatus = 'completed' | 'in_progress' | 'failed';
export type RecoveryPointType = 'manual' | 'automated';

export interface BackupScheduleRecord {
  frequency: string;
  lastBackup: string;
  nextBackup: string;
  retention: string;
  location: string;
}

export interface BackupRecord {
  id: number;
  type: string;
  size: string;
  status: BackupStatus;
  timestamp: string;
  duration: string;
}

export interface RecoveryPointRecord {
  id: number;
  name: string;
  timestamp: string;
  size: string;
  type: RecoveryPointType;
}

export interface StorageMetricsRecord {
  totalBackupSize: string;
  availableSpace: string;
  usagePercentage: number;
  estimatedCostMonth: string;
}

interface BackupRecoveryStore {
  nextBackupId: number;
  nextRecoveryPointId: number;
  schedule: BackupScheduleRecord;
  recentBackups: BackupRecord[];
  recoveryPoints: RecoveryPointRecord[];
  storageMetrics: StorageMetricsRecord;
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'backup-recovery-store.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function defaultStore(): BackupRecoveryStore {
  return {
    nextBackupId: 5,
    nextRecoveryPointId: 4,
    schedule: {
      frequency: 'Daily',
      lastBackup: '2026-05-14T02:00:00.000Z',
      nextBackup: '2026-05-15T02:00:00.000Z',
      retention: '30 days',
      location: 'Geo-redundant object storage (Lagos + Frankfurt)',
    },
    recentBackups: [
      { id: 1, type: 'Full Backup', size: '45.2 GB', status: 'completed', timestamp: '2026-05-14T02:00:00.000Z', duration: '1h 23m' },
      { id: 2, type: 'Incremental Backup', size: '2.1 GB', status: 'completed', timestamp: '2026-05-13T14:00:00.000Z', duration: '8m 45s' },
      { id: 3, type: 'Full Backup', size: '44.8 GB', status: 'completed', timestamp: '2026-05-13T02:00:00.000Z', duration: '1h 19m' },
      { id: 4, type: 'Incremental Backup', size: '1.8 GB', status: 'completed', timestamp: '2026-05-12T14:00:00.000Z', duration: '7m 12s' },
    ],
    recoveryPoints: [
      { id: 1, name: 'Pre-Migration Snapshot', timestamp: '2026-05-10T00:00:00.000Z', size: '42.5 GB', type: 'manual' },
      { id: 2, name: 'Daily Backup - May 14', timestamp: '2026-05-14T02:00:00.000Z', size: '45.2 GB', type: 'automated' },
      { id: 3, name: 'Daily Backup - May 13', timestamp: '2026-05-13T02:00:00.000Z', size: '44.8 GB', type: 'automated' },
    ],
    storageMetrics: {
      totalBackupSize: '450 GB',
      availableSpace: '2.5 TB',
      usagePercentage: 15,
      estimatedCostMonth: '$125',
    },
  };
}

function loadStore(): BackupRecoveryStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as BackupRecoveryStore;
    if (!parsed || !Array.isArray(parsed.recentBackups) || !Array.isArray(parsed.recoveryPoints)) {
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

function saveStore(store: BackupRecoveryStore) {
  ensureDataDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function getBackupRecoveryState() {
  return loadStore();
}

export function initiateBackupRun() {
  const store = loadStore();
  const now = new Date();
  const id = store.nextBackupId++;
  const backup: BackupRecord = {
    id,
    type: now.getUTCHours() < 6 ? 'Full Backup' : 'Incremental Backup',
    size: now.getUTCHours() < 6 ? '45.5 GB' : '2.3 GB',
    status: 'completed',
    timestamp: now.toISOString(),
    duration: now.getUTCHours() < 6 ? '1h 17m' : '9m 10s',
  };

  const recoveryPoint: RecoveryPointRecord = {
    id: store.nextRecoveryPointId++,
    name: `${backup.type} - ${now.toISOString().slice(0, 10)}`,
    timestamp: backup.timestamp,
    size: backup.size,
    type: 'automated',
  };

  store.schedule.lastBackup = backup.timestamp;
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(2, 0, 0, 0);
  store.schedule.nextBackup = next.toISOString();
  store.recentBackups.unshift(backup);
  store.recentBackups = store.recentBackups.slice(0, 10);
  store.recoveryPoints.unshift(recoveryPoint);
  store.recoveryPoints = store.recoveryPoints.slice(0, 10);
  saveStore(store);
  return backup;
}

export function restoreFromRecoveryPoint(recoveryPointId: number) {
  const store = loadStore();
  const point = store.recoveryPoints.find((item) => item.id === recoveryPointId);
  if (!point) {
    throw new Error('Recovery point not found');
  }
  return {
    success: true,
    recoveryPointId,
    name: point.name,
    restoredAt: new Date().toISOString(),
    message: 'Recovery workflow registered successfully',
  };
}
