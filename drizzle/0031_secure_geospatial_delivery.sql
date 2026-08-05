-- ============================================================================
-- Migration 0031: Secure cross-language geospatial delivery
--
-- Adds immutable 3D asset metadata and non-secret capability issuance/audit
-- records. Browser capabilities are never persisted verbatim; only their SHA-256
-- fingerprints are retained for incident investigation and revocation analysis.
-- ============================================================================

DO $$
BEGIN
  CREATE TYPE geo_delivery_audience AS ENUM ('vector_tiles', 'cesium_assets', 'geo_analysis', 'mobile_evidence');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS geo_3d_assets (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_key varchar(128) NOT NULL UNIQUE,
  parcel_id integer REFERENCES parcels(id) ON DELETE SET NULL,
  source_asset_id varchar(128) REFERENCES geo_asset_catalog(asset_id) ON DELETE SET NULL,
  asset_kind varchar(32) NOT NULL,
  evidence_status geo_evidence_status NOT NULL DEFAULT 'insufficient_evidence',
  content_root_relative text NOT NULL,
  tileset_relative_path text,
  terrain_relative_path text,
  manifest_checksum_sha256 varchar(64) NOT NULL,
  source_checksum_sha256 varchar(64),
  processing_version varchar(128) NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  registered_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_3d_assets_key_nonblank CHECK (length(trim(asset_key)) > 0),
  CONSTRAINT geo_3d_assets_kind_valid CHECK (asset_kind IN ('tileset', 'terrain', 'combined')),
  CONSTRAINT geo_3d_assets_root_relative CHECK (
    content_root_relative !~ '(^/|\\.\\.|\\x00)' AND length(trim(content_root_relative)) > 0
  ),
  CONSTRAINT geo_3d_assets_tileset_relative CHECK (
    tileset_relative_path IS NULL OR tileset_relative_path !~ '(^/|\\.\\.|\\x00)'
  ),
  CONSTRAINT geo_3d_assets_terrain_relative CHECK (
    terrain_relative_path IS NULL OR terrain_relative_path !~ '(^/|\\.\\.|\\x00)'
  ),
  CONSTRAINT geo_3d_assets_checksum_shape CHECK (manifest_checksum_sha256 ~ '^[A-Fa-f0-9]{64}$')
);

CREATE TABLE IF NOT EXISTS geo_delivery_access_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id varchar(128) NOT NULL,
  capability_fingerprint_sha256 varchar(64) NOT NULL,
  capability_id varchar(128) NOT NULL,
  audience geo_delivery_audience NOT NULL,
  purpose varchar(128) NOT NULL,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  parcel_ids jsonb NOT NULL,
  asset_key varchar(128) REFERENCES geo_3d_assets(asset_key) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  outcome varchar(32) NOT NULL DEFAULT 'issued',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_delivery_audit_fingerprint_shape CHECK (capability_fingerprint_sha256 ~ '^[A-Fa-f0-9]{64}$'),
  CONSTRAINT geo_delivery_audit_expiry_after_issue CHECK (expires_at > issued_at),
  CONSTRAINT geo_delivery_audit_parcel_ids_array CHECK (jsonb_typeof(parcel_ids) = 'array'),
  CONSTRAINT geo_delivery_audit_outcome_valid CHECK (outcome IN ('issued', 'used', 'denied', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS geo_3d_assets_parcel_active_idx
  ON geo_3d_assets (parcel_id, active, created_at DESC);
CREATE INDEX IF NOT EXISTS geo_delivery_access_audit_user_created_idx
  ON geo_delivery_access_audit (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS geo_delivery_access_audit_capability_idx
  ON geo_delivery_access_audit (capability_id, created_at DESC);
CREATE INDEX IF NOT EXISTS geo_delivery_access_audit_asset_idx
  ON geo_delivery_access_audit (asset_key, created_at DESC);

COMMENT ON TABLE geo_3d_assets IS 'Immutable, provenance-bearing metadata for locally hosted 3D Tiles and terrain assets. Paths are relative to the configured service asset root.';
COMMENT ON TABLE geo_delivery_access_audit IS 'Non-secret audit trail for short-lived cross-language map, 3D asset, analysis, and mobile evidence capabilities.';
