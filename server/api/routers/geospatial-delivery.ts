import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../../_core/trpc";
import { geo3dAssets } from "../../../drizzle/schema";
import { requireDb } from "../../db";
import {
  GEO_DELIVERY_MAX_TTL_SECONDS,
  authorizeGeospatialParcelScope,
  issueGeospatialCapability,
  type GeospatialDeliveryAudience,
} from "../../geospatialDeliveryCapability";

const parcelScope = z.array(z.number().int().positive()).min(1).max(512);
const stableKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,127}$/);
const sha256 = z.string().regex(/^[A-Fa-f0-9]{64}$/);
const relativePath = z.string().min(1).max(1024).refine(
  (value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..") && !value.includes("\0"),
  "Path must be a safe relative POSIX path",
);

function capabilityResponse(params: {
  audience: GeospatialDeliveryAudience;
  endpoint: string;
  capability: string;
  expiresAt: string;
  capabilityId: string;
  parcelIds: number[];
}) {
  return {
    audience: params.audience,
    endpoint: params.endpoint,
    capability: params.capability,
    expiresAt: params.expiresAt,
    capabilityId: params.capabilityId,
    parcelIds: params.parcelIds,
    transport: "X-Geospatial-Capability: Bearer capability; same-origin proxy only" as const,
    cachePolicy: "private, max-age=60" as const,
  };
}

function requestIdentifier(headers: Record<string, string | string[] | undefined>) {
  return headers["x-request-id"];
}

export const geospatialDeliveryRouter = router({
  issueVectorTileCapability: protectedProcedure
    .input(z.object({
      parcelIds: parcelScope,
      purpose: z.string().min(3).max(128).default("maplibre.parcel-review"),
      ttlSeconds: z.number().int().min(30).max(GEO_DELIVERY_MAX_TTL_SECONDS).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const issued = await issueGeospatialCapability({
        user: ctx.user,
        audience: "vector_tiles",
        parcelIds: input.parcelIds,
        purpose: input.purpose,
        ttlSeconds: input.ttlSeconds,
        requestId: requestIdentifier(ctx.req.headers),
        metadata: { client: "pwa", renderer: "maplibre" },
      });
      return capabilityResponse({
        audience: "vector_tiles",
        endpoint: "/api/geospatial-delivery/tiles/{z}/{x}/{y}.pbf",
        ...issued,
      });
    }),

  issueMobileEvidenceCapability: protectedProcedure
    .input(z.object({
      parcelIds: parcelScope,
      purpose: z.string().min(3).max(128).default("mobile.evidence-view"),
      ttlSeconds: z.number().int().min(30).max(GEO_DELIVERY_MAX_TTL_SECONDS).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const issued = await issueGeospatialCapability({
        user: ctx.user,
        audience: "mobile_evidence",
        parcelIds: input.parcelIds,
        purpose: input.purpose,
        ttlSeconds: input.ttlSeconds,
        requestId: requestIdentifier(ctx.req.headers),
        metadata: { client: "native", renderer: "map-evidence" },
      });
      return capabilityResponse({
        audience: "mobile_evidence",
        endpoint: "/api/geospatial-delivery/mobile-evidence",
        ...issued,
      });
    }),

  listCesiumAssets: protectedProcedure
    .input(z.object({ parcelIds: parcelScope }))
    .query(async ({ input, ctx }) => {
      const authorizedParcelIds = await authorizeGeospatialParcelScope(ctx.user, input.parcelIds);
      const db = await requireDb();
      return await db
        .select({
          assetKey: geo3dAssets.assetKey,
          parcelId: geo3dAssets.parcelId,
          assetKind: geo3dAssets.assetKind,
          evidenceStatus: geo3dAssets.evidenceStatus,
          processingVersion: geo3dAssets.processingVersion,
          provenance: geo3dAssets.provenance,
          limitations: geo3dAssets.limitations,
          updatedAt: geo3dAssets.updatedAt,
        })
        .from(geo3dAssets)
        .where(and(inArray(geo3dAssets.parcelId, authorizedParcelIds), eq(geo3dAssets.active, true)));
    }),

  issueCesiumAssetCapability: protectedProcedure
    .input(z.object({
      assetKey: stableKey,
      parcelIds: parcelScope,
      purpose: z.string().min(3).max(128).default("cesium.3d-review"),
      ttlSeconds: z.number().int().min(30).max(GEO_DELIVERY_MAX_TTL_SECONDS).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const issued = await issueGeospatialCapability({
        user: ctx.user,
        audience: "cesium_assets",
        parcelIds: input.parcelIds,
        assetKey: input.assetKey,
        purpose: input.purpose,
        ttlSeconds: input.ttlSeconds,
        requestId: requestIdentifier(ctx.req.headers),
        metadata: { client: "pwa", renderer: "cesiumjs" },
      });
      return capabilityResponse({
        audience: "cesium_assets",
        endpoint: `/api/geospatial-delivery/cesium/assets/${encodeURIComponent(input.assetKey)}/tileset.json`,
        ...issued,
      });
    }),

  issueAnalysisCapability: protectedProcedure
    .input(z.object({
      parcelIds: parcelScope,
      purpose: z.string().min(3).max(128),
      ttlSeconds: z.number().int().min(30).max(GEO_DELIVERY_MAX_TTL_SECONDS).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const issued = await issueGeospatialCapability({
        user: ctx.user,
        audience: "geo_analysis",
        parcelIds: input.parcelIds,
        purpose: input.purpose,
        ttlSeconds: input.ttlSeconds,
        requestId: requestIdentifier(ctx.req.headers),
        metadata: { client: "pwa", execution: "lakehouse-authority" },
      });
      return capabilityResponse({
        audience: "geo_analysis",
        endpoint: "/api/geospatial-delivery/analysis",
        ...issued,
      });
    }),

  registerCesiumAsset: adminProcedure
    .input(z.object({
      assetKey: stableKey,
      parcelId: z.number().int().positive(),
      sourceAssetId: stableKey.optional(),
      assetKind: z.enum(["tileset", "terrain", "combined"]),
      evidenceStatus: z.enum(["verified", "provisional", "insufficient_evidence", "rejected"]),
      contentRootRelative: relativePath,
      tilesetRelativePath: relativePath.optional(),
      terrainRelativePath: relativePath.optional(),
      manifestChecksumSha256: sha256,
      sourceChecksumSha256: sha256.optional(),
      processingVersion: z.string().min(1).max(128),
      provenance: z.record(z.string(), z.unknown()).default({}),
      limitations: z.array(z.string().min(1).max(1000)).max(32).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [registered] = await db
        .insert(geo3dAssets)
        .values({
          ...input,
          manifestChecksumSha256: input.manifestChecksumSha256.toLowerCase(),
          sourceChecksumSha256: input.sourceChecksumSha256?.toLowerCase() ?? null,
          tilesetRelativePath: input.tilesetRelativePath ?? null,
          terrainRelativePath: input.terrainRelativePath ?? null,
          registeredBy: ctx.user.id,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: geo3dAssets.assetKey,
          set: {
            parcelId: input.parcelId,
            sourceAssetId: input.sourceAssetId ?? null,
            assetKind: input.assetKind,
            evidenceStatus: input.evidenceStatus,
            contentRootRelative: input.contentRootRelative,
            tilesetRelativePath: input.tilesetRelativePath ?? null,
            terrainRelativePath: input.terrainRelativePath ?? null,
            manifestChecksumSha256: input.manifestChecksumSha256.toLowerCase(),
            sourceChecksumSha256: input.sourceChecksumSha256?.toLowerCase() ?? null,
            processingVersion: input.processingVersion,
            provenance: input.provenance,
            limitations: input.limitations,
            active: true,
            registeredBy: ctx.user.id,
            updatedAt: new Date(),
          },
        })
        .returning();
      return {
        ...registered,
        manifestFingerprint: createHash("sha256").update(registered.manifestChecksumSha256).digest("hex"),
      };
    }),
});
