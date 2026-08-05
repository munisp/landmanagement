ALTER TYPE "commercial_member_role" ADD VALUE IF NOT EXISTS 'registry_admin';--> statement-breakpoint
ALTER TYPE "commercial_member_role" ADD VALUE IF NOT EXISTS 'registry_supervisor';--> statement-breakpoint
ALTER TYPE "commercial_member_role" ADD VALUE IF NOT EXISTS 'registry_officer';--> statement-breakpoint

CREATE TYPE "registry_operation_case_status" AS ENUM ('submitted', 'triaged', 'in_review', 'returned', 'completed', 'withdrawn');--> statement-breakpoint

CREATE TABLE "registry_operation_queues" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "account_id" bigint NOT NULL REFERENCES "commercial_accounts"("id") ON DELETE CASCADE,
  "queue_key" varchar(96) NOT NULL UNIQUE,
  "name" varchar(160) NOT NULL,
  "service_type" varchar(64) NOT NULL,
  "sla_hours" integer NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_by" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "registry_operation_queues_sla_positive" CHECK ("sla_hours" > 0 AND "sla_hours" <= 8760),
  CONSTRAINT "registry_operation_queues_service_type_nonblank" CHECK (length(trim("service_type")) > 0),
  UNIQUE("account_id", "service_type")
);--> statement-breakpoint

CREATE TABLE "registry_operation_cases" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "case_key" varchar(96) NOT NULL UNIQUE,
  "account_id" bigint NOT NULL REFERENCES "commercial_accounts"("id") ON DELETE RESTRICT,
  "queue_id" bigint NOT NULL REFERENCES "registry_operation_queues"("id") ON DELETE RESTRICT,
  "parcel_id" integer REFERENCES "parcels"("id") ON DELETE SET NULL,
  "request_reference" varchar(160) NOT NULL,
  "requester_name" varchar(255),
  "requester_contact_reference" varchar(160),
  "status" "registry_operation_case_status" NOT NULL DEFAULT 'submitted',
  "assigned_to" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  "due_at" timestamptz NOT NULL,
  "completed_at" timestamptz,
  "outcome_note" text,
  "source_reference" varchar(160),
  "created_by" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "registry_operation_cases_reference_nonblank" CHECK (length(trim("request_reference")) > 0),
  CONSTRAINT "registry_operation_cases_due_valid" CHECK ("due_at" >= "submitted_at")
);--> statement-breakpoint

CREATE TABLE "registry_operation_events" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "case_id" bigint NOT NULL REFERENCES "registry_operation_cases"("id") ON DELETE CASCADE,
  "event_type" varchar(64) NOT NULL,
  "previous_status" "registry_operation_case_status",
  "next_status" "registry_operation_case_status",
  "actor_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "description" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "registry_operation_events_type_nonblank" CHECK (length(trim("event_type")) > 0)
);--> statement-breakpoint

CREATE INDEX "registry_operation_queues_account_enabled_idx" ON "registry_operation_queues"("account_id", "enabled");--> statement-breakpoint
CREATE INDEX "registry_operation_cases_account_status_due_idx" ON "registry_operation_cases"("account_id", "status", "due_at");--> statement-breakpoint
CREATE INDEX "registry_operation_cases_queue_assignee_idx" ON "registry_operation_cases"("queue_id", "assigned_to", "status");--> statement-breakpoint
CREATE INDEX "registry_operation_events_case_created_idx" ON "registry_operation_events"("case_id", "created_at");--> statement-breakpoint

INSERT INTO "commercial_products" ("product_key", "name", "description", "monthly_price_minor", "currency", "included_seats", "included_units")
VALUES ('registry-operations-cloud', 'Registry Operations Cloud', 'Institution-scoped public-service queues, accountable request handling, configurable service levels, and audit-ready operations.', 500000, 'USD', 25, '{"monthly_operation_cases":5000,"active_registry_queues":50}'::jsonb)
ON CONFLICT ("product_key") DO NOTHING;
