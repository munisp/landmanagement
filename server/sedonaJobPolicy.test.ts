import { describe, expect, it } from "vitest";
import { validateSedonaJobInput } from "./sedonaJobPolicy";

const checksum = "a".repeat(64);
const base = {
  features: [{
    featureId: "parcel-42",
    geometryWkt: "POLYGON ((3 4, 3 5, 4 5, 3 4))",
    sourceCrs: "EPSG:4326",
    properties: { land_use: "residential", confidence: 0.98 },
  }],
  analysisCrs: "EPSG:32632",
  outputCrs: "EPSG:4326",
  sourceAssetIds: ["evidence-asset-42"],
  sourceChecksums: [checksum],
};

describe("Sedona job manifest policy", () => {
  it("accepts a bounded GeoParquet export with registered provenance", () => {
    const result = validateSedonaJobInput("geoparquet_export", {
      ...base,
      operation: "geoparquet_export",
      includeProperties: ["land_use", "confidence"],
    });

    expect(result.operation).toBe("geoparquet_export");
    expect(result.features).toHaveLength(1);
    expect(result.sourceChecksums).toEqual([checksum]);
  });

  it("accepts a bounded viewshed with a private registered DEM", () => {
    const result = validateSedonaJobInput("viewshed", {
      ...base,
      operation: "viewshed",
      dem: {
        assetId: "dem-2026-01",
        uri: "s3://idlr-lakehouse/evidence/dem-2026-01.tif",
        checksumSha256: checksum,
        sourceCrs: "EPSG:32632",
        band: 1,
      },
      observer: { longitude: 3.5, latitude: 4.5, heightAboveGroundMeters: 2 },
      maximumDistanceMeters: 10_000,
    });

    expect(result.operation).toBe("viewshed");
    expect(result.dem.uri).toMatch(/^s3:\/\//);
  });

  it("rejects an operation mismatch before a worker can claim a job", () => {
    expect(() => validateSedonaJobInput("viewshed", {
      ...base,
      operation: "geoparquet_export",
    })).toThrow("must match");
  });

  it("rejects raw SQL, shell-like fields, and arbitrary output locations", () => {
    expect(() => validateSedonaJobInput("geoparquet_export", {
      ...base,
      operation: "geoparquet_export",
      sql: "DROP TABLE parcels;",
      command: "spark-submit /tmp/untrusted.py",
      outputUri: "file:///tmp/escape.parquet",
    })).toThrow();
  });

  it("rejects public/untrusted raster addressing and malformed geometry", () => {
    expect(() => validateSedonaJobInput("zonal_statistics", {
      ...base,
      features: [{ ...base.features[0], geometryWkt: "javascript:alert(1)" }],
      operation: "zonal_statistics",
      raster: {
        assetId: "raster-42",
        uri: "file:///etc/shadow",
        checksumSha256: checksum,
        sourceCrs: "EPSG:32632",
      },
    })).toThrow();
  });
});
