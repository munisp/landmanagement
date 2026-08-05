ALTER TYPE "commercial_member_role" ADD VALUE IF NOT EXISTS 'field_manager';--> statement-breakpoint
ALTER TYPE "commercial_member_role" ADD VALUE IF NOT EXISTS 'field_inspector';--> statement-breakpoint
ALTER TYPE "commercial_member_role" ADD VALUE IF NOT EXISTS 'field_reviewer';--> statement-breakpoint

CREATE TYPE "field_assignment_status" AS ENUM ('assigned', 'in_progress', 'submitted', 'under_review', 'accepted', 'returned', 'cancelled');--> statement-breakpoint
CREATE TYPE "field_evidence_status" AS ENUM ('pending', 'accepted', 'rejected');--> statement-breakpoint

CREATE TABLE "field_survey_assignments" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "assignment_key" varchar(96) NOT NULL UNIQUE,
  "account_id" bigint NOT NULL REFERENCES "commercial_accounts"("id") ON DELETE RESTRICT,
  "parcel_id" integer NOT NULL REFERENCES "parcels"("id") ON DELETE RESTRICT,
  "assigned_to" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "assigned_by" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" "field_assignment_status" NOT NULL DEFAULT 'assigned',
  "instructions" text NOT NULL,
  "scheduled_for" timestamptz,
  "due_at" timestamptz,
  "reviewed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "review_notes" text,
  "assigned_at" timestamptz NOT NULL DEFAULT now(),
  "submitted_at" timestamptz,
  "reviewed_at" timestamptz,
  "closed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "field_assignments_instructions_nonblank" CHECK (length(trim("instructions")) > 0),
  CONSTRAINT "field_assignments_due_after_scheduled" CHECK ("due_at" IS NULL OR "scheduled_for" IS NULL OR "due_at" >= "scheduled_for")
);--> statement-breakpoint

CREATE TABLE "field_survey_evidence" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "evidence_key" varchar(96) NOT NULL UNIQUE,
  "assignment_id" bigint NOT NULL REFERENCES "field_survey_assignments"("id") ON DELETE CASCADE,
  "evidence_type" varchar(64) NOT NULL,
  "source_reference" varchar(160) NOT NULL,
  "source_checksum_sha256" varchar(64),
  "captured_at" timestamptz NOT NULL,
  "latitude" numeric(9,6),
  "longitude" numeric(9,6),
  "geometry" jsonb,
  "quality_flags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" "field_evidence_status" NOT NULL DEFAULT 'pending',
  "review_notes" text,
  "submitted_by" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reviewed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "field_evidence_type_nonblank" CHECK (length(trim("evidence_type")) > 0),
  CONSTRAINT "field_evidence_reference_nonblank" CHECK (length(trim("source_reference")) > 0),
  CONSTRAINT "field_evidence_latitude_range" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  CONSTRAINT "field_evidence_longitude_range" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
  CONSTRAINT "field_evidence_coordinate_pair" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL))
);--> statement-breakpoint

CREATE TABLE "field_survey_events" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "assignment_id" bigint NOT NULL REFERENCES "field_survey_assignments"("id") ON DELETE CASCADE,
  "event_type" varchar(64) NOT NULL,
  "previous_status" "field_assignment_status",
  "next_status" "field_assignment_status",
  "actor_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "description" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "field_survey_events_type_nonblank" CHECK (length(trim("event_type")) > 0)
);--> statement-breakpoint

CREATE INDEX "field_assignments_account_status_updated_idx" ON "field_survey_assignments"("account_id", "status", "updated_at" DESC);--> statement-breakpoint
CREATE INDEX "field_assignments_assignee_status_idx" ON "field_survey_assignments"("assigned_to", "status", "due_at");--> statement-breakpoint
CREATE INDEX "field_evidence_assignment_status_idx" ON "field_survey_evidence"("assignment_id", "status");--> statement-breakpoint
CREATE INDEX "field_events_assignment_created_idx" ON "field_survey_events"("assignment_id", "created_at" ASC);--> statement-breakpoint
