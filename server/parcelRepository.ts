/**
 * Parcel repository — PostgreSQL-backed.
 *
 * All parcel records are persisted to the `parcels` table (migration 0012).
 * There is no in-memory or file-store fallback: every function requires a
 * working database connection and fails loudly otherwise.
 */

import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import { parcels, type Parcel } from '../drizzle/schema';
import { requireDb } from './db';

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

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function toRecord(row: Parcel): ParcelRecord {
  return {
    id: row.id,
    parcelNumber: row.parcelNumber ?? row.parcelId,
    surveyPlanNumber: row.surveyPlanNumber ?? '',
    state: row.state ?? '',
    lga: row.lga ?? '',
    ward: row.ward ?? undefined,
    streetAddress: row.address ?? undefined,
    areaSquareMeters: row.area ?? 0,
    geometryGeoJSON: row.geometryGeoJSON ?? undefined,
    landUseType: row.landUse ?? '',
    status: (row.status as ParcelStatus) ?? 'pending_verification',
    estimatedValue: row.estimatedValue ?? 0,
    notes: row.notes ?? undefined,
    coordinates: {
      lat: row.latitude ? Number(row.latitude) : 0,
      lng: row.longitude ? Number(row.longitude) : 0,
    },
    boundaryCoordinates: row.boundaryCoordinates ?? undefined,
    surveyorId: row.surveyorId ?? undefined,
    verifierId: row.verifierId ?? undefined,
    verifiedAt: toIso(row.verifiedAt),
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
  };
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

export async function searchParcels(input: ParcelSearchInput) {
  const db = await requireDb();
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;

  const conditions: SQL[] = [];
  if (input.priceMin !== undefined) conditions.push(gte(parcels.estimatedValue, input.priceMin));
  if (input.priceMax !== undefined) conditions.push(lte(parcels.estimatedValue, input.priceMax));
  if (input.areaMin !== undefined) conditions.push(gte(parcels.area, input.areaMin));
  if (input.areaMax !== undefined) conditions.push(lte(parcels.area, input.areaMax));
  if (input.landUseType) conditions.push(eq(parcels.landUse, input.landUseType));
  if (input.state) conditions.push(eq(parcels.state, input.state));
  if (input.lga) conditions.push(eq(parcels.lga, input.lga));
  if (input.status) conditions.push(eq(parcels.status, input.status as ParcelStatus));
  if (input.query) {
    const pattern = `%${input.query}%`;
    const queryCondition = or(
      ilike(parcels.parcelNumber, pattern),
      ilike(parcels.surveyPlanNumber, pattern),
      ilike(parcels.address, pattern),
      ilike(parcels.state, pattern),
      ilike(parcels.lga, pattern),
    );
    if (queryCondition) conditions.push(queryCondition);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(parcels)
    .where(where);

  const rows = await db
    .select()
    .from(parcels)
    .where(where)
    .orderBy(desc(parcels.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    parcels: rows.map(toRecord),
    total: count,
    page,
    limit,
  };
}

export async function getParcelById(id: number): Promise<ParcelRecord | null> {
  const db = await requireDb();
  const rows = await db.select().from(parcels).where(eq(parcels.id, id)).limit(1);
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function getParcelByNumber(parcelNumber: string): Promise<ParcelRecord | null> {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(parcels)
    .where(or(eq(parcels.parcelNumber, parcelNumber), eq(parcels.parcelId, parcelNumber)))
    .limit(1);
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function createParcel(input: {
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
}): Promise<ParcelRecord> {
  const db = await requireDb();

  return db.transaction(async (tx) => {
    // Insert with a temporary unique business id, then derive the canonical
    // parcel number from the assigned identity inside the same transaction.
    const tempParcelId = `PENDING-${crypto.randomUUID()}`;
    const inserted = await tx
      .insert(parcels)
      .values({
        parcelId: tempParcelId,
        parcelNumber: tempParcelId,
        surveyPlanNumber: input.surveyPlanNumber,
        state: input.state,
        city: input.lga,
        lga: input.lga,
        ward: input.ward,
        address: input.streetAddress,
        area: input.areaSquareMeters,
        geometryGeoJSON: input.geometryGeoJSON,
        landUse: input.landUseType,
        status: 'pending_verification',
        estimatedValue: Math.round(input.areaSquareMeters * 85000),
        notes: input.notes,
        surveyorId: input.surveyorId,
        latitude: '6.5244',
        longitude: '3.3792',
      })
      .returning();

    const row = inserted[0];
    const statePrefix = input.state.slice(0, 2).toUpperCase();
    const lgaPrefix = input.lga.slice(0, 2).toUpperCase();
    const parcelNumber = `${statePrefix}-${lgaPrefix}-${new Date().getFullYear()}-${String(row.id).padStart(3, '0')}`;

    const updated = await tx
      .update(parcels)
      .set({ parcelNumber, parcelId: parcelNumber, updatedAt: new Date() })
      .where(eq(parcels.id, row.id))
      .returning();

    return toRecord(updated[0]);
  });
}

export async function updateParcel(
  id: number,
  data: { streetAddress?: string; landUseType?: string; notes?: string },
): Promise<ParcelRecord> {
  const db = await requireDb();

  const existing = await db.select().from(parcels).where(eq(parcels.id, id)).limit(1);
  if (!existing[0]) {
    throw new Error('Parcel not found');
  }
  if (existing[0].status === 'registered') {
    throw new Error('Registered parcels require a formal amendment workflow before updates');
  }

  const patch: Partial<typeof parcels.$inferInsert> = { updatedAt: new Date() };
  if (data.streetAddress !== undefined) patch.address = data.streetAddress;
  if (data.landUseType !== undefined) patch.landUse = data.landUseType;
  if (data.notes !== undefined) patch.notes = data.notes;

  const updated = await db.update(parcels).set(patch).where(eq(parcels.id, id)).returning();
  return toRecord(updated[0]);
}

export async function verifyParcel(id: number, verifierId: string): Promise<ParcelRecord> {
  const db = await requireDb();

  const existing = await db.select().from(parcels).where(eq(parcels.id, id)).limit(1);
  if (!existing[0]) {
    throw new Error('Parcel not found');
  }
  if (existing[0].status === 'verified' || existing[0].status === 'registered') {
    return toRecord(existing[0]);
  }

  const now = new Date();
  const updated = await db
    .update(parcels)
    .set({ status: 'verified', verifierId, verifiedAt: now, updatedAt: now })
    .where(eq(parcels.id, id))
    .returning();
  return toRecord(updated[0]);
}

export async function geospatialSearch(input: { centerLat: number; centerLng: number; radiusKm?: number; limit?: number }) {
  const db = await requireDb();
  const radiusKm = input.radiusKm ?? 5;
  const limit = input.limit ?? 50;

  // Bounding-box pre-filter in SQL, exact haversine distance in application
  // code — identical semantics to the previous implementation.
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos((input.centerLat * Math.PI) / 180) || 1);

  const rows = await db
    .select()
    .from(parcels)
    .where(
      and(
        gte(sql`CAST(${parcels.latitude} AS double precision)`, input.centerLat - latDelta),
        lte(sql`CAST(${parcels.latitude} AS double precision)`, input.centerLat + latDelta),
        gte(sql`CAST(${parcels.longitude} AS double precision)`, input.centerLng - lngDelta),
        lte(sql`CAST(${parcels.longitude} AS double precision)`, input.centerLng + lngDelta),
      ),
    );

  const results = rows
    .map((row) => {
      const record = toRecord(row);
      const distance = calculateDistance(
        input.centerLat,
        input.centerLng,
        record.coordinates.lat,
        record.coordinates.lng,
      );
      return {
        ...record,
        distance,
        coordinates: `${record.coordinates.lat},${record.coordinates.lng}`,
      };
    })
    .filter((parcel) => parcel.distance <= radiusKm)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit);

  return {
    parcels: results,
    total: results.length,
    radiusKm,
  };
}
