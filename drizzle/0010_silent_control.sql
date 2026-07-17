CREATE TYPE "public"."auth_provider_type" AS ENUM('manus_oauth', 'keycloak', 'oidc', 'saml', 'local');--> statement-breakpoint
CREATE TYPE "public"."integration_kind" AS ENUM('keycloak', 'permify', 'apisix', 'dapr', 'fluvio', 'openappsec', 'lakehouse', 'tigerbeetle', 'temporal', 'redis', 'postgres');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('draft', 'configured', 'active', 'degraded', 'failed', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."integration_sync_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'partial', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."authorization_subject_type" AS ENUM('user', 'group', 'role', 'service');--> statement-breakpoint
CREATE TYPE "public"."authorization_resource_type" AS ENUM('parcel', 'transaction', 'title', 'document', 'workflow', 'report', 'marketplace_listing', 'admin_surface', 'system');--> statement-breakpoint
CREATE TYPE "public"."api_gateway_resource_type" AS ENUM('route', 'upstream', 'service', 'consumer', 'plugin', 'certificate');--> statement-breakpoint
CREATE TYPE "public"."stream_backend" AS ENUM('kafka', 'fluvio', 'dapr_pubsub');--> statement-breakpoint
CREATE TYPE "public"."stream_delivery_status" AS ENUM('pending', 'published', 'acked', 'failed', 'dead_lettered');--> statement-breakpoint
CREATE TYPE "public"."waf_policy_mode" AS ENUM('detect', 'prevent', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."waf_incident_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."lakehouse_job_type" AS ENUM('ingest', 'export', 'sync', 'backfill', 'analytics_refresh');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."mfa_factor_type" AS ENUM('totp', 'sms', 'email', 'recovery_code');--> statement-breakpoint

CREATE TABLE "identity_providers" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "identity_providers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "name" varchar(100) NOT NULL,
  "provider_type" "auth_provider_type" NOT NULL,
  "issuer" text,
  "client_id" varchar(255),
  "client_secret_ref" varchar(255),
  "realm" varchar(120),
  "authorization_url" text,
  "token_url" text,
  "user_info_url" text,
  "jwks_url" text,
  "scopes" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "configuration" jsonb,
  "last_synced_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "identity_providers_name_unique" UNIQUE("name")
);--> statement-breakpoint

CREATE TABLE "external_identities" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "external_identities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "user_id" integer NOT NULL,
  "provider_id" integer NOT NULL,
  "external_subject" varchar(255) NOT NULL,
  "username" varchar(255),
  "email" varchar(320),
  "claims" jsonb,
  "last_login_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "user_sessions" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "user_id" integer NOT NULL,
  "session_token_hash" varchar(255) NOT NULL,
  "status" "session_status" DEFAULT 'active' NOT NULL,
  "ip_address" varchar(64),
  "user_agent" text,
  "device_name" varchar(255),
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "revoked_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_sessions_session_token_hash_unique" UNIQUE("session_token_hash")
);--> statement-breakpoint

CREATE TABLE "mfa_factors" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mfa_factors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "user_id" integer NOT NULL,
  "factor_type" "mfa_factor_type" NOT NULL,
  "label" varchar(255) NOT NULL,
  "secret_ref" varchar(255),
  "phone_number" varchar(32),
  "email_address" varchar(320),
  "recovery_codes" jsonb,
  "enabled" boolean DEFAULT true NOT NULL,
  "verified_at" timestamp,
  "last_used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "trusted_devices" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trusted_devices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "user_id" integer NOT NULL,
  "device_fingerprint" varchar(255) NOT NULL,
  "device_name" varchar(255) NOT NULL,
  "ip_address" varchar(64),
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "integration_registry" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "integration_registry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "integration_key" "integration_kind" NOT NULL,
  "display_name" varchar(120) NOT NULL,
  "status" "integration_status" DEFAULT 'draft' NOT NULL,
  "endpoint" text,
  "namespace" varchar(120),
  "version" varchar(64),
  "health_status" varchar(32),
  "configuration" jsonb,
  "capabilities" jsonb,
  "last_checked_at" timestamp,
  "last_healthy_at" timestamp,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "integration_registry_integration_key_unique" UNIQUE("integration_key")
);--> statement-breakpoint

CREATE TABLE "integration_sync_runs" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "integration_sync_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "integration_id" integer NOT NULL,
  "operation" varchar(120) NOT NULL,
  "status" "integration_sync_status" DEFAULT 'pending' NOT NULL,
  "correlation_id" varchar(128),
  "request_payload" jsonb,
  "response_payload" jsonb,
  "error_message" text,
  "records_processed" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp,
  "finished_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "authorization_relationships" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "authorization_relationships_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "engine" varchar(50) DEFAULT 'permify' NOT NULL,
  "subject_type" "authorization_subject_type" NOT NULL,
  "subject_id" varchar(128) NOT NULL,
  "relation" varchar(100) NOT NULL,
  "resource_type" "authorization_resource_type" NOT NULL,
  "resource_id" varchar(128) NOT NULL,
  "caveat" jsonb,
  "source_integration_id" integer,
  "synced_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "authorization_decision_audit" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "authorization_decision_audit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "integration_id" integer,
  "actor_user_id" integer,
  "subject_type" "authorization_subject_type" NOT NULL,
  "subject_id" varchar(128) NOT NULL,
  "relation" varchar(100) NOT NULL,
  "resource_type" "authorization_resource_type" NOT NULL,
  "resource_id" varchar(128) NOT NULL,
  "decision" boolean NOT NULL,
  "reason" text,
  "context" jsonb,
  "checked_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "api_gateway_resources" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_gateway_resources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "integration_id" integer,
  "resource_type" "api_gateway_resource_type" NOT NULL,
  "external_id" varchar(128),
  "name" varchar(255) NOT NULL,
  "route_path" text,
  "methods" text,
  "upstream_url" text,
  "plugins" jsonb,
  "enabled" boolean DEFAULT true NOT NULL,
  "sync_status" "integration_sync_status" DEFAULT 'pending' NOT NULL,
  "last_synced_at" timestamp,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "dapr_components" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dapr_components_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "integration_id" integer,
  "component_type" varchar(100) NOT NULL,
  "name" varchar(255) NOT NULL,
  "version" varchar(64),
  "namespace" varchar(120),
  "configuration" jsonb,
  "secrets" jsonb,
  "enabled" boolean DEFAULT true NOT NULL,
  "last_synced_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "dapr_components_name_unique" UNIQUE("name")
);--> statement-breakpoint

CREATE TABLE "event_outbox" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "backend" "stream_backend" NOT NULL,
  "topic" varchar(255) NOT NULL,
  "event_type" varchar(120) NOT NULL,
  "aggregate_type" varchar(120),
  "aggregate_id" varchar(128),
  "payload" jsonb NOT NULL,
  "headers" jsonb,
  "partition_key" varchar(255),
  "delivery_status" "stream_delivery_status" DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp DEFAULT now() NOT NULL,
  "published_at" timestamp,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "stream_consumer_checkpoints" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stream_consumer_checkpoints_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "backend" "stream_backend" NOT NULL,
  "consumer_group" varchar(255) NOT NULL,
  "topic" varchar(255) NOT NULL,
  "partition_id" integer DEFAULT 0 NOT NULL,
  "offset_value" varchar(128) NOT NULL,
  "last_message_key" varchar(255),
  "last_processed_at" timestamp,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "waf_policies" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "waf_policies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "integration_id" integer,
  "name" varchar(255) NOT NULL,
  "mode" "waf_policy_mode" DEFAULT 'detect' NOT NULL,
  "policy_version" varchar(64),
  "managed_by" varchar(100) DEFAULT 'openappsec' NOT NULL,
  "configuration" jsonb,
  "enabled" boolean DEFAULT true NOT NULL,
  "deployed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "waf_incidents" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "waf_incidents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "policy_id" integer,
  "integration_id" integer,
  "severity" "waf_incident_severity" DEFAULT 'medium' NOT NULL,
  "source_ip" varchar(64),
  "request_path" text,
  "rule_id" varchar(128),
  "action_taken" varchar(64),
  "request_metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "lakehouse_sync_jobs" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lakehouse_sync_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "integration_id" integer,
  "job_type" "lakehouse_job_type" NOT NULL,
  "table_name" varchar(255) NOT NULL,
  "source_entity" varchar(120),
  "status" "integration_sync_status" DEFAULT 'pending' NOT NULL,
  "cursor_value" varchar(255),
  "payload" jsonb,
  "result_summary" jsonb,
  "records_processed" integer DEFAULT 0 NOT NULL,
  "error_message" text,
  "started_at" timestamp,
  "finished_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "lakehouse_query_audit" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lakehouse_query_audit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "integration_id" integer,
  "actor_user_id" integer,
  "query_type" varchar(64) NOT NULL,
  "target_table" varchar(255),
  "query_text" text,
  "filters" jsonb,
  "result_row_count" integer DEFAULT 0 NOT NULL,
  "status" "integration_sync_status" DEFAULT 'succeeded' NOT NULL,
  "error_message" text,
  "executed_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_provider_id_identity_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."identity_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_factors" ADD CONSTRAINT "mfa_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_integration_id_integration_registry_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_relationships" ADD CONSTRAINT "authorization_relationships_source_integration_id_integration_registry_id_fk" FOREIGN KEY ("source_integration_id") REFERENCES "public"."integration_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_decision_audit" ADD CONSTRAINT "authorization_decision_audit_integration_id_integration_registry_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_decision_audit" ADD CONSTRAINT "authorization_decision_audit_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_gateway_resources" ADD CONSTRAINT "api_gateway_resources_integration_id_integration_registry_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dapr_components" ADD CONSTRAINT "dapr_components_integration_id_integration_registry_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waf_policies" ADD CONSTRAINT "waf_policies_integration_id_integration_registry_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waf_incidents" ADD CONSTRAINT "waf_incidents_policy_id_waf_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."waf_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waf_incidents" ADD CONSTRAINT "waf_incidents_integration_id_integration_registry_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lakehouse_sync_jobs" ADD CONSTRAINT "lakehouse_sync_jobs_integration_id_integration_registry_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lakehouse_query_audit" ADD CONSTRAINT "lakehouse_query_audit_integration_id_integration_registry_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lakehouse_query_audit" ADD CONSTRAINT "lakehouse_query_audit_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "identity_providers_type_idx" ON "identity_providers" USING btree ("provider_type");--> statement-breakpoint
CREATE INDEX "identity_providers_enabled_idx" ON "identity_providers" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "external_identities_provider_subject_idx" ON "external_identities" USING btree ("provider_id", "external_subject");--> statement-breakpoint
CREATE INDEX "external_identities_user_idx" ON "external_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_status_idx" ON "user_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_sessions_expires_idx" ON "user_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mfa_factors_user_idx" ON "mfa_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mfa_factors_type_idx" ON "mfa_factors" USING btree ("factor_type");--> statement-breakpoint
CREATE INDEX "trusted_devices_user_device_idx" ON "trusted_devices" USING btree ("user_id", "device_fingerprint");--> statement-breakpoint
CREATE INDEX "integration_registry_status_idx" ON "integration_registry" USING btree ("status");--> statement-breakpoint
CREATE INDEX "integration_sync_runs_integration_idx" ON "integration_sync_runs" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX "integration_sync_runs_status_idx" ON "integration_sync_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "authorization_relationships_subject_idx" ON "authorization_relationships" USING btree ("subject_type", "subject_id");--> statement-breakpoint
CREATE INDEX "authorization_relationships_resource_idx" ON "authorization_relationships" USING btree ("resource_type", "resource_id");--> statement-breakpoint
CREATE INDEX "authorization_decision_audit_checked_idx" ON "authorization_decision_audit" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "authorization_decision_audit_actor_idx" ON "authorization_decision_audit" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "api_gateway_resources_type_idx" ON "api_gateway_resources" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "api_gateway_resources_name_idx" ON "api_gateway_resources" USING btree ("name");--> statement-breakpoint
CREATE INDEX "event_outbox_backend_idx" ON "event_outbox" USING btree ("backend");--> statement-breakpoint
CREATE INDEX "event_outbox_status_idx" ON "event_outbox" USING btree ("delivery_status");--> statement-breakpoint
CREATE INDEX "event_outbox_available_idx" ON "event_outbox" USING btree ("available_at");--> statement-breakpoint
CREATE INDEX "stream_consumer_checkpoints_group_topic_idx" ON "stream_consumer_checkpoints" USING btree ("consumer_group", "topic", "partition_id");--> statement-breakpoint
CREATE INDEX "waf_policies_mode_idx" ON "waf_policies" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "waf_incidents_severity_idx" ON "waf_incidents" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "waf_incidents_created_idx" ON "waf_incidents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lakehouse_sync_jobs_table_idx" ON "lakehouse_sync_jobs" USING btree ("table_name");--> statement-breakpoint
CREATE INDEX "lakehouse_sync_jobs_status_idx" ON "lakehouse_sync_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lakehouse_query_audit_actor_idx" ON "lakehouse_query_audit" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "lakehouse_query_audit_executed_idx" ON "lakehouse_query_audit" USING btree ("executed_at");
