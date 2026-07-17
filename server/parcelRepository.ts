import fs from 'fs';
import path from 'path';

export type ParcelStatus = 'pending_verification' | 'verified' | 'registered' | 'disputed';

export interface ParcelRecord {
  id: number;
  parcelNumber: string;
  surveyPlanNumber: string;
  state: string;
  lga: string;
  ward?: string;
  streetAddress?: string;
  areaSquareMeters: number;
  geometryGeoJSON?: string;
  landUseType: string;
  status: ParcelStatus;
  estimatedValue: number;
  notes?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  boundaryCoordinates?: string;
  surveyorId?: string;
  verifierId?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ParcelStore {
  parcels: ParcelRecord[];
  nextId: number;
}

export interface ParcelSearchInput {
  query?: string;
  state?: string;
  lga?: string;
  status?: string;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  landUseType?: string;
  page?: number;
  limit?: number;
}

const dataDir = path.join(process.cwd(), 'server', 'data');
const storePath = path.join(dataDir, 'parcel-store.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function seededParcels(): ParcelRecord[] {
  return [
    {
      id: 1,
      parcelNumber: 'LG-VI-2024-001',
      surveyPlanNumber: 'SP/2024/001',
      state: 'Lagos',
      lga: 'Victoria Island',
      ward: 'Ward 1',
      streetAddress: '123 Ahmadu Bello Way, Victoria Island',
      areaSquareMeters: 1200.5,
      geometryGeoJSON: '{"type":"Polygon","coordinates":[]}',
      landUseType: 'residential',
      status: 'verified',
      estimatedValue: 150000000,
      notes: 'Prime coastal residential parcel with clear survey history.',
      coordinates: { lat: 6.4281, lng: 3.4219 },
      boundaryCoordinates: '6.4281,3.4219;6.4285,3.4219;6.4285,3.4225;6.4281,3.4225',
      surveyorId: 'system',
      verifierId: 'registry-admin',
      verifiedAt: '2024-01-20T10:00:00.000Z',
      createdAt: '2024-01-15T09:00:00.000Z',
      updatedAt: '2024-01-20T10:00:00.000Z',
    },
    {
      id: 2,
      parcelNumber: 'AB-FCT-2024-002',
      surveyPlanNumber: 'SP/2024/002',
      state: 'Abuja',
      lga: 'Garki',
      ward: 'Ward 3',
      streetAddress: '45 Herbert Macaulay Way, Garki',
      areaSquareMeters: 850,
      geometryGeoJSON: '{"type":"Polygon","coordinates":[]}',
      landUseType: 'commercial',
      status: 'registered',
      estimatedValue: 200000000,
      notes: 'Commercial asset with completed registry workflow.',
      coordinates: { lat: 9.0428, lng: 7.4891 },
      boundaryCoordinates: '9.0428,7.4891;9.0430,7.4891;9.0430,7.4895;9.0428,7.4895',
      surveyorId: 'system',
      verifierId: 'registry-admin',
      verifiedAt: '2024-02-12T13:00:00.000Z',
      createdAt: '2024-02-10T09:00:00.000Z',
      updatedAt: '2024-02-12T13:00:00.000Z',
    },
    {
      id: 3,
      parcelNumber: 'KN-KN-2024-003',
      surveyPlanNumber: 'SP/2024/003',
      state: 'Kano',
      lga: 'Kano Municipal',
      ward: 'Ward 5',
      streetAddress: 'Plot 12 Murtala Mohammed Road',
      areaSquareMeters: 2500,
      geometryGeoJSON: '{"type":"Polygon","coordinates":[]}',
      landUseType: 'agricultural',
      status: 'pending_verification',
      estimatedValue: 50000000,
      notes: 'Awaiting land office verification and title perfection.',
      coordinates: { lat: 12.0022, lng: 8.5919 },
      boundaryCoordinates: '12.0022,8.5919;12.0027,8.5919;12.0027,8.5925;12.0022,8.5925',
      surveyorId: 'surveyor-1',
      createdAt: '2024-03-01T09:00:00.000Z',
      updatedAt: '2024-03-01T09:00:00.000Z',
    },
    {
      id: 4,
      parcelNumber: 'LG-IK-2024-004',
      surveyPlanNumber: 'SP/2024/004',
      state: 'Lagos',
      lga: 'Ikeja',
      ward: 'Ward 2',
      streetAddress: 'Plot 8 Industrial Avenue, Ikeja',
      areaSquareMeters: 3000,
      geometryGeoJSON: '{"type":"Polygon","coordinates":[]}',
      landUseType: 'industrial',
      status: 'verified',
      estimatedValue: 300000000,
      notes: 'Industrial plot cleared for secured lending workflows.',
      coordinates: { lat: 6.6018, lng: 3.3515 },
      boundaryCoordinates: '6.6018,3.3515;6.6022,3.3515;6.6022,3.3521;6.6018,3.3521',
      surveyorId: 'system',
      verifierId: 'registry-admin',
      verifiedAt: '2024-01-25T12:00:00.000Z',
      createdAt: '2024-01-20T09:00:00.000Z',
      updatedAt: '2024-01-25T12:00:00.000Z',
    },
    {
      id: 5,
      parcelNumber: 'AB-MA-2024-005',
      surveyPlanNumber: 'SP/2024/005',
      state: 'Abuja',
      lga: 'Maitama',
      ward: 'Ward 1',
      streetAddress: '15 Aguiyi Ironsi Street, Maitama',
      areaSquareMeters: 1500,
      geometryGeoJSON: '{"type":"Polygon","coordinates":[]}',
      landUseType: 'residential',
      status: 'verified',
      estimatedValue: 250000000,
      notes: 'High-value residential parcel suitable for premium mortgage products.',
      coordinates: { lat: 9.0952, lng: 7.4956 },
      boundaryCoordinates: '9.0952,7.4956;9.0956,7.4956;9.0956,7.4960;9.0952,7.4960',
      surveyorId: 'system',
      verifierId: 'registry-admin',
      verifiedAt: '2024-02-05T14:00:00.000Z',
      createdAt: '2024-02-01T09:00:00.000Z',
      updatedAt: '2024-02-05T14:00:00.000Z',
    },
  ];
}

function buildInitialStore(): ParcelStore {
  const parcels = seededParcels();
  return {
    parcels,
    nextId: parcels.length + 1,
  };
}

function loadStore(): ParcelStore {
  ensureDataDir();

  if (!fs.existsSync(storePath)) {
    const initial = buildInitialStore();
    fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
    return initial;
  }

  const raw = fs.readFileSync(storePath, 'utf-8');
  const parsed = JSON.parse(raw) as ParcelStore;

  if (!parsed.parcels?.length) {
    const initial = buildInitialStore();
    fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
    return initial;
  }

  return parsed;
}

function saveStore(store: ParcelStore) {
  ensureDataDir();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function paginate<T>(items: T[], page = 1, limit = 20) {
  const start = (page - 1) * limit;
  return items.slice(start, start + limit);
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function searchParcels(input: ParcelSearchInput) {
  const store = loadStore();
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;

  const filtered = store.parcels.filter((parcel) => {
    if (input.priceMin !== undefined && parcel.estimatedValue < input.priceMin) return false;
    if (input.priceMax !== undefined && parcel.estimatedValue > input.priceMax) return false;
    if (input.areaMin !== undefined && parcel.areaSquareMeters < input.areaMin) return false;
    if (input.areaMax !== undefined && parcel.areaSquareMeters > input.areaMax) return false;
    if (input.landUseType && parcel.landUseType !== input.landUseType) return false;
    if (input.state && parcel.state !== input.state) return false;
    if (input.lga && parcel.lga !== input.lga) return false;
    if (input.status && parcel.status !== input.status) return false;
    if (input.query) {
      const query = input.query.toLowerCase();
      return [
        parcel.parcelNumber,
        parcel.surveyPlanNumber,
        parcel.streetAddress ?? '',
        parcel.state,
        parcel.lga,
      ].some((value) => value.toLowerCase().includes(query));
    }
    return true;
  });

  return {
    parcels: paginate(filtered, page, limit),
    total: filtered.length,
    page,
    limit,
  };
}

export function getParcelById(id: number) {
  const store = loadStore();
  return store.parcels.find((parcel) => parcel.id === id) ?? null;
}

export function getParcelByNumber(parcelNumber: string) {
  const store = loadStore();
  return store.parcels.find((parcel) => parcel.parcelNumber === parcelNumber) ?? null;
}

export function createParcel(input: {
  surveyPlanNumber: string;
  state: string;
  lga: string;
  ward?: string;
  streetAddress?: string;
  areaSquareMeters: number;
  geometryGeoJSON: string;
  landUseType: string;
  notes?: string;
  surveyorId: string;
}) {
  const store = loadStore();
  const now = new Date().toISOString();
  const id = store.nextId;
  const statePrefix = input.state.slice(0, 2).toUpperCase();
  const lgaPrefix = input.lga.slice(0, 2).toUpperCase();
  const parcelNumber = `${statePrefix}-${lgaPrefix}-${new Date().getFullYear()}-${String(id).padStart(3, '0')}`;

  const record: ParcelRecord = {
    id,
    parcelNumber,
    surveyPlanNumber: input.surveyPlanNumber,
    state: input.state,
    lga: input.lga,
    ward: input.ward,
    streetAddress: input.streetAddress,
    areaSquareMeters: input.areaSquareMeters,
    geometryGeoJSON: input.geometryGeoJSON,
    landUseType: input.landUseType,
    status: 'pending_verification',
    estimatedValue: Math.round(input.areaSquareMeters * 85000),
    notes: input.notes,
    coordinates: { lat: 6.5244, lng: 3.3792 },
    surveyorId: input.surveyorId,
    createdAt: now,
    updatedAt: now,
  };

  store.parcels.unshift(record);
  store.nextId += 1;
  saveStore(store);
  return record;
}

export function updateParcel(id: number, data: { streetAddress?: string; landUseType?: string; notes?: string }) {
  const store = loadStore();
  const parcel = store.parcels.find((item) => item.id === id);

  if (!parcel) {
    throw new Error('Parcel not found');
  }

  if (parcel.status === 'registered') {
    throw new Error('Registered parcels require a formal amendment workflow before updates');
  }

  if (data.streetAddress !== undefined) parcel.streetAddress = data.streetAddress;
  if (data.landUseType !== undefined) parcel.landUseType = data.landUseType;
  if (data.notes !== undefined) parcel.notes = data.notes;
  parcel.updatedAt = new Date().toISOString();

  saveStore(store);
  return parcel;
}

export function verifyParcel(id: number, verifierId: string) {
  const store = loadStore();
  const parcel = store.parcels.find((item) => item.id === id);

  if (!parcel) {
    throw new Error('Parcel not found');
  }

  if (parcel.status === 'verified' || parcel.status === 'registered') {
    return parcel;
  }

  parcel.status = 'verified';
  parcel.verifierId = verifierId;
  parcel.verifiedAt = new Date().toISOString();
  parcel.updatedAt = new Date().toISOString();

  saveStore(store);
  return parcel;
}

export function geospatialSearch(input: { centerLat: number; centerLng: number; radiusKm?: number; limit?: number }) {
  const store = loadStore();
  const radiusKm = input.radiusKm ?? 5;
  const limit = input.limit ?? 50;

  const results = store.parcels
    .map((parcel) => ({
      ...parcel,
      distance: calculateDistance(input.centerLat, input.centerLng, parcel.coordinates.lat, parcel.coordinates.lng),
      coordinates: `${parcel.coordinates.lat},${parcel.coordinates.lng}`,
    }))
    .filter((parcel) => parcel.distance <= radiusKm)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit);

  return {
    parcels: results,
    total: results.length,
    radiusKm,
  };
}
