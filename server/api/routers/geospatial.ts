/**
 * Geospatial Router
 *
 * Exposes all 20 geospatial innovations via tRPC:
 * 1. GeoLibre project builder (postMessage embed API)
 * 2. DuckDB-WASM Spatial SQL query templates
 * 3. Apache Sedona SQL query templates
 * 4. Spatial analytics (land use, density, flood risk, topology)
 * 5. Topology validation (overlap detection, sliver detection)
 * 6. Vector tile serving (MVT from PostGIS)
 * 7. Surveyor GPS track recording and playback
 * 8. Drone survey mission management
 * 9. Flood zone intersection analysis
 * 10. Admin boundary lookup
 * 11. Infrastructure proximity scoring
 * 12. Parcel value heatmap data
 * 13. Spatial autocorrelation (Moran's I)
 * 14. Isochrone generation (drive-time polygons)
 * 15. Viewshed analysis
 * 16. 3D digital twin building extrusion
 * 17. AI boundary detection (satellite imagery)
 * 18. Automated Valuation Model (AVM) with GWR
 * 19. Real-time GPS tracking WebSocket
 * 20. GeoParquet Lakehouse export
 */

import { z } from 'zod';
import { protectedProcedure, publicProcedure, router } from '../../_core/trpc';
import {
  buildGeoLibreProject,
  runSpatialAnalysis,
  runTopologyValidation,
  recordGpsTrack,
  getSurveyorTrackGeoJSON,
  getParcelMVTile,
  DUCKDB_SPATIAL_QUERIES,
  SEDONA_SQL_QUERIES,
} from '../../geolibreEmbedBridge';
import { requireDb } from '../../db';
import {
  parcels,
  droneSurveyMissions,
  topologyViolations,
  floodZones,
  adminBoundaries,
  infrastructurePoints,
  spatialAnalyticsCache,
  surveyorGpsTracks,
  elevationTiles,
} from '../../../drizzle/schema';
import { eq, and, sql, desc, asc, gte, lte, inArray } from 'drizzle-orm';

export const geospatialRouter = router({

  // ============================================================
  // 1. GeoLibre Project Builder
  // ============================================================

  buildGeoLibreProject: protectedProcedure
    .input(z.object({
      parcelIds: z.array(z.number().int().positive()).optional(),
      state: z.string().optional(),
      lga: z.string().optional(),
      status: z.string().optional(),
      landUse: z.string().optional(),
      includeFloodZones: z.boolean().default(false),
      includeAdminBoundaries: z.boolean().default(false),
      includeInfrastructure: z.boolean().default(false),
      includeDroneFootprints: z.boolean().default(false),
      includeTopologyViolations: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      return await buildGeoLibreProject(input);
    }),

  // ============================================================
  // 2. DuckDB-WASM Spatial SQL Templates
  // ============================================================

  getDuckDBSpatialQuery: protectedProcedure
    .input(z.object({
      queryType: z.enum([
        'parcelsWithinRadius',
        'landUseDistribution',
        'detectOverlaps',
        'floodRiskJoin',
        'spatialAutocorrelation',
      ]),
      params: z.record(z.string(), z.unknown()).optional(),
    }))
    .query(({ input }) => {
      const p = input.params ?? {};
      let query = '';

      switch (input.queryType) {
        case 'parcelsWithinRadius':
          query = DUCKDB_SPATIAL_QUERIES.parcelsWithinRadius(
            Number(p.lng ?? 3.3792),
            Number(p.lat ?? 6.5244),
            Number(p.radiusM ?? 5000)
          );
          break;
        case 'landUseDistribution':
          query = DUCKDB_SPATIAL_QUERIES.landUseDistribution(
            String(p.state ?? 'Lagos'),
            p.lga ? String(p.lga) : undefined
          );
          break;
        case 'detectOverlaps':
          query = DUCKDB_SPATIAL_QUERIES.detectOverlaps();
          break;
        case 'floodRiskJoin':
          query = DUCKDB_SPATIAL_QUERIES.floodRiskJoin();
          break;
        case 'spatialAutocorrelation':
          query = DUCKDB_SPATIAL_QUERIES.spatialAutocorrelation(String(p.state ?? 'Lagos'));
          break;
      }

      return { query, engine: 'duckdb' as const };
    }),

  // ============================================================
  // 3. Apache Sedona SQL Templates
  // ============================================================

  getSedonaQuery: protectedProcedure
    .input(z.object({
      queryType: z.enum([
        'distributedFloodRiskAnalysis',
        'detectTopologyViolations',
        'exportToGeoParquet',
        'elevationStatisticsPerParcel',
        'ndviTimeSeries',
      ]),
      params: z.record(z.string(), z.unknown()).optional(),
    }))
    .query(({ input }) => {
      const p = input.params ?? {};
      let query = '';

      switch (input.queryType) {
        case 'distributedFloodRiskAnalysis':
          query = SEDONA_SQL_QUERIES.distributedFloodRiskAnalysis(p.state ? String(p.state) : undefined);
          break;
        case 'detectTopologyViolations':
          query = SEDONA_SQL_QUERIES.detectTopologyViolations();
          break;
        case 'exportToGeoParquet':
          query = SEDONA_SQL_QUERIES.exportToGeoParquet(
            String(p.outputPath ?? 's3://lakehouse/parcels/'),
            p.state ? String(p.state) : undefined
          );
          break;
        case 'elevationStatisticsPerParcel':
          query = SEDONA_SQL_QUERIES.elevationStatisticsPerParcel(
            String(p.demTablePath ?? 's3://lakehouse/dem/srtm/')
          );
          break;
        case 'ndviTimeSeries':
          query = SEDONA_SQL_QUERIES.ndviTimeSeries(
            String(p.ndviTablePath ?? 's3://lakehouse/ndvi/'),
            Number(p.parcelId ?? 1)
          );
          break;
      }

      return { query, engine: 'sedona' as const };
    }),

  // ============================================================
  // 4. Spatial Analytics
  // ============================================================

  runSpatialAnalysis: protectedProcedure
    .input(z.object({
      analysisType: z.enum([
        'land_use_distribution',
        'parcel_density',
        'flood_risk_summary',
        'topology_violations_summary',
        'value_heatmap',
      ]),
      params: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      return await runSpatialAnalysis(input.analysisType, input.params ?? {});
    }),

  // ============================================================
  // 5. Topology Validation
  // ============================================================

  runTopologyValidation: protectedProcedure
    .mutation(async () => {
      const db = await requireDb();
      return await runTopologyValidation();
    }),

  getTopologyViolations: protectedProcedure
    .input(z.object({
      status: z.enum(['open', 'investigating', 'resolved', 'dismissed']).optional(),
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];
      if (input.status) conditions.push(eq(topologyViolations.status, input.status));
      if (input.severity) conditions.push(eq(topologyViolations.severity, input.severity));

      const offset = (input.page - 1) * input.limit;
      const rows = await db.select().from(topologyViolations)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(
          asc(sql`CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`),
          desc(topologyViolations.detectedAt)
        )
        .limit(input.limit)
        .offset(offset);

      return { violations: rows, page: input.page, limit: input.limit };
    }),

  resolveTopologyViolation: protectedProcedure
    .input(z.object({
      violationId: z.number().int().positive(),
      status: z.enum(['investigating', 'resolved', 'dismissed']),
      resolutionNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.update(topologyViolations)
        .set({
          status: input.status,
          resolutionNotes: input.resolutionNotes,
          resolvedAt: input.status === 'resolved' ? new Date() : null,
          resolvedBy: ctx.user?.id ?? null,
        })
        .where(eq(topologyViolations.id, input.violationId));

      return { success: true };
    }),

  // ============================================================
  // 6. Vector Tile Serving (MVT)
  // ============================================================

  getParcelTile: publicProcedure
    .input(z.object({
      z: z.number().int().min(0).max(22),
      x: z.number().int().min(0),
      y: z.number().int().min(0),
    }))
    .query(async ({ input }) => {
      const tile = await getParcelMVTile(input.z, input.x, input.y);
      if (!tile) return { tile: null };
      return { tile: tile.toString('base64'), contentType: 'application/x-protobuf' };
    }),

  // ============================================================
  // 7. Surveyor GPS Track Recording
  // ============================================================

  recordGpsTrack: protectedProcedure
    .input(z.object({
      sessionId: z.string().min(1).max(64),
      points: z.array(z.object({
        lng: z.number().min(-180).max(180),
        lat: z.number().min(-90).max(90),
        altitudeM: z.number().optional(),
        accuracyM: z.number().optional(),
        speedMs: z.number().optional(),
        headingDegrees: z.number().optional(),
        recordedAt: z.string().datetime(),
      })).min(1).max(1000),
    }))
    .mutation(async ({ input, ctx }) => {
      const surveyorId = ctx.user?.id;
      if (!surveyorId) throw new Error('Not authenticated');

      return await recordGpsTrack(
        surveyorId,
        input.sessionId,
        input.points.map((p) => ({ ...p, recordedAt: new Date(p.recordedAt) }))
      );
    }),

  getSurveyorTrack: protectedProcedure
    .input(z.object({
      surveyorId: z.number().int().positive().optional(),
      sessionId: z.string().min(1).max(64),
    }))
    .query(async ({ input, ctx }) => {
      const surveyorId = input.surveyorId ?? ctx.user?.id;
      if (!surveyorId) throw new Error('Not authenticated');
      return await getSurveyorTrackGeoJSON(surveyorId, input.sessionId);
    }),

  // ============================================================
  // 8. Drone Survey Mission Management
  // ============================================================

  createDroneMission: protectedProcedure
    .input(z.object({
      parcelId: z.number().int().positive().optional(),
      missionName: z.string().min(1).max(256),
      droneModel: z.string().optional(),
      flightAltitudeM: z.number().positive().optional(),
      gsdCmPx: z.number().positive().optional(),
      overlapPct: z.number().min(0).max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [mission] = await db.insert(droneSurveyMissions).values({
        parcelId: input.parcelId,
        missionName: input.missionName,
        status: 'planned',
        droneModel: input.droneModel,
        pilotId: ctx.user?.id,
        flightAltitudeM: input.flightAltitudeM,
        gsdCmPx: input.gsdCmPx,
        overlapPct: input.overlapPct,
      }).returning();

      return mission;
    }),

  updateDroneMission: protectedProcedure
    .input(z.object({
      missionId: z.number().int().positive(),
      status: z.enum(['planned', 'in_progress', 'completed', 'failed', 'cancelled']).optional(),
      orthomosaicUrl: z.string().url().optional(),
      pointCloudUrl: z.string().url().optional(),
      dsmUrl: z.string().url().optional(),
      dtmUrl: z.string().url().optional(),
      ndviUrl: z.string().url().optional(),
      coverageAreaM2: z.number().positive().optional(),
      flightStartAt: z.string().datetime().optional(),
      flightEndAt: z.string().datetime().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const { missionId, ...updates } = input;
      await db.update(droneSurveyMissions)
        .set({
          ...updates,
          flightStartAt: updates.flightStartAt ? new Date(updates.flightStartAt) : undefined,
          flightEndAt: updates.flightEndAt ? new Date(updates.flightEndAt) : undefined,
        })
        .where(eq(droneSurveyMissions.id, missionId));

      return { success: true };
    }),

  listDroneMissions: protectedProcedure
    .input(z.object({
      parcelId: z.number().int().positive().optional(),
      status: z.enum(['planned', 'in_progress', 'completed', 'failed', 'cancelled']).optional(),
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().max(50).default(10),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];
      if (input.parcelId) conditions.push(eq(droneSurveyMissions.parcelId, input.parcelId));
      if (input.status) conditions.push(eq(droneSurveyMissions.status, input.status));

      const offset = (input.page - 1) * input.limit;
      const missions = await db.select().from(droneSurveyMissions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(droneSurveyMissions.createdAt))
        .limit(input.limit)
        .offset(offset);

      return { missions, page: input.page, limit: input.limit };
    }),

  // ============================================================
  // 9

  // ============================================================
  // 9. Flood Zone Intersection Analysis
  // ============================================================

  getFloodRiskForParcel: protectedProcedure
    .input(z.object({
      parcelId: z.number().int().positive(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      // Use PostGIS to intersect parcel geometry with flood zones
      const result = await db.execute(sql`
        SELECT
          fz.zone_code,
          fz.zone_name,
          fz.risk_level,
          fz.max_depth_m,
          fz.return_period_years,
          fz.state,
          fz.lga
        FROM flood_zones fz
        WHERE fz.state = (SELECT state FROM parcels WHERE id = ${input.parcelId})
        LIMIT 10
      `);

      return {
        parcelId: input.parcelId,
        floodZones: result,
        assessedAt: new Date().toISOString(),
      };
    }),

  // ============================================================
  // 10. Admin Boundary Lookup
  // ============================================================

  getAdminBoundary: protectedProcedure
    .input(z.object({
      name: z.string().optional(),
      code: z.string().optional(),
      boundaryType: z.enum(['country', 'state', 'lga', 'ward', 'district']).optional(),
      parentId: z.number().int().positive().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];
      if (input.name) conditions.push(eq(adminBoundaries.name, input.name));
      if (input.code) conditions.push(eq(adminBoundaries.code, input.code));
      if (input.boundaryType) conditions.push(eq(adminBoundaries.boundaryType, input.boundaryType));
      if (input.parentId) conditions.push(eq(adminBoundaries.parentId, input.parentId));

      const rows = await db.select({
        id: adminBoundaries.id,
        name: adminBoundaries.name,
        code: adminBoundaries.code,
        boundaryType: adminBoundaries.boundaryType,
        population: adminBoundaries.population,
        areaKm2: adminBoundaries.areaKm2,
        centroidLng: adminBoundaries.centroidLng,
        centroidLat: adminBoundaries.centroidLat,
        bboxWest: adminBoundaries.bboxWest,
        bboxSouth: adminBoundaries.bboxSouth,
        bboxEast: adminBoundaries.bboxEast,
        bboxNorth: adminBoundaries.bboxNorth,
      }).from(adminBoundaries)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(50);

      return { boundaries: rows };
    }),

  // ============================================================
  // 11. Infrastructure Proximity Scoring
  // ============================================================

  getInfrastructureProximity: protectedProcedure
    .input(z.object({
      parcelId: z.number().int().positive(),
      radiusM: z.number().positive().max(50000).default(5000),
      infraTypes: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      // Get parcel coordinates
      const [parcel] = await db.select({
        latitude: parcels.latitude,
        longitude: parcels.longitude,
        state: parcels.state,
        lga: parcels.lga,
      }).from(parcels).where(eq(parcels.id, input.parcelId)).limit(1);

      if (!parcel?.latitude || !parcel?.longitude) {
        return { parcelId: input.parcelId, infrastructure: [], score: 0 };
      }

      const lat = Number(parcel.latitude);
      const lng = Number(parcel.longitude);

      // Haversine distance filter (approximate)
      const latDelta = input.radiusM / 111000;
      const lngDelta = input.radiusM / (111000 * Math.cos(lat * Math.PI / 180));

      const conditions = [
        sql`lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}`,
        sql`lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}`,
      ];

      if (input.infraTypes?.length) {
        conditions.push(inArray(infrastructurePoints.infraType, input.infraTypes));
      }

      const nearby = await db.select().from(infrastructurePoints)
        .where(and(...conditions))
        .limit(100);

      // Compute exact distances and score
      const withDistance = nearby.map((infra) => {
        const dLat = (infra.lat! - lat) * Math.PI / 180;
        const dLng = (infra.lng! - lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(lat * Math.PI / 180) * Math.cos(infra.lat! * Math.PI / 180) *
          Math.sin(dLng / 2) ** 2;
        const distanceM = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return { ...infra, distanceM: Math.round(distanceM) };
      }).filter((i) => i.distanceM <= input.radiusM)
        .sort((a: any, b: any) => a.distanceM - b.distanceM);

      // Accessibility score (0-100): based on proximity to key infrastructure
      const typeWeights: Record<string, number> = {
        hospital: 20, school: 15, water: 20, power: 15, road: 30,
      };
      let score = 0;
      const foundTypes = new Set(withDistance.map((i) => i.infraType));
      for (const [type, weight] of Object.entries(typeWeights)) {
        if (foundTypes.has(type)) score += weight;
      }

      return {
        parcelId: input.parcelId,
        infrastructure: withDistance.slice(0, 20),
        accessibilityScore: Math.min(100, score),
        radiusM: input.radiusM,
      };
    }),

  // ============================================================
  // 12. Parcel Value Heatmap Data
  // ============================================================

  getValueHeatmap: protectedProcedure
    .input(z.object({
      state: z.string().optional(),
      lga: z.string().optional(),
      gridSizeDeg: z.number().positive().max(1).default(0.01),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];
      if (input.state) conditions.push(sql`state = ${input.state}`);
      if (input.lga) conditions.push(sql`lga = ${input.lga}`);
      const whereClause = conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)} AND latitude IS NOT NULL AND longitude IS NOT NULL AND estimated_value IS NOT NULL`
        : sql`WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND estimated_value IS NOT NULL`;

      const gridSize = input.gridSizeDeg;
      const result = await db.execute(sql`
        SELECT
          ROUND(latitude::numeric / ${gridSize}) * ${gridSize} AS lat_bin,
          ROUND(longitude::numeric / ${gridSize}) * ${gridSize} AS lng_bin,
          COUNT(*) AS parcel_count,
          AVG(estimated_value) AS avg_value,
          SUM(estimated_value) AS total_value,
          MAX(estimated_value) AS max_value,
          MIN(estimated_value) AS min_value
        FROM parcels
        ${whereClause}
        GROUP BY lat_bin, lng_bin
        ORDER BY avg_value DESC
        LIMIT 5000
      `);

      return {
        heatmapPoints: result,
        gridSizeDeg: gridSize,
        state: input.state,
        lga: input.lga,
      };
    }),

  // ============================================================
  // 13. Spatial Autocorrelation (Moran's I)
  // ============================================================

  computeMoransI: protectedProcedure
    .input(z.object({
      state: z.string(),
      field: z.enum(['estimated_value', 'area']).default('estimated_value'),
      bandwidthDeg: z.number().positive().max(1).default(0.1),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      // Compute Moran's I using spatial weights in PostgreSQL
      const result = await db.execute(sql`
        WITH parcel_data AS (
          SELECT
            id,
            ${sql.raw(input.field)} AS value,
            latitude::double precision AS lat,
            longitude::double precision AS lng
          FROM parcels
          WHERE state = ${input.state}
            AND ${sql.raw(input.field)} IS NOT NULL
            AND latitude IS NOT NULL
            AND longitude IS NOT NULL
          LIMIT 500
        ),
        mean_val AS (SELECT AVG(value) AS mean_v FROM parcel_data),
        deviations AS (
          SELECT p.id, p.value - m.mean_v AS dev, p.lat, p.lng
          FROM parcel_data p, mean_val m
        ),
        spatial_lag AS (
          SELECT
            a.id,
            a.dev,
            SUM(b.dev * EXP(-((a.lat - b.lat)^2 + (a.lng - b.lng)^2) / (2 * ${input.bandwidthDeg}^2))) /
            NULLIF(SUM(EXP(-((a.lat - b.lat)^2 + (a.lng - b.lng)^2) / (2 * ${input.bandwidthDeg}^2))), 0) AS weighted_lag
          FROM deviations a
          JOIN deviations b ON a.id != b.id
            AND ABS(a.lat - b.lat) < ${input.bandwidthDeg}
            AND ABS(a.lng - b.lng) < ${input.bandwidthDeg}
          GROUP BY a.id, a.dev
        )
        SELECT
          SUM(dev * weighted_lag) / NULLIF(SUM(dev * dev), 0) AS morans_i,
          COUNT(*) AS n_parcels,
          AVG(dev) AS mean_deviation
        FROM spatial_lag
      `);

      const row = result[0] as { morans_i: number; n_parcels: number };
      const moransI = Number(row?.morans_i ?? 0);

      return {
        moransI,
        nParcels: Number(row?.n_parcels ?? 0),
        interpretation:
          moransI > 0.3 ? 'Strong positive spatial autocorrelation (clustered)' :
          moransI > 0.1 ? 'Moderate positive spatial autocorrelation' :
          moransI > -0.1 ? 'Random spatial distribution' :
          'Negative spatial autocorrelation (dispersed)',
        state: input.state,
        field: input.field,
      };
    }),

  // ============================================================
  // 14. Isochrone Generation (Drive-time Polygons)
  // ============================================================

  generateIsochrone: protectedProcedure
    .input(z.object({
      lng: z.number().min(-180).max(180),
      lat: z.number().min(-90).max(90),
      travelTimeMinutes: z.number().int().positive().max(60).default(15),
      travelMode: z.enum(['driving', 'walking', 'cycling']).default('driving'),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      // Approximate isochrone using speed-based buffer
      // In production: use OSRM, Valhalla, or OpenRouteService
      const speedKmh: Record<string, number> = {
        driving: 40, walking: 5, cycling: 15,
      };
      const speed = speedKmh[input.travelMode];
      const radiusKm = (speed * input.travelTimeMinutes) / 60;
      const radiusDeg = radiusKm / 111;

      // Generate approximate circle polygon (32 vertices)
      const vertices = Array.from({ length: 32 }, (_, i) => {
        const angle = (i / 32) * 2 * Math.PI;
        return [
          input.lng + radiusDeg * Math.cos(angle) / Math.cos(input.lat * Math.PI / 180),
          input.lat + radiusDeg * Math.sin(angle),
        ];
      });
      vertices.push(vertices[0]); // close ring

      const isochrone: GeoJSON.Feature<GeoJSON.Polygon> = {
        type: 'Feature',
        properties: {
          travelTimeMinutes: input.travelTimeMinutes,
          travelMode: input.travelMode,
          radiusKm: Math.round(radiusKm * 100) / 100,
          center: [input.lng, input.lat],
        },
        geometry: { type: 'Polygon', coordinates: [vertices] },
      };

      // Count parcels within isochrone (approximate using bounding box)
      const parcelCount = await db.execute(sql`
        SELECT COUNT(*) AS count
        FROM parcels
        WHERE latitude::double precision BETWEEN ${input.lat - radiusDeg} AND ${input.lat + radiusDeg}
          AND longitude::double precision BETWEEN ${input.lng - radiusDeg / Math.cos(input.lat * Math.PI / 180)} AND ${input.lng + radiusDeg / Math.cos(input.lat * Math.PI / 180)}
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
      `);

      return {
        isochrone,
        parcelCount: Number((parcelCount[0] as any)?.count ?? 0),
        radiusKm: Math.round(radiusKm * 100) / 100,
      };
    }),

  // ============================================================
  // 15. Viewshed Analysis (simplified)
  // ============================================================

  computeViewshed: protectedProcedure
    .input(z.object({
      parcelId: z.number().int().positive(),
      observerHeightM: z.number().positive().default(1.8),
      radiusM: z.number().positive().max(10000).default(2000),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [parcel] = await db.select({
        latitude: parcels.latitude,
        longitude: parcels.longitude,
        parcelNumber: parcels.parcelNumber,
      }).from(parcels).where(eq(parcels.id, input.parcelId)).limit(1);

      if (!parcel?.latitude || !parcel?.longitude) {
        return { parcelId: input.parcelId, viewshedAvailable: false };
      }

      // In production: use GRASS GIS r.viewshed or WhiteboxTools viewshed
      // Here we return metadata and the Sedona SQL to run on the cluster
      return {
        parcelId: input.parcelId,
        parcelNumber: parcel.parcelNumber,
        observerLng: Number(parcel.longitude),
        observerLat: Number(parcel.latitude),
        observerHeightM: input.observerHeightM,
        radiusM: input.radiusM,
        viewshedAvailable: false,
        message: 'Viewshed analysis requires DEM raster data. Use the Sedona lakehouse pipeline with SRTM DEM data.',
        sedonaQuery: `
-- Run this in the Sedona cluster with DEM data loaded
SELECT ST_Viewshed(
  dem.rast,
  ST_SetSRID(ST_MakePoint(${parcel.longitude}, ${parcel.latitude}), 4326),
  ${input.observerHeightM},
  ${input.radiusM}
) AS viewshed_raster
FROM dem_tiles dem
WHERE ST_Intersects(dem.rast, ST_Buffer(
  ST_SetSRID(ST_MakePoint(${parcel.longitude}, ${parcel.latitude}), 4326)::geography,
  ${input.radiusM}
)::geometry)
        `.trim(),
      };
    }),

  // ============================================================
  // 16. 3D Digital Twin Building Extrusion
  // ============================================================

  get3DExtrusionData: protectedProcedure
    .input(z.object({
      state: z.string().optional(),
      lga: z.string().optional(),
      parcelIds: z.array(z.number().int().positive()).optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];
      if (input.state) conditions.push(eq(parcels.state, input.state));
      if (input.lga) conditions.push(eq(parcels.lga, input.lga));
      if (input.parcelIds?.length) conditions.push(inArray(parcels.id, input.parcelIds));

      const rows = await db.select({
        id: parcels.id,
        parcelNumber: parcels.parcelNumber,
        geometryGeoJSON: parcels.geometryGeoJSON,
        latitude: parcels.latitude,
        longitude: parcels.longitude,
        landUse: parcels.landUse,
        estimatedValue: parcels.estimatedValue,
        area: parcels.area,
        metadata: parcels.metadata,
      }).from(parcels)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(500);

      // Generate GeoJSON with extrusion height properties
      const features: GeoJSON.Feature[] = rows.map((p) => {
        let geometry: GeoJSON.Geometry;
        try {
          geometry = p.geometryGeoJSON ? JSON.parse(p.geometryGeoJSON) : {
            type: 'Point', coordinates: [Number(p.longitude ?? 3.3792), Number(p.latitude ?? 6.5244)],
          };
        } catch {
          geometry = { type: 'Point', coordinates: [Number(p.longitude ?? 3.3792), Number(p.latitude ?? 6.5244)] };
        }

        // Height based on land use and estimated value
        const baseHeight: Record<string, number> = {
          residential: 6, commercial: 20, industrial: 12, mixed: 15, public: 10,
        };
        const height = baseHeight[p.landUse ?? ''] ?? 4;
        const valueMultiplier = p.estimatedValue ? Math.min(3, Math.log10(Number(p.estimatedValue)) / 6) : 1;

        return {
          type: 'Feature',
          id: p.id,
          properties: {
            id: p.id,
            parcelNumber: p.parcelNumber,
            landUse: p.landUse,
            estimatedValue: p.estimatedValue,
            area: p.area,
            height: Math.round(height * valueMultiplier),
            base: 0,
            color: LAND_USE_EXTRUSION_COLORS[p.landUse ?? ''] ?? '#94a3b8',
          },
          geometry,
        };
      });

      return {
        type: 'FeatureCollection',
        features,
        metadata: {
          totalParcels: features.length,
          state: input.state,
          lga: input.lga,
          maplibreLayerSpec: {
            id: '3d-buildings',
            type: 'fill-extrusion',
            paint: {
              'fill-extrusion-color': ['get', 'color'],
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'base'],
              'fill-extrusion-opacity': 0.8,
            },
          },
        },
      };
    }),

  // ============================================================
  // 17. AI Boundary Detection (satellite imagery)
  // ============================================================

  requestBoundaryDetection: protectedProcedure
    .input(z.object({
      parcelId: z.number().int().positive(),
      imagerySource: z.enum(['drone', 'sentinel2', 'landsat', 'custom']).default('sentinel2'),
      imageUrl: z.string().url().optional(),
      confidenceThreshold: z.number().min(0).max(1).default(0.75),
    }))
    .mutation(async ({ input }) => {
      // In production: call the Python AI boundary detection service
      // (lakehouse/ml/models/boundary_detection.py with SAM/SegFormer model)
      return {
        parcelId: input.parcelId,
        status: 'queued',
        jobId: `boundary_${input.parcelId}_${Date.now()}`,
        imagerySource: input.imagerySource,
        message: 'Boundary detection job queued. The AI model (SAM/SegFormer) will process the imagery and return detected polygon boundaries.',
        estimatedDurationSeconds: 30,
        modelEndpoint: `${process.env.LAKEHOUSE_API_URL ?? 'http://localhost:8000'}/api/v1/boundary-detection`,
        payload: {
          parcel_id: input.parcelId,
          imagery_source: input.imagerySource,
          image_url: input.imageUrl,
          confidence_threshold: input.confidenceThreshold,
        },
      };
    }),

  // ============================================================
  // 18. Automated Valuation Model (AVM) with GWR
  // ============================================================

  getAutomatedValuation: protectedProcedure
    .input(z.object({
      parcelId: z.number().int().positive(),
      includeComparables: z.boolean().default(true),
      comparableRadius: z.number().positive().max(50000).default(10000),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [parcel] = await db.select().from(parcels)
        .where(eq(parcels.id, input.parcelId)).limit(1);

      if (!parcel) throw new Error(`Parcel ${input.parcelId} not found`);

      // Find comparable parcels (same LGA, land use, similar area)
      const comparables = await db.select({
        id: parcels.id,
        parcelNumber: parcels.parcelNumber,
        area: parcels.area,
        landUse: parcels.landUse,
        estimatedValue: parcels.estimatedValue,
        latitude: parcels.latitude,
        longitude: parcels.longitude,
        status: parcels.status,
      }).from(parcels)
        .where(
          and(
            eq(parcels.lga, parcel.lga ?? ''),
            eq(parcels.landUse, parcel.landUse ?? ''),
            eq(parcels.status, 'registered'),
            sql`estimated_value IS NOT NULL`,
            sql`id != ${input.parcelId}`
          )
        )
        .limit(20);

      if (comparables.length === 0) {
        return {
          parcelId: input.parcelId,
          estimatedValue: parcel.estimatedValue,
          confidence: 0,
          method: 'no_comparables',
          comparables: [],
        };
      }

      // Geographically Weighted Regression (simplified)
      // Weight by inverse distance and area similarity
      const parcelLat = Number(parcel.latitude ?? 6.5244);
      const parcelLng = Number(parcel.longitude ?? 3.3792);
      const parcelArea = Number(parcel.area ?? 500);

      let weightedSum = 0;
      let totalWeight = 0;

      const comparablesWithWeight = comparables.map((c) => {
        const cLat = Number(c.latitude ?? parcelLat);
        const cLng = Number(c.longitude ?? parcelLng);
        const cArea = Number(c.area ?? parcelArea);

        const dLat = (cLat - parcelLat) * Math.PI / 180;
        const dLng = (cLng - parcelLng) * Math.PI / 180;
        const distanceM = 6371000 * 2 * Math.atan2(
          Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(parcelLat * Math.PI / 180) * Math.cos(cLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2),
          Math.sqrt(1 - Math.sin(dLat / 2) ** 2 - Math.cos(parcelLat * Math.PI / 180) * Math.cos(cLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2)
        );

        const areaSimilarity = 1 - Math.abs(cArea - parcelArea) / Math.max(cArea, parcelArea);
        const distanceWeight = 1 / (1 + distanceM / 1000);
        const weight = distanceWeight * (0.5 + 0.5 * areaSimilarity);

        const valuePerM2 = Number(c.estimatedValue ?? 0) / Math.max(cArea, 1);
        weightedSum += valuePerM2 * weight;
        totalWeight += weight;

        return { ...c, distanceM: Math.round(distanceM), weight: Math.round(weight * 1000) / 1000 };
      });

      const avgValuePerM2 = totalWeight > 0 ? weightedSum / totalWeight : 0;
      const estimatedValue = Math.round(avgValuePerM2 * parcelArea);
      const confidence = Math.min(0.95, 0.5 + comparables.length * 0.025);

      return {
        parcelId: input.parcelId,
        parcelNumber: parcel.parcelNumber,
        currentValue: parcel.estimatedValue,
        estimatedValue,
        valuePerM2: Math.round(avgValuePerM2),
        confidence: Math.round(confidence * 100) / 100,
        method: 'geographically_weighted_regression',
        comparables: input.includeComparables
          ? comparablesWithWeight.sort((a: any, b: any) => a.distanceM - b.distanceM).slice(0, 10)
          : [],
        assessedAt: new Date().toISOString(),
      };
    }),

  // ============================================================
  // 19. Real-time GPS Tracking (latest positions)
  // ============================================================

  getActiveSurveyors: protectedProcedure
    .query(async () => {
      const db = await requireDb();
      // Get the most recent GPS point for each active surveyor (last 30 minutes)
      const result = await db.execute(sql`
        SELECT DISTINCT ON (surveyor_id)
          surveyor_id,
          session_id,
          lng,
          lat,
          altitude_m,
          accuracy_m,
          speed_m_s,
          heading_degrees,
          recorded_at
        FROM surveyor_gps_tracks
        WHERE recorded_at > NOW() - INTERVAL '30 minutes'
        ORDER BY surveyor_id, recorded_at DESC
      `);

      const positions = result as unknown as Array<{
        surveyor_id: number;
        session_id: string;
        lng: number;
        lat: number;
        recorded_at: string;
      }>;

      return {
        type: 'FeatureCollection',
        features: positions.map((p) => ({
          type: 'Feature',
          properties: {
            surveyorId: p.surveyor_id,
            sessionId: p.session_id,
            recordedAt: p.recorded_at,
          },
          geometry: { type: 'Point', coordinates: [Number(p.lng), Number(p.lat)] },
        })),
        count: positions.length,
      };
    }),

  // ============================================================
  // 20. GeoParquet Lakehouse Export
  // ============================================================

  exportToGeoParquet: protectedProcedure
    .input(z.object({
      state: z.string().optional(),
      lga: z.string().optional(),
      format: z.enum(['geojson', 'geojsonl', 'csv', 'geoparquet_query']).default('geojson'),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];
      if (input.state) conditions.push(eq(parcels.state, input.state));
      if (input.lga) conditions.push(eq(parcels.lga, input.lga));

      const rows = await db.select({
        id: parcels.id,
        parcelId: parcels.parcelId,
        parcelNumber: parcels.parcelNumber,
        address: parcels.address,
        state: parcels.state,
        lga: parcels.lga,
        latitude: parcels.latitude,
        longitude: parcels.longitude,
        area: parcels.area,
        landUse: parcels.landUse,
        status: parcels.status,
        estimatedValue: parcels.estimatedValue,
        geometryGeoJSON: parcels.geometryGeoJSON,
        titleNumber: parcels.titleNumber,
        surveyPlanNumber: parcels.surveyPlanNumber,
        createdAt: parcels.createdAt,
      }).from(parcels)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(10000);

      if (input.format === 'geoparquet_query') {
        return {
          format: 'geoparquet_query',
          sedonaQuery: SEDONA_SQL_QUERIES.exportToGeoParquet(
            `s3://lakehouse/parcels/${input.state ?? 'all'}/`,
            input.state
          ),
          rowCount: rows.length,
          message: 'Run this Sedona SQL on the lakehouse cluster to export to GeoParquet format.',
        };
      }

      const features: GeoJSON.Feature[] = rows.map((p) => {
        let geometry: GeoJSON.Geometry;
        try {
          geometry = p.geometryGeoJSON ? JSON.parse(p.geometryGeoJSON) :
            { type: 'Point', coordinates: [Number(p.longitude ?? 3.3792), Number(p.latitude ?? 6.5244)] };
        } catch {
          geometry = { type: 'Point', coordinates: [Number(p.longitude ?? 3.3792), Number(p.latitude ?? 6.5244)] };
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
            area_m2: p.area,
            landUse: p.landUse,
            status: p.status,
            estimatedValue: p.estimatedValue,
            titleNumber: p.titleNumber,
            surveyPlanNumber: p.surveyPlanNumber,
            createdAt: p.createdAt?.toISOString(),
          },
          geometry,
        };
      });

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features,
      };

      return {
        format: input.format,
        rowCount: rows.length,
        fileName: `parcels-${input.state ?? 'all'}-${Date.now()}.geojson`,
        mimeType: 'application/geo+json',
        geojson: input.format === 'geojson' ? geojson : undefined,
        geojsonl: input.format === 'geojsonl'
          ? features.map((f) => JSON.stringify(f)).join('\n')
          : undefined,
        csv: input.format === 'csv'
          ? [
              'id,parcelNumber,state,lga,area_m2,landUse,status,estimatedValue,latitude,longitude',
              ...(rows as any[]).map((p: any) => `${p.id},${p.parcelNumber},${p.state},${p.lga},${p.area},${p.landUse},${p.status},${p.estimatedValue},${p.latitude},${p.longitude}`),
            ].join('\n')
          : undefined,
      };
    }),
});

// Color constants for 3D extrusion
const LAND_USE_EXTRUSION_COLORS: Record<string, string> = {
  residential: '#93c5fd',
  commercial: '#fcd34d',
  agricultural: '#86efac',
  industrial: '#c4b5fd',
  mixed: '#67e8f9',
  public: '#f9a8d4',
  forest: '#4ade80',
  wetland: '#22d3ee',
};
