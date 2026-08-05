import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { contextDeliveryAudits, contextLayers } from "../drizzle/schema";
import { requireDb } from "./db";

type ContextAudience = "context_stream" | "context_tiles" | "context_mobile";
export const CONTEXT_AUDIENCES: readonly ContextAudience[] = ["context_stream", "context_tiles", "context_mobile"] as const;
export const CONTEXT_MAX_TTL_SECONDS = 300;
const LAYER_KEY_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;

export interface ContextCapabilityPayload {
  v: 1;
  aud: ContextAudience;
  sub: number;
  layers: string[];
  purpose: string;
  iat: number;
  exp: number;
  jti: string;
}

function secret(): Buffer {
  const configured = process.env.CONTEXT_CAPABILITY_SECRET?.trim() || process.env.GEOSPATIAL_CAPABILITY_SECRET?.trim();
  if (!configured || configured.length < 32) {
    throw new Error("CONTEXT_CAPABILITY_SECRET or GEOSPATIAL_CAPABILITY_SECRET must be configured with at least 32 characters");
  }
  return Buffer.from(configured, "utf8");
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode<T>(value: string): T {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Capability segment is not base64url");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value) throw new Error("Capability segment is noncanonical");
  return JSON.parse(bytes.toString("utf8")) as T;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", secret()).update(encodedPayload).digest("base64url");
}

function stableLayers(raw: string[]): string[] {
  const normalized = [...new Set(raw.map((value) => value.trim().toLowerCase()))].sort();
  if (!normalized.length || normalized.length > 8 || normalized.some((value) => !LAYER_KEY_PATTERN.test(value))) {
    throw new Error("Capability must reference between one and eight valid context layer keys");
  }
  return normalized;
}

function parseCapability(raw: string): ContextCapabilityPayload {
  const parts = raw.split(".");
  if (parts.length !== 2) throw new Error("Capability format is invalid");
  const [encodedPayload, suppliedSignature] = parts;
  if (!encodedPayload || !suppliedSignature || !/^[A-Za-z0-9_-]+$/.test(suppliedSignature)) {
    throw new Error("Capability format is invalid");
  }
  const expectedSignature = sign(encodedPayload);
  const supplied = Buffer.from(suppliedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (supplied.toString("base64url") !== suppliedSignature || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("Capability signature is invalid");
  }
  const payload = decode<ContextCapabilityPayload>(encodedPayload);
  if (payload.v !== 1 || !CONTEXT_AUDIENCES.includes(payload.aud) || !Number.isInteger(payload.sub) || payload.sub < 1 || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= payload.iat || typeof payload.purpose !== "string" || payload.purpose.length < 3 || payload.purpose.length > 128 || typeof payload.jti !== "string" || !payload.jti) {
    throw new Error("Capability payload is invalid");
  }
  payload.layers = stableLayers(payload.layers);
  return payload;
}

export function verifyContextCapability(raw: string, audience: ContextAudience, nowSeconds = Math.floor(Date.now() / 1000)): ContextCapabilityPayload {
  const payload = parseCapability(raw);
  if (payload.aud !== audience) throw new Error("Capability audience is invalid");
  if (payload.exp <= nowSeconds || payload.iat > nowSeconds + 60) throw new Error("Capability has expired or is not yet valid");
  return payload;
}

export async function issueContextCapability(params: {
  userId: number;
  audience: ContextAudience;
  layerKeys: string[];
  purpose: string;
  ttlSeconds?: number;
  requestId?: string | string[];
}): Promise<{ capability: string; expiresAt: string; capabilityId: string; layerKeys: string[] }> {
  if (!CONTEXT_AUDIENCES.includes(params.audience)) throw new Error("Unsupported Context Globe audience");
  if (!Number.isInteger(params.userId) || params.userId < 1) throw new Error("A valid user is required");
  const purpose = params.purpose.trim();
  if (purpose.length < 3 || purpose.length > 128) throw new Error("Capability purpose must be between 3 and 128 characters");
  const layerKeys = stableLayers(params.layerKeys);
  const ttlSeconds = Math.min(CONTEXT_MAX_TTL_SECONDS, Math.max(30, params.ttlSeconds ?? 120));
  const db = await requireDb();
  const approved = await db
    .select({ layerKey: contextLayers.layerKey })
    .from(contextLayers)
    .where(and(inArray(contextLayers.layerKey, layerKeys), eq(contextLayers.enabled, true)));
  if (approved.length !== layerKeys.length) throw new Error("One or more requested Context Globe layers are unavailable");

  const now = Math.floor(Date.now() / 1000);
  const payload: ContextCapabilityPayload = {
    v: 1,
    aud: params.audience,
    sub: params.userId,
    layers: layerKeys,
    purpose,
    iat: now,
    exp: now + ttlSeconds,
    jti: randomUUID(),
  };
  const encodedPayload = encode(payload);
  const capability = `${encodedPayload}.${sign(encodedPayload)}`;
  const fingerprint = createHash("sha256").update(capability).digest("hex");
  await db.insert(contextDeliveryAudits).values({
    userId: params.userId,
    audience: params.audience,
    layerKeys,
    capabilityFingerprintSha256: fingerprint,
    requestId: Array.isArray(params.requestId) ? params.requestId[0] ?? null : params.requestId ?? null,
  });
  return {
    capability,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    capabilityId: payload.jti,
    layerKeys,
  };
}

export function extractContextCapability(header: string | undefined): string {
  if (!header) throw new Error("X-Context-Capability is required");
  const match = /^Bearer ([A-Za-z0-9_\-.]+)$/.exec(header.trim());
  if (!match) throw new Error("X-Context-Capability must use Bearer authentication");
  return match[1];
}

export type { ContextAudience };
