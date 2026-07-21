
DO $sector_schema$
BEGIN
  -- Sector enums
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sector_type') THEN
    CREATE TYPE sector_type AS ENUM ('land','mining','oil_gas','water','forestry','agriculture','fisheries','renewable_energy');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mining_license_type') THEN
    CREATE TYPE mining_license_type AS ENUM ('exploration_license','mining_lease','quarrying_lease','small_scale_mining','mineral_buying_center','water_use_permit');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'petroleum_license_type') THEN
    CREATE TYPE petroleum_license_type AS ENUM ('OPL','OML','marginal_field','gas_flare_permit','pipeline_license');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'license_status') THEN
    CREATE TYPE license_status AS ENUM ('application','under_review','approved','active','suspended','revoked','expired','renewal_pending');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'terrain_type') THEN
    CREATE TYPE terrain_type AS ENUM ('onshore','shallow_water','deep_water','ultra_deep_water');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'water_source_type') THEN
    CREATE TYPE water_source_type AS ENUM ('river','lake','groundwater_borehole','reservoir','spring','coastal');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'concession_status') THEN
    CREATE TYPE concession_status AS ENUM ('application','under_review','granted','active','suspended','revoked','expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eia_category') THEN
    CREATE TYPE eia_category AS ENUM ('A','B1','B2','C');
  END IF;

  -- Mining licenses
  CREATE TABLE IF NOT EXISTS "mining_licenses" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "license_number" varchar(64) UNIQUE NOT NULL,
    "type" mining_license_type NOT NULL,
    "status" license_status NOT NULL DEFAULT 'application',
    "operator_id" integer NOT NULL REFERENCES "users"("id"),
    "state_code" varchar(3) NOT NULL,
    "lga_code" varchar(10),
    "tenant_code" varchar(20) NOT NULL DEFAULT 'FED',
    "minerals_approved" text[],
    "area_hectares" numeric(12,4),
    "geometry_geojson" text,
    "issue_date" timestamp,
    "expiry_date" timestamp,
    "renewal_count" integer NOT NULL DEFAULT 0,
    "annual_fee_ngn" bigint NOT NULL DEFAULT 0,
    "royalty_rate_percent" numeric(5,2) NOT NULL DEFAULT 5.00,
    "eia_reference" varchar(64),
    "approved_by" integer REFERENCES "users"("id"),
    "notes" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
  );

  -- Mineral production
  CREATE TABLE IF NOT EXISTS "mineral_production" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "license_id" integer NOT NULL REFERENCES "mining_licenses"("id"),
    "mineral_type" varchar(64) NOT NULL,
    "volume_extracted" numeric(18,4) NOT NULL,
    "unit" varchar(16) NOT NULL DEFAULT 'tonnes',
    "production_date" timestamp NOT NULL,
    "reported_by" integer NOT NULL REFERENCES "users"("id"),
    "verified_by" integer REFERENCES "users"("id"),
    "royalty_amount_ngn" bigint NOT NULL DEFAULT 0,
    "royalty_paid" boolean NOT NULL DEFAULT false,
    "tigerbeetle_transfer_id" varchar(128),
    "created_at" timestamp NOT NULL DEFAULT now()
  );

  -- Oil/gas blocks
  CREATE TABLE IF NOT EXISTS "oil_gas_blocks" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "block_name" varchar(32) UNIQUE NOT NULL,
    "basin" varchar(64) NOT NULL,
    "terrain" terrain_type NOT NULL,
    "status" license_status NOT NULL DEFAULT 'application',
    "operator_id" integer REFERENCES "users"("id"),
    "area_km2" numeric(12,4),
    "geometry_geojson" text,
    "estimated_reserves_barrels" bigint,
    "discovery_year" integer,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
  );

  -- Petroleum licenses
  CREATE TABLE IF NOT EXISTS "petroleum_licenses" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "license_number" varchar(32) UNIQUE NOT NULL,
    "type" petroleum_license_type NOT NULL,
    "block_id" integer NOT NULL REFERENCES "oil_gas_blocks"("id"),
    "operator_id" integer NOT NULL REFERENCES "users"("id"),
    "status" license_status NOT NULL DEFAULT 'application',
    "issue_date" timestamp,
    "expiry_date" timestamp,
    "farm_out_percentage" numeric(5,2),
    "royalty_rate_percent" numeric(5,2) NOT NULL DEFAULT 12.50,
    "annual_rental_usd" bigint NOT NULL DEFAULT 0,
    "eia_reference" varchar(64),
    "approved_by" integer REFERENCES "users"("id"),
    "notes" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
  );

  -- Oil production metering
  CREATE TABLE IF NOT EXISTS "oil_production_metering" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "license_id" integer NOT NULL REFERENCES "petroleum_licenses"("id"),
    "well_id" varchar(32) NOT NULL,
    "barrels_produced" numeric(18,4) NOT NULL,
    "gas_flared_mcf" numeric(18,4) NOT NULL DEFAULT 0,
    "water_cut_percent" numeric(5,2),
    "timestamp" timestamp NOT NULL,
    "meter_hash" varchar(128),
    "reported_by" integer REFERENCES "users"("id"),
    "royalty_amount_usd" bigint NOT NULL DEFAULT 0,
    "royalty_paid" boolean NOT NULL DEFAULT false,
    "tigerbeetle_transfer_id" varchar(128),
    "created_at" timestamp NOT NULL DEFAULT now()
  );

  -- Water rights
  CREATE TABLE IF NOT EXISTS "water_rights" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "license_number" varchar(64) UNIQUE NOT NULL,
    "source_type" water_source_type NOT NULL,
    "basin" varchar(64),
    "state_code" varchar(3) NOT NULL,
    "operator_id" integer NOT NULL REFERENCES "users"("id"),
    "status" license_status NOT NULL DEFAULT 'application',
    "max_daily_volume_m3" numeric(12,2) NOT NULL,
    "purpose_of_use" varchar(128) NOT NULL,
    "issue_date" timestamp,
    "expiry_date" timestamp,
    "annual_fee_ngn" bigint NOT NULL DEFAULT 0,
    "geometry_geojson" text,
    "eia_reference" varchar(64),
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
  );

  -- Agricultural concessions
  CREATE TABLE IF NOT EXISTS "agricultural_concessions" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "concession_number" varchar(64) UNIQUE NOT NULL,
    "operator_id" integer NOT NULL REFERENCES "users"("id"),
    "state_code" varchar(3) NOT NULL,
    "lga_code" varchar(10),
    "status" concession_status NOT NULL DEFAULT 'application',
    "crop_types" text[],
    "hectares" numeric(12,4) NOT NULL,
    "geometry_geojson" text,
    "issue_date" timestamp,
    "expiry_date" timestamp,
    "annual_rent_ngn" bigint NOT NULL DEFAULT 0,
    "employment_target" integer,
    "eia_reference" varchar(64),
    "notes" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
  );

  -- Forestry concessions
  CREATE TABLE IF NOT EXISTS "forestry_concessions" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "concession_number" varchar(64) UNIQUE NOT NULL,
    "operator_id" integer NOT NULL REFERENCES "users"("id"),
    "state_code" varchar(3) NOT NULL,
    "status" concession_status NOT NULL DEFAULT 'application',
    "allowable_cut_volume_cubic_m" numeric(12,2),
    "hectares" numeric(12,4) NOT NULL,
    "geometry_geojson" text,
    "issue_date" timestamp,
    "expiry_date" timestamp,
    "reforestation_obligation_met" boolean NOT NULL DEFAULT false,
    "annual_rent_ngn" bigint NOT NULL DEFAULT 0,
    "eia_reference" varchar(64),
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
  );

  -- Environmental compliance
  CREATE TABLE IF NOT EXISTS "environmental_compliance" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "sector_type" sector_type NOT NULL,
    "entity_id" integer NOT NULL,
    "operator_id" integer NOT NULL REFERENCES "users"("id"),
    "eia_category" eia_category NOT NULL,
    "eia_status" varchar(32) NOT NULL DEFAULT 'pending',
    "eia_approved_date" timestamp,
    "eia_expiry_date" timestamp,
    "last_audit_date" timestamp,
    "next_audit_due" timestamp,
    "risk_score" integer NOT NULL DEFAULT 0,
    "violations_count" integer NOT NULL DEFAULT 0,
    "penalties_ngn" bigint NOT NULL DEFAULT 0,
    "remediation_status" varchar(32) NOT NULL DEFAULT 'none',
    "notes" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
  );

  -- Stakeholder onboarding
  CREATE TABLE IF NOT EXISTS "stakeholder_onboarding" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "user_id" integer NOT NULL REFERENCES "users"("id"),
    "sector" sector_type NOT NULL,
    "role" varchar(64) NOT NULL,
    "onboarding_status" varchar(32) NOT NULL DEFAULT 'pending',
    "keycloak_user_id" varchar(128),
    "keycloak_roles_assigned" text[],
    "permify_policies_applied" boolean NOT NULL DEFAULT false,
    "nin_verified" boolean NOT NULL DEFAULT false,
    "bvn_verified" boolean NOT NULL DEFAULT false,
    "documents_submitted" boolean NOT NULL DEFAULT false,
    "documents_verified" boolean NOT NULL DEFAULT false,
    "training_completed" boolean NOT NULL DEFAULT false,
    "activated_at" timestamp,
    "invited_by" integer REFERENCES "users"("id"),
    "invite_token" varchar(128) UNIQUE,
    "invite_expires_at" timestamp,
    "notes" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
  );

  -- C of O Applications
  CREATE TABLE IF NOT EXISTS "cof_o_applications" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "application_number" varchar(64) UNIQUE NOT NULL,
    "parcel_id" integer NOT NULL REFERENCES "parcels"("id"),
    "applicant_id" integer NOT NULL REFERENCES "users"("id"),
    "sector" sector_type NOT NULL DEFAULT 'land',
    "status" varchar(32) NOT NULL DEFAULT 'submitted',
    "current_stage" varchar(64) NOT NULL DEFAULT 'submission',
    "submitted_at" timestamp NOT NULL DEFAULT now(),
    "nin_verified_at" timestamp,
    "documents_verified_at" timestamp,
    "survey_verified_at" timestamp,
    "site_inspected_at" timestamp,
    "legal_reviewed_at" timestamp,
    "governor_consent_at" timestamp,
    "gazette_published_at" timestamp,
    "issued_at" timestamp,
    "rejected_at" timestamp,
    "rejection_reason" text,
    "assigned_surveyor_id" integer REFERENCES "users"("id"),
    "assigned_registrar_id" integer REFERENCES "users"("id"),
    "legal_officer_id" integer REFERENCES "users"("id"),
    "temporal_workflow_id" varchar(256),
    "gazette_notice_number" varchar(64),
    "certificate_number" varchar(64) UNIQUE,
    "processing_fee_ngn" bigint NOT NULL DEFAULT 0,
    "fees_paid" boolean NOT NULL DEFAULT false,
    "tigerbeetle_transfer_id" varchar(128),
    "notes" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
  );

  -- C of O Stage Audit Log
  CREATE TABLE IF NOT EXISTS "cof_o_stage_log" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "application_id" integer NOT NULL REFERENCES "cof_o_applications"("id"),
    "from_stage" varchar(64),
    "to_stage" varchar(64) NOT NULL,
    "action" varchar(64) NOT NULL,
    "performed_by" integer NOT NULL REFERENCES "users"("id"),
    "notes" text,
    "attachment_url" varchar(512),
    "created_at" timestamp NOT NULL DEFAULT now()
  );

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Sector schema migration skipped: %', SQLERRM;
END;
$sector_schema$;
