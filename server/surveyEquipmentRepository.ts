import fs from 'fs';
import path from 'path';

export interface SurveyDeviceRecord {
  id: number;
  name: string;
  type: string;
  status: 'connected' | 'offline';
  lastSync: string;
  accuracy: string;
}

export interface SurveyImportRecord {
  id: number;
  filename: string;
  type: string;
  points?: number;
  size?: string;
  status: 'completed' | 'processing';
  timestamp: string;
}

export interface CalibrationRecord {
  id: number;
  device: string;
  calibratedBy: string;
  date: string;
  nextDue: string;
  status: 'valid' | 'due_soon';
}

interface SurveyEquipmentStore {
  connectedDevices: SurveyDeviceRecord[];
  recentImports: SurveyImportRecord[];
  calibrationRecords: CalibrationRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'survey-equipment-store.json');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function defaultStore(): SurveyEquipmentStore {
  return {
    connectedDevices: [
      { id: 1, name: 'Trimble R10 GNSS', type: 'GPS', status: 'connected', lastSync: '2026-02-16T14:30:00.000Z', accuracy: '±2cm' },
      { id: 2, name: 'Leica TS16 Total Station', type: 'Total Station', status: 'connected', lastSync: '2026-02-16T13:15:00.000Z', accuracy: '±1mm' },
      { id: 3, name: 'DJI Phantom 4 RTK', type: 'Drone', status: 'offline', lastSync: '2026-02-15T16:00:00.000Z', accuracy: '±5cm' },
    ],
    recentImports: [
      { id: 1, filename: 'parcel_survey_LGA_001.csv', type: 'GPS Points', points: 247, status: 'completed', timestamp: '2026-02-16T14:30:00.000Z' },
      { id: 2, filename: 'drone_orthophoto_zone_A.tif', type: 'Drone Imagery', size: '2.4 GB', status: 'completed', timestamp: '2026-02-16T12:00:00.000Z' },
      { id: 3, filename: 'lidar_scan_boundary_012.las', type: 'LiDAR Data', points: 15000000, status: 'processing', timestamp: '2026-02-16T10:15:00.000Z' },
    ],
    calibrationRecords: [
      { id: 1, device: 'Trimble R10 GNSS', calibratedBy: 'John Surveyor', date: '2026-02-01T00:00:00.000Z', nextDue: '2026-05-01T00:00:00.000Z', status: 'valid' },
      { id: 2, device: 'Leica TS16 Total Station', calibratedBy: 'Jane Engineer', date: '2026-01-15T00:00:00.000Z', nextDue: '2026-04-15T00:00:00.000Z', status: 'valid' },
      { id: 3, device: 'DJI Phantom 4 RTK', calibratedBy: 'Mike Pilot', date: '2025-12-10T00:00:00.000Z', nextDue: '2026-03-10T00:00:00.000Z', status: 'due_soon' },
    ],
  };
}

function loadStore(): SurveyEquipmentStore {
  ensureDir();
  if (!fs.existsSync(STORE_PATH)) {
    const seeded = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(seeded, null, 2));
    return seeded;
  }
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as SurveyEquipmentStore;
  } catch {
    const seeded = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(seeded, null, 2));
    return seeded;
  }
}

export function getSurveyEquipmentState() {
  return loadStore();
}
