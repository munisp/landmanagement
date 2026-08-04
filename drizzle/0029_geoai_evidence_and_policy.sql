-- ============================================================================
-- Migration 0029: GeoAI evidence, policy, and controlled-operation contracts
--
-- This migration intentionally persists methodology, source assets, evidence,
-- uncertainty, reviewer decisions, and external workflow references. GeoAI
-- outputs must be traceable to source data and policy checks rather than being
-- represented as unqualified analytical facts.
-- ============================================================================

DO $$
BEGIN
  CREATE TYPE geo_evidence_status AS ENUM (
    'verified',
    'provisional',
    'insufficient_evidence',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE geo_analysis_status AS ENUM (
    'draft',
    'queued',
    'running',
    'awaiting_review',
    'completed',
    'failed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE geo_asset_type AS ENUM (
    'parcel_geometry',
    'survey_plan',
    'orthophoto',
    'satellite_scene',
    'raster',
    'lidar_point_cloud',
    'dem',
    'dtm',
    'dsm',
    'road_network',
    'field_observation',
    'derived_product'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE geo_checkpoint_status AS ENUM (
    'pending',
    'passed',
    'failed',
    'waived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE geo_arcgis_operation_status AS ENUM (
    'requested',
    'approved',
    'rejected',
    'running',
    'completed',
    'failed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE parcels
  ADD COLUMN IF NOT EXISTS geometry_evidence_status geo_evidence_status NOT NULL DEFAULT 'insufficient_evidence',
  ADD COLUMN IF NOT EXISTS geometry_source_asset_id varchar(128),
  ADD COLUMN IF NOT EXISTS geometry_source_crs varchar(64),
  ADD COLUMN IF NOT EXISTS measurement_crs varchar(64),
  ADD COLUMN IF NOT EXISTS geometry_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS geometry_verified_by integer REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS geo_asset_catalog (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id varchar(128) NOT NULL UNIQUE,
  parcel_id integer REFERENCES parcels(id) ON DELETE SET NULL,
  asset_type geo_asset_type NOT NULL,
  uri text NOT NULL,
  checksum_sha256 varchar(128),
  media_type varchar(128),
  data_source varchar(255) NOT NULL,
  acquired_at timestamptz,
  source_crs varchar(64),
  vertical_crs varchar(128),
  coverage_geojson jsonb,
  quality_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_status geo_evidence_status NOT NULL DEFAULT 'insufficient_evidence',
  registered_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_asset_uri_nonblank CHECK (length(trim(uri)) > 0),
  CONSTRAINT geo_asset_source_nonblank CHECK (length(trim(data_source)) > 0)
);

CREATE TABLE IF NOT EXISTS geo_analysis_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_key varchar(128) NOT NULL UNIQUE,
  parcel_id integer REFERENCES parcels(id) ON DELETE SET NULL,
  analysis_type varchar(64) NOT NULL,
  title varchar(255) NOT NULL,
  purpose text NOT NULL,
  policy_version varchar(64) NOT NULL,
  status geo_analysis_status NOT NULL DEFAULT 'draft',
  evidence_status geo_evidence_status NOT NULL DEFAULT 'insufficient_evidence',
  requested_by integer REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by integer REFERENCES users(id) ON DELETE SET NULL,
  workflow_id varchar(255),
  input_manifest jsonb NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary jsonb,
  uncertainty_summary jsonb,
  failure_reason text,
  review_notes text,
  started_at timestamptz,
  completed_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_analysis_type_nonblank CHECK (length(trim(analysis_type)) > 0),
  CONSTRAINT geo_analysis_title_nonblank CHECK (length(trim(title)) > 0),
  CONSTRAINT geo_analysis_purpose_nonblank CHECK (length(trim(purpose)) > 0)
);

CREATE TABLE IF NOT EXISTS geo_analysis_artifacts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES geo_analysis_runs(id) ON DELETE CASCADE,
  asset_id varchar(128) REFERENCES geo_asset_catalog(asset_id) ON DELETE SET NULL,
  artifact_type varchar(64) NOT NULL,
  uri text NOT NULL,
  checksum_sha256 varchar(128),
  media_type varchar(128),
  is_primary boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_artifact_type_nonblank CHECK (length(trim(artifact_type)) > 0),
  CONSTRAINT geo_artifact_uri_nonblank CHECK (length(trim(uri)) > 0)
);

CREATE TABLE IF NOT EXISTS geo_analysis_checkpoints (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES geo_analysis_runs(id) ON DELETE CASCADE,
  checkpoint_key varchar(96) NOT NULL,
  checkpoint_name varchar(255) NOT NULL,
  required boolean NOT NULL DEFAULT true,
  status geo_checkpoint_status NOT NULL DEFAULT 'pending',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  fulfilled_by integer REFERENCES users(id) ON DELETE SET NULL,
  fulfilled_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_checkpoint_key_nonblank CHECK (length(trim(checkpoint_key)) > 0),
  CONSTRAINT geo_checkpoint_unique UNIQUE (run_id, checkpoint_key)
);

CREATE TABLE IF NOT EXISTS geo_model_evidence (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint REFERENCES geo_analysis_runs(id) ON DELETE SET NULL,
  model_name varchar(128) NOT NULL,
  model_version varchar(128) NOT NULL,
  model_run_id bigint REFERENCES ml_model_runs(id) ON DELETE SET NULL,
  training_manifest jsonb NOT NULL,
  split_manifest jsonb NOT NULL,
  baseline_metrics jsonb NOT NULL,
  evaluation_metrics jsonb NOT NULL,
  uncertainty_metrics jsonb NOT NULL,
  error_artifact_uri text,
  geographic_transfer_artifact_uri text,
  evidence_status geo_evidence_status NOT NULL DEFAULT 'insufficient_evidence',
  reviewed_by integer REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_model_version_unique UNIQUE (model_name, model_version)
);

CREATE TABLE IF NOT EXISTS geo_arcgis_operation_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_key varchar(128) NOT NULL UNIQUE,
  run_id bigint REFERENCES geo_analysis_runs(id) ON DELETE SET NULL,
  requested_by integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by integer REFERENCES users(id) ON DELETE SET NULL,
  operation_type varchar(96) NOT NULL,
  operation_plan jsonb NOT NULL,
  recovery_plan jsonb NOT NULL,
  target_workspace_uri text NOT NULL,
  status geo_arcgis_operation_status NOT NULL DEFAULT 'requested',
  external_job_id varchar(255),
  result_summary jsonb,
  failure_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT geo_arcgis_operation_type_nonblank CHECK (length(trim(operation_type)) > 0),
  CONSTRAINT geo_arcgis_workspace_nonblank CHECK (length(trim(target_workspace_uri)) > 0)
);

CREATE INDEX IF NOT EXISTS geo_asset_catalog_parcel_type_idx
  ON geo_asset_catalog (parcel_id, asset_type, acquired_at DESC);
CREATE INDEX IF NOT EXISTS geo_asset_catalog_status_idx
  ON geo_asset_catalog (evidence_status, created_at DESC);
CREATE INDEX IF NOT EXISTS geo_analysis_runs_parcel_created_idx
  ON geo_analysis_runs (parcel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS geo_analysis_runs_status_created_idx
  ON geo_analysis_runs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS geo_analysis_runs_type_status_idx
  ON geo_analysis_runs (analysis_type, evidence_status, created_at DESC);
CREATE INDEX IF NOT EXISTS geo_artifacts_run_idx
  ON geo_analysis_artifacts (run_id, created_at);
CREATE INDEX IF NOT EXISTS geo_checkpoints_run_status_idx
  ON geo_analysis_checkpoints (run_id, status);
CREATE INDEX IF NOT EXISTS geo_model_evidence_run_idx
  ON geo_model_evidence (run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS geo_arcgis_operations_status_idx
  ON geo_arcgis_operation_requests (status, requested_at DESC);

COMMENT ON TABLE geo_analysis_runs IS 'Versioned, auditable GeoAI analysis runs with policy, provenance, uncertainty, and review status.';
COMMENT ON TABLE geo_analysis_artifacts IS 'Artifacts and evidence emitted by a GeoAI analysis run, including QA maps and result products.';
COMMENT ON TABLE geo_analysis_checkpoints IS 'Stage-level verification gates for GeoAI methods; required checks must pass before evidence is verified.';
COMMENT ON TABLE geo_model_evidence IS 'Spatial ML provenance, split evidence, baselines, metrics, uncertainty, and reviewer state.';
COMMENT ON TABLE geo_arcgis_operation_requests IS 'Human-gated ArcGIS automation requests with plan, recovery plan, approval, and external job evidence.';
