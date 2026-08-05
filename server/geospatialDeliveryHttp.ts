import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import express from "express";
import { and, eq, inArray, ne } from "drizzle-orm";
import { geoAssetCatalog } from "../drizzle/schema";
import { requireDb } from "./db";
import {
  readBearerCapability,
  recordGeospatialCapabilityUse,
  verifyGeospatialCapability,
  type GeospatialDeliveryAudience,
} from "./geospatialDeliveryCapability";
import { sdk } from "./_core/sdk";

export const geospatialDeliveryHttpRouter = express.Router();

const TILE_PATH = /^\d{1,2}$/;
const TILE_COORDINATE_MAX = 2 ** 22 - 1;
const CONTENT_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,255}$/;

function configuredHttpService(name: string): URL {
  const raw = process.env[name]?.trim();
  if (!raw) throw new Error(`${name} must be configured for geospatial delivery`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be a credential-free base HTTP(S) URL`);
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url;
}

function requestId(req: express.Request): string {
  const candidate = req.header("x-request-id")?.trim();
  return candidate && /^[A-Za-z0-9_.:-]{8,128}$/.test(candidate) ? candidate : crypto.randomUUID();
}

function parseTileCoordinate(value: string, field: string): number {
  if (!TILE_PATH.test(value)) throw new Error(`${field} must be a decimal tile coordinate`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > TILE_COORDINATE_MAX) {
    throw new Error(`${field} is outside the supported tile range`);
  }
  return parsed;
}

function safeContentPath(splat: string | string[] | undefined): string {
  const raw = Array.isArray(splat) ? splat.join("/") : splat ?? "";
  const segments = raw.split("/").filter(Boolean);
  if (!segments.length || segments.some((segment) => !CONTENT_PATH_SEGMENT.test(segment))) {
    throw new Error("Requested asset path is invalid");
  }
  return segments.join("/");
}

async function requireDeliveryCapability(req: express.Request, audience: GeospatialDeliveryAudience) {
  const user = await sdk.authenticateRequest(req);
  const token = readBearerCapability(req.headers["x-geospatial-capability"] ?? req.headers.authorization);
  const capability = verifyGeospatialCapability(token, audience);
  if (capability.sub !== String(user.id)) {
    throw new Error("Capability subject does not match the authenticated user");
  }
  await recordGeospatialCapabilityUse({
    token,
    audience,
    requestId: req.headers["x-request-id"],
    metadata: { path: req.path, method: req.method },
  });
  return { token, capability, user };
}

function gatewayHeaders(token: string, correlationId: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "X-Request-Id": correlationId,
    "X-Geospatial-Service-Version": "1",
  };
}

function forwardHeaders(source: Headers, res: express.Response, correlationId: string, cacheControl: string) {
  const contentType = source.get("content-type");
  const contentLength = source.get("content-length");
  const etag = source.get("etag");
  if (contentType) res.setHeader("Content-Type", contentType);
  if (contentLength) res.setHeader("Content-Length", contentLength);
  if (etag) res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("X-Request-Id", correlationId);
  res.setHeader("Vary", "Authorization");
}

async function streamUpstream(upstream: Response, res: express.Response) {
  if (!upstream.body) {
    res.end();
    return;
  }
  await pipeline(Readable.fromWeb(upstream.body as never), res);
}

function sendDeliveryError(res: express.Response, error: unknown, correlationId: string) {
  const message = error instanceof Error ? error.message : "Geospatial delivery failed";
  const unauthorized = /authentication|required|capability|subject|signature|expired|audience/i.test(message);
  const badRequest = /coordinate|path|invalid/i.test(message);
  const status = unauthorized ? 401 : badRequest ? 400 : 502;
  res.status(status).setHeader("X-Request-Id", correlationId).json({
    error: unauthorized ? "Geospatial delivery authorization failed" : badRequest ? "Invalid geospatial delivery request" : "Geospatial delivery service is unavailable",
    requestId: correlationId,
  });
}

geospatialDeliveryHttpRouter.get("/tiles/:z/:x/:y.pbf", async (req, res) => {
  const correlationId = requestId(req);
  try {
    const z = parseTileCoordinate(req.params.z, "z");
    const x = parseTileCoordinate(req.params.x, "x");
    const y = parseTileCoordinate(req.params.y, "y");
    if (x >= 2 ** z || y >= 2 ** z) throw new Error("Tile coordinate is outside its zoom matrix");
    const { token } = await requireDeliveryCapability(req, "vector_tiles");
    const upstreamBase = configuredHttpService("GEO_TILE_SERVICE_URL");
    const upstream = await fetch(`${upstreamBase.toString()}/tiles/${z}/${x}/${y}.pbf`, {
      headers: gatewayHeaders(token, correlationId),
      signal: AbortSignal.timeout(Number(process.env.GEO_TILE_SERVICE_TIMEOUT_MS || 10_000)),
    });
    if (!upstream.ok) throw new Error(`Tile service returned ${upstream.status}`);
    forwardHeaders(upstream.headers, res, correlationId, "private, max-age=60, must-revalidate");
    await streamUpstream(upstream, res);
  } catch (error) {
    if (!res.headersSent) sendDeliveryError(res, error, correlationId);
  }
});

geospatialDeliveryHttpRouter.get("/cesium/assets/:assetKey/{*splat}", async (req, res) => {
  const correlationId = requestId(req);
  try {
    const assetKey = req.params.assetKey;
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,127}$/.test(assetKey)) throw new Error("Asset key is invalid");
    const relativeContent = safeContentPath((req.params as Record<string, string | string[] | undefined>).splat);
    const { token, capability } = await requireDeliveryCapability(req, "cesium_assets");
    if (capability.assetKey !== assetKey) throw new Error("Capability does not grant the requested asset");
    const upstreamBase = configuredHttpService("GEO_CESIUM_ASSET_SERVICE_URL");
    const upstream = await fetch(`${upstreamBase.toString()}/assets/${encodeURIComponent(assetKey)}/${relativeContent}`, {
      headers: gatewayHeaders(token, correlationId),
      signal: AbortSignal.timeout(Number(process.env.GEO_CESIUM_ASSET_SERVICE_TIMEOUT_MS || 20_000)),
    });
    if (!upstream.ok) throw new Error(`Cesium asset service returned ${upstream.status}`);
    forwardHeaders(upstream.headers, res, correlationId, "private, max-age=60, must-revalidate");
    await streamUpstream(upstream, res);
  } catch (error) {
    if (!res.headersSent) sendDeliveryError(res, error, correlationId);
  }
});

const analysisPaths: Record<string, string> = {
  routing: "/geo-authority/network/route",
  viewshed: "/geo-authority/viewshed",
  "prepare-3d": "/geo-authority/three-d/prepare",
};

geospatialDeliveryHttpRouter.post("/analysis/:operation", async (req, res) => {
  const correlationId = requestId(req);
  try {
    const targetPath = analysisPaths[req.params.operation];
    if (!targetPath) throw new Error("Requested analysis operation is invalid");
    const { token } = await requireDeliveryCapability(req, "geo_analysis");
    const upstreamBase = configuredHttpService("GEO_SPATIAL_AUTHORITY_URL");
    const upstream = await fetch(`${upstreamBase.toString()}${targetPath}`, {
      method: "POST",
      headers: {
        ...gatewayHeaders(token, correlationId),
        "Content-Type": "application/json",
        "X-Lakehouse-Api-Key": process.env.LAKEHOUSE_API_KEY?.trim() || "",
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(Number(process.env.GEO_SPATIAL_AUTHORITY_TIMEOUT_MS || 120_000)),
    });
    const payload = await upstream.text();
    if (!upstream.ok) throw new Error(`Spatial authority returned ${upstream.status}`);
    res.status(200).setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Request-Id", correlationId);
    res.send(payload);
  } catch (error) {
    if (!res.headersSent) sendDeliveryError(res, error, correlationId);
  }
});

geospatialDeliveryHttpRouter.get("/mobile-evidence", async (req, res) => {
  const correlationId = requestId(req);
  try {
    const { capability } = await requireDeliveryCapability(req, "mobile_evidence");
    const db = await requireDb();
    const evidence = await db
      .select({
        assetId: geoAssetCatalog.assetId,
        parcelId: geoAssetCatalog.parcelId,
        assetType: geoAssetCatalog.assetType,
        checksumSha256: geoAssetCatalog.checksumSha256,
        sourceCrs: geoAssetCatalog.sourceCrs,
        verticalCrs: geoAssetCatalog.verticalCrs,
        coverageGeojson: geoAssetCatalog.coverageGeojson,
        qualityMetadata: geoAssetCatalog.qualityMetadata,
        provenance: geoAssetCatalog.provenance,
        evidenceStatus: geoAssetCatalog.evidenceStatus,
        acquiredAt: geoAssetCatalog.acquiredAt,
        updatedAt: geoAssetCatalog.updatedAt,
      })
      .from(geoAssetCatalog)
      .where(and(inArray(geoAssetCatalog.parcelId, capability.parcels), ne(geoAssetCatalog.evidenceStatus, "rejected")));
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Request-Id", correlationId);
    res.json({
      generatedAt: new Date().toISOString(),
      parcelIds: capability.parcels,
      evidence,
      limitations: ["The mobile evidence manifest is a provenance view and is not a title, legal boundary, or survey certification."],
    });
  } catch (error) {
    if (!res.headersSent) sendDeliveryError(res, error, correlationId);
  }
});
