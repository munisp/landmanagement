CREATE TYPE "public"."checkpoint_status" AS ENUM('pending', 'fulfilled', 'waived', 'failed');--> statement-breakpoint
CREATE TYPE "public"."clearance_status" AS ENUM('pending', 'submitted', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."exchange_decision" AS ENUM('allowed', 'denied', 'conditional');--> statement-breakpoint
CREATE TYPE "public"."integrity_finding_severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."integrity_finding_status" AS ENUM('open', 'acknowledged', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."risk_band" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('draft', 'pending', 'release_ready', 'released', 'blocked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('active', 'inactive', 'failed');--> statement-breakpoint
CREATE TABLE "agency_clearances" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agency_clearances_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"transaction_id" integer NOT NULL,
	"agency" varchar(64) NOT NULL,
	"status" "clearance_status" DEFAULT 'pending' NOT NULL,
	"reference_number" varchar(128),
	"sla_due_at" timestamp,
	"submitted_at" timestamp,
	"decided_at" timestamp,
	"decision_notes" text,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "data_exchange_audits" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "data_exchange_audits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"subject_user_id" integer,
	"requestor_user_id" integer,
	"requestor_role" varchar(64) NOT NULL,
	"purpose" varchar(128) NOT NULL,
	"jurisdiction" varchar(64) DEFAULT 'NG' NOT NULL,
	"data_categories" jsonb,
	"decision" "exchange_decision" NOT NULL,
	"decision_reasons" jsonb,
	"conditions" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "email_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"logo_url" text,
	"primary_color" varchar(7),
	"footer_text" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "escrow_settlements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "escrow_settlements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"settlement_ref" varchar(64) NOT NULL,
	"transaction_id" integer,
	"amount" numeric(18, 2),
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"status" "settlement_status" DEFAULT 'draft' NOT NULL,
	"release_decision" jsonb,
	"blocking_reasons" jsonb,
	"released_at" timestamp,
	"released_by" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "escrow_settlements_settlement_ref_unique" UNIQUE("settlement_ref")
);--> statement-breakpoint
CREATE TABLE "mortgage_decision_explanations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mortgage_decision_explanations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"application_id" integer NOT NULL,
	"overall_recommendation" varchar(64) NOT NULL,
	"overall_score" integer NOT NULL,
	"factors" jsonb,
	"policy_version" varchar(32) DEFAULT 'v1' NOT NULL,
	"generated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "registry_integrity_findings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "registry_integrity_findings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"check_type" varchar(64) NOT NULL,
	"severity" "integrity_finding_severity" DEFAULT 'medium' NOT NULL,
	"status" "integrity_finding_status" DEFAULT 'open' NOT NULL,
	"parcel_id" integer,
	"related_entity_type" varchar(64),
	"related_entity_id" integer,
	"description" text NOT NULL,
	"evidence" jsonb,
	"detected_by" varchar(64) DEFAULT 'manual' NOT NULL,
	"scan_run_id" varchar(64),
	"acknowledged_by" integer,
	"acknowledged_at" timestamp,
	"resolved_by" integer,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "settlement_checkpoints" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "settlement_checkpoints_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"settlement_id" integer NOT NULL,
	"checkpoint_key" varchar(64) NOT NULL,
	"label" varchar(255) NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"status" "checkpoint_status" DEFAULT 'pending' NOT NULL,
	"evidence" jsonb,
	"fulfilled_by" integer,
	"fulfilled_at" timestamp,
	"waived_by" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "title_risk_assessments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "title_risk_assessments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parcel_id" integer,
	"transaction_id" integer,
	"overall_score" integer NOT NULL,
	"risk_band" "risk_band" NOT NULL,
	"factor_scores" jsonb,
	"drivers" jsonb,
	"recommendations" jsonb,
	"assessed_by" integer,
	"assessed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "webhook_delivery_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhook_delivery_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"webhook_id" integer NOT NULL,
	"event" varchar(64) NOT NULL,
	"payload" text NOT NULL,
	"response_status" integer,
	"response_body" text,
	"status" "webhook_delivery_status" NOT NULL,
	"error_message" text,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"delivered_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ALTER COLUMN "secret" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "dashboard_layout" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "status" "webhook_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "max_retries" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "data_exchange_audits" ADD CONSTRAINT "data_exchange_audits_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_exchange_audits" ADD CONSTRAINT "data_exchange_audits_requestor_user_id_users_id_fk" FOREIGN KEY ("requestor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_settlements" ADD CONSTRAINT "escrow_settlements_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_settlements" ADD CONSTRAINT "escrow_settlements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage_decision_explanations" ADD CONSTRAINT "mortgage_decision_explanations_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_integrity_findings" ADD CONSTRAINT "registry_integrity_findings_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_integrity_findings" ADD CONSTRAINT "registry_integrity_findings_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_integrity_findings" ADD CONSTRAINT "registry_integrity_findings_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_checkpoints" ADD CONSTRAINT "settlement_checkpoints_settlement_id_escrow_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."escrow_settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_checkpoints" ADD CONSTRAINT "settlement_checkpoints_fulfilled_by_users_id_fk" FOREIGN KEY ("fulfilled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_checkpoints" ADD CONSTRAINT "settlement_checkpoints_waived_by_users_id_fk" FOREIGN KEY ("waived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_risk_assessments" ADD CONSTRAINT "title_risk_assessments_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_risk_assessments" ADD CONSTRAINT "title_risk_assessments_assessed_by_users_id_fk" FOREIGN KEY ("assessed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery_log" ADD CONSTRAINT "webhook_delivery_log_webhook_id_webhook_endpoints_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_clearances_transaction_idx" ON "agency_clearances" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "agency_clearances_agency_idx" ON "agency_clearances" USING btree ("agency");--> statement-breakpoint
CREATE INDEX "agency_clearances_status_idx" ON "agency_clearances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "data_exchange_audits_subject_idx" ON "data_exchange_audits" USING btree ("subject_user_id");--> statement-breakpoint
CREATE INDEX "data_exchange_audits_decision_idx" ON "data_exchange_audits" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "data_exchange_audits_purpose_idx" ON "data_exchange_audits" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "escrow_settlements_status_idx" ON "escrow_settlements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "escrow_settlements_transaction_idx" ON "escrow_settlements" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "mortgage_decision_explanations_application_idx" ON "mortgage_decision_explanations" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "registry_integrity_findings_status_idx" ON "registry_integrity_findings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "registry_integrity_findings_severity_idx" ON "registry_integrity_findings" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "registry_integrity_findings_check_type_idx" ON "registry_integrity_findings" USING btree ("check_type");--> statement-breakpoint
CREATE INDEX "registry_integrity_findings_parcel_idx" ON "registry_integrity_findings" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "settlement_checkpoints_settlement_idx" ON "settlement_checkpoints" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "settlement_checkpoints_status_idx" ON "settlement_checkpoints" USING btree ("status");--> statement-breakpoint
CREATE INDEX "title_risk_assessments_parcel_idx" ON "title_risk_assessments" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "title_risk_assessments_band_idx" ON "title_risk_assessments" USING btree ("risk_band");--> statement-breakpoint
CREATE INDEX "title_risk_assessments_assessed_at_idx" ON "title_risk_assessments" USING btree ("assessed_at");--> statement-breakpoint
