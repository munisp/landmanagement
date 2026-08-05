import * as SecureStore from "expo-secure-store";
import NetInfo from "@react-native-community/netinfo";
import { getApiBaseUrl } from "../lib/runtimeConfig";

const ACCESS_TOKEN_KEY = "idlr.mobile.access_token";
const REFRESH_TOKEN_KEY = "idlr.mobile.refresh_token";
const TOKEN_EXPIRY_KEY = "idlr.mobile.access_token_expires_at";

export class MobileApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "MobileApiError";
  }
}

export type MobileSessionTokens = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
};

export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getStoredSessionTokens(): Promise<MobileSessionTokens | null> {
  const [accessToken, refreshToken, expiryValue] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(TOKEN_EXPIRY_KEY),
  ]);
  if (!accessToken) return null;
  const expiresAt = expiryValue ? Number(expiryValue) : null;
  return {
    accessToken,
    refreshToken,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
  };
}

export async function setAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export async function setStoredSessionTokens(tokens: MobileSessionTokens): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
  else await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  if (tokens.expiresAt) await SecureStore.setItemAsync(TOKEN_EXPIRY_KEY, String(tokens.expiresAt));
  else await SecureStore.deleteItemAsync(TOKEN_EXPIRY_KEY);
}

export async function clearAuthToken(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(TOKEN_EXPIRY_KEY),
  ]);
}

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected === true && state.isInternetReachable !== false;
}

function trpcUrl(procedure: string, input?: unknown): string {
  const endpoint = `${getApiBaseUrl()}/trpc/${procedure}`;
  if (input === undefined) return endpoint;
  return `${endpoint}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
}

function errorMessage(payload: any): string {
  return payload?.error?.json?.message
    ?? payload?.error?.message
    ?? payload?.message
    ?? "The platform could not complete this request";
}

function unpackTrpc(payload: any): any {
  const envelope = Array.isArray(payload) ? payload[0] : payload;
  if (envelope?.error) {
    throw new MobileApiError(errorMessage(envelope), envelope.error?.data?.code ?? envelope.error?.code, undefined, envelope.error);
  }
  if (envelope?.result?.data?.json !== undefined) return envelope.result.data.json;
  if (envelope?.result?.data !== undefined) return envelope.result.data;
  if (envelope?.json !== undefined) return envelope.json;
  return envelope;
}

async function requestTrpc<T>(
  procedure: string,
  method: "GET" | "POST",
  input?: unknown,
  accessToken?: string | null,
): Promise<T> {
  const token = accessToken ?? await getAuthToken();
  if (!token) throw new MobileApiError("Sign in is required before accessing protected platform data", "UNAUTHORIZED", 401);

  const response = await fetch(
    method === "GET" ? trpcUrl(procedure, input) : trpcUrl(procedure),
    {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: method === "POST" ? JSON.stringify({ json: input ?? {} }) : undefined,
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new MobileApiError(errorMessage(payload), payload?.error?.data?.code, response.status, payload?.error ?? payload);
  }
  return unpackTrpc(payload) as T;
}

export const trpcQuery = <T>(procedure: string, input?: unknown, accessToken?: string | null) =>
  requestTrpc<T>(procedure, "GET", input, accessToken);

export const trpcMutation = <T>(procedure: string, input?: unknown, accessToken?: string | null) =>
  requestTrpc<T>(procedure, "POST", input, accessToken);

export interface MobileNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export async function listNotifications(params: { limit?: number; offset?: number; unreadOnly?: boolean }, token?: string | null) {
  const result = await trpcQuery<{ notifications: MobileNotification[]; total: number }>("notificationInbox.list", params, token);
  const unread = await trpcQuery<{ count: number }>("notificationInbox.getUnreadCount", undefined, token);
  return { ...result, unreadCount: unread.count };
}

export const markNotificationRead = (notificationId: number, token?: string | null) =>
  trpcMutation<{ success: boolean }>("notificationInbox.markAsRead", { notificationId }, token);

export const dismissNotification = (notificationId: number, token?: string | null) =>
  trpcMutation<{ success: boolean }>("notificationInbox.dismiss", { notificationId }, token);

export const markAllNotificationsRead = (token?: string | null) =>
  trpcMutation<{ success: boolean; count: number }>("notificationInbox.markAllAsRead", {}, token);

export const registerPushToken = (token: string, platform: "ios" | "android", accessToken?: string | null) =>
  trpcMutation<void>("notificationPreferences.registerPushToken", { token, platform }, accessToken);

export type GeoEvidenceStatus = "verified" | "provisional" | "insufficient_evidence" | "rejected";
export type GeoAnalysisType =
  | "spatial_correctness"
  | "network_access"
  | "imagery_analysis"
  | "change_detection"
  | "lidar_qc"
  | "model_governance"
  | "suitability_analysis"
  | "cartography_review"
  | "arcgis_automation"
  | "field_evidence_review"
  | "geometry_quality"
  | "hazard_profile"
  | "cog_readiness"
  | "stac_catalog"
  | "change_vectorization"
  | "accessibility_equity"
  | "field_geofence"
  | "zonal_statistics"
  | "privacy_release"
  | "ogc_features";
export type GeoAssetType =
  | "parcel_geometry"
  | "survey_plan"
  | "orthophoto"
  | "satellite_scene"
  | "raster"
  | "lidar_point_cloud"
  | "dem"
  | "dtm"
  | "dsm"
  | "road_network"
  | "field_observation"
  | "derived_product";

export type GeoAssetReference = {
  assetId: string;
  assetType: GeoAssetType;
  uri: string;
  dataSource: string;
  sourceCrs?: string;
  verticalCrs?: string;
  acquiredAt?: string;
  checksumSha256: string;
  qualityMetadata: Record<string, unknown>;
  provenance: Record<string, unknown>;
};

export type GeoAnalysisManifest = {
  analysisType: GeoAnalysisType;
  title: string;
  purpose: string;
  parcelId?: number;
  sourceAssets: GeoAssetReference[];
  analysisCrs?: string;
  outputCrs?: string;
  temporalWindow?: {
    start: string;
    end: string;
    seasonalComparable: boolean;
    mutualValidCoveragePct?: number;
  };
  networkAssumptions?: {
    mode: "drive" | "walk" | "cycle" | "transit";
    impedance: "travel_time" | "distance" | "cost";
    routerSource: string;
    maxSnapDistanceM: number;
  };
  modelContext?: {
    modelName: string;
    labelUnit: "parcel" | "scene" | "geographic_block" | "pixel" | "object";
    splitStrategy: "spatial_block" | "geographic_holdout" | "grouped_parcel" | "time_series";
    decisionThreshold?: number;
  };
  methodParameters: Record<string, unknown>;
  legalOrRegulatoryUse: boolean;
  allowProvisionalOutput: boolean;
};

export type GeoAnalysisRun = {
  id: number;
  runKey: string;
  parcelId: number | null;
  analysisType: GeoAnalysisType;
  title: string;
  purpose: string;
  policyVersion: string;
  status: "draft" | "queued" | "running" | "awaiting_review" | "completed" | "failed" | "cancelled";
  evidenceStatus: GeoEvidenceStatus;
  workflowId?: string | null;
  failureReason?: string | null;
  resultSummary?: Record<string, unknown> | null;
  uncertaintySummary?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type GeoPresentation = {
  run: GeoAnalysisRun;
  display: {
    allowedForDecisionPresentation: boolean;
    banner: string;
    checkpointSummary: { passed: number; required: number };
  };
  provenance: {
    purpose: string;
    legalOrRegulatoryUse: boolean;
    analysisCrs: string | null;
    outputCrs: string | null;
    sourceAssets: Array<{
      assetId: string;
      assetType: GeoAssetType;
      dataSource: string;
      uri: string;
      checksumSha256: string | null;
      sourceCrs: string | null;
      verticalCrs: string | null;
      acquiredAt: string | null;
      qualityMetadata: Record<string, unknown>;
      provenance: Record<string, unknown>;
    }>;
  };
  layers: Array<{
    artifactId: number;
    artifactType: string;
    uri: string;
    usableForVerifiedPresentation: boolean;
    metadata?: Record<string, unknown>;
  }>;
  qualityGates: Array<{
    key: string;
    name: string;
    required: boolean;
    status: string;
    notes?: string | null;
  }>;
  uncertaintySummary?: Record<string, unknown> | null;
};

export type GeoEvidenceReport = { markdown: string };

export type GeoArcgisOperation = {
  id: number;
  operationKey: string;
  runId: number | null;
  operationType: string;
  targetWorkspaceUri: string;
  status: "requested" | "approved" | "running" | "completed" | "failed" | "cancelled";
  operationPlan: Record<string, unknown>;
  recoveryPlan: Record<string, unknown>;
  externalJobId?: string | null;
  failureReason?: string | null;
  approvedAt?: string | null;
  executedAt?: string | null;
  createdAt: string;
};

export type GeoAssetCatalogRecord = {
  id: number;
  assetId: string;
  parcelId: number | null;
  assetType: GeoAssetType;
  uri: string;
  checksumSha256: string | null;
  mediaType: string | null;
  dataSource: string;
  acquiredAt: string | null;
  sourceCrs: string | null;
  verticalCrs: string | null;
  qualityMetadata: Record<string, unknown>;
  provenance: Record<string, unknown>;
  evidenceStatus: GeoEvidenceStatus;
  createdAt: string;
};

export const listGeoAiRuns = (input: { parcelId?: number; limit?: number } = {}, token?: string | null) =>
  trpcQuery<GeoAnalysisRun[]>("geoai.listRuns", input, token);

export const listGeoAiAssets = (input: { parcelId?: number; assetTypes?: GeoAssetType[]; limit?: number } = {}, token?: string | null) =>
  trpcQuery<GeoAssetCatalogRecord[]>("geoai.listAssets", input, token);

export const getGeoAiRun = (runId: number, token?: string | null) =>
  trpcQuery<{ run: GeoAnalysisRun; checkpoints: any[]; artifacts: any[] }>("geoai.getRun", { runId }, token);

export const getGeoAiPresentation = (runId: number, token?: string | null) =>
  trpcQuery<GeoPresentation>("geoai.getPresentation", { runId }, token);

export const getGeoAiEvidenceReport = (runId: number, token?: string | null) =>
  trpcQuery<GeoEvidenceReport>("geoai.getEvidenceReport", { runId }, token);

export const createGeoAiRun = (manifest: GeoAnalysisManifest, token?: string | null) =>
  trpcMutation<{ run: GeoAnalysisRun; checkpoints: any[] }>("geoai.createRun", { manifest }, token);

export const queueGeoAiRun = (runId: number, token?: string | null) =>
  trpcMutation<GeoAnalysisRun>("geoai.queueRun", { runId }, token);

export const reviewGeoAiRun = (
  runId: number,
  decision: "verified" | "rejected",
  reviewNotes?: string,
  token?: string | null,
) => trpcMutation<GeoAnalysisRun>("geoai.reviewRun", { runId, decision, reviewNotes }, token);

export const registerGeoAiAsset = (
  asset: GeoAssetReference,
  parcelId?: number,
  evidenceStatus: GeoEvidenceStatus = "insufficient_evidence",
  token?: string | null,
) => trpcMutation<any>("geoai.registerAsset", { asset, parcelId, evidenceStatus }, token);

export const addGeoAiArtifact = (input: {
  runId: number;
  assetId?: string;
  artifactType: string;
  uri: string;
  checksumSha256?: string;
  mediaType?: string;
  isPrimary?: boolean;
  metadata?: Record<string, unknown>;
}, token?: string | null) => trpcMutation<any>("geoai.addArtifact", input, token);

export const uploadStorageAsset = (input: { key: string; data: string; contentType: string }, token?: string | null) =>
  trpcMutation<{ key: string; url: string; checksumSha256: string; byteLength: number }>("storage.upload", input, token);

export const listGeoAiArcgisOperations = (limit = 100, token?: string | null) =>
  trpcQuery<GeoArcgisOperation[]>("geoai.listArcgisOperations", { limit }, token);

export const getGeoAiArcgisOperation = (operationId: number, token?: string | null) =>
  trpcQuery<GeoArcgisOperation>("geoai.getArcgisOperation", { operationId }, token);

export const refreshGeoAiArcgisOperation = (operationId: number, token?: string | null) =>
  trpcMutation<GeoArcgisOperation>("geoai.refreshArcgisOperation", { operationId }, token);

export const requestGeoAiArcgisOperation = (input: {
  runId?: number;
  operationType: string;
  operationPlan: Record<string, unknown>;
  recoveryPlan: Record<string, unknown>;
  targetWorkspaceUri: string;
}, token?: string | null) => trpcMutation<GeoArcgisOperation>("geoai.requestArcgisOperation", input, token);

export const approveGeoAiArcgisOperation = (operationId: number, externalJobId?: string, token?: string | null) =>
  trpcMutation<GeoArcgisOperation>("geoai.approveArcgisOperation", { operationId, externalJobId }, token);

export const executeApprovedGeoAiArcgisOperation = (operationId: number, token?: string | null) =>
  trpcMutation<GeoArcgisOperation>("geoai.executeArcgisOperation", { operationId }, token);


export type GeoStacCollection = {
  id: number;
  collectionKey: string;
  title: string;
  description: string;
  license: string;
  spatialExtent: Record<string, unknown>;
  temporalExtent: Record<string, unknown>;
  providers: unknown[];
  keywords: unknown[];
  createdAt: string;
  updatedAt: string;
};

export type GeoMonitor = {
  id: number;
  subscriptionKey: string;
  parcelId: number | null;
  innovationType: "change_vectorization" | "hazard_profile" | "field_geofence" | "zonal_statistics";
  scheduleHint: string;
  settings: Record<string, unknown>;
  status: "active" | "paused" | "disabled";
  nextEvaluationAt: string | null;
  lastEvaluationAt: string | null;
  createdAt: string;
};

export type GeoChangeAlert = {
  id: number;
  alertKey: string;
  parcelId: number | null;
  runId: number;
  subscriptionId: number | null;
  alertType: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "acknowledged" | "investigating" | "resolved" | "dismissed";
  evidenceStatus: GeoEvidenceStatus;
  alertGeometryGeojson: Record<string, unknown> | null;
  evidence: Record<string, unknown>;
  summary: string;
  resolutionNotes: string | null;
  createdAt: string;
};

export type GeoPublicRelease = {
  id: number;
  releaseKey: string;
  parcelId: number | null;
  sourceRunId: number | null;
  privacyMethod: string;
  privacyParameters: Record<string, unknown>;
  releasedFeature: Record<string, unknown> | null;
  license: string;
  legalNotice: string;
  status: "draft" | "approved" | "published" | "revoked";
  publishedAt: string | null;
  createdAt: string;
};

export const listGeoInnovationCollections = (token?: string | null) =>
  trpcQuery<GeoStacCollection[]>("geoInnovations.listStacCollections", undefined, token);

export const createGeoInnovationCollection = (input: {
  collectionKey: string;
  title: string;
  description: string;
  license: string;
  spatialExtent: Record<string, unknown>;
  temporalExtent: Record<string, unknown>;
  providers?: unknown[];
  keywords?: string[];
}, token?: string | null) => trpcMutation<GeoStacCollection>("geoInnovations.createStacCollection", input, token);

export const listGeoInnovationMonitors = (input: { parcelId?: number; includeAll?: boolean } = {}, token?: string | null) =>
  trpcQuery<GeoMonitor[]>("geoInnovations.listMonitors", input, token);

export const createGeoInnovationMonitor = (input: {
  parcelId?: number;
  innovationType: GeoMonitor["innovationType"];
  scheduleHint: string;
  settings: Record<string, unknown>;
  nextEvaluationAt?: string;
}, token?: string | null) => trpcMutation<GeoMonitor>("geoInnovations.createMonitor", input, token);

export const setGeoInnovationMonitorStatus = (subscriptionId: number, status: GeoMonitor["status"], token?: string | null) =>
  trpcMutation<GeoMonitor>("geoInnovations.setMonitorStatus", { subscriptionId, status }, token);

export const listGeoInnovationAlerts = (input: { parcelId?: number; runId?: number; status?: GeoChangeAlert["status"]; limit?: number } = {}, token?: string | null) =>
  trpcQuery<GeoChangeAlert[]>("geoInnovations.listChangeAlerts", input, token);

export const acknowledgeGeoInnovationAlert = (alertId: number, status: "acknowledged" | "investigating", token?: string | null) =>
  trpcMutation<GeoChangeAlert>("geoInnovations.acknowledgeChangeAlert", { alertId, status }, token);

export const resolveGeoInnovationAlert = (alertId: number, status: "resolved" | "dismissed", resolutionNotes: string, token?: string | null) =>
  trpcMutation<GeoChangeAlert>("geoInnovations.resolveChangeAlert", { alertId, status, resolutionNotes }, token);

export const listGeoInnovationReleases = (input: { status?: GeoPublicRelease["status"]; limit?: number } = {}, token?: string | null) =>
  trpcQuery<GeoPublicRelease[]>("geoInnovations.listPublicReleases", input, token);

export const requestGeoInnovationRelease = (runId: number, parcelId?: number, token?: string | null) =>
  trpcMutation<GeoPublicRelease>("geoInnovations.requestPublicRelease", { runId, parcelId }, token);

export const approveGeoInnovationRelease = (releaseId: number, token?: string | null) =>
  trpcMutation<GeoPublicRelease>("geoInnovations.approvePublicRelease", { releaseId }, token);

export const publishGeoInnovationRelease = (releaseId: number, token?: string | null) =>
  trpcMutation<GeoPublicRelease>("geoInnovations.publishPublicRelease", { releaseId }, token);

export const revokeGeoInnovationRelease = (releaseId: number, token?: string | null) =>
  trpcMutation<GeoPublicRelease>("geoInnovations.revokePublicRelease", { releaseId }, token);

export type GeoFeatureCollection = {
  type: "FeatureCollection";
  timeStamp: string;
  numberReturned: number;
  features: Array<{ type: "Feature"; id: string; geometry: Record<string, unknown>; properties: Record<string, unknown> }>;
  metadata: Record<string, unknown>;
};

export const getGeoInnovationParcelFeatures = (input: { bbox?: [number, number, number, number]; state?: string; lga?: string; status?: string; limit?: number } = {}, token?: string | null) =>
  trpcQuery<GeoFeatureCollection>("geoInnovations.getParcelFeatureCollection", input, token);


export type MobileEvidenceManifestAsset = {
  assetId: string;
  parcelId: number | null;
  assetType: GeoAssetType;
  checksumSha256: string | null;
  sourceCrs: string | null;
  verticalCrs: string | null;
  evidenceStatus: GeoEvidenceStatus;
  acquiredAt: string | null;
  updatedAt: string | null;
};

export type MobileEvidenceManifest = {
  generatedAt: string;
  parcelIds: number[];
  evidence: MobileEvidenceManifestAsset[];
  limitations: string[];
};

export type MobileEvidenceResult = {
  manifest: MobileEvidenceManifest;
  source: "network" | "secure_cache";
  expiresAt: string;
};

const MOBILE_EVIDENCE_CACHE_PREFIX = "idlr.mobile.geo_evidence.v1";
const MOBILE_EVIDENCE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MOBILE_EVIDENCE_REVALIDATE_MS = 6 * 60 * 60 * 1000;
const MOBILE_EVIDENCE_MAX_ASSETS = 100;

type MobileEvidenceCacheIndex = {
  generatedAt: string;
  parcelIds: number[];
  expiresAt: string;
  assetCount: number;
  limitations: string[];
};

function mobileEvidenceIndexKey(parcelId: number) {
  return `${MOBILE_EVIDENCE_CACHE_PREFIX}.${parcelId}.index`;
}

function mobileEvidenceAssetKey(parcelId: number, index: number) {
  return `${MOBILE_EVIDENCE_CACHE_PREFIX}.${parcelId}.asset.${index}`;
}

function safeManifestAsset(value: unknown): MobileEvidenceManifestAsset | null {
  if (!value || typeof value !== "object") return null;
  const asset = value as Record<string, unknown>;
  const assetId = typeof asset.assetId === "string" ? asset.assetId : null;
  const assetType = typeof asset.assetType === "string" ? asset.assetType as GeoAssetType : null;
  const evidenceStatus = typeof asset.evidenceStatus === "string" ? asset.evidenceStatus as GeoEvidenceStatus : null;
  if (!assetId || !assetType || !evidenceStatus) return null;
  const optionalText = (field: string): string | null => {
    const candidate = asset[field];
    return typeof candidate === "string" ? candidate : null;
  };
  const parcelId = typeof asset.parcelId === "number" && Number.isInteger(asset.parcelId) && asset.parcelId > 0 ? asset.parcelId : null;
  return {
    assetId,
    parcelId,
    assetType,
    checksumSha256: optionalText("checksumSha256"),
    sourceCrs: optionalText("sourceCrs"),
    verticalCrs: optionalText("verticalCrs"),
    evidenceStatus,
    acquiredAt: optionalText("acquiredAt"),
    updatedAt: optionalText("updatedAt"),
  };
}

function safeManifest(value: unknown): MobileEvidenceManifest | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const generatedAt = typeof candidate.generatedAt === "string" ? candidate.generatedAt : null;
  const parcelIds = Array.isArray(candidate.parcelIds)
    ? candidate.parcelIds.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0)
    : [];
  const evidence = Array.isArray(candidate.evidence)
    ? candidate.evidence.map(safeManifestAsset).filter((asset): asset is MobileEvidenceManifestAsset => asset !== null).slice(0, MOBILE_EVIDENCE_MAX_ASSETS)
    : [];
  const limitations = Array.isArray(candidate.limitations)
    ? candidate.limitations.filter((item): item is string => typeof item === "string").slice(0, 16)
    : [];
  if (!generatedAt || !parcelIds.length) return null;
  return { generatedAt, parcelIds: [...new Set(parcelIds)].sort((a, b) => a - b), evidence, limitations };
}

async function writeMobileEvidenceCache(parcelId: number, manifest: MobileEvidenceManifest): Promise<string> {
  const expiresAt = new Date(Date.now() + MOBILE_EVIDENCE_CACHE_MAX_AGE_MS).toISOString();
  const safeAssets = manifest.evidence.slice(0, MOBILE_EVIDENCE_MAX_ASSETS);
  const previous = await readMobileEvidenceCacheIndex(parcelId);
  await Promise.all([
    ...Array.from({ length: previous?.assetCount ?? 0 }, (_, index) => SecureStore.deleteItemAsync(mobileEvidenceAssetKey(parcelId, index))),
    ...safeAssets.map((asset, index) => SecureStore.setItemAsync(mobileEvidenceAssetKey(parcelId, index), JSON.stringify(asset))),
    SecureStore.setItemAsync(mobileEvidenceIndexKey(parcelId), JSON.stringify({
      generatedAt: manifest.generatedAt,
      parcelIds: manifest.parcelIds,
      expiresAt,
      assetCount: safeAssets.length,
      limitations: manifest.limitations,
    } satisfies MobileEvidenceCacheIndex)),
  ]);
  return expiresAt;
}

async function readMobileEvidenceCacheIndex(parcelId: number): Promise<MobileEvidenceCacheIndex | null> {
  const raw = await SecureStore.getItemAsync(mobileEvidenceIndexKey(parcelId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MobileEvidenceCacheIndex>;
    const assetCount = parsed.assetCount;
    if (
      typeof parsed.generatedAt !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      !Array.isArray(parsed.parcelIds) ||
      !Number.isInteger(assetCount) ||
      typeof assetCount !== "number" ||
      assetCount < 0 ||
      assetCount > MOBILE_EVIDENCE_MAX_ASSETS ||
      !Array.isArray(parsed.limitations)
    ) return null;
    return {
      generatedAt: parsed.generatedAt,
      expiresAt: parsed.expiresAt,
      parcelIds: parsed.parcelIds.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0),
      assetCount,
      limitations: parsed.limitations.filter((item): item is string => typeof item === "string").slice(0, 16),
    };
  } catch {
    return null;
  }
}

export async function clearMobileEvidenceCache(parcelId: number): Promise<void> {
  const index = await readMobileEvidenceCacheIndex(parcelId);
  await Promise.all([
    SecureStore.deleteItemAsync(mobileEvidenceIndexKey(parcelId)),
    ...Array.from({ length: index?.assetCount ?? 0 }, (_, item) => SecureStore.deleteItemAsync(mobileEvidenceAssetKey(parcelId, item))),
  ]);
}

export async function readMobileEvidenceCache(parcelId: number): Promise<MobileEvidenceResult | null> {
  const index = await readMobileEvidenceCacheIndex(parcelId);
  if (!index) return null;
  const expiry = Date.parse(index.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || !index.parcelIds.includes(parcelId)) {
    await clearMobileEvidenceCache(parcelId);
    return null;
  }
  const records = await Promise.all(Array.from({ length: index.assetCount }, (_, item) => SecureStore.getItemAsync(mobileEvidenceAssetKey(parcelId, item))));
  const evidence = records.flatMap((raw) => {
    if (!raw) return [];
    try {
      const asset = safeManifestAsset(JSON.parse(raw));
      return asset ? [asset] : [];
    } catch {
      return [];
    }
  });
  return {
    manifest: { generatedAt: index.generatedAt, parcelIds: index.parcelIds, evidence, limitations: index.limitations },
    source: "secure_cache",
    expiresAt: index.expiresAt,
  };
}

export async function getMobileParcelEvidence(parcelId: number, token?: string | null): Promise<MobileEvidenceResult> {
  if (!Number.isInteger(parcelId) || parcelId <= 0) throw new MobileApiError("A valid parcel identifier is required", "BAD_REQUEST", 400);
  const cached = await readMobileEvidenceCache(parcelId);
  const cacheAge = cached ? Date.now() - Date.parse(cached.manifest.generatedAt) : Number.POSITIVE_INFINITY;
  if (!(await isOnline())) {
    if (cached) return cached;
    throw new MobileApiError("No secure offline evidence cache exists for this parcel", "OFFLINE", 503);
  }
  if (cached && Number.isFinite(cacheAge) && cacheAge < MOBILE_EVIDENCE_REVALIDATE_MS) return cached;

  try {
    const accessToken = token ?? await getAuthToken();
    if (!accessToken) throw new MobileApiError("Sign in is required before accessing protected geospatial evidence", "UNAUTHORIZED", 401);
    const grant = await trpcMutation<{ capability: string; endpoint: string; expiresAt: string }>(
      "geospatialDelivery.issueMobileEvidenceCapability",
      { parcelIds: [parcelId], purpose: "mobile.evidence-view" },
      accessToken,
    );
    const response = await fetch(`${getApiBaseUrl()}${grant.endpoint}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Geospatial-Capability": `Bearer ${grant.capability}`,
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new MobileApiError("The governed mobile evidence service rejected this request", "DELIVERY_DENIED", response.status, payload);
    const manifest = safeManifest(payload);
    if (!manifest || !manifest.parcelIds.includes(parcelId)) {
      throw new MobileApiError("The governed mobile evidence response was incomplete", "INVALID_RESPONSE", 502);
    }
    const expiresAt = await writeMobileEvidenceCache(parcelId, manifest);
    return { manifest, source: "network", expiresAt };
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

export type SedonaJobStatus = "queued" | "claimed" | "running" | "cancel_requested" | "succeeded" | "failed" | "cancelled";
export type SedonaOperation = "geoparquet_export" | "topology_validation" | "spatial_workbench" | "zonal_statistics" | "viewshed";

export type MobileSedonaJob = {
  id: number;
  jobKey: string;
  operation: SedonaOperation;
  status: SedonaJobStatus;
  analysisRunId: number | null;
  parcelId: number | null;
  attempt: number;
  maxAttempts: number;
  resultSummary?: Record<string, unknown> | null;
  outputUri?: string | null;
  failureCode?: string | null;
  failureReason?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
};

/**
 * Job state is always fetched live through the authenticated tRPC boundary.
 * No scoped capability, raw artifact URI, or job manifest is written to the
 * device cache because output access remains subject to server policy.
 */
export const listSedonaJobsForRun = (analysisRunId: number, token?: string | null) =>
  trpcQuery<MobileSedonaJob[]>("sedonaJobs.listForRun", { analysisRunId, limit: 50 }, token);

export const cancelSedonaJob = (jobId: number, token?: string | null) =>
  trpcMutation<MobileSedonaJob>("sedonaJobs.cancel", { jobId }, token);


export type MobileContextGlobeLayerSummary = {
  layerKey: "seismic" | "weather-alerts";
  activeEvents: number;
};

export type MobileContextGlobeSummary = {
  windowStart: string;
  windowEnd: string;
  layers: MobileContextGlobeLayerSummary[];
  offlinePolicy: string;
};

export type MobileContextGlobeFeature = {
  type: "Feature";
  id?: string;
  geometry: GeoJSON.Geometry;
  properties: {
    layerKey: "seismic" | "weather-alerts";
    sourceObservedAt?: string;
    severity?: string | null;
    urgency?: string | null;
    mag?: number | null;
    place?: string | null;
    event?: string | null;
    headline?: string | null;
  };
};

export type MobileContextGlobeResult = {
  summary: MobileContextGlobeSummary;
  features: MobileContextGlobeFeature[];
};

const CONTEXT_GLOBE_LAYER_KEYS = new Set(["seismic", "weather-alerts"]);

function validContextTime(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && Math.abs(parsed - Date.now()) <= 31 * 24 * 60 * 60 * 1000;
}

function safeMobileContextSummary(value: unknown): MobileContextGlobeSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!validContextTime(String(record.windowStart ?? "")) || !validContextTime(String(record.windowEnd ?? "")) || !Array.isArray(record.layers) || typeof record.offlinePolicy !== "string") return null;
  const layers = record.layers.flatMap((layer) => {
    if (!layer || typeof layer !== "object") return [];
    const item = layer as Record<string, unknown>;
    const layerKey = String(item.layerKey ?? "");
    const activeEvents = Number(item.activeEvents);
    return CONTEXT_GLOBE_LAYER_KEYS.has(layerKey) && Number.isInteger(activeEvents) && activeEvents >= 0
      ? [{ layerKey: layerKey as MobileContextGlobeLayerSummary["layerKey"], activeEvents }]
      : [];
  });
  return layers.length === record.layers.length ? { windowStart: String(record.windowStart), windowEnd: String(record.windowEnd), layers, offlinePolicy: record.offlinePolicy } : null;
}

function safeMobileContextFeatures(value: unknown): MobileContextGlobeFeature[] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type !== "FeatureCollection" || !Array.isArray(record.features) || record.features.length > 2_000) return null;
  const accepted: MobileContextGlobeFeature[] = [];
  for (const feature of record.features) {
    if (!feature || typeof feature !== "object") return null;
    const item = feature as Record<string, unknown>;
    const geometry = item.geometry as GeoJSON.Geometry | undefined;
    const properties = item.properties as Record<string, unknown> | undefined;
    const layerKey = String(properties?.layerKey ?? "");
    if (!geometry || !["Point", "LineString", "Polygon", "MultiPoint", "MultiLineString", "MultiPolygon"].includes(geometry.type) || !properties || !CONTEXT_GLOBE_LAYER_KEYS.has(layerKey)) return null;
    accepted.push({
      type: "Feature",
      id: typeof item.id === "string" ? item.id : undefined,
      geometry,
      properties: {
        layerKey: layerKey as MobileContextGlobeFeature["properties"]["layerKey"],
        sourceObservedAt: typeof properties.sourceObservedAt === "string" ? properties.sourceObservedAt : undefined,
        severity: typeof properties.severity === "string" ? properties.severity : null,
        urgency: typeof properties.urgency === "string" ? properties.urgency : null,
        mag: typeof properties.mag === "number" ? properties.mag : null,
        place: typeof properties.place === "string" ? properties.place : null,
        event: typeof properties.event === "string" ? properties.event : null,
        headline: typeof properties.headline === "string" ? properties.headline : null,
      },
    });
  }
  return accepted;
}

export async function getMobileContextGlobe(
  input: { layerKeys: Array<MobileContextGlobeLayerSummary["layerKey"]>; start: string; end: string },
  token?: string | null,
): Promise<MobileContextGlobeResult> {
  const layerKeys = [...new Set(input.layerKeys)].sort();
  if (!layerKeys.length || layerKeys.length > 2 || layerKeys.some((layerKey) => !CONTEXT_GLOBE_LAYER_KEYS.has(layerKey))) {
    throw new MobileApiError("Select at least one approved public-context layer", "BAD_REQUEST", 400);
  }
  if (!validContextTime(input.start) || !validContextTime(input.end) || Date.parse(input.start) > Date.parse(input.end) || Date.parse(input.end) - Date.parse(input.start) > 30 * 24 * 60 * 60 * 1000) {
    throw new MobileApiError("The Context Globe time window is invalid", "BAD_REQUEST", 400);
  }
  if (!(await isOnline())) {
    throw new MobileApiError("Context Globe events are online-only and are not stored on this device", "OFFLINE", 503);
  }
  const accessToken = token ?? await getAuthToken();
  if (!accessToken) throw new MobileApiError("Sign in is required before accessing Context Globe", "UNAUTHORIZED", 401);

  const [mobileGrant, tilesGrant] = await Promise.all([
    trpcMutation<{ capability: string; endpoint: string }>("contextGlobe.issueCapability", { audience: "context_mobile", layerKeys, purpose: "mobile.context-globe.summary", ttlSeconds: 300 }, accessToken),
    trpcMutation<{ capability: string; endpoint: string }>("contextGlobe.issueCapability", { audience: "context_tiles", layerKeys, purpose: "mobile.context-globe.overlay", ttlSeconds: 300 }, accessToken),
  ]);
  const query = new URLSearchParams({ layers: layerKeys.join(","), start: input.start, end: input.end }).toString();
  const commonHeaders = { Accept: "application/json", Authorization: `Bearer ${accessToken}` };
  const [summaryResponse, featureResponse] = await Promise.all([
    fetch(`${getApiBaseUrl()}${mobileGrant.endpoint}?${query}`, { headers: { ...commonHeaders, "X-Context-Capability": `Bearer ${mobileGrant.capability}` } }),
    fetch(`${getApiBaseUrl()}${tilesGrant.endpoint}?${query}`, { headers: { ...commonHeaders, "X-Context-Capability": `Bearer ${tilesGrant.capability}` } }),
  ]);
  const [summaryPayload, featurePayload] = await Promise.all([summaryResponse.json().catch(() => null), featureResponse.json().catch(() => null)]);
  if (!summaryResponse.ok || !featureResponse.ok) throw new MobileApiError("The governed Context Globe delivery service rejected this request", "DELIVERY_DENIED", !summaryResponse.ok ? summaryResponse.status : featureResponse.status, !summaryResponse.ok ? summaryPayload : featurePayload);
  const summary = safeMobileContextSummary(summaryPayload);
  const features = safeMobileContextFeatures(featurePayload);
  if (!summary || !features) throw new MobileApiError("The Context Globe response was incomplete", "INVALID_RESPONSE", 502);
  return { summary, features };
}


export type MobileCommercialAccount = {
  accountKey: string;
  legalName: string;
  status: string;
  billingEmail: string;
  role: string;
};

export type MobileFieldAssignment = {
  assignmentKey: string;
  parcelId: number;
  assignedTo: number;
  assignedBy: number;
  status: "assigned" | "in_progress" | "submitted" | "under_review" | "accepted" | "returned" | "cancelled";
  instructions: string;
  scheduledFor?: string | null;
  dueAt?: string | null;
  reviewNotes?: string | null;
  updatedAt: string;
};

export type MobileFieldEvidence = {
  evidenceKey: string;
  evidenceType: string;
  sourceReference: string;
  sourceChecksumSha256?: string | null;
  capturedAt: string;
  latitude?: string | null;
  longitude?: string | null;
  qualityFlags: string[];
  status: "pending" | "accepted" | "rejected";
  reviewNotes?: string | null;
  submittedAt: string;
};

export type MobileFieldEvent = {
  id: number;
  eventType: string;
  previousStatus?: string | null;
  nextStatus?: string | null;
  description: string;
  createdAt: string;
};

export type MobileFieldDashboard = {
  account: { accountKey: string; legalName: string; accountStatus: string; billingEmail: string; role: string };
  subscriptions: Array<{ subscription: { status: string; currentPeriodEnd: string }; product: { name: string } }>;
  assignments: MobileFieldAssignment[];
  usageByMetric: Record<string, number>;
  selectedAssignment: { assignment: MobileFieldAssignment; evidence: MobileFieldEvidence[]; events: MobileFieldEvent[] } | null;
};

export async function listMobileFieldAccounts(accessToken?: string | null): Promise<MobileCommercialAccount[]> {
  const accounts = await trpcQuery<MobileCommercialAccount[]>("commercialLender.listMyAccounts", undefined, accessToken);
  return accounts.filter((account) => account.accountKey.startsWith("FIELD-"));
}

export const getMobileFieldDashboard = (input: { accountKey: string; assignmentKey?: string }, accessToken?: string | null) =>
  trpcQuery<MobileFieldDashboard>("commercialLender.fieldSurveyDashboard", input, accessToken);

export const submitMobileFieldEvidence = (input: {
  accountKey: string;
  assignmentKey: string;
  evidenceType: string;
  sourceReference: string;
  sourceChecksumSha256?: string;
  capturedAt: string;
  latitude?: number;
  longitude?: number;
  qualityFlags?: string[];
}, accessToken?: string | null) => trpcMutation<MobileFieldEvidence>("commercialLender.submitFieldEvidence", input, accessToken);

export const reviewMobileFieldEvidence = (input: {
  accountKey: string;
  evidenceKey: string;
  status: "accepted" | "rejected";
  reviewNotes: string;
}, accessToken?: string | null) => trpcMutation<MobileFieldEvidence>("commercialLender.reviewFieldEvidence", input, accessToken);

export const transitionMobileFieldAssignment = (input: {
  accountKey: string;
  assignmentKey: string;
  nextStatus: MobileFieldAssignment["status"];
  reviewNotes?: string;
}, accessToken?: string | null) => trpcMutation<MobileFieldAssignment>("commercialLender.transitionFieldAssignment", input, accessToken);
