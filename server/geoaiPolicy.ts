import { z } from "zod";

/**
 * GeoAI policy is deliberately independent of any single agent runtime.
 * It translates selected geospatial-method safeguards into versioned, testable
 * platform contracts that are enforced before work is queued and before an
 * analytical outcome may be marked verified.
 */
export const GEOAI_POLICY_VERSION = "1.0.0";

export const geoAnalysisTypeSchema = z.enum([
  "spatial_correctness",
  "field_evidence_review",
  "network_access",
  "imagery_analysis",
  "change_detection",
  "lidar_qc",
  "model_governance",
  "suitability_analysis",
  "cartography_review",
  "arcgis_automation",
]);
export type GeoAnalysisType = z.infer<typeof geoAnalysisTypeSchema>;

export const geoEvidenceStatusSchema = z.enum([
  "verified",
  "provisional",
  "insufficient_evidence",
  "rejected",
]);
export type GeoEvidenceStatus = z.infer<typeof geoEvidenceStatusSchema>;

export const geoAssetTypeSchema = z.enum([
  "parcel_geometry",
  "survey_plan",
  "orthophoto",
  "satellite_scene",
  "raster",
  "lidar_point_cloud",
  "dem",
  "dtm",
  "dsm",
  "road_network",
  "field_observation",
  "derived_product",
]);
export type GeoAssetType = z.infer<typeof geoAssetTypeSchema>;

export const geoAssetReferenceSchema = z.object({
  assetId: z.string().min(6).max(128),
  assetType: geoAssetTypeSchema,
  uri: z.string().url().or(z.string().regex(/^(s3|ipfs|gs):\/\//, "Use an HTTPS, S3, IPFS, or GCS URI")),
  dataSource: z.string().min(2).max(255),
  sourceCrs: z.string().min(3).max(64).optional(),
  verticalCrs: z.string().min(3).max(128).optional(),
  acquiredAt: z.string().datetime().optional(),
  checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  qualityMetadata: z.record(z.string(), z.unknown()).default({}),
  provenance: z.record(z.string(), z.unknown()).default({}),
});
export type GeoAssetReference = z.infer<typeof geoAssetReferenceSchema>;

export const geoAnalysisManifestSchema = z.object({
  analysisType: geoAnalysisTypeSchema,
  title: z.string().min(3).max(255),
  purpose: z.string().min(10).max(4000),
  parcelId: z.number().int().positive().optional(),
  sourceAssets: z.array(geoAssetReferenceSchema).min(1).max(64),
  analysisCrs: z.string().min(3).max(64).optional(),
  outputCrs: z.string().min(3).max(64).optional(),
  temporalWindow: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    seasonalComparable: z.boolean(),
    mutualValidCoveragePct: z.number().min(0).max(100).optional(),
  }).optional(),
  networkAssumptions: z.object({
    mode: z.enum(["drive", "walk", "cycle", "transit"]),
    impedance: z.enum(["travel_time", "distance", "cost"]),
    routerSource: z.string().min(2).max(255),
    maxSnapDistanceM: z.number().positive().max(5000),
  }).optional(),
  modelContext: z.object({
    modelName: z.string().min(2).max(128),
    labelUnit: z.enum(["parcel", "scene", "geographic_block", "pixel", "object"]),
    splitStrategy: z.enum(["spatial_block", "geographic_holdout", "grouped_parcel", "time_series"]),
    decisionThreshold: z.number().min(0).max(1).optional(),
  }).optional(),
  methodParameters: z.record(z.string(), z.unknown()).default({}),
  legalOrRegulatoryUse: z.boolean().default(false),
  allowProvisionalOutput: z.boolean().default(false),
});
export type GeoAnalysisManifest = z.infer<typeof geoAnalysisManifestSchema>;

export type GeoCheckpointDefinition = {
  key: string;
  name: string;
  required: boolean;
};

const PROJECTED_MEASUREMENT_CRS_DENYLIST = new Set(["EPSG:4326", "EPSG:4258", "EPSG:3857"]);
const GEOGRAPHIC_CRS_PATTERN = /^(EPSG:(?:4\d{3}|42\d{2})|CRS:84)$/i;

function normaliseCrs(value: string | undefined): string | undefined {
  return value?.trim().toUpperCase();
}

export function isMetricAnalysisCrs(value: string | undefined): boolean {
  const normalized = normaliseCrs(value);
  return Boolean(normalized && !PROJECTED_MEASUREMENT_CRS_DENYLIST.has(normalized) && !GEOGRAPHIC_CRS_PATTERN.test(normalized));
}

function requireMetricCrs(manifest: GeoAnalysisManifest, errors: string[]) {
  if (!isMetricAnalysisCrs(manifest.analysisCrs)) {
    errors.push("analysisCrs must be an explicit, suitable projected or equal-area CRS; geographic EPSG:4326 and Web Mercator EPSG:3857 cannot support measured area or distance claims");
  }
}

function requireAssetType(manifest: GeoAnalysisManifest, type: GeoAssetType, errors: string[]) {
  if (!manifest.sourceAssets.some((asset) => asset.assetType === type)) {
    errors.push(`A ${type} source asset is required for ${manifest.analysisType}`);
  }
}

function requireAssetCrs(manifest: GeoAnalysisManifest, assetTypes: GeoAssetType[], errors: string[]) {
  for (const asset of manifest.sourceAssets.filter((candidate) => assetTypes.includes(candidate.assetType))) {
    if (!asset.sourceCrs) errors.push(`Source asset ${asset.assetId} (${asset.assetType}) is missing sourceCrs`);
  }
}

export function defaultGeoCheckpoints(manifest: GeoAnalysisManifest): GeoCheckpointDefinition[] {
  const common: GeoCheckpointDefinition[] = [
    { key: "provenance-recorded", name: "Source asset provenance and immutable identifiers recorded", required: true },
    { key: "crs-declared", name: "Source and analysis coordinate reference systems declared", required: true },
    { key: "visual-numeric-verification", name: "Numeric summary and visual QA artifact attached", required: true },
  ];

  switch (manifest.analysisType) {
    case "spatial_correctness":
      return [...common,
        { key: "geometry-validity", name: "Geometry validity and type checks passed", required: true },
        { key: "row-accounting", name: "Spatial join or overlay row accounting reconciled", required: true },
        { key: "query-plan-reviewed", name: "Representative PostGIS query plan and index usage recorded", required: true },
      ];
    case "field_evidence_review":
      return [
        { key: "provenance-recorded", name: "Capture device, acquisition time, location permission state, and immutable asset identifier recorded", required: true },
        { key: "capture-integrity", name: "Server-computed file checksum and capture metadata match the registered source asset", required: true },
        { key: "field-location-review", name: "Captured location, declared geographic CRS, and parcel relationship are reviewed", required: true },
        { key: "field-observation-review", name: "Authorized reviewer has inspected the field observation and attached decision notes", required: true },
      ];
    case "network_access":
      return [...common,
        { key: "network-mode", name: "Network mode and impedance match the access question", required: true },
        { key: "snap-distance-audit", name: "Origin and destination snap-distance distribution reviewed", required: true },
        { key: "unreachable-audit", name: "Unreachable origin-destination pairs are mapped and explained", required: true },
        { key: "route-spot-check", name: "Representative routes are checked against an independent route source", required: true },
      ];
    case "imagery_analysis":
      return [...common,
        { key: "sensor-product-level", name: "Sensor, processing level, bands, scale factors, and resolution recorded", required: true },
        { key: "valid-pixel-mask", name: "Cloud, shadow, nodata, and valid-pixel coverage checks passed", required: true },
        { key: "spatial-validation", name: "Spatially independent validation metrics and error map attached", required: true },
      ];
    case "change_detection":
      return [...common,
        { key: "co-registration", name: "Temporal co-registration quality is measured and accepted", required: true },
        { key: "temporal-comparability", name: "Season, sensor, processing level, and mutual mask comparability are evidenced", required: true },
        { key: "threshold-sensitivity", name: "Threshold selection and sensitivity results are attached", required: true },
        { key: "adjusted-area-uncertainty", name: "Error-adjusted area estimate and confidence interval are attached", required: true },
      ];
    case "lidar_qc":
      return [...common,
        { key: "point-density", name: "Point density supports the requested output resolution", required: true },
        { key: "vertical-datum", name: "Vertical CRS, datum, geoid transformation, and output metadata are recorded", required: true },
        { key: "classification-qa", name: "Ground classification cross-sections and terrain QA artifacts are attached", required: true },
      ];
    case "model_governance":
      return [...common,
        { key: "leakage-audit", name: "Spatial or group leakage audit passed", required: true },
        { key: "baseline-comparison", name: "Baseline model and selection rationale recorded", required: true },
        { key: "uncertainty-metrics", name: "Metrics with uncertainty and spatial error artifacts attached", required: true },
        { key: "transfer-check", name: "Geographic or temporal transfer behavior documented", required: true },
      ];
    case "suitability_analysis":
      return [...common,
        { key: "criteria-weights", name: "Criteria, weights, rationale, and consistency diagnostics recorded", required: true },
        { key: "sensitivity-analysis", name: "Sensitivity analysis and decision robustness recorded", required: true },
      ];
    case "cartography_review":
      return [...common,
        { key: "legend-semantics", name: "Legend, classification, units, projection, and uncertainty semantics reviewed", required: true },
        { key: "accessibility-review", name: "Color accessibility and visual comparison checks passed", required: true },
      ];
    case "arcgis_automation":
      return [...common,
        { key: "operation-plan", name: "Inspectable operation plan and explicit mutation scope attached", required: true },
        { key: "recovery-plan", name: "Recovery plan and backup target attached", required: true },
        { key: "human-approval", name: "Authorized human approval recorded before external execution", required: true },
      ];
  }
}

/**
 * Validate a GeoAI analysis request before it can be persisted or queued.
 * The function returns all actionable errors together so callers do not need to
 * discover evidence requirements one failure at a time.
 */
export function validateGeoAnalysisManifest(rawManifest: unknown): GeoAnalysisManifest {
  const manifest = geoAnalysisManifestSchema.parse(rawManifest);
  const errors: string[] = [];
  const assetIds = new Set<string>();
  for (const asset of manifest.sourceAssets) {
    if (assetIds.has(asset.assetId)) errors.push(`Duplicate source asset ID: ${asset.assetId}`);
    assetIds.add(asset.assetId);
    if (!asset.checksumSha256) errors.push(`Source asset ${asset.assetId} is missing checksumSha256`);
    if (!asset.sourceCrs && asset.assetType !== "field_observation") errors.push(`Source asset ${asset.assetId} is missing sourceCrs`);
  }

  switch (manifest.analysisType) {
    case "spatial_correctness":
      requireMetricCrs(manifest, errors);
      requireAssetType(manifest, "parcel_geometry", errors);
      requireAssetCrs(manifest, ["parcel_geometry"], errors);
      break;
    case "field_evidence_review": {
      requireAssetType(manifest, "field_observation", errors);
      for (const asset of manifest.sourceAssets.filter((candidate) => candidate.assetType === "field_observation")) {
        if (!asset.sourceCrs) errors.push(`Field observation ${asset.assetId} is missing sourceCrs`);
        const provenance = asset.provenance;
        if (typeof provenance.capturedAt !== "string") errors.push(`Field observation ${asset.assetId} is missing provenance.capturedAt`);
        if (!provenance.location || typeof provenance.location !== "object") errors.push(`Field observation ${asset.assetId} is missing provenance.location`);
        if (typeof provenance.captureMethod !== "string") errors.push(`Field observation ${asset.assetId} is missing provenance.captureMethod`);
      }
      break;
    }
    case "network_access":
      requireMetricCrs(manifest, errors);
      requireAssetType(manifest, "road_network", errors);
      if (!manifest.networkAssumptions) errors.push("networkAssumptions are required for network-access analysis");
      break;
    case "imagery_analysis":
      requireAssetCrs(manifest, ["orthophoto", "satellite_scene", "raster"], errors);
      if (!manifest.sourceAssets.some((asset) => ["orthophoto", "satellite_scene", "raster"].includes(asset.assetType))) {
        errors.push("An orthophoto, satellite_scene, or raster source asset is required for imagery analysis");
      }
      break;
    case "change_detection": {
      const imagery = manifest.sourceAssets.filter((asset) => ["orthophoto", "satellite_scene", "raster"].includes(asset.assetType));
      if (imagery.length < 2) errors.push("At least two imagery assets are required for change detection");
      if (!manifest.temporalWindow) errors.push("temporalWindow is required for change detection");
      if (manifest.temporalWindow && !manifest.temporalWindow.seasonalComparable) errors.push("Change detection requires seasonally comparable observations or an explicitly different time-series method");
      if (manifest.temporalWindow && (manifest.temporalWindow.mutualValidCoveragePct ?? 0) <= 0) errors.push("Change detection requires a positive mutual valid-pixel coverage percentage");
      requireAssetCrs(manifest, ["orthophoto", "satellite_scene", "raster"], errors);
      break;
    }
    case "lidar_qc":
      requireAssetType(manifest, "lidar_point_cloud", errors);
      for (const asset of manifest.sourceAssets.filter((candidate) => candidate.assetType === "lidar_point_cloud")) {
        if (!asset.verticalCrs) errors.push(`LiDAR asset ${asset.assetId} is missing verticalCrs`);
        const density = Number(asset.qualityMetadata.pointDensityPtsM2);
        if (!Number.isFinite(density) || density <= 0) errors.push(`LiDAR asset ${asset.assetId} is missing a positive qualityMetadata.pointDensityPtsM2`);
      }
      break;
    case "model_governance":
      if (!manifest.modelContext) errors.push("modelContext is required for model governance");
      break;
    case "suitability_analysis":
      requireMetricCrs(manifest, errors);
      break;
    case "cartography_review":
      if (!manifest.outputCrs) errors.push("outputCrs is required for cartography review");
      break;
    case "arcgis_automation":
      if (!manifest.methodParameters.operationPlan || !manifest.methodParameters.recoveryPlan) {
        errors.push("ArcGIS automation requires methodParameters.operationPlan and methodParameters.recoveryPlan");
      }
      break;
  }

  if (manifest.legalOrRegulatoryUse) {
    requireAssetType(manifest, "parcel_geometry", errors);
    const geometry = manifest.sourceAssets.find((asset) => asset.assetType === "parcel_geometry");
    if (geometry?.qualityMetadata.isProxy === true) errors.push("Proxy geometry cannot support a legal or regulatory spatial claim");
    if (!geometry?.sourceCrs) errors.push("Legal or regulatory spatial claims require a declared parcel geometry CRS");
  }

  if (errors.length > 0) {
    throw new Error(`GeoAI evidence preflight failed: ${errors.join("; ")}`);
  }
  return manifest;
}

export function deriveEvidenceStatus(checkpoints: Array<{ required: boolean; status: string }>, reviewed: boolean): GeoEvidenceStatus {
  if (checkpoints.some((checkpoint) => checkpoint.required && checkpoint.status === "failed")) return "rejected";
  if (checkpoints.some((checkpoint) => checkpoint.required && !["passed", "waived"].includes(checkpoint.status))) return "insufficient_evidence";
  return reviewed ? "verified" : "provisional";
}
