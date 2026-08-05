import { randomUUID } from "crypto";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { requireDb } from "./db";
import { publishGeoInnovationAlertNotification } from "./geoaiMobileNotificationService";
import { initializeGeoMonitorSchedule } from "./geoInnovationMonitorService";
import {
  geoChangeAlerts,
  geoMonitorSubscriptions,
  geoPublicReleases,
  geoStacCollections,
  geoStacItems,
  parcels,
} from "../drizzle/schema";

export type EvidenceStatus = "verified" | "provisional" | "insufficient_evidence" | "rejected";
export type AlertSeverity = "low" | "medium" | "high" | "critical";

function generatedKey(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function jsonRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function jsonArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function validBbox(value: unknown): number[] {
  const bbox = jsonArray(value, "bbox").map(Number);
  if (bbox.length !== 4 && bbox.length !== 6) throw new Error("bbox must have four or six numeric ordinates");
  if (!bbox.every(Number.isFinite)) throw new Error("bbox must contain finite numeric ordinates");
  if (bbox[0] > bbox[2] || bbox[1] > bbox[3]) throw new Error("bbox axis ordering is invalid");
  return bbox;
}

function parseStoredGeometry(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function featureBbox(geometry: Record<string, unknown> | null, longitude: string | null, latitude: string | null): number[] | null {
  if (geometry && geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    const [longitudeValue, latitudeValue] = geometry.coordinates.map(Number);
    if (Number.isFinite(longitudeValue) && Number.isFinite(latitudeValue)) return [longitudeValue, latitudeValue, longitudeValue, latitudeValue];
  }
  const lon = Number(longitude);
  const lat = Number(latitude);
  if (Number.isFinite(lon) && Number.isFinite(lat)) return [lon, lat, lon, lat];
  return null;
}

function geometryIntersectsBbox(geometry: Record<string, unknown> | null, bbox: number[] | undefined, longitude: string | null, latitude: string | null): boolean {
  if (!bbox) return true;
  const candidateBbox = featureBbox(geometry, longitude, latitude);
  if (!candidateBbox) return false;
  return !(candidateBbox[2] < bbox[0] || candidateBbox[0] > bbox[2] || candidateBbox[3] < bbox[1] || candidateBbox[1] > bbox[3]);
}

export async function createStacCollection(input: {
  collectionKey: string;
  title: string;
  description: string;
  license: string;
  spatialExtent: Record<string, unknown>;
  temporalExtent: Record<string, unknown>;
  providers?: unknown[];
  keywords?: unknown[];
}, userId: number) {
  const db = await requireDb();
  const [collection] = await db.insert(geoStacCollections).values({
    collectionKey: input.collectionKey.trim(),
    title: input.title.trim(),
    description: input.description.trim(),
    license: input.license.trim(),
    spatialExtent: input.spatialExtent,
    temporalExtent: input.temporalExtent,
    providers: input.providers ?? [],
    keywords: input.keywords ?? [],
    createdBy: userId,
  }).returning();
  return collection;
}

export async function createStacItem(input: {
  itemKey: string;
  collectionId: number;
  assetId?: string;
  parcelId?: number;
  geometryGeojson?: Record<string, unknown>;
  bbox: unknown;
  itemDatetime?: Date;
  startDatetime?: Date;
  endDatetime?: Date;
  properties?: Record<string, unknown>;
  links?: unknown[];
  evidenceStatus: EvidenceStatus;
}, userId: number) {
  const db = await requireDb();
  const [item] = await db.insert(geoStacItems).values({
    itemKey: input.itemKey.trim(),
    collectionId: input.collectionId,
    assetId: input.assetId,
    parcelId: input.parcelId,
    geometryGeojson: input.geometryGeojson,
    bbox: validBbox(input.bbox),
    itemDatetime: input.itemDatetime,
    startDatetime: input.startDatetime,
    endDatetime: input.endDatetime,
    properties: input.properties ?? {},
    links: input.links ?? [],
    evidenceStatus: input.evidenceStatus,
    createdBy: userId,
  }).returning();
  return item;
}

export async function listStacCollections() {
  const db = await requireDb();
  return db.select().from(geoStacCollections).orderBy(desc(geoStacCollections.updatedAt));
}

export async function searchStacItems(input: {
  collectionId?: number;
  parcelId?: number;
  evidenceStatus?: EvidenceStatus;
  startDatetime?: Date;
  endDatetime?: Date;
  limit: number;
}) {
  const db = await requireDb();
  const conditions = [];
  if (input.collectionId) conditions.push(eq(geoStacItems.collectionId, input.collectionId));
  if (input.parcelId) conditions.push(eq(geoStacItems.parcelId, input.parcelId));
  if (input.evidenceStatus) conditions.push(eq(geoStacItems.evidenceStatus, input.evidenceStatus));
  if (input.startDatetime) conditions.push(gte(geoStacItems.itemDatetime, input.startDatetime));
  if (input.endDatetime) conditions.push(lte(geoStacItems.itemDatetime, input.endDatetime));
  return db.select().from(geoStacItems)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(geoStacItems.itemDatetime), desc(geoStacItems.createdAt))
    .limit(input.limit);
}

export async function getOgcFeatureCollection(input: {
  bbox?: number[];
  state?: string;
  lga?: string;
  status?: "draft" | "pending_verification" | "verified" | "registered" | "transferred" | "disputed" | "archived";
  limit: number;
}) {
  const db = await requireDb();
  const conditions = [];
  if (input.state) conditions.push(eq(parcels.state, input.state));
  if (input.lga) conditions.push(eq(parcels.lga, input.lga));
  if (input.status) conditions.push(eq(parcels.status, input.status));
  const rows = await db.select({
    id: parcels.id,
    parcelId: parcels.parcelId,
    status: parcels.status,
    state: parcels.state,
    lga: parcels.lga,
    ward: parcels.ward,
    landUse: parcels.landUse,
    area: parcels.area,
    geometryGeoJSON: parcels.geometryGeoJSON,
    latitude: parcels.latitude,
    longitude: parcels.longitude,
    updatedAt: parcels.updatedAt,
  }).from(parcels).where(conditions.length ? and(...conditions) : undefined).limit(Math.min(input.limit * 4, 1000));

  const features = rows.flatMap((parcel) => {
    const storedGeometry = parseStoredGeometry(parcel.geometryGeoJSON);
    const longitude = Number(parcel.longitude);
    const latitude = Number(parcel.latitude);
    const geometry = storedGeometry ?? (Number.isFinite(longitude) && Number.isFinite(latitude)
      ? { type: "Point", coordinates: [longitude, latitude] }
      : null);
    if (!geometry || !geometryIntersectsBbox(geometry, input.bbox, parcel.longitude, parcel.latitude)) return [];
    return [{
      type: "Feature" as const,
      id: parcel.parcelId,
      geometry,
      properties: {
        parcel_id: parcel.parcelId,
        status: parcel.status,
        state: parcel.state,
        lga: parcel.lga,
        ward: parcel.ward,
        land_use: parcel.landUse,
        declared_area_m2: parcel.area,
        geometry_representation: storedGeometry ? "registered_geometry" : "persisted_reference_point",
        updated_at: parcel.updatedAt?.toISOString() ?? null,
        non_authoritative_notice: "Feature output supports interoperability and discovery. It is not a certified survey, title, or legal boundary representation.",
      },
    }];
  }).slice(0, input.limit);

  return {
    type: "FeatureCollection" as const,
    timeStamp: new Date().toISOString(),
    numberReturned: features.length,
    numberMatched: features.length,
    links: [],
    features,
    metadata: {
      collection: "parcels",
      crs: "EPSG:4326",
      queryable: ["state", "lga", "status", "bbox"],
      evidence_policy: "Feature response excludes owner, title, transaction, and unreviewed sensitive data.",
    },
  };
}

export async function createGeoMonitor(input: {
  parcelId?: number;
  innovationType: "change_vectorization" | "hazard_profile" | "field_geofence" | "zonal_statistics";
  scheduleHint: string;
  settings: Record<string, unknown>;
  nextEvaluationAt?: Date;
}, userId: number) {
  const db = await requireDb();
  const scheduleHint = input.scheduleHint.trim();
  const nextEvaluationAt = await initializeGeoMonitorSchedule({
    scheduleHint,
    settings: input.settings,
    requestedNextEvaluationAt: input.nextEvaluationAt,
  });
  const [subscription] = await db.insert(geoMonitorSubscriptions).values({
    subscriptionKey: generatedKey("monitor"),
    parcelId: input.parcelId,
    requestedBy: userId,
    innovationType: input.innovationType,
    scheduleHint,
    settings: input.settings,
    nextEvaluationAt,
  }).returning();
  return subscription;
}

export async function listGeoMonitors(input: { userId: number; parcelId?: number; includeAll?: boolean }) {
  const db = await requireDb();
  const conditions = [];
  if (!input.includeAll) conditions.push(eq(geoMonitorSubscriptions.requestedBy, input.userId));
  if (input.parcelId) conditions.push(eq(geoMonitorSubscriptions.parcelId, input.parcelId));
  return db.select().from(geoMonitorSubscriptions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(geoMonitorSubscriptions.createdAt));
}

export async function setGeoMonitorStatus(subscriptionId: number, status: "active" | "paused" | "disabled") {
  const db = await requireDb();
  const [updated] = await db.update(geoMonitorSubscriptions)
    .set({ status, updatedAt: new Date() })
    .where(eq(geoMonitorSubscriptions.id, subscriptionId))
    .returning();
  if (!updated) throw new Error("Geo monitor subscription was not found");
  return updated;
}

export async function recordChangeAlerts(input: {
  runId: number;
  parcelId?: number;
  subscriptionId?: number;
  resultSummary: Record<string, unknown>;
  evidenceStatus: EvidenceStatus;
  recipientId?: number | null;
}) {
  const features = jsonRecord(input.resultSummary.feature_collection, "change vectorization feature_collection").features;
  if (!Array.isArray(features)) return [];
  const db = await requireDb();
  const alerts = [];
  for (const candidate of features) {
    const feature = jsonRecord(candidate, "change vector feature");
    const properties = feature.properties && typeof feature.properties === "object" ? feature.properties as Record<string, unknown> : {};
    const area = Number(properties.area_m2 ?? 0);
    const severity: AlertSeverity = area >= 100_000 ? "critical" : area >= 25_000 ? "high" : area >= 5_000 ? "medium" : "low";
    const [alert] = await db.insert(geoChangeAlerts).values({
      alertKey: generatedKey("change-alert"),
      parcelId: input.parcelId,
      runId: input.runId,
      subscriptionId: input.subscriptionId,
      alertType: "vectorized_change",
      severity,
      evidenceStatus: input.evidenceStatus,
      alertGeometryGeojson: feature.geometry && typeof feature.geometry === "object" ? feature.geometry as Record<string, unknown> : null,
      evidence: { runId: input.runId, properties, feature },
      summary: `Vectorized change candidate with ${Number.isFinite(area) ? area.toFixed(2) : "unknown"} m² declared area. Human evidence review is required.`,
    }).returning();
    alerts.push(alert);
    await publishGeoInnovationAlertNotification({
      recipientId: input.recipientId,
      alertId: alert.id,
      alertKey: alert.alertKey,
      runId: input.runId,
      severity,
      summary: alert.summary,
    });
  }
  return alerts;
}

export async function listChangeAlerts(input: {
  parcelId?: number;
  runId?: number;
  status?: "open" | "acknowledged" | "investigating" | "resolved" | "dismissed";
  limit: number;
}) {
  const db = await requireDb();
  const conditions = [];
  if (input.parcelId) conditions.push(eq(geoChangeAlerts.parcelId, input.parcelId));
  if (input.runId) conditions.push(eq(geoChangeAlerts.runId, input.runId));
  if (input.status) conditions.push(eq(geoChangeAlerts.status, input.status));
  return db.select().from(geoChangeAlerts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(geoChangeAlerts.createdAt))
    .limit(input.limit);
}

export async function acknowledgeChangeAlert(alertId: number, userId: number, status: "acknowledged" | "investigating") {
  const db = await requireDb();
  const [updated] = await db.update(geoChangeAlerts).set({
    status,
    acknowledgedBy: userId,
    acknowledgedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(geoChangeAlerts.id, alertId)).returning();
  if (!updated) throw new Error("Geo change alert was not found");
  return updated;
}

export async function resolveChangeAlert(alertId: number, userId: number, status: "resolved" | "dismissed", resolutionNotes: string) {
  const db = await requireDb();
  const [updated] = await db.update(geoChangeAlerts).set({
    status,
    resolvedBy: userId,
    resolvedAt: new Date(),
    resolutionNotes: resolutionNotes.trim(),
    updatedAt: new Date(),
  }).where(eq(geoChangeAlerts.id, alertId)).returning();
  if (!updated) throw new Error("Geo change alert was not found");
  return updated;
}

export async function createPublicRelease(input: {
  parcelId?: number;
  sourceRunId?: number;
  privacyMethod: string;
  privacyParameters: Record<string, unknown>;
  releasedFeature: Record<string, unknown>;
  license: string;
  legalNotice: string;
}, userId: number) {
  const db = await requireDb();
  const [release] = await db.insert(geoPublicReleases).values({
    releaseKey: generatedKey("public-release"),
    parcelId: input.parcelId,
    sourceRunId: input.sourceRunId,
    requestedBy: userId,
    privacyMethod: input.privacyMethod,
    privacyParameters: input.privacyParameters,
    releasedFeature: input.releasedFeature,
    license: input.license,
    legalNotice: input.legalNotice,
  }).returning();
  return release;
}

export async function approvePublicRelease(releaseId: number, approverId: number) {
  const db = await requireDb();
  const [release] = await db.update(geoPublicReleases).set({
    status: "approved",
    approvedBy: approverId,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(geoPublicReleases.id, releaseId), eq(geoPublicReleases.status, "draft"))).returning();
  if (!release) throw new Error("Only a draft public release can be approved");
  return release;
}

export async function publishPublicRelease(releaseId: number, actorId: number) {
  const db = await requireDb();
  const [release] = await db.update(geoPublicReleases).set({
    status: "published",
    publishedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(geoPublicReleases.id, releaseId), eq(geoPublicReleases.status, "approved"))).returning();
  if (!release) throw new Error("Only an approved public release can be published");
  if (!release.releasedFeature) throw new Error("Public release has no governed released feature");
  return { ...release, publishedBy: actorId };
}

export async function revokePublicRelease(releaseId: number) {
  const db = await requireDb();
  const [release] = await db.update(geoPublicReleases).set({
    status: "revoked",
    revokedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(geoPublicReleases.id, releaseId), eq(geoPublicReleases.status, "published"))).returning();
  if (!release) throw new Error("Only a published public release can be revoked");
  return release;
}

export async function listPublicReleases(input: { status?: "draft" | "approved" | "published" | "revoked"; limit: number }) {
  const db = await requireDb();
  return db.select().from(geoPublicReleases)
    .where(input.status ? eq(geoPublicReleases.status, input.status) : undefined)
    .orderBy(desc(geoPublicReleases.createdAt))
    .limit(input.limit);
}
