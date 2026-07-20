CREATE TABLE IF NOT EXISTS "tigerbeetle_ledger_accounts" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tigerbeetle_ledger_accounts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "ledger_id" integer NOT NULL,
  "account_id" varchar(128) NOT NULL,
  "account_type" varchar(32) NOT NULL,
  "code" integer NOT NULL,
  "user_id" integer,
  "parcel_id" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "tigerbeetle_ledger_accounts_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "temporal_workflow_audit" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "temporal_workflow_audit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "workflow_id" varchar(255) NOT NULL,
  "run_id" varchar(255) NOT NULL,
  "workflow_type" varchar(128) NOT NULL,
  "status" varchar(32) NOT NULL,
  "input" jsonb,
  "output" jsonb,
  "error" text,
  "started_at" timestamp NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "keycloak_session_sync" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "keycloak_session_sync_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "user_id" integer NOT NULL,
  "keycloak_session_id" varchar(255) NOT NULL,
  "keycloak_user_id" varchar(255) NOT NULL,
  "ip_address" varchar(64),
  "user_agent" text,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "last_synced_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "keycloak_session_sync_keycloak_session_id_unique" UNIQUE("keycloak_session_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fluvio_topic_registry" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fluvio_topic_registry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "topic_name" varchar(255) NOT NULL,
  "partitions" integer DEFAULT 1 NOT NULL,
  "replication_factor" integer DEFAULT 1 NOT NULL,
  "retention_time" varchar(32),
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "fluvio_topic_registry_topic_name_unique" UNIQUE("topic_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "apisix_route_persistence" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "apisix_route_persistence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "route_id" varchar(128) NOT NULL,
  "name" varchar(255) NOT NULL,
  "uris" jsonb NOT NULL,
  "methods" jsonb,
  "upstream_id" varchar(128),
  "plugins" jsonb,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "last_synced_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "apisix_route_persistence_route_id_unique" UNIQUE("route_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permify_schema_sync" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "permify_schema_sync_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "version" varchar(128) NOT NULL,
  "schema_definition" text NOT NULL,
  "applied_at" timestamp DEFAULT now() NOT NULL,
  "status" varchar(32) DEFAULT 'applied' NOT NULL,
  "applied_by" varchar(128),
  CONSTRAINT "permify_schema_sync_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openappsec_policy_audit" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "openappsec_policy_audit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "policy_id" varchar(128) NOT NULL,
  "name" varchar(255) NOT NULL,
  "mode" varchar(32) NOT NULL,
  "action" varchar(32) NOT NULL,
  "changes" jsonb,
  "applied_at" timestamp DEFAULT now() NOT NULL,
  "applied_by" varchar(128)
);
