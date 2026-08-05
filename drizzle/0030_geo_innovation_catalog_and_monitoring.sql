-- ============================================================================
-- Migration 0030: Interoperable geospatial catalog, monitoring, and releases
--
-- Adds durable contracts for ten GeoAI innovations. Existing geo_analysis_runs
-- remains the authoritative execution/evidence record; these tables add
-- discoverability, monitoring, alert lifecycle, and governed public release
-- metadata without duplicating analytical state.
-- ============================================================================

DO $$
BEGIN
  CREATE TYPE geo_monitor_status AS ENUM ('active', 'paused', 'disabled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE geo_alert_status AS ENUM ('open', 'acknowledged', 'investigating', 'resolved', 'dismissed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE geo_release_status AS ENUM ('draft', 'approved', 'published', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS geo_stac_collections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  collection_key varchar(128) NOT NULL UNIQUE,
  title varchar(255) NOT NULL,
  description text NOT NULL,
  license varchar(255) NOT NULL,
  spatial_extent jsonb NOT NULL,
  temporal_extent jsonb NOT NULL,
  providers jsonb NOT NULL DEFAULT '[]'::jsonb,
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_stac_collection_key_nonblank CHECK (length(trim(collection_key)) > 0),
  CONSTRAINT geo_stac_collection_title_nonblank CHECK (length(trim(title)) > 0),
  CONSTRAINT geo_stac_collection_license_nonblank CHECK (length(trim(license)) > 0)
);

CREATE TABLE IF NOT EXISTS geo_stac_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_key varchar(128) NOT NULL UNIQUE,
  collection_id bigint NOT NULL REFERENCES geo_stac_collections(id) ON DELETE CASCADE,
  asset_id varchar(128) REFERENCES geo_asset_catalog(asset_id) ON DELETE SET NULL,
  parcel_id integer REFERENCES parcels(id) ON DELETE SET NULL,
  geometry_geojson jsonb,
  bbox jsonb NOT NULL,
  item_datetime timestamptz,
  start_datetime timestamptz,
  end_datetime timestamptz,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_status geo_evidence_status NOT NULL DEFAULT 'insufficient_evidence',
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_stac_item_key_nonblank CHECK (length(trim(item_key)) > 0),
  CONSTRAINT geo_stac_item_bbox_is_array CHECK (jsonb_typeof(bbox) = 'array')
);

CREATE TABLE IF NOT EXISTS geo_monitor_subscriptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_key varchar(128) NOT NULL UNIQUE,
  parcel_id integer REFERENCES parcels(id) ON DELETE CASCADE,
  requested_by integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  innovation_type varchar(64) NOT NULL,
  status geo_monitor_status NOT NULL DEFAULT 'active',
  schedule_hint varchar(128) NOT NULL,
  settings jsonb NOT NULL,
  last_run_id bigint REFERENCES geo_analysis_runs(id) ON DELETE SET NULL,
  last_evaluated_at timestamptz,
  next_evaluation_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_monitor_subscription_key_nonblank CHECK (length(trim(subscription_key)) > 0),
  CONSTRAINT geo_monitor_innovation_type_nonblank CHECK (length(trim(innovation_type)) > 0),
  CONSTRAINT geo_monitor_schedule_hint_nonblank CHECK (length(trim(schedule_hint)) > 0)
);

CREATE TABLE IF NOT EXISTS geo_change_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alert_key varchar(128) NOT NULL UNIQUE,
  parcel_id integer REFERENCES parcels(id) ON DELETE SET NULL,
  run_id bigint REFERENCES geo_analysis_runs(id) ON DELETE SET NULL,
  subscription_id bigint REFERENCES geo_monitor_subscriptions(id) ON DELETE SET NULL,
  alert_type varchar(64) NOT NULL,
  severity varchar(16) NOT NULL,
  status geo_alert_status NOT NULL DEFAULT 'open',
  evidence_status geo_evidence_status NOT NULL DEFAULT 'insufficient_evidence',
  alert_geometry_geojson jsonb,
  evidence jsonb NOT NULL,
  summary text NOT NULL,
  acknowledged_by integer REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_by integer REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_change_alert_key_nonblank CHECK (length(trim(alert_key)) > 0),
  CONSTRAINT geo_change_alert_type_nonblank CHECK (length(trim(alert_type)) > 0),
  CONSTRAINT geo_change_alert_severity_valid CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT geo_change_alert_summary_nonblank CHECK (length(trim(summary)) > 0)
);

CREATE TABLE IF NOT EXISTS geo_public_releases (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  release_key varchar(128) NOT NULL UNIQUE,
  parcel_id integer REFERENCES parcels(id) ON DELETE SET NULL,
  source_run_id bigint REFERENCES geo_analysis_runs(id) ON DELETE SET NULL,
  requested_by integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by integer REFERENCES users(id) ON DELETE SET NULL,
  status geo_release_status NOT NULL DEFAULT 'draft',
  privacy_method varchar(64) NOT NULL,
  privacy_parameters jsonb NOT NULL,
  released_feature jsonb,
  license varchar(255) NOT NULL,
  legal_notice text NOT NULL,
  approved_at timestamptz,
  published_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_public_release_key_nonblank CHECK (length(trim(release_key)) > 0),
  CONSTRAINT geo_public_release_method_nonblank CHECK (length(trim(privacy_method)) > 0),
  CONSTRAINT geo_public_release_license_nonblank CHECK (length(trim(license)) > 0),
  CONSTRAINT geo_public_release_notice_nonblank CHECK (length(trim(legal_notice)) > 0)
);

CREATE INDEX IF NOT EXISTS geo_stac_items_collection_datetime_idx
  ON geo_stac_items (collection_id, item_datetime DESC);
CREATE INDEX IF NOT EXISTS geo_stac_items_asset_idx
  ON geo_stac_items (asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS geo_monitor_subscriptions_status_next_idx
  ON geo_monitor_subscriptions (status, next_evaluation_at);
CREATE INDEX IF NOT EXISTS geo_monitor_subscriptions_parcel_type_idx
  ON geo_monitor_subscriptions (parcel_id, innovation_type, status);
CREATE INDEX IF NOT EXISTS geo_change_alerts_parcel_status_created_idx
  ON geo_change_alerts (parcel_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS geo_change_alerts_run_idx
  ON geo_change_alerts (run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS geo_public_releases_status_created_idx
  ON geo_public_releases (status, created_at DESC);

COMMENT ON TABLE geo_stac_collections IS 'STAC-compatible collection metadata for registered geospatial assets.';
COMMENT ON TABLE geo_stac_items IS 'STAC-compatible item metadata linked to registered platform evidence assets.';
COMMENT ON TABLE geo_monitor_subscriptions IS 'Authorized, evidence-gated recurring geospatial monitoring configurations; actual execution uses the platform workflow runtime.';
COMMENT ON TABLE geo_change_alerts IS 'Evidence-bearing parcel change alerts requiring acknowledgement and review before operational action.';
COMMENT ON TABLE geo_public_releases IS 'Human-governed privacy-preserving geospatial release records; released features remain non-authoritative for legal claims.';
