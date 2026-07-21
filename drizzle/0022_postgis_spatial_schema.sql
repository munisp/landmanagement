-- ============================================================================
-- Migration 0022: PostGIS Spatial Schema Enhancement
-- Uses a DO block to gracefully skip in PGlite (test env) where PostGIS
-- extensions are unavailable. Falls back to WKT-based text columns.
-- ============================================================================
DO $postgis_migration$
DECLARE
  postgis_available boolean := false;
BEGIN
  BEGIN
    PERFORM PostGIS_Version();
    postgis_available := true;
  EXCEPTION WHEN undefined_function THEN
    postgis_available := false;
  END;

  IF postgis_available THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS postgis';
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS postgis_topology';
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS fuzzystrmatch';
    BEGIN EXECUTE 'ALTER TABLE parcels ADD COLUMN IF NOT EXISTS geom_point geometry(Point,4326)'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'ALTER TABLE parcels ADD COLUMN IF NOT EXISTS geom_polygon geometry(Polygon,4326)'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'ALTER TABLE parcels ADD COLUMN IF NOT EXISTS elevation_m double precision'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'ALTER TABLE parcels ADD COLUMN IF NOT EXISTS flood_risk_level varchar(16)'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'ALTER TABLE parcels ADD COLUMN IF NOT EXISTS flood_zone_code varchar(32)'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_parcels_geom_point ON parcels USING GIST (geom_point)'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_parcels_geom_polygon ON parcels USING GIST (geom_polygon)'; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Always create these tables (with WKT fallback when PostGIS unavailable)
  CREATE TABLE IF NOT EXISTS flood_zones (
    id serial PRIMARY KEY,
    zone_code varchar(32) NOT NULL,
    zone_name varchar(128),
    risk_level varchar(16) NOT NULL DEFAULT 'medium',
    geom_wkt text,
    state varchar(64),
    lga varchar(64),
    source varchar(128),
    effective_date date,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS admin_boundaries (
    id serial PRIMARY KEY,
    boundary_type varchar(32) NOT NULL,
    name varchar(128) NOT NULL,
    code varchar(32),
    parent_id integer,
    geom_wkt text,
    area_km2 double precision,
    population integer,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS infrastructure_points (
    id serial PRIMARY KEY,
    infra_type varchar(64) NOT NULL,
    name varchar(128),
    geom_wkt text,
    state varchar(64),
    lga varchar(64),
    attributes jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS topology_violations (
    id serial PRIMARY KEY,
    violation_type varchar(64) NOT NULL,
    parcel_id_a integer REFERENCES parcels(id) ON DELETE SET NULL,
    parcel_id_b integer REFERENCES parcels(id) ON DELETE SET NULL,
    overlap_area_m2 double precision,
    overlap_geom_wkt text,
    gap_geom_wkt text,
    severity varchar(16) DEFAULT 'medium',
    status varchar(32) DEFAULT 'open',
    resolved_by integer,
    resolved_at timestamptz,
    notes text,
    detected_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS drone_survey_missions (
    id serial PRIMARY KEY,
    mission_name varchar(128) NOT NULL,
    surveyor_id integer,
    parcel_id integer REFERENCES parcels(id) ON DELETE SET NULL,
    status varchar(32) DEFAULT 'planned',
    planned_date timestamptz,
    completed_date timestamptz,
    flight_altitude_m double precision,
    ground_resolution_cm double precision,
    coverage_area_km2 double precision,
    flight_path_geojson jsonb,
    footprint_geom_wkt text,
    image_count integer DEFAULT 0,
    point_cloud_url text,
    orthophoto_url text,
    dsm_url text,
    dtm_url text,
    report_url text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS surveyor_gps_tracks (
    id serial PRIMARY KEY,
    surveyor_id integer NOT NULL,
    session_id varchar(64) NOT NULL,
    lng double precision NOT NULL,
    lat double precision NOT NULL,
    altitude_m double precision,
    accuracy_m double precision,
    speed_ms double precision,
    heading_degrees double precision,
    geom_wkt text,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS spatial_audit_trail (
    id serial PRIMARY KEY,
    entity_type varchar(64) NOT NULL,
    entity_id integer NOT NULL,
    action varchar(32) NOT NULL,
    old_geom_wkt text,
    new_geom_wkt text,
    changed_by integer,
    change_reason text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_topology_violations_status ON topology_violations (status);
  CREATE INDEX IF NOT EXISTS idx_drone_missions_status ON drone_survey_missions (status);
  CREATE INDEX IF NOT EXISTS idx_gps_tracks_surveyor ON surveyor_gps_tracks (surveyor_id, session_id);
  CREATE INDEX IF NOT EXISTS idx_gps_tracks_recorded ON surveyor_gps_tracks (recorded_at DESC);

END $postgis_migration$;
