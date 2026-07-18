-- Migration 0014: Repair the migration chain so a fresh database can be
-- bootstrapped with `drizzle-kit migrate`.
--
-- The pre-existing migration set referenced the mortgage_applications table
-- from FOREIGN KEY constraints in 0005-0011 but never created it, and twelve
-- tables plus ten enums declared in drizzle/schema.ts had no CREATE statement
-- anywhere in the chain. Any attempt to migrate an empty database therefore
-- failed (PostgreSQL errors 42704 / 42P01). This migration creates the missing
-- enums and tables exactly as declared in schema.ts and re-applies the ten
-- deferred FOREIGN KEY constraints after their referenced table exists.

CREATE TYPE "public"."cadastral_survey_status" AS ENUM('pending', 'in_progress', 'completed', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."environmental_assessment_status" AS ENUM('pending', 'under_review', 'approved', 'conditional_approval', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."land_use_plan_status" AS ENUM('pending', 'under_review', 'approved', 'conditional_approval', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."legal_document_status" AS ENUM('draft', 'pending_review', 'approved', 'signed', 'registered', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."legal_document_type" AS ENUM('deed_of_assignment', 'power_of_attorney', 'contract_of_sale', 'lease_agreement', 'mortgage_deed', 'certificate_of_occupancy', 'governor_consent', 'other');--> statement-breakpoint
CREATE TYPE "public"."mortgage_status" AS ENUM('pending', 'under_review', 'approved', 'rejected', 'disbursed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_transaction_type" AS ENUM('transfer', 'deposit', 'withdrawal', 'property_purchase', 'registration_fee', 'survey_fee');--> statement-breakpoint
CREATE TYPE "public"."public_notice_status" AS ENUM('pending', 'published', 'objection_filed', 'objection_resolved', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."tax_clearance_status" AS ENUM('pending', 'in_progress', 'verified', 'issued', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mortgage_applications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mortgage_applications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"application_id" varchar(64) NOT NULL,
	"transaction_id" varchar(64) NOT NULL REFERENCES "transactions"("transaction_id"),
	"parcel_id" integer NOT NULL REFERENCES "parcels"("id"),
	"applicant_id" integer NOT NULL REFERENCES "users"("id"),
	"loan_amount" integer NOT NULL,
	"interest_rate" varchar(10) NOT NULL,
	"loan_term" integer NOT NULL,
	"monthly_payment" integer NOT NULL,
	"down_payment" integer NOT NULL,
	"bank_name" varchar(255) NOT NULL,
	"bank_branch" varchar(255),
	"loan_officer" varchar(255),
	"loan_officer_contact" varchar(50),
	"status" "mortgage_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"disbursed_at" timestamp,
	"rejection_reason" text,
	"documents" jsonb,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mortgage_applications_application_id_unique" UNIQUE("application_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mojaloop_transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mojaloop_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"transaction_id" varchar(128) NOT NULL,
	"transfer_id" varchar(128),
	"quote_id" varchar(128),
	"user_id" integer NOT NULL,
	"property_id" varchar(64),
	"escrow_contract_address" varchar(128),
	"amount" real NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"payer_fsp_id" varchar(64) NOT NULL,
	"payer_party_id_type" varchar(32) NOT NULL,
	"payer_party_identifier" varchar(128) NOT NULL,
	"payer_name" varchar(255),
	"payee_fsp_id" varchar(64) NOT NULL,
	"payee_party_id_type" varchar(32) NOT NULL,
	"payee_party_identifier" varchar(128) NOT NULL,
	"payee_name" varchar(255),
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"error_code" varchar(64),
	"error_description" text,
	"quote_amount" real,
	"quote_fees" real,
	"quote_expiration" timestamp,
	"transfer_state" varchar(32),
	"transfer_fulfilment" text,
	"transfer_condition" text,
	"note" text,
	"transaction_type" "payment_transaction_type" DEFAULT 'transfer' NOT NULL,
	"purpose" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"reconciled_at" timestamp,
	"blockchain_tx_hash" varchar(128),
	CONSTRAINT "mojaloop_transactions_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "mojaloop_transactions_transfer_id_unique" UNIQUE("transfer_id"),
	CONSTRAINT "mojaloop_transactions_quote_id_unique" UNIQUE("quote_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mojaloop_payment_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mojaloop_payment_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"transaction_id" varchar(128) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"event_status" varchar(32) NOT NULL,
	"request_payload" text,
	"response_payload" text,
	"error_code" varchar(64),
	"error_message" text,
	"fsp_id" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mojaloop_fsp_config" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mojaloop_fsp_config_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"fsp_id" varchar(64) NOT NULL,
	"fsp_name" varchar(255) NOT NULL,
	"api_base_url" varchar(512) NOT NULL,
	"api_version" varchar(16) DEFAULT '1.1' NOT NULL,
	"auth_type" varchar(32) DEFAULT 'BEARER' NOT NULL,
	"auth_token" text,
	"certificate_path" varchar(512),
	"supported_currencies" text DEFAULT 'USD' NOT NULL,
	"supported_transaction_types" text DEFAULT 'TRANSFER' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mojaloop_fsp_config_fsp_id_unique" UNIQUE("fsp_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" varchar(64),
	"user_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"key" varchar(128) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"request_count" integer DEFAULT 0 NOT NULL,
	"rate_limit" integer DEFAULT 1000 NOT NULL,
	CONSTRAINT "api_keys_key_unique" UNIQUE("key")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tax_clearances" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tax_clearances_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"clearance_id" varchar(64) NOT NULL,
	"transaction_id" varchar(64) NOT NULL REFERENCES "transactions"("transaction_id"),
	"parcel_id" integer NOT NULL REFERENCES "parcels"("id"),
	"owner_id" integer NOT NULL REFERENCES "users"("id"),
	"tax_year" integer NOT NULL,
	"tax_amount" integer NOT NULL,
	"paid_amount" integer NOT NULL,
	"outstanding_amount" integer NOT NULL,
	"firs_reference_number" varchar(128),
	"firs_verification_date" timestamp,
	"status" "tax_clearance_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"verified_at" timestamp,
	"issued_at" timestamp,
	"expires_at" timestamp,
	"certificate_url" text,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tax_clearances_clearance_id_unique" UNIQUE("clearance_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "insurance_policies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "insurance_policies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"policy_id" varchar(64) NOT NULL,
	"transaction_id" varchar(64) REFERENCES "transactions"("transaction_id"),
	"parcel_id" integer NOT NULL REFERENCES "parcels"("id"),
	"policy_holder_id" integer NOT NULL REFERENCES "users"("id"),
	"provider_name" varchar(255) NOT NULL,
	"provider_contact" varchar(100),
	"agent_name" varchar(255),
	"agent_contact" varchar(100),
	"policy_type" varchar(100) NOT NULL,
	"coverage_amount" integer NOT NULL,
	"premium_amount" integer NOT NULL,
	"deductible" integer,
	"status" "insurance_policy_status" DEFAULT 'pending' NOT NULL,
	"effective_date" timestamp NOT NULL,
	"expiry_date" timestamp NOT NULL,
	"last_renewal_date" timestamp,
	"next_renewal_date" timestamp,
	"policy_document_url" text,
	"certificate_url" text,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "insurance_policies_policy_id_unique" UNIQUE("policy_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_documents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "legal_documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"document_id" varchar(64) NOT NULL,
	"transaction_id" varchar(64) NOT NULL REFERENCES "transactions"("transaction_id"),
	"parcel_id" integer NOT NULL REFERENCES "parcels"("id"),
	"document_type" "legal_document_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"document_url" text,
	"lawyer_name" varchar(255),
	"lawyer_bar_number" varchar(100),
	"lawyer_contact" varchar(100),
	"law_firm" varchar(255),
	"status" "legal_document_status" DEFAULT 'draft' NOT NULL,
	"drafted_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"approved_at" timestamp,
	"signed_at" timestamp,
	"registered_at" timestamp,
	"registration_number" varchar(128),
	"signatories" jsonb,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "legal_documents_document_id_unique" UNIQUE("document_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cadastral_surveys" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cadastral_surveys_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"survey_id" varchar(64) NOT NULL,
	"transaction_id" varchar(64) REFERENCES "transactions"("transaction_id"),
	"parcel_id" integer NOT NULL REFERENCES "parcels"("id"),
	"survey_plan_number" varchar(128) NOT NULL,
	"survey_date" timestamp NOT NULL,
	"surveyor_name" varchar(255) NOT NULL,
	"surveyor_license_number" varchar(100) NOT NULL,
	"survey_firm" varchar(255),
	"coordinates" jsonb NOT NULL,
	"area" integer NOT NULL,
	"perimeter" integer,
	"boundary_points" jsonb,
	"status" "cadastral_survey_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"approved_by" varchar(255),
	"rejected_at" timestamp,
	"rejection_reason" text,
	"expires_at" timestamp,
	"survey_plan_url" text,
	"approval_certificate_url" text,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cadastral_surveys_survey_id_unique" UNIQUE("survey_id"),
	CONSTRAINT "cadastral_surveys_survey_plan_number_unique" UNIQUE("survey_plan_number")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "environmental_assessments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "environmental_assessments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"assessment_id" varchar(64) NOT NULL,
	"transaction_id" varchar(64) REFERENCES "transactions"("transaction_id"),
	"parcel_id" integer NOT NULL REFERENCES "parcels"("id"),
	"assessment_type" varchar(100) NOT NULL,
	"assessor_name" varchar(255) NOT NULL,
	"assessor_license" varchar(100),
	"assessor_firm" varchar(255),
	"soil_quality" varchar(50),
	"water_quality" varchar(50),
	"air_quality" varchar(50),
	"flood_risk" varchar(50),
	"erosion_risk" varchar(50),
	"contamination_level" varchar(50),
	"is_protected_area" boolean DEFAULT false NOT NULL,
	"protected_area_type" varchar(100),
	"status" "environmental_assessment_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"conditions" text,
	"rejection_reason" text,
	"expires_at" timestamp,
	"report_url" text,
	"certificate_url" text,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "environmental_assessments_assessment_id_unique" UNIQUE("assessment_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public_notices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "public_notices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"notice_id" varchar(64) NOT NULL,
	"transaction_id" varchar(64) NOT NULL REFERENCES "transactions"("transaction_id"),
	"parcel_id" integer NOT NULL REFERENCES "parcels"("id"),
	"notice_type" varchar(100) NOT NULL,
	"notice_title" varchar(255) NOT NULL,
	"notice_content" text NOT NULL,
	"publication_date" timestamp NOT NULL,
	"publication_period_days" integer DEFAULT 30 NOT NULL,
	"expiry_date" timestamp NOT NULL,
	"newspaper_name" varchar(255),
	"newspaper_edition" varchar(100),
	"publication_url" text,
	"has_objections" boolean DEFAULT false NOT NULL,
	"objections_count" integer DEFAULT 0 NOT NULL,
	"objections" jsonb,
	"status" "public_notice_status" DEFAULT 'pending' NOT NULL,
	"published_at" timestamp,
	"completed_at" timestamp,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "public_notices_notice_id_unique" UNIQUE("notice_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "land_use_plans" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "land_use_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"plan_id" varchar(64) NOT NULL,
	"transaction_id" varchar(64) REFERENCES "transactions"("transaction_id"),
	"parcel_id" integer NOT NULL REFERENCES "parcels"("id"),
	"current_land_use" varchar(100) NOT NULL,
	"proposed_land_use" varchar(100) NOT NULL,
	"zoning_classification" varchar(100),
	"development_type" varchar(100),
	"planning_authority" varchar(255) NOT NULL,
	"planning_officer" varchar(255),
	"planning_officer_contact" varchar(100),
	"is_compliant" boolean,
	"compliance_notes" text,
	"restrictions" text,
	"conditions" text,
	"status" "land_use_plan_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"expires_at" timestamp,
	"application_url" text,
	"approval_certificate_url" text,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "land_use_plans_plan_id_unique" UNIQUE("plan_id")
);--> statement-breakpoint

-- Deferred foreign keys (moved from 0005-0011; referenced table did not exist yet).
ALTER TABLE "auto_debit_mandates" ADD CONSTRAINT "auto_debit_mandates_application_id_mortgage_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."mortgage_applications"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "mortgage_payment_schedule" ADD CONSTRAINT "mortgage_payment_schedule_application_id_mortgage_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."mortgage_applications"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "mortgage_payment_transactions" ADD CONSTRAINT "mortgage_payment_transactions_application_id_mortgage_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."mortgage_applications"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "escrow_accounts" ADD CONSTRAINT "escrow_accounts_application_id_mortgage_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."mortgage_applications"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "mortgage_insurance_policies" ADD CONSTRAINT "mortgage_insurance_policies_application_id_mortgage_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."mortgage_applications"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "document_verifications" ADD CONSTRAINT "document_verifications_application_id_mortgage_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."mortgage_applications"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "broker_application_submissions" ADD CONSTRAINT "broker_application_submissions_application_id_mortgage_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."mortgage_applications"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "broker_commissions" ADD CONSTRAINT "broker_commissions_application_id_mortgage_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."mortgage_applications"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "loan_pool_loans" ADD CONSTRAINT "loan_pool_loans_application_id_mortgage_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."mortgage_applications"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
-- application_id intentionally kept as a plain column (no FK): mortgage application records
-- are currently dual-stored; consolidation tracked in the audit report.

-- Nextgen transaction FKs (moved from 0011; registry_transactions is created in 0012).
ALTER TABLE "agency_clearances" ADD CONSTRAINT "agency_clearances_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."registry_transactions"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "escrow_settlements" ADD CONSTRAINT "escrow_settlements_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."registry_transactions"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
ALTER TABLE "title_risk_assessments" ADD CONSTRAINT "title_risk_assessments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."registry_transactions"("id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint
