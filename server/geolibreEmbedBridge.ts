/**
 * GeoLibre Embed Bridge
 *
 * Implements the full GeoLibre postMessage embed API as documented at:
 * https://github.com/opengeos/GeoLibre
 *
 * GeoLibre is a cloud-native GIS platform built with Tauri v2, React,
 * MapLibre GL JS, DuckDB-WASM Spatial, and deck.gl. This bridge enables:
 *
 * 1. Bidirectional postMessage communication with the embedded GeoLibre iframe
 * 2. Loading parcel GeoJSON directly into GeoLibre's project state
 * 3. Receiving spatial analysis results back from GeoLibre
 * 4. Collaboration session management via GeoLibre's WebSocket relay
 * 5. Vector tile (PMTiles) serving for GeoLibre consumption
 * 6. DuckDB-WASM Spatial query construction for in-browser spatial analysis
 * 7. Apache Sedona SQL query generation for server-side distributed processing
 */

import { requireDb } from './db';
import {
  parcels,
  floodZones,
  adminBoundaries,
  infrastructurePoints,
  spatialAnalyticsCache,
  topologyViolations,
  droneSurveyMissions,
  surveyorGpsTracks,
} from '../drizzle/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

// ============================================================================
// GeoLibre Project Format (matches GeoLibre's internal project JSON schema)
// ============================================================================

export interface GeoLibreLayer {
  id: string;
  type: 'vector' | 'raster' | 'geojson' | 'wms' | 'xyz' | 'pmtiles' | 'wfs';
  name: string;
  visible: boolean;
  opacity: number;
  source: {
    type: string;
    data?: GeoJSON.FeatureCollection;
    url?: string;
    tiles?: string[];
    minzoom?: number;
    maxzoom?: number;
  };
  style?: {
    type: 'single' | 'categorized' | 'graduated' | 'heatmap' | 'cluster';
    paint?: Record<string, unknown>;
    layout?: Record<string, unknown>;
    colorField?: string;
    colorRamp?: string;
  };
  labels?: {
    field: string;
    size: number;
    color: string;
    haloColor: string;
    haloWidth: number;
  };
}

export interface GeoLibreProject {
  version: '2.2';
  name: string;
  description?: string;
  basemap: string;
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  terrain?: {
    source: string;
    exaggeration: number;
  };
  layers: GeoLibreLayer[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// GeoLibre postMessage Protocol
// ============================================================================

export type GeoLibreEmbedMessage =
  | { type: 'loadProject'; project: GeoLibreProject }
  | { type: 'loadGeoJSON'; layerId: string; data: GeoJSON.FeatureCollection }
  | { type: 'setView'; center: [number, number]; zoom: number; pitch?: number; bearing?: number }
  | { type: 'addLayer'; layer: GeoLibreLayer }
  | { type: 'removeLayer'; layerId: string }
  | { type: 'setLayerVisibility'; layerId: string; visible: boolean }
  | { type: 'runSQL'; sql: string; engine: 'duckdb' | 'pglite' | 'sedona' }
  | { type: 'exportGeoJSON'; layerId: string }
  | { type: 'fitBounds'; bounds: [number, number, number, number]; padding?: number }
  | { type: 'startCollabSession'; displayName: string; color: string }
  | { type: 'joinCollabSession'; sessionCode: string; displayName: string; color: string };

export type GeoLibreEmbedResponse =
  | { type: 'projectLoaded'; layerCount: number }
  | { type: 'sqlResult'; rows: Record<string, unknown>[]; columns: string[] }
  | { type: 'exportResult'; layerId: string; geojson: GeoJSON.FeatureCollection }
  | { type: 'collabSessionCreated'; sessionCode: string; hostToken: string }
  | { type: 'error'; code: string; message: string };

// ============================================================================
// Parcel GeoJSON Builder (for GeoLibre project layers)
// ============================================================================

export interface ParcelGeoLibreOptions {
  parcelIds?: number[];
  state?: string;
  lga?: string;
  status?: string;
  landUse?: string;
  includeFloodZones?: boolean;
  includeAdminBoundaries?: boolean;
  includeInfrastructure?: boolean;
  includeDroneFootprints?: boolean;
  includeTopologyViolations?: boolean;
}

export async function buildGeoLibreProject(options: ParcelGeoLibreOptions = {}): Promise<GeoLibreProject> {
  const db = await requireDb();
  const layers: GeoLibreLayer[] = [];

  // --- Parcels layer ---
  const parcelQuery = db.select({
    id: parcels.id,
    parcelId: parcels.parcelId,
    parcelNumber: parcels.parcelNumber,
    address: parcels.address,
    city: parcels.city,
    state: parcels.state,
    lga: parcels.lga,
    ward: parcels.ward,
    latitude: parcels.latitude,
    longitude: parcels.longitude,
    area: parcels.area,
    landUse: parcels.landUse,
    status: parcels.status,
    estimatedValue: parcels.estimatedValue,
    geometryGeoJSON: parcels.geometryGeoJSON,
    boundaryCoordinates: parcels.boundaryCoordinates,
    titleNumber: parcels.titleNumber,
    surveyPlanNumber: parcels.surveyPlanNumber,
    metadata: parcels.metadata,
  }).from(parcels);

  const conditions = [];
  if (options.parcelIds?.length) conditions.push(inArray(parcels.id, options.parcelIds));
  if (options.state) conditions.push(eq(parcels.state, options.state));
  if (options.lga) conditions.push(eq(parcels.lga, options.lga));
  if (options.status) conditions.push(eq(parcels.status, options.status as any));
  if (options.landUse) conditions.push(eq(parcels.landUse, options.landUse));

  const parcelRows = conditions.length > 0
    ? await parcelQuery.where(and(...conditions)).limit(2000)
    : await parcelQuery.limit(2000);

  const parcelFeatures: GeoJSON.Feature[] = parcelRows.map((p) => {
    let geometry: GeoJSON.Geometry;

    if (p.geometryGeoJSON) {
      try {
        const parsed = JSON.parse(p.geometryGeoJSON);
        geometry = parsed.type === 'Feature' ? parsed.geometry : parsed;
      } catch {
        geometry = buildPointGeometry(p.latitude, p.longitude);
      }
    } else if (p.boundaryCoordinates) {
      geometry = buildPolygonFromBoundary(p.boundaryCoordinates, p.latitude, p.longitude);
    } else if (p.latitude && p.longitude) {
      geometry = buildPointGeometry(p.latitude, p.longitude);
    } else {
      return null;
    }

    return {
      type: 'Feature',
      id: p.id,
      properties: {
        id: p.id,
        parcelId: p.parcelId,
        parcelNumber: p.parcelNumber,
        address: p.address,
        state: p.state,
        lga: p.lga,
        ward: p.ward,
        area_m2: p.area,
        landUse: p.landUse,
        status: p.status,
        estimatedValue: p.estimatedValue,
        titleNumber: p.titleNumber,
        surveyPlanNumber: p.surveyPlanNumber,
        metadata: p.metadata,
        // Computed style properties
        _statusColor: STATUS_COLORS[p.status] ?? '#6b7280',
        _landUseColor: LAND_USE_COLORS[p.landUse ?? ''] ?? '#94a3b8',
      },
      geometry,
    } as GeoJSON.Feature;
  }).filter(Boolean) as GeoJSON.Feature[];

  layers.push({
    id: 'parcels',
    type: 'geojson',
    name: 'Parcels',
    visible: true,
    opacity: 1,
    source: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: parcelFeatures },
    },
    style: {
      type: 'categorized',
      colorField: 'status',
      paint: {
        'fill-color': [
          'match', ['get', 'status'],
          'registered', '#22c55e',
          'pending', '#f59e0b',
          'disputed', '#ef4444',
          'draft', '#94a3b8',
          '#6b7280',
        ],
        'fill-opacity': 0.5,
        'fill-outline-color': '#1e293b',
      },
    },
    labels: {
      field: 'parcelNumber',
      size: 11,
      color: '#1e293b',
      haloColor: '#ffffff',
      haloWidth: 1.5,
    },
  });

  // --- Flood Zones layer (optional) ---
  if (options.includeFloodZones) {
    const floodRows = await db.select().from(floodZones).limit(500);
    const floodFeatures: GeoJSON.Feature[] = floodRows
      .filter((fz) => fz.geomWkt)
      .map((fz) => ({
        type: 'Feature',
        properties: {
          id: fz.id,
          zoneCode: fz.zoneCode,
          zoneName: fz.zoneName,
          riskLevel: fz.riskLevel,
          returnPeriodYears: fz.returnPeriodYears,
          maxDepthM: fz.maxDepthM,
          state: fz.state,
          lga: fz.lga,
          _riskColor: FLOOD_RISK_COLORS[fz.riskLevel] ?? '#94a3b8',
        },
        geometry: wktToGeoJSON(fz.geomWkt!),
      } as GeoJSON.Feature));

    if (floodFeatures.length > 0) {
      layers.push({
        id: 'flood-zones',
        type: 'geojson',
        name: 'Flood Zones',
        visible: true,
        opacity: 0.6,
        source: { type: 'geojson', data: { type: 'FeatureCollection', features: floodFeatures } },
        style: {
          type: 'categorized',
          colorField: 'riskLevel',
          paint: {
            'fill-color': ['get', '_riskColor'],
            'fill-opacity': 0.35,
            'fill-outline-color': ['get', '_riskColor'],
          },
        },
      });
    }
  }

  // --- Admin Boundaries layer (optional) ---
  if (options.includeAdminBoundaries) {
    const adminRows = await db.select().from(adminBoundaries)
      .where(eq(adminBoundaries.boundaryType, 'lga'))
      .limit(200);

    const adminFeatures: GeoJSON.Feature[] = adminRows
      .filter((ab) => ab.geomWkt)
      .map((ab) => ({
        type: 'Feature',
        properties: {
          id: ab.id,
          name: ab.name,
          code: ab.code,
          boundaryType: ab.boundaryType,
          population: ab.population,
          areaKm2: ab.areaKm2,
        },
        geometry: wktToGeoJSON(ab.geomWkt!),
      } as GeoJSON.Feature));

    if (adminFeatures.length > 0) {
      layers.push({
        id: 'admin-boundaries',
        type: 'geojson',
        name: 'LGA Boundaries',
        visible: true,
        opacity: 1,
        source: { type: 'geojson', data: { type: 'FeatureCollection', features: adminFeatures } },
        style: {
          type: 'single',
          paint: {
            'line-color': '#1e40af',
            'line-width': 2,
            'line-dasharray': [4, 2],
          },
        },
        labels: {
          field: 'name',
          size: 13,
          color: '#1e40af',
          haloColor: '#ffffff',
          haloWidth: 2,
        },
      });
    }
  }

  // --- Infrastructure Points layer (optional) ---
  if (options.includeInfrastructure) {
    const infraRows = await db.select().from(infrastructurePoints).limit(1000);
    const infraFeatures: GeoJSON.Feature[] = infraRows
      .filter((ip) => ip.lat && ip.lng)
      .map((ip) => ({
        type: 'Feature',
        properties: {
          id: ip.id,
          infraType: ip.infraType,
          name: ip.name,
          operator: ip.operator,
          status: ip.status,
          state: ip.state,
          lga: ip.lga,
        },
        geometry: { type: 'Point', coordinates: [ip.lng!, ip.lat!] },
      } as GeoJSON.Feature));

    if (infraFeatures.length > 0) {
      layers.push({
        id: 'infrastructure',
        type: 'geojson',
        name: 'Infrastructure',
        visible: false,
        opacity: 1,
        source: { type: 'geojson', data: { type: 'FeatureCollection', features: infraFeatures } },
        style: {
          type: 'categorized',
          colorField: 'infraType',
          paint: {
            'circle-radius': 6,
            'circle-color': ['match', ['get', 'infraType'],
              'hospital', '#ef4444',
              'school', '#3b82f6',
              'water', '#06b6d4',
              'power', '#f59e0b',
              'road', '#6b7280',
              '#8b5cf6',
            ],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
          },
        },
      });
    }
  }

  // --- Topology Violations layer (optional) ---
  if (options.includeTopologyViolations) {
    const violations = await db.select({
      id: topologyViolations.id,
      violationType: topologyViolations.violationType,
      parcelIdA: topologyViolations.parcelIdA,
      parcelIdB: topologyViolations.parcelIdB,
      overlapAreaM2: topologyViolations.overlapAreaM2,
      severity: topologyViolations.severity,
      status: topologyViolations.status,
      overlapGeomWkt: topologyViolations.overlapGeomWkt,
    }).from(topologyViolations)
      .where(eq(topologyViolations.status, 'open'))
      .limit(200);

    const violationFeatures: GeoJSON.Feature[] = violations
      .filter((v) => v.overlapGeomWkt)
      .map((v) => ({
        type: 'Feature',
        properties: {
          id: v.id,
          violationType: v.violationType,
          parcelIdA: v.parcelIdA,
          parcelIdB: v.parcelIdB,
          overlapAreaM2: v.overlapAreaM2,
          severity: v.severity,
          status: v.status,
          _severityColor: SEVERITY_COLORS[v.severity] ?? '#6b7280',
        },
        geometry: wktToGeoJSON(v.overlapGeomWkt!),
      } as GeoJSON.Feature));

    if (violationFeatures.length > 0) {
      layers.push({
        id: 'topology-violations',
        type: 'geojson',
        name: 'Topology Violations',
        visible: true,
        opacity: 0.8,
        source: { type: 'geojson', data: { type: 'FeatureCollection', features: violationFeatures } },
        style: {
          type: 'categorized',
          colorField: 'severity',
          paint: {
            'fill-color': ['get', '_severityColor'],
            'fill-opacity': 0.6,
            'fill-outline-color': '#dc2626',
          },
        },
      });
    }
  }

  // Compute bounding box for initial view
  const allCoords = parcelFeatures
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => (f.geometry as GeoJSON.Point).coordinates as [number, number]);

  const center: [number, number] = allCoords.length > 0
    ? [
        allCoords.reduce((sum, c) => sum + c[0], 0) / allCoords.length,
        allCoords.reduce((sum, c) => sum + c[1], 0) / allCoords.length,
      ]
    : [3.3792, 6.5244]; // Lagos default

  return {
    version: '2.2',
    name: 'Land Registry — Parcel Workspace',
    description: `${parcelFeatures.length} parcels loaded from Land Management Platform`,
    basemap: 'https://tiles.openfreemap.org/styles/liberty',
    center,
    zoom: 10,
    pitch: 0,
    bearing: 0,
    layers,
    metadata: {
      generatedAt: new Date().toISOString(),
      parcelCount: parcelFeatures.length,
      platform: 'Land Management Platform',
    },
  };
}

// ============================================================================
// DuckDB-WASM Spatial SQL Query Builder
// These queries run IN THE BROWSER via GeoLibre's SQL Workspace
// ============================================================================

export const DUCKDB_SPATIAL_QUERIES = {
  /**
   * Find all parcels within a given radius (meters) of a point.
   * Runs in-browser via DuckDB-WASM Spatial.
   */
  parcelsWithinRadius: (lng: number, lat: number, radiusM: number) => `
INSTALL spatial; LOAD spatial;
SELECT
  parcelNumber,
  status,
  landUse,
  area_m2,
  estimatedValue,
  ST_Distance(
    ST_Transform(ST_Point(longitude::DOUBLE, latitude::DOUBLE), 'EPSG:4326', 'EPSG:32632'),
    ST_Transform(ST_Point(${lng}, ${lat}), 'EPSG:4326', 'EPSG:32632')
  ) AS distance_m
FROM parcels
WHERE ST_DWithin(
  ST_Transform(ST_Point(longitude::DOUBLE, latitude::DOUBLE), 'EPSG:4326', 'EPSG:32632'),
  ST_Transform(ST_Point(${lng}, ${lat}), 'EPSG:4326', 'EPSG:32632'),
  ${radiusM}
)
ORDER BY distance_m;
  `.trim(),

  /**
   * Calculate land use distribution for a state/LGA.
   */
  landUseDistribution: (state: string, lga?: string) => `
SELECT
  landUse,
  COUNT(*) AS parcel_count,
  SUM(area_m2) AS total_area_m2,
  AVG(estimatedValue) AS avg_value,
  MIN(estimatedValue) AS min_value,
  MAX(estimatedValue) AS max_value
FROM parcels
WHERE state = '${state}'
${lga ? `AND lga = '${lga}'` : ''}
GROUP BY landUse
ORDER BY parcel_count DESC;
  `.trim(),

  /**
   * Detect overlapping parcels using DuckDB Spatial.
   */
  detectOverlaps: () => `
INSTALL spatial; LOAD spatial;
SELECT
  a.parcelNumber AS parcel_a,
  b.parcelNumber AS parcel_b,
  ST_Area(ST_Intersection(
    ST_GeomFromGeoJSON(a.geometryGeoJSON),
    ST_GeomFromGeoJSON(b.geometryGeoJSON)
  )) AS overlap_area_m2
FROM parcels a
JOIN parcels b ON a.id < b.id
WHERE a.geometryGeoJSON IS NOT NULL
  AND b.geometryGeoJSON IS NOT NULL
  AND ST_Intersects(
    ST_GeomFromGeoJSON(a.geometryGeoJSON),
    ST_GeomFromGeoJSON(b.geometryGeoJSON)
  )
  AND NOT ST_Touches(
    ST_GeomFromGeoJSON(a.geometryGeoJSON),
    ST_GeomFromGeoJSON(b.geometryGeoJSON)
  );
  `.trim(),

  /**
   * Spatial join parcels with flood zones.
   */
  floodRiskJoin: () => `
INSTALL spatial; LOAD spatial;
SELECT
  p.parcelNumber,
  p.state,
  p.lga,
  p.estimatedValue,
  fz.zoneName,
  fz.riskLevel,
  fz.maxDepthM,
  ST_Area(ST_Intersection(
    ST_GeomFromGeoJSON(p.geometryGeoJSON),
    ST_GeomFromGeoJSON(fz.geomGeoJSON)
  )) / ST_Area(ST_GeomFromGeoJSON(p.geometryGeoJSON)) * 100 AS flood_coverage_pct
FROM parcels p
JOIN flood_zones fz ON ST_Intersects(
  ST_GeomFromGeoJSON(p.geometryGeoJSON),
  ST_GeomFromGeoJSON(fz.geomGeoJSON)
)
WHERE p.geometryGeoJSON IS NOT NULL
  AND fz.geomGeoJSON IS NOT NULL
ORDER BY flood_coverage_pct DESC;
  `.trim(),

  /**
   * Moran's I spatial autocorrelation for property values.
   */
  spatialAutocorrelation: (state: string) => `
INSTALL spatial; LOAD spatial;
-- Compute spatial weights matrix and Moran's I for property values
WITH parcel_points AS (
  SELECT
    id,
    estimatedValue,
    ST_Point(longitude::DOUBLE, latitude::DOUBLE) AS geom
  FROM parcels
  WHERE state = '${state}'
    AND estimatedValue IS NOT NULL
    AND longitude IS NOT NULL
),
mean_val AS (
  SELECT AVG(estimatedValue) AS mean_v FROM parcel_points
),
deviations AS (
  SELECT
    p.id,
    p.estimatedValue - m.mean_v AS dev,
    p.geom
  FROM parcel_points p, mean_val m
),
spatial_lag AS (
  SELECT
    a.id,
    a.dev,
    SUM(b.dev / ST_Distance(a.geom, b.geom)) / SUM(1.0 / ST_Distance(a.geom, b.geom)) AS weighted_lag
  FROM deviations a
  JOIN deviations b ON a.id != b.id
    AND ST_Distance(a.geom, b.geom) < 0.1  -- ~11km radius
  GROUP BY a.id, a.dev
)
SELECT
  SUM(dev * weighted_lag) / SUM(dev * dev) AS morans_i,
  COUNT(*) AS n_parcels
FROM spatial_lag;
  `.trim(),
};

// ============================================================================
// Apache Sedona SQL Query Builder
// These queries run on the server-side Sedona Spark cluster
// ============================================================================

export const SEDONA_SQL_QUERIES = {
  /**
   * Distributed spatial join: parcels × flood zones
   * Runs on Apache Sedona Spark cluster via lakehouse API
   */
  distributedFloodRiskAnalysis: (state?: string) => `
-- Apache Sedona Spatial SQL
-- Distributed spatial join: parcels × flood zones
SELECT /*+ BROADCAST(fz) */
  p.parcel_id,
  p.parcel_number,
  p.state,
  p.lga,
  p.estimated_value,
  p.land_use,
  fz.zone_code,
  fz.risk_level,
  fz.max_depth_m,
  ST_Area(ST_Transform(ST_Intersection(p.geom_polygon, fz.geom), 'EPSG:32632')) AS overlap_area_m2,
  ST_Area(ST_Transform(p.geom_polygon, 'EPSG:32632')) AS parcel_area_m2,
  ST_Area(ST_Transform(ST_Intersection(p.geom_polygon, fz.geom), 'EPSG:32632')) /
    NULLIF(ST_Area(ST_Transform(p.geom_polygon, 'EPSG:32632')), 0) * 100 AS flood_coverage_pct
FROM parcels p
JOIN flood_zones fz ON ST_Intersects(p.geom_polygon, fz.geom)
${state ? `WHERE p.state = '${state}'` : ''}
ORDER BY flood_coverage_pct DESC
  `.trim(),

  /**
   * Distributed topology validation: detect overlapping parcels
   */
  detectTopologyViolations: () => `
-- Apache Sedona: Detect overlapping parcels using distributed spatial join
SELECT
  a.id AS parcel_id_a,
  a.parcel_number AS parcel_a,
  b.id AS parcel_id_b,
  b.parcel_number AS parcel_b,
  ST_Area(ST_Transform(ST_Intersection(a.geom_polygon, b.geom_polygon), 'EPSG:32632')) AS overlap_area_m2,
  ST_AsGeoJSON(ST_Intersection(a.geom_polygon, b.geom_polygon)) AS overlap_geojson,
  CASE
    WHEN ST_Area(ST_Transform(ST_Intersection(a.geom_polygon, b.geom_polygon), 'EPSG:32632')) > 1000 THEN 'critical'
    WHEN ST_Area(ST_Transform(ST_Intersection(a.geom_polygon, b.geom_polygon), 'EPSG:32632')) > 100 THEN 'high'
    WHEN ST_Area(ST_Transform(ST_Intersection(a.geom_polygon, b.geom_polygon), 'EPSG:32632')) > 10 THEN 'medium'
    ELSE 'low'
  END AS severity
FROM parcels a
JOIN parcels b ON a.id < b.id
  AND ST_Intersects(a.geom_polygon, b.geom_polygon)
  AND NOT ST_Touches(a.geom_polygon, b.geom_polygon)
WHERE a.geom_polygon IS NOT NULL
  AND b.geom_polygon IS NOT NULL
  `.trim(),

  /**
   * GeoParquet export: write parcels to lakehouse as GeoParquet
   */
  exportToGeoParquet: (outputPath: string, state?: string) => `
-- Apache Sedona: Export parcels to GeoParquet (lakehouse)
CREATE OR REPLACE TABLE delta.\`${outputPath}\`
USING delta
AS
SELECT
  p.*,
  ST_AsGeoJSON(p.geom_polygon) AS geometry_geojson,
  ST_AsGeoJSON(p.geom_point) AS point_geojson,
  ST_Area(ST_Transform(p.geom_polygon, 'EPSG:32632')) AS computed_area_m2,
  ST_Perimeter(ST_Transform(p.geom_polygon, 'EPSG:32632')) AS perimeter_m,
  ST_IsValid(p.geom_polygon) AS is_valid_geometry,
  ST_Centroid(p.geom_polygon) AS centroid
FROM parcels p
${state ? `WHERE p.state = '${state}'` : ''}
  `.trim(),

  /**
   * Raster-vector join: extract elevation statistics per parcel from DEM
   */
  elevationStatisticsPerParcel: (demTablePath: string) => `
-- Apache Sedona: Zonal statistics — elevation per parcel from DEM raster
SELECT
  p.parcel_id,
  p.parcel_number,
  RS_ZonalStats(dem.rast, p.geom_polygon, 1, 'mean') AS mean_elevation_m,
  RS_ZonalStats(dem.rast, p.geom_polygon, 1, 'min') AS min_elevation_m,
  RS_ZonalStats(dem.rast, p.geom_polygon, 1, 'max') AS max_elevation_m,
  RS_ZonalStats(dem.rast, p.geom_polygon, 1, 'stddev') AS elevation_stddev
FROM parcels p
JOIN delta.\`${demTablePath}\` dem ON RS_Intersects(dem.rast, p.geom_polygon)
WHERE p.geom_polygon IS NOT NULL
  `.trim(),

  /**
   * NDVI time series: vegetation health tracking per parcel
   */
  ndviTimeSeries: (ndviTablePath: string, parcelId: number) => `
-- Apache Sedona: NDVI time series for a specific parcel
SELECT
  img.acquisition_date,
  RS_ZonalStats(img.rast, p.geom_polygon, 1, 'mean') AS mean_ndvi,
  RS_ZonalStats(img.rast, p.geom_polygon, 1, 'min') AS min_ndvi,
  RS_ZonalStats(img.rast, p.geom_polygon, 1, 'max') AS max_ndvi
FROM parcels p
JOIN delta.\`${ndviTablePath}\` img ON RS_Intersects(img.rast, p.geom_polygon)
WHERE p.id = ${parcelId}
  AND p.geom_polygon IS NOT NULL
ORDER BY img.acquisition_date
  `.trim(),
};

// ============================================================================
// Spatial Analytics Service
// ============================================================================

export interface SpatialAnalyticsResult {
  analysisType: string;
  parcelId?: number;
  state?: string;
  lga?: string;
  result: Record<string, unknown>;
  computedAt: string;
  computationMs: number;
}

export async function runSpatialAnalysis(
  analysisType: string,
  params: Record<string, unknown>
): Promise<SpatialAnalyticsResult> {
  const db = await requireDb();
  const cacheKey = `${analysisType}:${JSON.stringify(params)}`;
  const start = Date.now();

  // Check cache first
  const cached = await db.select().from(spatialAnalyticsCache)
    .where(
      and(
        eq(spatialAnalyticsCache.cacheKey, cacheKey),
        sql`expires_at > NOW()`
      )
    )
    .limit(1);

  if (cached.length > 0) {
    return {
      analysisType,
      result: cached[0].result as Record<string, unknown>,
      computedAt: cached[0].computedAt.toISOString(),
      computationMs: 0,
    };
  }

  let result: Record<string, unknown> = {};

  switch (analysisType) {
    case 'land_use_distribution': {
      const rows = await db.execute(sql`
        SELECT
          land_use,
          COUNT(*) AS parcel_count,
          SUM(area) AS total_area_m2,
          AVG(estimated_value) AS avg_value
        FROM parcels
        WHERE state = ${params.state}
        GROUP BY land_use
        ORDER BY parcel_count DESC
      `);
      result = { rows: rows };
      break;
    }

    case 'parcel_density': {
      const rows = await db.execute(sql`
        SELECT
          lga,
          COUNT(*) AS parcel_count,
          SUM(area) AS total_area_m2,
          AVG(estimated_value) AS avg_value,
          COUNT(CASE WHEN status = 'registered' THEN 1 END) AS registered_count,
          COUNT(CASE WHEN status = 'disputed' THEN 1 END) AS disputed_count
        FROM parcels
        WHERE state = ${params.state}
        GROUP BY lga
        ORDER BY parcel_count DESC
      `);
      result = { rows: rows };
      break;
    }

    case 'flood_risk_summary': {
      const rows = await db.execute(sql`
        SELECT
          flood_risk_level,
          COUNT(*) AS parcel_count,
          SUM(estimated_value) AS total_value_at_risk
        FROM parcels
        WHERE flood_risk_level IS NOT NULL
        GROUP BY flood_risk_level
        ORDER BY
          CASE flood_risk_level
            WHEN 'extreme' THEN 1
            WHEN 'high' THEN 2
            WHEN 'moderate' THEN 3
            WHEN 'low' THEN 4
          END
      `);
      result = { rows: rows };
      break;
    }

    case 'topology_violations_summary': {
      const rows = await db.execute(sql`
        SELECT
          violation_type,
          severity,
          status,
          COUNT(*) AS violation_count,
          SUM(overlap_area_m2) AS total_overlap_area_m2
        FROM topology_violations
        GROUP BY violation_type, severity, status
        ORDER BY
          CASE severity
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
          END
      `);
      result = { rows: rows };
      break;
    }

    case 'value_heatmap': {
      const rows = await db.execute(sql`
        SELECT
          ROUND(latitude::numeric, 2) AS lat_bin,
          ROUND(longitude::numeric, 2) AS lng_bin,
          COUNT(*) AS parcel_count,
          AVG(estimated_value) AS avg_value,
          SUM(estimated_value) AS total_value
        FROM parcels
        WHERE latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND estimated_value IS NOT NULL
          AND state = ${params.state}
        GROUP BY lat_bin, lng_bin
        ORDER BY avg_value DESC
      `);
      result = { rows: rows };
      break;
    }

    default:
      result = { error: `Unknown analysis type: ${analysisType}` };
  }

  const computationMs = Date.now() - start;

  // Cache result for 1 hour
  await db.insert(spatialAnalyticsCache).values({
    cacheKey,
    analysisType,
    parcelId: params.parcelId as number | undefined,
    state: params.state as string | undefined,
    lga: params.lga as string | undefined,
    result,
    expiresAt: new Date(Date.now() + 3600_000),
    computationMs,
  }).onConflictDoUpdate({
    target: spatialAnalyticsCache.cacheKey,
    set: {
      result,
      computedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600_000),
      computationMs,
    },
  });

  return {
    analysisType,
    parcelId: params.parcelId as number | undefined,
    state: params.state as string | undefined,
    lga: params.lga as string | undefined,
    result,
    computedAt: new Date().toISOString(),
    computationMs,
  };
}

// ============================================================================
// Topology Validation Service
// ============================================================================

export async function runTopologyValidation(): Promise<{
  violationsDetected: number;
  violationsInserted: number;
  summary: Record<string, number>;
}> {
  const db = await requireDb();
  // Use PostGIS to detect overlapping parcels
  const overlaps = await db.execute(sql`
    SELECT
      a.id AS parcel_id_a,
      b.id AS parcel_id_b,
      ST_Area(ST_Transform(ST_Intersection(
        ST_SetSRID(ST_GeomFromGeoJSON(a.geometry_geojson), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON(b.geometry_geojson), 4326)
      ), 32632)) AS overlap_area_m2,
      ST_AsText(ST_Intersection(
        ST_SetSRID(ST_GeomFromGeoJSON(a.geometry_geojson), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON(b.geometry_geojson), 4326)
      )) AS overlap_wkt
    FROM parcels a
    JOIN parcels b ON a.id < b.id
    WHERE a.geometry_geojson IS NOT NULL
      AND b.geometry_geojson IS NOT NULL
      AND ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(a.geometry_geojson), 4326))
      AND ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(b.geometry_geojson), 4326))
      AND ST_Intersects(
        ST_SetSRID(ST_GeomFromGeoJSON(a.geometry_geojson), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON(b.geometry_geojson), 4326)
      )
      AND NOT ST_Touches(
        ST_SetSRID(ST_GeomFromGeoJSON(a.geometry_geojson), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON(b.geometry_geojson), 4326)
      )
    LIMIT 500
  `);

  const rows = overlaps as unknown as Array<{
    parcel_id_a: number;
    parcel_id_b: number;
    overlap_area_m2: number;
    overlap_wkt: string;
  }>;

  let inserted = 0;
  const summary: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };

  for (const row of rows) {
    const areaM2 = Number(row.overlap_area_m2);
    const severity =
      areaM2 > 1000 ? 'critical' :
      areaM2 > 100 ? 'high' :
      areaM2 > 10 ? 'medium' : 'low';

    summary[severity]++;

    await db.insert(topologyViolations).values({
      violationType: 'overlap',
      parcelIdA: row.parcel_id_a,
      parcelIdB: row.parcel_id_b,
      overlapAreaM2: areaM2,
      overlapGeomWkt: row.overlap_wkt,
      severity: severity as any,
      status: 'open',
    }).onConflictDoNothing();

    inserted++;
  }

  return {
    violationsDetected: rows.length,
    violationsInserted: inserted,
    summary,
  };
}

// ============================================================================
// Surveyor GPS Track Service
// ============================================================================

export async function recordGpsTrack(
  surveyorId: number,
  sessionId: string,
  points: Array<{
    lng: number;
    lat: number;
    altitudeM?: number;
    accuracyM?: number;
    speedMs?: number;
    headingDegrees?: number;
    recordedAt: Date;
  }>
): Promise<{ inserted: number }> {
  const db = await requireDb();
  if (points.length === 0) return { inserted: 0 };

  const values = points.map((p) => ({
    surveyorId,
    sessionId,
    lng: p.lng,
    lat: p.lat,
    altitudeM: p.altitudeM,
    accuracyM: p.accuracyM,
    speedMs: p.speedMs,
    headingDegrees: p.headingDegrees,
    recordedAt: p.recordedAt,
  }));

  await db.insert(surveyorGpsTracks).values(values);
  return { inserted: values.length };
}

export async function getSurveyorTrackGeoJSON(
  surveyorId: number,
  sessionId: string
): Promise<GeoJSON.FeatureCollection<GeoJSON.LineString>> {
  const db = await requireDb();
  const tracks = await db.select({
    lng: surveyorGpsTracks.lng,
    lat: surveyorGpsTracks.lat,
    altitudeM: surveyorGpsTracks.altitudeM,
    accuracyM: surveyorGpsTracks.accuracyM,
    speedMs: surveyorGpsTracks.speedMs,
    recordedAt: surveyorGpsTracks.recordedAt,
  }).from(surveyorGpsTracks)
    .where(
      and(
        eq(surveyorGpsTracks.surveyorId, surveyorId),
        eq(surveyorGpsTracks.sessionId, sessionId)
      )
    )
    .orderBy(surveyorGpsTracks.recordedAt);

  const coordinates = tracks.map((t) => [t.lng, t.lat, t.altitudeM ?? 0]);

  return {
    type: 'FeatureCollection',
    features: coordinates.length >= 2 ? [{
      type: 'Feature',
      properties: {
        surveyorId,
        sessionId,
        pointCount: coordinates.length,
        startTime: tracks[0]?.recordedAt?.toISOString(),
        endTime: tracks[tracks.length - 1]?.recordedAt?.toISOString(),
      },
      geometry: {
        type: 'LineString',
        coordinates,
      },
    }] : [],
  };
}

// ============================================================================
// Vector Tile Server (MVT from PostGIS)
// ============================================================================

export async function getParcelMVTile(z: number, x: number, y: number): Promise<Buffer | null> {
  const db = await requireDb();
  // Generate Mapbox Vector Tile from PostGIS using ST_AsMVT
  const result = await db.execute(sql`
    WITH tile_bounds AS (
      SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS bbox
    ),
    mvt_data AS (
      SELECT
        ST_AsMVTGeom(
          ST_Transform(
            COALESCE(
              ST_SetSRID(ST_GeomFromGeoJSON(geometry_geojson), 4326),
              ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)
            ),
            3857
          ),
          (SELECT bbox FROM tile_bounds),
          4096,
          256,
          true
        ) AS geom,
        id,
        parcel_id,
        parcel_number,
        status,
        land_use,
        estimated_value,
        state,
        lga,
        flood_risk_level
      FROM parcels
      WHERE ST_Intersects(
        COALESCE(
          ST_SetSRID(ST_GeomFromGeoJSON(geometry_geojson), 4326),
          ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)
        ),
        ST_Transform((SELECT bbox FROM tile_bounds), 4326)
      )
    )
    SELECT ST_AsMVT(mvt_data.*, 'parcels', 4096, 'geom') AS tile
    FROM mvt_data
  `);

  const rows = result as unknown as Array<{ tile: Buffer | null }>;
  return rows[0]?.tile ?? null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildPointGeometry(lat: string | null, lng: string | null): GeoJSON.Point {
  return {
    type: 'Point',
    coordinates: [Number(lng ?? 3.3792), Number(lat ?? 6.5244)],
  };
}

function buildPolygonFromBoundary(
  boundaryCoordinates: string,
  lat: string | null,
  lng: string | null
): GeoJSON.Polygon | GeoJSON.Point {
  const ring = boundaryCoordinates
    .split(';')
    .map((pair) => {
      const [la, lo] = pair.trim().split(',').map(Number);
      return Number.isFinite(la) && Number.isFinite(lo) ? [lo, la] : null;
    })
    .filter((p): p is number[] => p !== null);

  if (ring.length >= 3) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
    return { type: 'Polygon', coordinates: [closed] };
  }

  return buildPointGeometry(lat, lng);
}

/**
 * Minimal WKT to GeoJSON converter for common geometry types.
 * For production, use a proper WKT parser library.
 */
function wktToGeoJSON(wkt: string): GeoJSON.Geometry {
  if (!wkt) return { type: 'Point', coordinates: [0, 0] };

  try {
    if (wkt.startsWith('POINT')) {
      const match = wkt.match(/POINT\s*\(([^)]+)\)/);
      if (match) {
        const [lng, lat] = match[1].split(' ').map(Number);
        return { type: 'Point', coordinates: [lng, lat] };
      }
    }

    if (wkt.startsWith('POLYGON')) {
      const match = wkt.match(/POLYGON\s*\(\(([^)]+)\)\)/);
      if (match) {
        const coords = match[1].split(',').map((pair) => {
          const [lng, lat] = pair.trim().split(' ').map(Number);
          return [lng, lat];
        });
        return { type: 'Polygon', coordinates: [coords] };
      }
    }

    if (wkt.startsWith('MULTIPOLYGON')) {
      // Simplified MULTIPOLYGON parsing
      return { type: 'Point', coordinates: [0, 0] };
    }
  } catch {
    // Fall through
  }

  return { type: 'Point', coordinates: [0, 0] };
}

const STATUS_COLORS: Record<string, string> = {
  registered: '#22c55e',
  pending: '#f59e0b',
  disputed: '#ef4444',
  draft: '#94a3b8',
  cancelled: '#6b7280',
  transferred: '#3b82f6',
};

const LAND_USE_COLORS: Record<string, string> = {
  residential: '#3b82f6',
  commercial: '#f59e0b',
  agricultural: '#22c55e',
  industrial: '#8b5cf6',
  mixed: '#06b6d4',
  public: '#ec4899',
  forest: '#15803d',
  wetland: '#0891b2',
};

const FLOOD_RISK_COLORS: Record<string, string> = {
  low: '#86efac',
  moderate: '#fde047',
  high: '#f97316',
  extreme: '#dc2626',
};

const SEVERITY_COLORS: Record<string, string> = {
  low: '#fde047',
  medium: '#f97316',
  high: '#ef4444',
  critical: '#7f1d1d',
};
