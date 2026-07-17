type FieldDataRecord = {
  parcelNumber: string;
  location: { lat: number; lng: number } | null;
  area: string;
  boundaries: string;
  notes: string;
  photos: string[];
  timestamp: string;
};

export type OfflineFieldDataRecord = {
  id: number;
  userId: number;
  parcelNumber: string;
  locationLat: number | null;
  locationLng: number | null;
  area: string | null;
  boundaries: string | null;
  notes: string | null;
  photos: string[];
  timestamp: Date;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type FieldDataStore = {
  nextId: number;
  records: OfflineFieldDataRecord[];
};

const globalKey = '__idlrFieldDataStore';

function getStore(): FieldDataStore {
  const globalState = globalThis as typeof globalThis & { [globalKey]?: FieldDataStore };
  if (!globalState[globalKey]) {
    const now = new Date();
    globalState[globalKey] = {
      nextId: 4,
      records: [
        {
          id: 1,
          userId: 1,
          parcelNumber: 'LG-VI-2024-001',
          locationLat: 6.4281,
          locationLng: 3.4219,
          area: '1200.5',
          boundaries: 'North: Access Road; South: Plot 8; East: Drainage Reserve; West: Plot 6',
          notes: 'Initial field verification completed. Boundary beacons visible and consistent with registry coordinates.',
          photos: [],
          timestamp: new Date('2026-05-10T09:30:00.000Z'),
          syncedAt: new Date('2026-05-10T09:35:00.000Z'),
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 2,
          userId: 1,
          parcelNumber: 'FC-MAI-2024-014',
          locationLat: 9.0428,
          locationLng: 7.4891,
          area: '950.0',
          boundaries: 'North: Internal Road; South: Green Buffer; East: Plot 15; West: Plot 13',
          notes: 'Survey inspection noted active construction and clear beacon line. Photo set captured for review.',
          photos: [],
          timestamp: new Date('2026-05-11T14:10:00.000Z'),
          syncedAt: new Date('2026-05-11T14:18:00.000Z'),
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 3,
          userId: 2,
          parcelNumber: 'RV-PH-2024-009',
          locationLat: 4.8156,
          locationLng: 7.0498,
          area: '1450.2',
          boundaries: 'North: Canal Reserve; South: Service Lane; East: Plot 22; West: Plot 20',
          notes: 'Pending registrar review due to discrepancy between measured frontage and uploaded survey plan.',
          photos: [],
          timestamp: new Date('2026-05-12T11:00:00.000Z'),
          syncedAt: new Date('2026-05-12T11:06:00.000Z'),
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
  }
  return globalState[globalKey]!;
}

export function syncOfflineFieldData(userId: number, data: FieldDataRecord): OfflineFieldDataRecord {
  const store = getStore();
  const now = new Date();
  const record: OfflineFieldDataRecord = {
    id: store.nextId++,
    userId,
    parcelNumber: data.parcelNumber,
    locationLat: data.location?.lat ?? null,
    locationLng: data.location?.lng ?? null,
    area: data.area || null,
    boundaries: data.boundaries || null,
    notes: data.notes || null,
    photos: data.photos,
    timestamp: new Date(data.timestamp),
    syncedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  store.records.unshift(record);
  return record;
}

export function listOfflineFieldData(userId: number, limit = 50): OfflineFieldDataRecord[] {
  const store = getStore();
  return store.records
    .filter((record) => record.userId === userId)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}

export function listOfflineFieldDataByParcel(parcelNumber: string): OfflineFieldDataRecord[] {
  const store = getStore();
  return store.records
    .filter((record) => record.parcelNumber === parcelNumber)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export function getOfflineFieldDataStats(userId: number): {
  totalRecords: number;
  totalParcels: number;
  lastSync: Date | null;
} {
  const records = listOfflineFieldData(userId, Number.MAX_SAFE_INTEGER);
  return {
    totalRecords: records.length,
    totalParcels: new Set(records.map((record) => record.parcelNumber)).size,
    lastSync: records.length ? records.reduce((latest, record) => latest > record.syncedAt ? latest : record.syncedAt, records[0].syncedAt) : null,
  };
}

export function deleteOfflineFieldData(id: number, userId: number): boolean {
  const store = getStore();
  const index = store.records.findIndex((record) => record.id === id && record.userId === userId);
  if (index === -1) {
    return false;
  }
  store.records.splice(index, 1);
  return true;
}
