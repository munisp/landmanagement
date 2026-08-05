CREATE TYPE "sedona_spatial_operation" AS ENUM (
  'geoparquet_export',
  'topology_validation',
  'spatial_workbench',
  'zonal_statistics',
  'viewshed'
);--> statement-breakpoint

CREATE TYPE "sedona_spatial_job_status" AS ENUM (
  'queued',
  'claimed',
  'running',
  'cancel_requested',
  'succeeded',
  'failed',
  'cancelled'
);--> statement-breakpoint

CREATE TABLE "sedona_spatial_jobs" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "job_key" varchar(128) NOT NULL UNIQUE,
  "request_fingerprint_sha256" varchar(64) NOT NULL,
  "operation" "sedona_spatial_operation" NOT NULL,
  "status" "sedona_spatial_job_status" NOT NULL DEFAULT 'queued',
  "requested_by" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "analysis_run_id" bigint REFERENCES "geo_analysis_runs"("id") ON DELETE SET NULL,
  "parcel_id" integer REFERENCES "parcels"("id") ON DELETE SET NULL,
  "input_manifest" jsonb NOT NULL,
  "input_checksum_sha256" varchar(64) NOT NULL,
  "result_summary" jsonb,
  "output_uri" text,
  "output_checksum_sha256" varchar(64),
  "spark_application_id" varchar(255),
  "worker_id" varchar(128),
  "attempt" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "cancel_requested_at" timestamptz,
  "cancel_requested_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "heartbeat_at" timestamptz,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "failure_code" varchar(96),
  "failure_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sedona_spatial_jobs_attempt_range" CHECK ("attempt" >= 0 AND "attempt" <= "max_attempts"),
  CONSTRAINT "sedona_spatial_jobs_max_attempts_range" CHECK ("max_attempts" BETWEEN 1 AND 10),
  CONSTRAINT "sedona_spatial_jobs_terminal_output" CHECK (
    "status" NOT IN ('succeeded', 'failed', 'cancelled') OR "completed_at" IS NOT NULL
  )
);--> statement-breakpoint

CREATE TABLE "sedona_spatial_job_events" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "job_id" bigint NOT NULL REFERENCES "sedona_spatial_jobs"("id") ON DELETE CASCADE,
  "event_type" varchar(96) NOT NULL,
  "status" "sedona_spatial_job_status" NOT NULL,
  "attempt" integer NOT NULL,
  "actor_type" varchar(32) NOT NULL,
  "actor_id" varchar(128),
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX "sedona_spatial_jobs_status_created_idx"
  ON "sedona_spatial_jobs" ("status", "created_at");--> statement-breakpoint
CREATE INDEX "sedona_spatial_jobs_parcel_created_idx"
  ON "sedona_spatial_jobs" ("parcel_id", "created_at");--> statement-breakpoint
CREATE INDEX "sedona_spatial_jobs_run_idx"
  ON "sedona_spatial_jobs" ("analysis_run_id", "created_at");--> statement-breakpoint
CREATE INDEX "sedona_spatial_jobs_heartbeat_idx"
  ON "sedona_spatial_jobs" ("status", "heartbeat_at");--> statement-breakpoint
CREATE INDEX "sedona_spatial_job_events_job_created_idx"
  ON "sedona_spatial_job_events" ("job_id", "created_at");
