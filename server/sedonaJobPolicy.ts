import { z } from "zod";
import type { SedonaOperation } from "./sedonaJobService";

const checksumSchema = z.string().regex(/^[a-fA-F0-9]{64}$/);
const crsSchema = z.string().regex(/^EPSG:[1-9][0-9]{3,5}$/i);
const identifierSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const privateUriSchema = z.string().refine((value) => value.startsWith("s3://") || value.startsWith("https://"), {
  message: "Asset URI must use s3:// or https://",
});
const wktSchema = z.string().min(9).max(2_000_000).regex(
  /^(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\s*(Z|M|ZM)?\s*\(/i,
  "Geometry must be WKT with a supported geometry type",
);

export const sedonaFeatureSchema = z.object({
  featureId: identifierSchema,
  geometryWkt: wktSchema,
  sourceCrs: crsSchema,
  sourceAssetId: identifierSchema.optional(),
  sourceChecksumSha256: checksumSchema.optional(),
  properties: z.record(z.string(), z.union([z.string().max(1_000), z.number().finite(), z.boolean(), z.null()])).default({}),
}).strict();

const baseManifestSchema = z.object({
  features: z.array(sedonaFeatureSchema).min(1).max(10_000),
  analysisCrs: crsSchema,
  outputCrs: crsSchema.default("EPSG:4326"),
  sourceAssetIds: z.array(identifierSchema).min(1).max(200),
  sourceChecksums: z.array(checksumSchema).min(1).max(200),
}).strict();

const rasterAssetSchema = z.object({
  assetId: identifierSchema,
  uri: privateUriSchema,
  checksumSha256: checksumSchema,
  sourceCrs: crsSchema,
  band: z.number().int().min(1).max(256).default(1),
}).strict();

const exportSchema = baseManifestSchema.extend({
  operation: z.literal("geoparquet_export"),
  includeProperties: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)).max(100).default([]),
}).strict();

const topologySchema = baseManifestSchema.extend({
  operation: z.literal("topology_validation"),
  overlapToleranceSquareMeters: z.number().finite().min(0).max(1_000_000).default(0),
}).strict();

const workbenchSchema = baseManifestSchema.extend({
  operation: z.literal("spatial_workbench"),
  anchorFeatureId: identifierSchema,
  neighborDistanceMeters: z.number().finite().positive().max(500_000).default(5_000),
}).strict();

const zonalSchema = baseManifestSchema.extend({
  operation: z.literal("zonal_statistics"),
  raster: rasterAssetSchema,
}).strict();

const viewshedSchema = baseManifestSchema.extend({
  operation: z.literal("viewshed"),
  dem: rasterAssetSchema,
  observer: z.object({ longitude: z.number().finite().min(-180).max(180), latitude: z.number().finite().min(-90).max(90), heightAboveGroundMeters: z.number().finite().min(0).max(100) }).strict(),
  maximumDistanceMeters: z.number().finite().positive().max(100_000).default(10_000),
}).strict();

export const sedonaJobInputSchema = z.discriminatedUnion("operation", [
  exportSchema,
  topologySchema,
  workbenchSchema,
  zonalSchema,
  viewshedSchema,
]);

export type SedonaJobInput = z.infer<typeof sedonaJobInputSchema>;

export function validateSedonaJobInput(operation: SedonaOperation, input: unknown): SedonaJobInput {
  const validated = sedonaJobInputSchema.parse(input);
  if (validated.operation !== operation) {
    throw new Error("Sedona job operation must match its typed manifest operation");
  }
  return validated;
}
