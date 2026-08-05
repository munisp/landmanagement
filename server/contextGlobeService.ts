import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { contextEvents, contextLayers, contextLayerSubscriptions } from "../drizzle/schema";
import { requireDb } from "./db";

const MAX_CONTEXT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CONTEXT_EVENTS = 1_000;
const LAYER_KEY_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;

function normalizeKeys(input?: string[]) {
  if (!input?.length) return undefined;
  const keys = [...new Set(input.map((key) => key.trim().toLowerCase()))].sort();
  if (keys.length > 8 || keys.some((key) => !LAYER_KEY_PATTERN.test(key))) throw new Error("Invalid Context Globe layer selection");
  return keys;
}

function normalizedWindow(start?: string, end?: string) {
  const now = Date.now();
  const parsedStart = start ? Date.parse(start) : now - 24 * 60 * 60 * 1000;
  const parsedEnd = end ? Date.parse(end) : now;
  if (!Number.isFinite(parsedStart) || !Number.isFinite(parsedEnd) || parsedStart > parsedEnd || parsedEnd - parsedStart > MAX_CONTEXT_WINDOW_MS || parsedEnd > now + 5 * 60 * 1000) {
    throw new Error("Context Globe time window must be valid, no more than 30 days, and cannot end in the distant future");
  }
  return { start: new Date(parsedStart), end: new Date(parsedEnd) };
}

export async function listContextLayers(userId: number) {
  const db = await requireDb();
  const layers = await db
    .select({
      key: contextLayers.layerKey,
      kind: contextLayers.kind,
      displayName: contextLayers.displayName,
      description: contextLayers.description,
      sourceName: contextLayers.sourceName,
      attribution: contextLayers.attribution,
      refreshSeconds: contextLayers.refreshSeconds,
      defaultEnabled: contextLayers.defaultEnabled,
      enabled: contextLayers.enabled,
      updatedAt: contextLayers.updatedAt,
    })
    .from(contextLayers)
    .where(eq(contextLayers.enabled, true));
  const subscriptions = await db
    .select({ layerId: contextLayerSubscriptions.layerId, enabled: contextLayerSubscriptions.enabled })
    .from(contextLayerSubscriptions)
    .where(eq(contextLayerSubscriptions.userId, userId));
  const preference = new Map(subscriptions.map((subscription) => [subscription.layerId, subscription.enabled]));
  const layerIds = await db.select({ id: contextLayers.id, key: contextLayers.layerKey }).from(contextLayers).where(eq(contextLayers.enabled, true));
  const idByKey = new Map(layerIds.map((layer) => [layer.key, layer.id]));
  return layers.map((layer) => ({
    ...layer,
    userEnabled: preference.get(idByKey.get(layer.key) ?? -1) ?? layer.defaultEnabled,
  }));
}

export async function setContextLayerSubscription(userId: number, layerKey: string, enabled: boolean) {
  const normalized = normalizeKeys([layerKey])![0];
  const db = await requireDb();
  const [layer] = await db.select({ id: contextLayers.id, key: contextLayers.layerKey }).from(contextLayers).where(and(eq(contextLayers.layerKey, normalized), eq(contextLayers.enabled, true)));
  if (!layer) throw new Error("Context Globe layer is unavailable");
  const [saved] = await db
    .insert(contextLayerSubscriptions)
    .values({ userId, layerId: layer.id, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [contextLayerSubscriptions.userId, contextLayerSubscriptions.layerId],
      set: { enabled, updatedAt: new Date() },
    })
    .returning();
  return { layerKey: layer.key, enabled: saved.enabled, updatedAt: saved.updatedAt };
}

export async function listContextEvents(params: {
  userId: number;
  layerKeys?: string[];
  start?: string;
  end?: string;
  limit?: number;
}) {
  const layerKeys = normalizeKeys(params.layerKeys);
  const window = normalizedWindow(params.start, params.end);
  const db = await requireDb();
  const layerRows = await db
    .select({ id: contextLayers.id, key: contextLayers.layerKey, attribution: contextLayers.attribution, sourceName: contextLayers.sourceName })
    .from(contextLayers)
    .where(layerKeys?.length ? and(eq(contextLayers.enabled, true), inArray(contextLayers.layerKey, layerKeys)) : eq(contextLayers.enabled, true));
  if (!layerRows.length) return { features: [], layers: [], window };
  const max = Math.min(MAX_CONTEXT_EVENTS, Math.max(1, params.limit ?? 500));
  const rows = await db
    .select({
      id: contextEvents.id,
      sourceEventKey: contextEvents.sourceEventKey,
      sourceUrl: contextEvents.sourceUrl,
      sourceObservedAt: contextEvents.sourceObservedAt,
      sourceUpdatedAt: contextEvents.sourceUpdatedAt,
      expiresAt: contextEvents.expiresAt,
      severity: contextEvents.severity,
      urgency: contextEvents.urgency,
      geometry: contextEvents.geometry,
      bbox: contextEvents.bbox,
      properties: contextEvents.properties,
      qualityState: contextEvents.qualityState,
      layerId: contextEvents.layerId,
      layerKey: contextLayers.layerKey,
      attribution: contextLayers.attribution,
      sourceName: contextLayers.sourceName,
    })
    .from(contextEvents)
    .innerJoin(contextLayers, eq(contextEvents.layerId, contextLayers.id))
    .where(and(
      inArray(contextEvents.layerId, layerRows.map((layer) => layer.id)),
      eq(contextEvents.eventStatus, "active"),
      gte(contextEvents.sourceObservedAt, window.start),
      lte(contextEvents.sourceObservedAt, window.end),
    ))
    .orderBy(desc(contextEvents.sourceObservedAt))
    .limit(max);
  return {
    window,
    layers: layerRows.map((layer) => ({ key: layer.key, attribution: layer.attribution, sourceName: layer.sourceName })),
    features: rows.map((event) => ({
      type: "Feature" as const,
      id: `${event.layerKey}:${event.sourceEventKey}`,
      geometry: event.geometry,
      bbox: event.bbox ?? undefined,
      properties: {
        eventId: event.id,
        layerKey: event.layerKey,
        sourceEventKey: event.sourceEventKey,
        sourceUrl: event.sourceUrl,
        sourceObservedAt: event.sourceObservedAt.toISOString(),
        sourceUpdatedAt: event.sourceUpdatedAt?.toISOString() ?? null,
        expiresAt: event.expiresAt?.toISOString() ?? null,
        severity: event.severity,
        urgency: event.urgency,
        qualityState: event.qualityState,
        attribution: event.attribution,
        sourceName: event.sourceName,
        ...(event.properties as Record<string, unknown>),
      },
    })),
  };
}

export function contextWindowBounds(start?: string, end?: string) {
  return normalizedWindow(start, end);
}
