ALTER TYPE "commercial_member_role" ADD VALUE IF NOT EXISTS 'row_manager';--> statement-breakpoint
ALTER TYPE "commercial_member_role" ADD VALUE IF NOT EXISTS 'row_officer';--> statement-breakpoint
ALTER TYPE "commercial_member_role" ADD VALUE IF NOT EXISTS 'row_reviewer';--> statement-breakpoint
CREATE TYPE "row_agreement_status" AS ENUM ('draft', 'proposed', 'under_review', 'executed', 'expired', 'terminated');--> statement-breakpoint
CREATE TYPE "row_finding_status" AS ENUM ('identified', 'verified', 'resolved', 'dismissed');--> statement-breakpoint

CREATE TABLE "row_corridors" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "account_id" bigint NOT NULL REFERENCES "commercial_accounts"("id") ON DELETE CASCADE,
  "corridor_key" varchar(96) NOT NULL UNIQUE,
  "name" varchar(200) NOT NULL,
  "purpose" varchar(96) NOT NULL,
  "geometry_geojson" jsonb NOT NULL,
  "created_by" integer NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "row_corridors_geometry_type" CHECK ("geometry_geojson" ? 'type'),
  CONSTRAINT "row_corridors_name_nonblank" CHECK (length(trim("name")) > 0)
);--> statement-breakpoint
CREATE TABLE "row_parcel_findings" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "finding_key" varchar(96) NOT NULL UNIQUE,
  "account_id" bigint NOT NULL REFERENCES "commercial_accounts"("id") ON DELETE CASCADE,
  "corridor_id" bigint NOT NULL REFERENCES "row_corridors"("id") ON DELETE CASCADE,
  "parcel_id" integer NOT NULL REFERENCES "parcels"("id") ON DELETE RESTRICT,
  "status" "row_finding_status" NOT NULL DEFAULT 'identified',
  "overlap_method" varchar(64) NOT NULL,
  "overlap_summary" text NOT NULL,
  "source_reference" varchar(160) NOT NULL,
  "reviewed_by" integer REFERENCES "users"("id"),
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("corridor_id", "parcel_id"),
  CONSTRAINT "row_findings_summary_nonblank" CHECK (length(trim("overlap_summary")) > 0)
);--> statement-breakpoint
CREATE TABLE "row_access_agreements" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "agreement_key" varchar(96) NOT NULL UNIQUE,
  "account_id" bigint NOT NULL REFERENCES "commercial_accounts"("id") ON DELETE CASCADE,
  "finding_id" bigint NOT NULL REFERENCES "row_parcel_findings"("id") ON DELETE RESTRICT,
  "status" "row_agreement_status" NOT NULL DEFAULT 'draft',
  "agreement_reference" varchar(160) NOT NULL,
  "effective_on" date,
  "expires_on" date,
  "terms_reference" varchar(160) NOT NULL,
  "created_by" integer NOT NULL REFERENCES "users"("id"),
  "approved_by" integer REFERENCES "users"("id"),
  "approved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "row_agreements_reference_nonblank" CHECK (length(trim("agreement_reference")) > 0),
  CONSTRAINT "row_agreements_dates_valid" CHECK ("expires_on" IS NULL OR "effective_on" IS NULL OR "expires_on" >= "effective_on")
);--> statement-breakpoint
CREATE TABLE "row_field_confirmations" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "confirmation_key" varchar(96) NOT NULL UNIQUE,
  "account_id" bigint NOT NULL REFERENCES "commercial_accounts"("id") ON DELETE CASCADE,
  "finding_id" bigint NOT NULL REFERENCES "row_parcel_findings"("id") ON DELETE RESTRICT,
  "latitude" double precision NOT NULL,
  "longitude" double precision NOT NULL,
  "observed_at" timestamptz NOT NULL,
  "evidence_reference" varchar(160) NOT NULL,
  "note" text NOT NULL,
  "captured_by" integer NOT NULL REFERENCES "users"("id"),
  "reviewed_by" integer REFERENCES "users"("id"),
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "row_field_confirmations_latitude" CHECK ("latitude" BETWEEN -90 AND 90),
  CONSTRAINT "row_field_confirmations_longitude" CHECK ("longitude" BETWEEN -180 AND 180)
);--> statement-breakpoint
CREATE TABLE "row_events" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "account_id" bigint NOT NULL REFERENCES "commercial_accounts"("id") ON DELETE CASCADE,
  "entity_type" varchar(64) NOT NULL,
  "entity_key" varchar(96) NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "actor_id" integer NOT NULL REFERENCES "users"("id"),
  "description" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "row_corridors_account_idx" ON "row_corridors"("account_id");--> statement-breakpoint
CREATE INDEX "row_findings_account_status_idx" ON "row_parcel_findings"("account_id", "status");--> statement-breakpoint
CREATE INDEX "row_agreements_account_status_expiry_idx" ON "row_access_agreements"("account_id", "status", "expires_on");--> statement-breakpoint
CREATE INDEX "row_field_confirmations_finding_idx" ON "row_field_confirmations"("finding_id", "observed_at");--> statement-breakpoint
CREATE INDEX "row_events_account_entity_idx" ON "row_events"("account_id", "entity_key", "created_at");--> statement-breakpoint
INSERT INTO "commercial_products" ("product_key", "name", "description", "monthly_price_minor", "currency", "included_seats", "included_units") VALUES ('right-of-way-manager', 'Right-of-Way and Land Access Manager', 'Institution-scoped corridor, agreement, field verification, and renewal workflows.', 300000, 'USD', 20, '{"monthly_row_findings":2000,"active_corridors":200}'::jsonb) ON CONFLICT ("product_key") DO NOTHING;
