import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import type { User } from "../drizzle/schema";
import { geo3dAssets, geoDeliveryAccessAudit, parcels } from "../drizzle/schema";
import { requireDb } from "./db";
import { ensureAuthorized } from "./authorizationService";
import { synchronizeParcelResourceRelations } from "./permifyService";

export const GEO_DELIVERY_ISSUER = "idlr-geospatial-platform";
export const GEO_DELIVERY_CAPABILITY_VERSION = 1;
export const GEO_DELIVERY_MAX_TTL_SECONDS = 600;

export const GEO_DELIVERY_AUDIENCES = [
  "vector_tiles",
  "cesium_assets",
  "geo_analysis",
  "mobile_evidence",
] as const;

export type GeospatialDeliveryAudience = (typeof GEO_DELIVERY_AUDIENCES)[number];

export type GeospatialDeliveryCapability = {
  iss: typeof GEO_DELIVERY_ISSUER;
  ver: typeof GEO_DELIVERY_CAPABILITY_VERSION;
  aud: GeospatialDeliveryAudience;
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  parcels: number[];
  purpose: string;
  assetKey?: string;
};

type CapabilityPayloadInput = Omit<GeospatialDeliveryCapability, "iss" | "ver" | "jti" | "iat" | "exp">;

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Capability contains invalid base64url data");
  }
  return Buffer.from(value, "base64url");
}

function getCapabilitySecret(): string {
  const secret = process.env.GEO_DELIVERY_CAPABILITY_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("GEO_DELIVERY_CAPABILITY_SECRET must be configured with at least 32 characters");
  }
  return secret;
}

function isAudience(value: unknown): value is GeospatialDeliveryAudience {
  return typeof value === "string" && GEO_DELIVERY_AUDIENCES.includes(value as GeospatialDeliveryAudience);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function normalizeScope(parcelIds: number[]): number[] {
  const scope = [...new Set(parcelIds)];
  if (!scope.length || scope.length > 512 || scope.some((id) => !isPositiveSafeInteger(id))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A geospatial delivery scope must contain between 1 and 512 positive parcel identifiers" });
  }
  return scope.sort((left, right) => left - right);
}

function normalizePurpose(value: string): string {
  const purpose = value.trim();
  if (!/^[a-z][a-z0-9_.:-]{2,127}$/.test(purpose)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Capability purpose must be a stable lowercase operation identifier" });
  }
  return purpose;
}

function normalizeAssetKey(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const assetKey = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,127}$/.test(assetKey)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Asset key has an unsupported format" });
  }
  return assetKey;
}

export function signGeospatialCapability(payload: CapabilityPayloadInput, ttlSeconds = GEO_DELIVERY_MAX_TTL_SECONDS): string {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > GEO_DELIVERY_MAX_TTL_SECONDS) {
    throw new Error(`Capability TTL must be between 30 and ${GEO_DELIVERY_MAX_TTL_SECONDS} seconds`);
  }
  if (!isAudience(payload.aud)) throw new Error("Capability audience is invalid");
  if (!/^\d+$/.test(payload.sub)) throw new Error("Capability subject is invalid");
  const parcels = normalizeScope(payload.parcels);
  const purpose = normalizePurpose(payload.purpose);
  const assetKey = normalizeAssetKey(payload.assetKey);
  if (payload.aud === "cesium_assets" && !assetKey) throw new Error("A Cesium asset capability requires an asset key");
  if (payload.aud !== "cesium_assets" && assetKey) throw new Error("Only Cesium asset capabilities may include an asset key");
  const now = Math.floor(Date.now() / 1000);
  const capability: GeospatialDeliveryCapability = {
    aud: payload.aud,
    sub: payload.sub,
    parcels,
    purpose,
    ...(assetKey ? { assetKey } : {}),
    iss: GEO_DELIVERY_ISSUER,
    ver: GEO_DELIVERY_CAPABILITY_VERSION,
    jti: randomUUID(),
    iat: now,
    exp: now + ttlSeconds,
  };
  const encodedPayload = base64UrlEncode(canonicalJson(capability));
  const signature = createHmac("sha256", getCapabilitySecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function parseCapabilityPayload(value: unknown): GeospatialDeliveryCapability {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Capability payload must be an object");
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.iss !== GEO_DELIVERY_ISSUER ||
    candidate.ver !== GEO_DELIVERY_CAPABILITY_VERSION ||
    !isAudience(candidate.aud) ||
    typeof candidate.sub !== "string" || !/^\d+$/.test(candidate.sub) ||
    typeof candidate.jti !== "string" || !/^[0-9a-f-]{36}$/i.test(candidate.jti) ||
    !Number.isSafeInteger(candidate.iat) || !Number.isSafeInteger(candidate.exp) ||
    !Array.isArray(candidate.parcels) ||
    typeof candidate.purpose !== "string"
  ) {
    throw new Error("Capability payload is malformed");
  }
  const parcelsScope = normalizeScope(candidate.parcels as number[]);
  const assetKey = candidate.assetKey === undefined ? undefined : normalizeAssetKey(candidate.assetKey as string);
  return {
    iss: GEO_DELIVERY_ISSUER,
    ver: GEO_DELIVERY_CAPABILITY_VERSION,
    aud: candidate.aud,
    sub: candidate.sub,
    jti: candidate.jti,
    iat: candidate.iat as number,
    exp: candidate.exp as number,
    parcels: parcelsScope,
    purpose: normalizePurpose(candidate.purpose),
    ...(assetKey ? { assetKey } : {}),
  };
}

export function verifyGeospatialCapability(token: string, expectedAudience: GeospatialDeliveryAudience, nowSeconds = Math.floor(Date.now() / 1000)): GeospatialDeliveryCapability {
  const [encodedPayload, encodedSignature, ...extra] = token.trim().split(".");
  if (!encodedPayload || !encodedSignature || extra.length) {
    throw new Error("Capability must contain exactly one payload and one signature");
  }
  const expected = createHmac("sha256", getCapabilitySecret()).update(encodedPayload).digest();
  const provided = base64UrlDecode(encodedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("Capability signature is invalid");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  } catch {
    throw new Error("Capability payload is not JSON");
  }
  const capability = parseCapabilityPayload(raw);
  if (capability.aud !== expectedAudience) {
    throw new Error("Capability audience does not match this service");
  }
  if (capability.iat > nowSeconds + 60 || capability.exp <= nowSeconds || capability.exp - capability.iat > GEO_DELIVERY_MAX_TTL_SECONDS) {
    throw new Error("Capability is expired or has an invalid issue window");
  }
  return capability;
}

export function capabilityFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function requestIdFrom(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^[A-Za-z0-9_.:-]{8,128}$/.test(candidate) ? candidate : randomUUID();
}

async function ensureParcelViewScope(user: User, parcelIds: number[]): Promise<void> {
  const db = await requireDb();
  const scopedParcels = await db
    .select({ id: parcels.id, ownerId: parcels.ownerId })
    .from(parcels)
    .where(inArray(parcels.id, parcelIds));
  if (scopedParcels.length !== parcelIds.length) {
    throw new TRPCError({ code: "NOT_FOUND", message: "One or more parcels do not exist" });
  }
  for (const parcel of scopedParcels) {
    await synchronizeParcelResourceRelations({ parcelId: parcel.id, ownerId: parcel.ownerId });
    await ensureAuthorized({ user, resource: "parcel", resourceId: String(parcel.id), action: "view" });
  }
}


export async function authorizeGeospatialParcelScope(user: User, requestedParcelIds: number[]): Promise<number[]> {
  const parcelIds = normalizeScope(requestedParcelIds);
  await ensureParcelViewScope(user, parcelIds);
  return parcelIds;
}

export async function issueGeospatialCapability(params: {
  user: User;
  audience: GeospatialDeliveryAudience;
  parcelIds: number[];
  purpose: string;
  requestId?: string | string[];
  assetKey?: string;
  ttlSeconds?: number;
  metadata?: Record<string, unknown>;
}): Promise<{ capability: string; expiresAt: string; capabilityId: string; parcelIds: number[] }> {
  const parcelIds = await authorizeGeospatialParcelScope(params.user, params.parcelIds);
  const purpose = normalizePurpose(params.purpose);
  const assetKey = normalizeAssetKey(params.assetKey);
  if (params.audience === "cesium_assets" && !assetKey) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A Cesium asset capability requires an asset key" });
  }
  if (params.audience !== "cesium_assets" && assetKey) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only Cesium asset capabilities may include an asset key" });
  }

  const db = await requireDb();
  if (assetKey) {
    const [asset] = await db
      .select({ parcelId: geo3dAssets.parcelId, active: geo3dAssets.active })
      .from(geo3dAssets)
      .where(eq(geo3dAssets.assetKey, assetKey))
      .limit(1);
    if (!asset || !asset.active || asset.parcelId === null || !parcelIds.includes(asset.parcelId)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "The requested 3D asset is unavailable in this parcel scope" });
    }
  }

  const capability = signGeospatialCapability({
    aud: params.audience,
    sub: String(params.user.id),
    parcels: parcelIds,
    purpose,
    ...(assetKey ? { assetKey } : {}),
  }, params.ttlSeconds);
  const parsed = verifyGeospatialCapability(capability, params.audience);
  await db.insert(geoDeliveryAccessAudit).values({
    requestId: requestIdFrom(params.requestId),
    capabilityFingerprintSha256: capabilityFingerprint(capability),
    capabilityId: parsed.jti,
    audience: params.audience,
    purpose,
    userId: params.user.id,
    parcelIds,
    assetKey: assetKey ?? null,
    issuedAt: new Date(parsed.iat * 1000),
    expiresAt: new Date(parsed.exp * 1000),
    outcome: "issued",
    metadata: params.metadata ?? {},
  });
  return {
    capability,
    expiresAt: new Date(parsed.exp * 1000).toISOString(),
    capabilityId: parsed.jti,
    parcelIds,
  };
}

export async function recordGeospatialCapabilityUse(params: {
  token: string;
  audience: GeospatialDeliveryAudience;
  requestId?: string | string[];
  metadata?: Record<string, unknown>;
}): Promise<GeospatialDeliveryCapability> {
  const capability = verifyGeospatialCapability(params.token, params.audience);
  const userId = Number(capability.sub);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("Capability subject is invalid");
  }
  const db = await requireDb();
  await db.insert(geoDeliveryAccessAudit).values({
    requestId: requestIdFrom(params.requestId),
    capabilityFingerprintSha256: capabilityFingerprint(params.token),
    capabilityId: capability.jti,
    audience: capability.aud,
    purpose: capability.purpose,
    userId,
    parcelIds: capability.parcels,
    assetKey: capability.assetKey ?? null,
    issuedAt: new Date(capability.iat * 1000),
    expiresAt: new Date(capability.exp * 1000),
    outcome: "used",
    metadata: params.metadata ?? {},
  });
  return capability;
}

export function readBearerCapability(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  const matched = value?.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  if (!matched?.[1]) throw new TRPCError({ code: "UNAUTHORIZED", message: "A geospatial delivery capability is required" });
  return matched[1];
}
