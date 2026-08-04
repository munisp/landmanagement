import { describe, expect, it } from "vitest";
import { evaluateSuitability } from "./geoaiDecisionSupportService";
import { validateGeoAnalysisManifest } from "./geoaiPolicy";

const checksum = "a".repeat(64);

function spatialManifest(overrides: Record<string, unknown> = {}) {
  return {
    analysisType: "spatial_correctness",
    title: "Registry boundary verification",
    purpose: "Verify the legally declared parcel boundary against the registered survey geometry.",
    analysisCrs: "EPSG:32631",
    sourceAssets: [{
      assetId: "parcel-boundary-001",
      assetType: "parcel_geometry",
      uri: "s3://trusted-geoai/parcel-boundary-001.geojson",
      dataSource: "registered-survey",
      sourceCrs: "EPSG:4326",
      checksumSha256: checksum,
      qualityMetadata: { surveyPlan: "SP-001" },
      provenance: { registryRecord: "REG-001" },
    }],
    methodParameters: {},
    ...overrides,
  };
}

describe("GeoAI policy preflight", () => {
  it("accepts a provenance-bearing projected spatial correctness manifest", () => {
    const manifest = validateGeoAnalysisManifest(spatialManifest());
    expect(manifest.analysisType).toBe("spatial_correctness");
    expect(manifest.sourceAssets[0].checksumSha256).toBe(checksum);
  });

  it("rejects geographic CRS for measured spatial claims", () => {
    expect(() => validateGeoAnalysisManifest(spatialManifest({ analysisCrs: "EPSG:4326" }))).toThrow(/analysisCrs/);
  });

  it("rejects proxy geometry for legal spatial claims", () => {
    const invalid = spatialManifest({
      legalOrRegulatoryUse: true,
      sourceAssets: [{
        assetId: "parcel-boundary-001",
        assetType: "parcel_geometry",
        uri: "s3://trusted-geoai/parcel-boundary-001.geojson",
        dataSource: "registered-survey",
        sourceCrs: "EPSG:4326",
        checksumSha256: checksum,
        qualityMetadata: { isProxy: true },
        provenance: { registryRecord: "REG-001" },
      }],
    });
    expect(() => validateGeoAnalysisManifest(invalid)).toThrow(/Proxy geometry/);
  });

  it("requires comparable observations and mutual coverage for change detection", () => {
    const invalid = {
      analysisType: "change_detection",
      title: "Encroachment monitoring",
      purpose: "Compare two orthophotos to identify potential registered parcel change evidence.",
      sourceAssets: ["before", "after"].map((id) => ({
        assetId: `scene-${id}-001`, assetType: "orthophoto", uri: `s3://trusted-geoai/${id}.tif`, dataSource: "surveyed-imagery", sourceCrs: "EPSG:32631", checksumSha256: checksum, qualityMetadata: {}, provenance: {},
      })),
      temporalWindow: { start: "2024-01-01T00:00:00.000Z", end: "2025-01-01T00:00:00.000Z", seasonalComparable: false, mutualValidCoveragePct: 0 },
      methodParameters: {},
    };
    expect(() => validateGeoAnalysisManifest(invalid)).toThrow(/seasonally comparable/);
  });
});

describe("GeoAI suitability decision support", () => {
  const request = {
    criteria: [
      { id: "access", label: "Network access", direction: "benefit" as const, weight: 0.6, sourceAssetId: "road-network-001" },
      { id: "flood", label: "Flood exposure", direction: "cost" as const, weight: 0.4, sourceAssetId: "flood-model-001" },
    ],
    alternatives: [
      { id: "parcel-a", label: "Parcel A", values: { access: 30, flood: 80 } },
      { id: "parcel-b", label: "Parcel B", values: { access: 80, flood: 20 } },
    ],
    sensitivityDelta: 0.1,
  };

  it("ranks alternatives from supplied values with provenance-linked contributions", () => {
    const result = evaluateSuitability(request);
    expect(result.ranking[0].id).toBe("parcel-b");
    expect(result.ranking[0].contributions).toHaveLength(2);
    expect(result.ranking[0].contributions[0].sourceAssetId).toBe("road-network-001");
  });

  it("rejects weights that do not sum to one", () => {
    expect(() => evaluateSuitability({ ...request, criteria: [{ ...request.criteria[0], weight: 0.5 }, request.criteria[1]] })).toThrow(/sum to exactly 1/);
  });
});
