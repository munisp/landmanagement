-- Platform integrity and integration hardening.
--
-- This migration is intentionally forward-only. It reconciles runtime models with
-- previously-created legal tables, replaces JSON-backed account state with durable
-- PostgreSQL records, and adds the indexes/constraints used by authorization,
-- session revocation, event delivery, and lakehouse ingestion paths.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "phone" varchar(32);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_unique_idx"
  ON "users" (lower("email"))
  WHERE "email" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_security_settings" (
  "user_id" integer PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "two_factor_state" varchar(32) NOT NULL DEFAULT 'disabled',
  "password_updated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_security_settings_two_factor_state_check"
    CHECK ("two_factor_state" IN ('disabled', 'setup_required', 'enabled'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_sessions_user_active_idx"
  ON "user_sessions" ("user_id", "revoked_at", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_sessions_expiry_idx"
  ON "user_sessions" ("expires_at");
--> statement-breakpoint

-- Legal-framework tables were introduced in migration 0024 but were not exposed
-- through Drizzle. Add the relationship constraints and query indexes that make
-- their application-level models safe to use.
DO $legal_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_signatures_signed_by_users_fk') THEN
    ALTER TABLE "document_signatures"
      ADD CONSTRAINT "document_signatures_signed_by_users_fk"
      FOREIGN KEY ("signed_by") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_signatures_parcel_id_parcels_parcel_id_fk') THEN
    ALTER TABLE "document_signatures"
      ADD CONSTRAINT "document_signatures_parcel_id_parcels_parcel_id_fk"
      FOREIGN KEY ("parcel_id") REFERENCES "parcels"("parcel_id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gazette_notices_submitted_by_users_fk') THEN
    ALTER TABLE "gazette_notices"
      ADD CONSTRAINT "gazette_notices_submitted_by_users_fk"
      FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gazette_parcel_links_gazette_id_gazette_notices_fk') THEN
    ALTER TABLE "gazette_parcel_links"
      ADD CONSTRAINT "gazette_parcel_links_gazette_id_gazette_notices_fk"
      FOREIGN KEY ("gazette_id") REFERENCES "gazette_notices"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gazette_parcel_links_parcel_id_parcels_parcel_id_fk') THEN
    ALTER TABLE "gazette_parcel_links"
      ADD CONSTRAINT "gazette_parcel_links_parcel_id_parcels_parcel_id_fk"
      FOREIGN KEY ("parcel_id") REFERENCES "parcels"("parcel_id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'identity_verifications_user_id_users_fk') THEN
    ALTER TABLE "identity_verifications"
      ADD CONSTRAINT "identity_verifications_user_id_users_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END;
$legal_constraints$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "gazette_parcel_links_unique_idx"
  ON "gazette_parcel_links" ("gazette_id", "parcel_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "identity_verifications_nin_unique_idx"
  ON "identity_verifications" ("nin")
  WHERE "nin" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identity_verifications_status_expiry_idx"
  ON "identity_verifications" ("verification_status", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_signatures_signed_at_idx"
  ON "document_signatures" ("signed_at");
--> statement-breakpoint

-- The event dispatcher selects ready events by both status and availability.
CREATE INDEX IF NOT EXISTS "event_outbox_ready_dispatch_idx"
  ON "event_outbox" ("delivery_status", "available_at", "id");
--> statement-breakpoint

-- Lakehouse writes must be traceable to a concrete source and lifecycle state.
ALTER TABLE "lakehouse_sync_jobs"
  ADD COLUMN IF NOT EXISTS "source_event_id" integer REFERENCES "event_outbox"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "contract_version" varchar(64);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lakehouse_sync_jobs_source_event_idx"
  ON "lakehouse_sync_jobs" ("source_event_id")
  WHERE "source_event_id" IS NOT NULL;
--> statement-breakpoint

-- Store the published Permify model version to prevent relationship writes from
-- silently targeting an unknown authorization schema revision.
CREATE TABLE IF NOT EXISTS "authorization_schema_versions" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "tenant_id" varchar(64) NOT NULL,
  "schema_version" varchar(128) NOT NULL,
  "schema_hash" varchar(128) NOT NULL,
  "published_at" timestamptz NOT NULL DEFAULT now(),
  "published_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "authorization_schema_versions_tenant_version_unique"
    UNIQUE ("tenant_id", "schema_version")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "authorization_schema_versions_tenant_published_idx"
  ON "authorization_schema_versions" ("tenant_id", "published_at" DESC);

--> statement-breakpoint

-- Blockchain workflows require an explicit verified wallet address; never infer one
-- from a numeric application user id.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "wallet_address" varchar(42);
--> statement-breakpoint
ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_wallet_address_format_check";
--> statement-breakpoint
ALTER TABLE "users"
  ADD CONSTRAINT "users_wallet_address_format_check"
  CHECK ("wallet_address" IS NULL OR "wallet_address" ~* '^0x[0-9a-f]{40}$');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_wallet_address_unique_idx"
  ON "users" (lower("wallet_address"))
  WHERE "wallet_address" IS NOT NULL;

--> statement-breakpoint

ALTER TABLE "mojaloop_transactions"
  ADD COLUMN IF NOT EXISTS "reversal_of_transaction_id" varchar(128)
  REFERENCES "mojaloop_transactions"("transaction_id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mojaloop_transactions_reversal_of_unique_idx"
  ON "mojaloop_transactions" ("reversal_of_transaction_id")
  WHERE "reversal_of_transaction_id" IS NOT NULL;

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ml_training_examples" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "model_name" varchar(128) NOT NULL,
  "feature_vector" jsonb NOT NULL,
  "label" boolean NOT NULL,
  "source_reference" varchar(255) NOT NULL,
  "source_event_id" integer REFERENCES "event_outbox"("id") ON DELETE SET NULL,
  "verified_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ml_training_examples_source_unique" UNIQUE ("model_name", "source_reference")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ml_training_examples_model_created_idx"
  ON "ml_training_examples" ("model_name", "created_at" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ml_model_runs" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "model_name" varchar(128) NOT NULL,
  "model_version" varchar(128) NOT NULL,
  "artifact_uri" text NOT NULL,
  "feature_schema" jsonb NOT NULL,
  "metrics" jsonb NOT NULL,
  "training_rows" integer NOT NULL,
  "positive_rows" integer NOT NULL,
  "trained_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "trained_at" timestamptz NOT NULL DEFAULT now(),
  "is_active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "ml_model_runs_name_version_unique" UNIQUE ("model_name", "model_version")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ml_model_runs_active_model_unique_idx"
  ON "ml_model_runs" ("model_name") WHERE "is_active";
