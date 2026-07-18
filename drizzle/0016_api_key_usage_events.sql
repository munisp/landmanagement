-- Migration 0016: Real API key usage telemetry.
-- Replaces the simulated getUsageStats metrics (requests were fabricated as
-- fixed fractions of lifetime totals) with an append-only event log that
-- validateApiKey writes to on every validated request and that enforcing
-- middleware/gateways write rate-limit and error events to.

CREATE TABLE IF NOT EXISTS "api_key_usage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"key_id" varchar(64) NOT NULL,
	"event" varchar(32) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "api_key_usage_events_key_idx" ON "api_key_usage_events" USING btree ("key_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "api_key_usage_events_created_at_idx" ON "api_key_usage_events" USING btree ("created_at");
--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'api_key_usage_events_key_id_api_keys_id_fk'
	) THEN
		ALTER TABLE "api_key_usage_events"
			ADD CONSTRAINT "api_key_usage_events_key_id_api_keys_id_fk"
			FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
