import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { ensureAuthorized } from "./authorizationService";
import { sdk } from "./_core/sdk";
import {
  getOgcFeatureCollection,
  listPublicReleases,
  listStacCollections,
  searchStacItems,
} from "./geoInnovationService";

const router = Router();

type AuthenticatedRequest = Request & { geoAuthenticatedUser?: Awaited<ReturnType<typeof sdk.authenticateRequest>> };

function parseLimit(raw: unknown, fallback: number, maximum: number): number {
  const numeric = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return Math.min(numeric, maximum);
}

function parseBbox(raw: unknown): [number, number, number, number] | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const values = raw.split(",").map((entry) => Number(entry.trim()));
  if (values.length !== 4 || !values.every(Number.isFinite)) throw new Error("bbox must be four comma-separated numeric ordinates: west,south,east,north");
  const [west, south, east, north] = values;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west > east || south > north) {
    throw new Error("bbox values are outside WGS 84 bounds or have invalid ordering");
  }
  return [west, south, east, north];
}

async function requireGeoView(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const user = await sdk.authenticateRequest(req);
    await ensureAuthorized({ user, resource: "geo_analysis", action: "view" });
    req.geoAuthenticatedUser = user;
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication or authorization failed";
    res.status(403).json({ error: "access_denied", message });
  }
}

router.get("/ogc/features", requireGeoView, (_req, res) => {
  res.json({
    title: "Landmanagement OGC API Features-inspired endpoint",
    description: "Protected feature discovery endpoint. The platform returns persisted parcel features in GeoJSON and never represents the response as a certified survey or title source.",
    links: [
      { rel: "data", href: "/api/geo/ogc/features/collections", type: "application/json", title: "Collections" },
      { rel: "conformance", href: "/api/geo/ogc/features/conformance", type: "application/json", title: "Conformance declaration" },
    ],
  });
});

router.get("/ogc/features/conformance", requireGeoView, (_req, res) => {
  res.json({
    conformsTo: [
      "https://api.ogc.org/features/part1/1.0/conf/core",
      "https://api.ogc.org/features/part2/1.0/conf/crs",
    ],
    implementationNotes: [
      "This platform implements a protected, minimal collection and item-discovery subset using GeoJSON output.",
      "CQL2 filtering, transactions, and public cadastral disclosure are intentionally not enabled by this endpoint.",
    ],
  });
});

router.get("/ogc/features/collections", requireGeoView, (_req, res) => {
  res.json({
    collections: [{
      id: "parcels",
      title: "Registered parcel references",
      description: "Persisted registered geometry or reference-point features. Output is discovery-grade and non-authoritative for title, survey, or legal boundary use.",
      itemType: "feature",
      crs: ["http://www.opengis.net/def/crs/EPSG/0/4326"],
      links: [{ rel: "items", href: "/api/geo/ogc/features/collections/parcels/items", type: "application/geo+json" }],
    }],
    links: [],
  });
});

router.get("/ogc/features/collections/parcels/items", requireGeoView, async (req, res) => {
  try {
    const featureCollection = await getOgcFeatureCollection({
      bbox: parseBbox(req.query.bbox),
      state: typeof req.query.state === "string" ? req.query.state : undefined,
      lga: typeof req.query.lga === "string" ? req.query.lga : undefined,
      status: typeof req.query.status === "string" ? req.query.status as any : undefined,
      limit: parseLimit(req.query.limit, 100, 200),
    });
    res.type("application/geo+json").json(featureCollection);
  } catch (error) {
    res.status(400).json({ error: "invalid_feature_query", message: error instanceof Error ? error.message : "Unable to produce feature collection" });
  }
});

router.get("/stac", requireGeoView, (_req, res) => {
  res.json({
    stac_version: "1.0.0",
    id: "landmanagement-geo-catalog",
    title: "Landmanagement governed geospatial catalog",
    description: "Protected STAC-compatible metadata catalog for platform-registered evidence assets. Items retain their platform evidence status and do not imply external publication.",
    links: [
      { rel: "data", href: "/api/geo/stac/collections", type: "application/json", title: "STAC collections" },
    ],
  });
});

router.get("/stac/collections", requireGeoView, async (_req, res) => {
  const collections = await listStacCollections();
  res.json({
    collections: collections.map((collection) => ({
      stac_version: "1.0.0",
      type: "Collection",
      id: collection.collectionKey,
      title: collection.title,
      description: collection.description,
      license: collection.license,
      extent: { spatial: collection.spatialExtent, temporal: collection.temporalExtent },
      providers: collection.providers,
      keywords: collection.keywords,
      links: [{ rel: "items", href: `/api/geo/stac/collections/${encodeURIComponent(collection.collectionKey)}/items`, type: "application/geo+json" }],
    })),
    links: [],
  });
});

router.get("/stac/collections/:collectionKey/items", requireGeoView, async (req, res) => {
  const collection = (await listStacCollections()).find((candidate) => candidate.collectionKey === req.params.collectionKey);
  if (!collection) {
    res.status(404).json({ error: "collection_not_found" });
    return;
  }
  const items = await searchStacItems({
    collectionId: collection.id,
    evidenceStatus: typeof req.query.evidence_status === "string" ? req.query.evidence_status as any : undefined,
    limit: parseLimit(req.query.limit, 100, 200),
  });
  res.type("application/geo+json").json({
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      id: item.itemKey,
      geometry: item.geometryGeojson,
      bbox: item.bbox,
      properties: {
        datetime: item.itemDatetime?.toISOString() ?? null,
        start_datetime: item.startDatetime?.toISOString() ?? null,
        end_datetime: item.endDatetime?.toISOString() ?? null,
        evidence_status: item.evidenceStatus,
        ...((item.properties ?? {}) as Record<string, unknown>),
      },
      assets: {},
      links: item.links,
      collection: collection.collectionKey,
      stac_version: "1.0.0",
    })),
    links: [],
  });
});

// Public output is intentionally limited to already-approved, privacy-preserving
// releases. There is no unauthenticated parcel, asset, alert, or evidence route.
router.get("/public-releases/:releaseKey", async (req, res) => {
  const releases = await listPublicReleases({ status: "published", limit: 200 });
  const release = releases.find((candidate) => candidate.releaseKey === req.params.releaseKey);
  if (!release || !release.releasedFeature) {
    res.status(404).json({ error: "public_release_not_found" });
    return;
  }
  res.type("application/geo+json").json({
    ...(release.releasedFeature as Record<string, unknown>),
    properties: {
      ...((release.releasedFeature as Record<string, any>).properties ?? {}),
      release_key: release.releaseKey,
      privacy_method: release.privacyMethod,
      license: release.license,
      legal_notice: release.legalNotice,
      released_at: release.publishedAt?.toISOString() ?? null,
    },
  });
});

export const geoInteroperabilityHttpRouter = router;
