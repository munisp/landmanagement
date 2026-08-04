import {
  completeGeoAnalysisRun,
  failGeoAnalysisRun,
  getGeoAnalysisRun,
  markGeoAnalysisRunning,
  parseGeoAnalysisManifest,
} from "./geoaiEvidenceService";
import {
  computeNetworkAccessibility,
  inspectGeoAiImagery,
  inspectGeoAiLidar,
  performGeoAiChangeDetection,
  validateGeoAiModelEvidence,
  validateSpatialGeometry,
} from "./geoaiLakehouseClient";

function recordValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function requiredNumber(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a finite number`);
  return parsed;
}

function findSourceAsset(manifest: ReturnType<typeof parseGeoAnalysisManifest>, allowedTypes: string[]) {
  const asset = manifest.sourceAssets.find((candidate) => allowedTypes.includes(candidate.assetType));
  if (!asset) throw new Error(`GeoAI run is missing a required source asset of type: ${allowedTypes.join(", ")}`);
  return asset;
}

function rasterRequest(asset: ReturnType<typeof findSourceAsset>) {
  if (!asset.checksumSha256) throw new Error(`GeoAI source asset ${asset.assetId} is missing checksumSha256`);
  if (!asset.sourceCrs) throw new Error(`GeoAI source asset ${asset.assetId} is missing sourceCrs`);
  return {
    uri: asset.uri,
    asset_id: asset.assetId,
    checksum_sha256: asset.checksumSha256,
    declared_source_crs: asset.sourceCrs,
  };
}

export async function executeGeoAnalysisRun(runId: number) {
  const stored = await getGeoAnalysisRun(runId);
  if (!stored) throw new Error(`GeoAI run ${runId} was not found`);
  const manifest = parseGeoAnalysisManifest(stored.run.inputManifest);
  const parameters = manifest.methodParameters;

  await markGeoAnalysisRunning(runId);
  try {
    let resultSummary: Record<string, unknown>;
    let uncertaintySummary: Record<string, unknown>;

    switch (manifest.analysisType) {
      case "field_evidence_review": {
        const fieldObservations = manifest.sourceAssets.filter((asset) => asset.assetType === "field_observation");
        if (!fieldObservations.length) throw new Error("Field evidence review requires at least one registered field observation");
        resultSummary = {
          status: "field_evidence_registered_for_review",
          observationCount: fieldObservations.length,
          observations: fieldObservations.map((asset) => ({
            assetId: asset.assetId,
            uri: asset.uri,
            checksumSha256: asset.checksumSha256,
            capturedAt: asset.provenance.capturedAt,
            location: asset.provenance.location,
            captureMethod: asset.provenance.captureMethod,
            sourceCrs: asset.sourceCrs,
          })),
        };
        uncertaintySummary = {
          status: "requires_authorized_field_review",
          statement: "The platform has registered immutable captured bytes and declared capture provenance. It has not inferred parcel validity, ownership, boundary accuracy, or legal sufficiency from a mobile observation.",
        };
        break;
      }
      case "spatial_correctness": {
        const geometry = recordValue(parameters.geometry, "methodParameters.geometry");
        const referenceGeometries = Array.isArray(parameters.referenceGeometries) ? parameters.referenceGeometries : [];
        const source = findSourceAsset(manifest, ["parcel_geometry"]);
        resultSummary = await validateSpatialGeometry({
          geometry,
          source_crs: source.sourceCrs,
          analysis_crs: manifest.analysisCrs,
          operation: String(parameters.operation ?? "area"),
          reference_geometries: referenceGeometries,
          legal_or_regulatory_use: manifest.legalOrRegulatoryUse,
          source_asset_id: source.assetId,
          source_checksum_sha256: source.checksumSha256,
          is_proxy_geometry: source.qualityMetadata.isProxy === true,
        });
        uncertaintySummary = {
          status: "not_applicable_to_deterministic_geometry_validation",
          statement: "Geometry validity, overlay accounting, and measurement CRS are deterministic checks; decision uncertainty must be attached through review evidence if an external survey accuracy model is used.",
        };
        break;
      }
      case "network_access": {
        if (!manifest.networkAssumptions) throw new Error("networkAssumptions are required for network-access execution");
        resultSummary = await computeNetworkAccessibility({
          nodes: parameters.nodes,
          edges: parameters.edges,
          origin_node_ids: parameters.originNodeIds,
          destination_node_ids: parameters.destinationNodeIds,
          mode: manifest.networkAssumptions.mode,
          impedance: manifest.networkAssumptions.impedance,
          max_snap_distance_m: manifest.networkAssumptions.maxSnapDistanceM,
          declared_router_source: manifest.networkAssumptions.routerSource,
        });
        uncertaintySummary = {
          status: "requires_snap_and_route_review",
          statement: "The calculation uses declared graph nodes and edges. Attach independent route spot checks, snap-distance distribution, and unreachable-pair explanation before evidence review.",
        };
        break;
      }
      case "imagery_analysis": {
        const assets = manifest.sourceAssets.filter((asset) => ["orthophoto", "satellite_scene", "raster"].includes(asset.assetType));
        if (!assets.length) throw new Error("Imagery analysis requires at least one raster source asset");
        const inspections = await Promise.all(assets.map((asset) => inspectGeoAiImagery(rasterRequest(asset))));
        resultSummary = { status: "inspected", inspections };
        uncertaintySummary = {
          status: "requires_spatially_independent_validation",
          statement: "Raster metadata and valid-pixel coverage are verified. Classification or detection confidence requires a separate spatial validation and error artifact.",
        };
        break;
      }
      case "change_detection": {
        const imagery = manifest.sourceAssets.filter((asset) => ["orthophoto", "satellite_scene", "raster"].includes(asset.assetType));
        if (imagery.length < 2) throw new Error("Change detection requires two imagery source assets");
        if (!manifest.temporalWindow) throw new Error("Change detection requires a temporalWindow");
        resultSummary = await performGeoAiChangeDetection({
          before: rasterRequest(imagery[0]),
          after: rasterRequest(imagery[1]),
          threshold: requiredNumber(parameters.threshold, "methodParameters.threshold"),
          seasonal_comparable: manifest.temporalWindow.seasonalComparable,
          mutual_valid_coverage_pct: manifest.temporalWindow.mutualValidCoveragePct,
          comparison_band: parameters.comparisonBand ?? 1,
        });
        uncertaintySummary = {
          status: "requires_error_adjustment",
          statement: "Raw changed-pixel statistics are not an error-adjusted area estimate. Attach a reference sample, confusion matrix, confidence interval, and threshold sensitivity artifact before verification.",
        };
        break;
      }
      case "lidar_qc": {
        const source = findSourceAsset(manifest, ["lidar_point_cloud"]);
        if (!source.verticalCrs) throw new Error("LiDAR execution requires a declared vertical CRS");
        resultSummary = await inspectGeoAiLidar({
          asset: rasterRequest(source),
          declared_vertical_crs: source.verticalCrs,
          requested_output_resolution_m: requiredNumber(parameters.requestedOutputResolutionM, "methodParameters.requestedOutputResolutionM"),
        });
        uncertaintySummary = {
          status: "requires_classification_cross_sections",
          statement: "Point density and metadata inspection are complete. Ground classification, vertical accuracy, and terrain artifacts must be attached before verification.",
        };
        break;
      }
      case "model_governance": {
        if (!manifest.modelContext) throw new Error("Model governance execution requires modelContext");
        resultSummary = await validateGeoAiModelEvidence({
          model_name: manifest.modelContext.modelName,
          model_version: String(parameters.modelVersion ?? ""),
          split_strategy: manifest.modelContext.splitStrategy,
          training_manifest: recordValue(parameters.trainingManifest, "methodParameters.trainingManifest"),
          split_manifest: recordValue(parameters.splitManifest, "methodParameters.splitManifest"),
          baseline_metrics: recordValue(parameters.baselineMetrics, "methodParameters.baselineMetrics"),
          evaluation_metrics: recordValue(parameters.evaluationMetrics, "methodParameters.evaluationMetrics"),
          uncertainty_metrics: recordValue(parameters.uncertaintyMetrics, "methodParameters.uncertaintyMetrics"),
        });
        uncertaintySummary = recordValue(parameters.uncertaintyMetrics, "methodParameters.uncertaintyMetrics");
        break;
      }
      case "suitability_analysis":
      case "cartography_review":
      case "arcgis_automation":
        throw new Error(`${manifest.analysisType} execution is controlled by the dedicated evidence-aware presentation and ArcGIS operation path; it cannot be auto-executed as a generic Lakehouse job`);
    }

    return await completeGeoAnalysisRun({ runId, resultSummary, uncertaintySummary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GeoAI execution failed";
    await failGeoAnalysisRun(runId, message);
    throw error;
  }
}
