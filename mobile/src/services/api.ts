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
  | "field_evidence_review";
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
