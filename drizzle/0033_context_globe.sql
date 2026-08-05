CREATE TYPE "context_layer_kind" AS ENUM ('seismic', 'weather_alert');--> statement-breakpoint
CREATE TYPE "context_event_status" AS ENUM ('active', 'expired', 'superseded', 'rejected');--> statement-breakpoint
CREATE TYPE "context_quality_state" AS ENUM ('verified', 'degraded', 'rejected');--> statement-breakpoint

CREATE TABLE "context_layers" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "layer_key" varchar(64) NOT NULL UNIQUE,
  "kind" "context_layer_kind" NOT NULL UNIQUE,
  "display_name" varchar(128) NOT NULL,
  "description" text NOT NULL,
  "source_name" varchar(128) NOT NULL,
  "source_endpoint" text NOT NULL,
  "attribution" text NOT NULL,
  "refresh_seconds" integer NOT NULL,
  "default_enabled" boolean NOT NULL DEFAULT true,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "context_layers_refresh_range" CHECK ("refresh_seconds" BETWEEN 30 AND 3600),
  CONSTRAINT "context_layers_https_source" CHECK ("source_endpoint" LIKE 'https://%')
);--> statement-breakpoint

CREATE TABLE "context_ingestion_runs" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "layer_id" integer NOT NULL REFERENCES "context_layers"("id") ON DELETE RESTRICT,
  "run_key" varchar(96) NOT NULL UNIQUE,
  "source_etag" varchar(512),
  "source_last_modified" varchar(512),
  "source_checksum_sha256" varchar(64),
  "http_status" integer NOT NULL,
  "received_count" integer NOT NULL DEFAULT 0,
  "accepted_count" integer NOT NULL DEFAULT 0,
  "rejected_count" integer NOT NULL DEFAULT 0,
  "quality_state" "context_quality_state" NOT NULL,
  "failure_reason" text,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  CONSTRAINT "context_ingestion_runs_http_status_range" CHECK ("http_status" BETWEEN 100 AND 599),
  CONSTRAINT "context_ingestion_runs_counts_range" CHECK ("received_count" >= 0 AND "accepted_count" >= 0 AND "rejected_count" >= 0)
);--> statement-breakpoint

CREATE TABLE "context_events" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "layer_id" integer NOT NULL REFERENCES "context_layers"("id") ON DELETE RESTRICT,
  "source_event_key" varchar(512) NOT NULL,
  "source_url" text,
  "source_observed_at" timestamptz NOT NULL,
  "source_updated_at" timestamptz,
  "expires_at" timestamptz,
  "event_status" "context_event_status" NOT NULL DEFAULT 'active',
  "quality_state" "context_quality_state" NOT NULL,
  "severity" varchar(32),
  "urgency" varchar(32),
  "geometry" jsonb NOT NULL,
  "bbox" jsonb,
  "properties" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_checksum_sha256" varchar(64) NOT NULL,
  "ingestion_run_id" bigint NOT NULL REFERENCES "context_ingestion_runs"("id") ON DELETE RESTRICT,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("layer_id", "source_event_key"),
  CONSTRAINT "context_events_geometry_object" CHECK (jsonb_typeof("geometry") = 'object')
);--> statement-breakpoint

CREATE TABLE "context_layer_subscriptions" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "layer_id" integer NOT NULL REFERENCES "context_layers"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT true,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("user_id", "layer_id")
);--> statement-breakpoint

CREATE TABLE "context_delivery_audits" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "audience" varchar(64) NOT NULL,
  "layer_keys" jsonb NOT NULL,
  "window_start" timestamptz,
  "window_end" timestamptz,
  "capability_fingerprint_sha256" varchar(64) NOT NULL,
  "request_id" varchar(128),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "context_delivery_audits_audience" CHECK ("audience" IN ('context_stream', 'context_tiles', 'context_mobile'))
);--> statement-breakpoint

CREATE INDEX "context_events_layer_observed_idx" ON "context_events" ("layer_id", "source_observed_at" DESC);--> statement-breakpoint
CREATE INDEX "context_events_active_expiry_idx" ON "context_events" ("event_status", "expires_at");--> statement-breakpoint
CREATE INDEX "context_ingestion_runs_layer_started_idx" ON "context_ingestion_runs" ("layer_id", "started_at" DESC);--> statement-breakpoint
CREATE INDEX "context_delivery_audits_user_created_idx" ON "context_delivery_audits" ("user_id", "created_at" DESC);--> statement-breakpoint

INSERT INTO "context_layers" ("layer_key", "kind", "display_name", "description", "source_name", "source_endpoint", "attribution", "refresh_seconds", "default_enabled", "enabled")
VALUES
  ('seismic', 'seismic', 'Seismic activity', 'Public earthquake context. Not an authoritative site safety assessment.', 'USGS Earthquake Hazards Program', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson', 'USGS Earthquake Hazards Program', 60, true, true),
  ('weather-alerts', 'weather_alert', 'Weather alerts', 'Public National Weather Service alerts. Not a site-specific forecast or emergency instruction.', 'National Weather Service', 'https://api.weather.gov/alerts/active', 'National Weather Service', 120, true, true)
ON CONFLICT ("layer_key") DO NOTHING;
