ALTER TYPE "commercial_member_role" ADD VALUE IF NOT EXISTS 'matter_manager';--> statement-breakpoint
ALTER TYPE "commercial_member_role" ADD VALUE IF NOT EXISTS 'legal_reviewer';--> statement-breakpoint

CREATE TYPE "conveyancing_matter_status" AS ENUM ('opened', 'evidence_requested', 'title_review', 'legal_drafting', 'signatures_pending', 'closing_ready', 'completed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "conveyancing_evidence_status" AS ENUM ('pending', 'accepted', 'rejected');--> statement-breakpoint

CREATE TABLE "conveyancing_matters" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "matter_key" varchar(96) NOT NULL UNIQUE,
  "account_id" bigint NOT NULL REFERENCES "commercial_accounts"("id") ON DELETE RESTRICT,
  "transaction_reference" varchar(96),
  "parcel_id" integer NOT NULL REFERENCES "parcels"("id") ON DELETE RESTRICT,
  "client_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "status" "conveyancing_matter_status" NOT NULL DEFAULT 'opened',
  "assigned_reviewer_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "title_review_notes" text,
  "closing_notes" text,
  "opened_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  "created_by" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "conveyancing_matters_transaction_reference_nonblank" CHECK ("transaction_reference" IS NULL OR length(trim("transaction_reference")) > 0)
);--> statement-breakpoint

CREATE TABLE "conveyancing_matter_evidence" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "evidence_key" varchar(96) NOT NULL UNIQUE,
  "matter_id" bigint NOT NULL REFERENCES "conveyancing_matters"("id") ON DELETE CASCADE,
  "evidence_type" varchar(64) NOT NULL,
  "source_reference" varchar(160) NOT NULL,
  "source_checksum_sha256" varchar(64),
  "status" "conveyancing_evidence_status" NOT NULL DEFAULT 'pending',
  "review_notes" text,
  "submitted_by" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reviewed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  "reviewed_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "conveyancing_evidence_type_nonblank" CHECK (length(trim("evidence_type")) > 0),
  CONSTRAINT "conveyancing_evidence_reference_nonblank" CHECK (length(trim("source_reference")) > 0)
);--> statement-breakpoint

CREATE TABLE "conveyancing_matter_events" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "matter_id" bigint NOT NULL REFERENCES "conveyancing_matters"("id") ON DELETE CASCADE,
  "event_type" varchar(64) NOT NULL,
  "previous_status" "conveyancing_matter_status",
  "next_status" "conveyancing_matter_status",
  "actor_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "description" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "conveyancing_matter_events_type_nonblank" CHECK (length(trim("event_type")) > 0)
);--> statement-breakpoint

CREATE INDEX "conveyancing_matters_account_status_updated_idx" ON "conveyancing_matters"("account_id", "status", "updated_at" DESC);--> statement-breakpoint
CREATE INDEX "conveyancing_matters_parcel_idx" ON "conveyancing_matters"("parcel_id", "status");--> statement-breakpoint
CREATE INDEX "conveyancing_matter_evidence_matter_status_idx" ON "conveyancing_matter_evidence"("matter_id", "status");--> statement-breakpoint
CREATE INDEX "conveyancing_matter_events_matter_created_idx" ON "conveyancing_matter_events"("matter_id", "created_at" ASC);--> statement-breakpoint
