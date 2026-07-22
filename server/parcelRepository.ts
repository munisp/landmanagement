import { randomUUID } from "node:crypto";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  ne,
  or,
} from "drizzle-orm";
import { parcels } from "../drizzle/schema";
import { requireDb } from "./db";

export type ParcelStatus =
  | "draft"
  | "pending_verification"
  | "verified"
  | "registered"
  | "transferred"
  | "disputed"
  | "archived";

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
  estimatedValue: number | null;
  notes?: string;
  coordinates: { lat: number; lng: number } | null;
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

type ParcelRow = typeof parcels.$inferSelect;

function requireText(value: string | null | undefined, field: string, parcelId: number): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Parcel ${parcelId} is missing required ${field} data`);
  }
  return normalized;
}

function toIso(value: Date | string | null | undefined, field: string, parcelId: number): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return new Date(value).toISOString();
  throw new Error(`Parcel ${parcelId} is missing required ${field} timestamp`);
}

function parseCoordinate(value: string | null | undefined, lower: number, upper: number): number | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= lower && numeric <= upper ? numeric : null;
}

function coordinatesFor(row: ParcelRow): { lat: number; lng: number } | null {
  const lat = parseCoordinate(row.latitude, -90, 90);
  const lng = parseCoordinate(row.longitude, -180, 180);
  return lat === null || lng === null ? null : { lat, lng };
}

function normalizeStatus(value: string, parcelId: number): ParcelStatus {
  const allowed: ParcelStatus[] = [
    "draft",
    "pending_verification",
    "verified",
    "registered",
    "transferred",
    "disputed",
    "archived",
  ];
  if (!allowed.includes(value as ParcelStatus)) {
    throw new Error(`Parcel ${parcelId} has an unsupported status: ${value}`);
  }
  return value as ParcelStatus;
}

function toParcelRecord(row: ParcelRow): ParcelRecord {
  const area = row.area;
  if (area === null || area === undefined || !Number.isFinite(Number(area)) || Number(area) <= 0) {
    throw new Error(`Parcel ${row.id} is missing a valid area`);
  }

  return {
    id: row.id,
    parcelNumber: requireText(row.parcelNumber ?? row.parcelId, "parcel number", row.id),
    surveyPlanNumber: requireText(row.surveyPlanNumber, "survey plan number", row.id),
    state: requireText(row.state, "state", row.id),
    lga: requireText(row.lga, "local government area", row.id),
    ward: row.ward ?? undefined,
    streetAddress: row.address ?? undefined,
    areaSquareMeters: Number(area),
    geometryGeoJSON: row.geometryGeoJSON ?? undefined,
    landUseType: requireText(row.landUse, "land use", row.id),
    status: normalizeStatus(row.status, row.id),
    estimatedValue: row.estimatedValue === null || row.estimatedValue === undefined ? null : Number(row.estimatedValue),
    notes: row.notes ?? undefined,
    coordinates: coordinatesFor(row),
    boundaryCoordinates: row.boundaryCoordinates ?? undefined,
    surveyorId: row.surveyorId ?? undefined,
    verifierId: row.verifierId ?? undefined,
    verifiedAt: row.verifiedAt ? toIso(row.verifiedAt, "verification", row.id) : undefined,
    createdAt: toIso(row.createdAt, "creation", row.id),
    updatedAt: toIso(row.updatedAt, "update", row.id),
  };
}

function validateGeometry(geometryGeoJSON: string): { lat: number; lng: number } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(geometryGeoJSON);
  } catch {
    throw new Error("geometryGeoJSON must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("geometryGeoJSON must be a GeoJSON object");
  }

  const values: Array<[number, number]> = [];
  const visit = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (
      node.length >= 2 &&
      typeof node[0] === "number" &&
      typeof node[1] === "number" &&
      Number.isFinite(node[0]) &&
      Number.isFinite(node[1])
    ) {
      const [lng, lat] = node;
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) values.push([lng, lat]);
      return;
    }
    node.forEach(visit);
  };
  visit((parsed as { coordinates?: unknown }).coordinates);
  if (!values.length) return null;
  return {
    lat: values.reduce((total, [, lat]) => total + lat, 0) / values.length,
    lng: values.reduce((total, [lng]) => total + lng, 0) / values.length,
  };
}

function compactSegment(value: string): string {
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
  if (!compact) throw new Error("Parcel state and local government area must contain alphanumeric characters");
  return compact;
}

function nextParcelNumber(state: string, lga: string): string {
  return `${compactSegment(state)}-${compactSegment(lga)}-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function searchParcels(input: ParcelSearchInput) {
  const db = await requireDb();
  const conditions = [];
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const limit = Math.min(1000, Math.max(1, Math.floor(input.limit ?? 20)));

  if (input.priceMin !== undefined) conditions.push(gte(parcels.estimatedValue, input.priceMin));
  if (input.priceMax !== undefined) conditions.push(lte(parcels.estimatedValue, input.priceMax));
  if (input.areaMin !== undefined) conditions.push(gte(parcels.area, input.areaMin));
  if (input.areaMax !== undefined) conditions.push(lte(parcels.area, input.areaMax));
  if (input.landUseType && input.landUseType !== "all") conditions.push(eq(parcels.landUse, input.landUseType));
  if (input.state) conditions.push(eq(parcels.state, input.state));
  if (input.lga) conditions.push(eq(parcels.lga, input.lga));
  if (input.status && input.status !== "all") conditions.push(eq(parcels.status, input.status as ParcelStatus));
  if (input.query?.trim()) {
    const pattern = `%${input.query.trim()}%`;
    conditions.push(or(
      ilike(parcels.parcelId, pattern),
      ilike(parcels.parcelNumber, pattern),
      ilike(parcels.surveyPlanNumber, pattern),
      ilike(parcels.address, pattern),
      ilike(parcels.state, pattern),
      ilike(parcels.lga, pattern),
    ));
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const [totalRow] = await db.select({ total: count() }).from(parcels).where(where);
  const rows = await db.select().from(parcels).where(where).orderBy(desc(parcels.createdAt), desc(parcels.id)).limit(limit).offset((page - 1) * limit);

  return { parcels: rows.map(toParcelRecord), total: Number(totalRow?.total ?? 0), page, limit };
}

export async function getParcelById(id: number): Promise<ParcelRecord | null> {
  const db = await requireDb();
  const [row] = await db.select().from(parcels).where(eq(parcels.id, id)).limit(1);
  return row ? toParcelRecord(row) : null;
}

export async function getParcelByNumber(parcelNumber: string): Promise<ParcelRecord | null> {
  const db = await requireDb();
  const [row] = await db.select().from(parcels).where(or(eq(parcels.parcelNumber, parcelNumber), eq(parcels.parcelId, parcelNumber))).limit(1);
  return row ? toParcelRecord(row) : null;
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
  country?: string;
}): Promise<ParcelRecord> {
  if (!Number.isFinite(input.areaSquareMeters) || input.areaSquareMeters <= 0) {
    throw new Error("areaSquareMeters must be a positive number");
  }
  const surveyorId = input.surveyorId?.trim();
  if (!input.surveyPlanNumber.trim() || !input.landUseType.trim() || !surveyorId) {
    throw new Error("surveyPlanNumber, landUseType, and surveyorId are required");
  }

  const coordinates = validateGeometry(input.geometryGeoJSON);
  const parcelNumber = nextParcelNumber(input.state, input.lga);
  const db = await requireDb();
  const [row] = await db.insert(parcels).values({
    parcelId: parcelNumber,
    parcelNumber,
    surveyPlanNumber: input.surveyPlanNumber.trim(),
    state: input.state.trim(),
    lga: input.lga.trim(),
    ward: input.ward?.trim() || null,
    address: input.streetAddress?.trim() || null,
    area: input.areaSquareMeters,
    geometryGeoJSON: input.geometryGeoJSON,
    latitude: coordinates ? String(coordinates.lat) : null,
    longitude: coordinates ? String(coordinates.lng) : null,
    landUse: input.landUseType.trim(),
    status: "pending_verification",
    estimatedValue: null,
    notes: input.notes?.trim() || null,
    surveyorId,
    country: input.country?.trim() || undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  if (!row) throw new Error("Parcel creation returned no database record");
  return toParcelRecord(row);
}

export async function updateParcel(id: number, data: { streetAddress?: string; landUseType?: string; notes?: string }): Promise<ParcelRecord> {
  const existing = await getParcelById(id);
  if (!existing) throw new Error("Parcel not found");
  if (existing.status === "registered") {
    throw new Error("Registered parcels require a formal amendment workflow before updates");
  }

  const db = await requireDb();
  const [updated] = await db.update(parcels).set({
    ...(data.streetAddress !== undefined ? { address: data.streetAddress.trim() || null } : {}),
    ...(data.landUseType !== undefined ? { landUse: data.landUseType.trim() || null } : {}),
    ...(data.notes !== undefined ? { notes: data.notes.trim() || null } : {}),
    updatedAt: new Date(),
  }).where(eq(parcels.id, id)).returning();
  if (!updated) throw new Error("Parcel update did not return a database record");
  return toParcelRecord(updated);
}

export async function verifyParcel(id: number, verifierId: string): Promise<ParcelRecord> {
  if (!verifierId.trim()) throw new Error("verifierId is required");
  const existing = await getParcelById(id);
  if (!existing) throw new Error("Parcel not found");
  if (existing.status === "verified" || existing.status === "registered") return existing;

  const db = await requireDb();
  const now = new Date();
  const [updated] = await db.update(parcels).set({
    status: "verified",
    verifierId: verifierId.trim(),
    verifiedAt: now,
    updatedAt: now,
  }).where(eq(parcels.id, id)).returning();
  if (!updated) throw new Error("Parcel verification did not return a database record");
  return toParcelRecord(updated);
}

export async function batchAssignParcels(parcelIds: number[], surveyorId: string): Promise<ParcelRecord[]> {
  const uniqueIds = [...new Set(parcelIds.filter(Number.isInteger))];
  if (!uniqueIds.length || !surveyorId.trim()) throw new Error("parcelIds and surveyorId are required");
  const db = await requireDb();
  const updated = await db.update(parcels).set({ surveyorId: surveyorId.trim(), updatedAt: new Date() }).where(inArray(parcels.id, uniqueIds)).returning();
  if (updated.length !== uniqueIds.length) throw new Error("One or more parcels were not found for assignment");
  return updated.map(toParcelRecord);
}

export async function batchVerifyParcels(parcelIds: number[], verifierId: string): Promise<ParcelRecord[]> {
  const uniqueIds = [...new Set(parcelIds.filter(Number.isInteger))];
  if (!uniqueIds.length || !verifierId.trim()) throw new Error("parcelIds and verifierId are required");
  const db = await requireDb();
  const now = new Date();
  const updated = await db.update(parcels).set({
    status: "verified",
    verifierId: verifierId.trim(),
    verifiedAt: now,
    updatedAt: now,
  }).where(and(inArray(parcels.id, uniqueIds), ne(parcels.status, "registered"))).returning();
  if (updated.length !== uniqueIds.length) throw new Error("One or more parcels were not found or cannot be verified");
  return updated.map(toParcelRecord);
}

export async function geospatialSearch(input: { centerLat: number; centerLng: number; radiusKm?: number; limit?: number }) {
  if (!Number.isFinite(input.centerLat) || !Number.isFinite(input.centerLng)) {
    throw new Error("centerLat and centerLng must be finite numbers");
  }
  const radiusKm = Math.min(500, Math.max(0.01, input.radiusKm ?? 5));
  const limit = Math.min(500, Math.max(1, Math.floor(input.limit ?? 50)));
  const db = await requireDb();
  const rows = await db.select().from(parcels).where(and(isNotNull(parcels.latitude), isNotNull(parcels.longitude)));

  const results = rows.map(toParcelRecord)
    .flatMap((parcel) => {
      if (!parcel.coordinates) return [];
      const distance = calculateDistance(input.centerLat, input.centerLng, parcel.coordinates.lat, parcel.coordinates.lng);
      return distance <= radiusKm ? [{ ...parcel, distance }] : [];
    })
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit);

  return { parcels: results, total: results.length, radiusKm };
}
