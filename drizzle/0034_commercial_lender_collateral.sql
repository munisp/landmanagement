CREATE TYPE "commercial_account_status" AS ENUM ('trial', 'active', 'past_due', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TYPE "commercial_member_role" AS ENUM ('owner', 'billing_admin', 'lender_admin', 'lender_analyst', 'reviewer');--> statement-breakpoint
CREATE TYPE "commercial_subscription_status" AS ENUM ('trialing', 'active', 'past_due', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TYPE "commercial_invoice_status" AS ENUM ('draft', 'issued', 'paid', 'void', 'overdue');--> statement-breakpoint
CREATE TYPE "collateral_case_status" AS ENUM ('opened', 'evidence_requested', 'ready_for_review', 'under_review', 'conditional_approval', 'approved', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "collateral_evidence_status" AS ENUM ('pending', 'accepted', 'rejected');--> statement-breakpoint

CREATE TABLE "commercial_products" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "product_key" varchar(64) NOT NULL UNIQUE,
  "name" varchar(160) NOT NULL,
  "description" text NOT NULL,
  "monthly_price_minor" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "included_seats" integer NOT NULL,
  "included_units" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "commercial_products_price_nonnegative" CHECK ("monthly_price_minor" >= 0),
  CONSTRAINT "commercial_products_seats_positive" CHECK ("included_seats" > 0),
  CONSTRAINT "commercial_products_currency_length" CHECK (char_length("currency") = 3)
);--> statement-breakpoint

CREATE TABLE "commercial_accounts" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "account_key" varchar(96) NOT NULL UNIQUE,
  "legal_name" varchar(255) NOT NULL,
  "billing_email" varchar(320) NOT NULL,
  "status" "commercial_account_status" NOT NULL DEFAULT 'trial',
  "created_by" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "commercial_accounts_billing_email_nonblank" CHECK (length(trim("billing_email")) > 3)
);--> statement-breakpoint

CREATE TABLE "commercial_account_members" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "account_id" bigint NOT NULL REFERENCES "commercial_accounts"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "commercial_member_role" NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("account_id", "user_id")
);--> statement-breakpoint

CREATE TABLE "commercial_subscriptions" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "subscription_key" varchar(96) NOT NULL UNIQUE,
  "account_id" bigint NOT NULL REFERENCES "commercial_accounts"("id") ON DELETE CASCADE,
  "product_id" bigint NOT NULL REFERENCES "commercial_products"("id") ON DELETE RESTRICT,
  "status" "commercial_subscription_status" NOT NULL,
  "started_at" timestamptz NOT NULL,
  "current_period_start" timestamptz NOT NULL,
  "current_period_end" timestamptz NOT NULL,
  "cancelled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "commercial_subscriptions_period_valid" CHECK ("current_period_end" > "current_period_start")
);--> statement-breakpoint

CREATE TABLE "commercial_usage_events" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "account_id" bigint NOT NULL REFERENCES "commercial_accounts"("id") ON DELETE CASCADE,
  "metric_key" varchar(96) NOT NULL,
  "quantity" integer NOT NULL,
  "idempotency_key" varchar(160) NOT NULL UNIQUE,
  "source_type" varchar(64) NOT NULL,
  "source_key" varchar(160) NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "commercial_usage_events_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "commercial_usage_events_metric_nonblank" CHECK (length(trim("metric_key")) > 0)
);--> statement-breakpoint

CREATE TABLE "commercial_invoices" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "invoice_key" varchar(96) NOT NULL UNIQUE,
  "account_id" bigint NOT NULL REFERENCES "commercial_accounts"("id") ON DELETE RESTRICT,
  "subscription_id" bigint REFERENCES "commercial_subscriptions"("id") ON DELETE SET NULL,
  "status" "commercial_invoice_status" NOT NULL DEFAULT 'draft',
  "currency" varchar(3) NOT NULL,
  "subtotal_minor" integer NOT NULL,
  "tax_minor" integer NOT NULL DEFAULT 0,
  "total_minor" integer NOT NULL,
  "issued_at" timestamptz,
  "due_at" timestamptz,
  "paid_at" timestamptz,
  "collection_method" varchar(64) NOT NULL DEFAULT 'manual_reconciliation',
  "provider_reference" varchar(160),
  "payment_evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "commercial_invoices_amounts_valid" CHECK ("subtotal_minor" >= 0 AND "tax_minor" >= 0 AND "total_minor" = "subtotal_minor" + "tax_minor"),
  CONSTRAINT "commercial_invoices_currency_length" CHECK (char_length("currency") = 3),
  CONSTRAINT "commercial_invoices_due_after_issue" CHECK ("due_at" IS NULL OR "issued_at" IS NULL OR "due_at" >= "issued_at")
);--> statement-breakpoint

CREATE TABLE "lender_portfolios" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "portfolio_key" varchar(96) NOT NULL UNIQUE,
  "account_id" bigint NOT NULL UNIQUE REFERENCES "commercial_accounts"("id") ON DELETE CASCADE,
  "lender_name" varchar(255) NOT NULL,
  "policy_version" varchar(64) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "lender_collateral_cases" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "case_key" varchar(96) NOT NULL UNIQUE,
  "account_id" bigint NOT NULL REFERENCES "commercial_accounts"("id") ON DELETE RESTRICT,
  "portfolio_id" bigint NOT NULL REFERENCES "lender_portfolios"("id") ON DELETE RESTRICT,
  "mortgage_application_id" integer REFERENCES "mortgage_applications"("id") ON DELETE SET NULL,
  "parcel_id" integer NOT NULL REFERENCES "parcels"("id") ON DELETE RESTRICT,
  "borrower_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "status" "collateral_case_status" NOT NULL DEFAULT 'opened',
  "requested_amount_minor" integer NOT NULL,
  "declared_collateral_value_minor" integer,
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "assigned_reviewer_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "decision_notes" text,
  "opened_at" timestamptz NOT NULL DEFAULT now(),
  "reviewed_at" timestamptz,
  "closed_at" timestamptz,
  "created_by" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "lender_collateral_cases_requested_amount_positive" CHECK ("requested_amount_minor" > 0),
  CONSTRAINT "lender_collateral_cases_value_nonnegative" CHECK ("declared_collateral_value_minor" IS NULL OR "declared_collateral_value_minor" >= 0),
  CONSTRAINT "lender_collateral_cases_currency_length" CHECK (char_length("currency") = 3)
);--> statement-breakpoint

CREATE TABLE "lender_collateral_evidence" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "evidence_key" varchar(96) NOT NULL UNIQUE,
  "case_id" bigint NOT NULL REFERENCES "lender_collateral_cases"("id") ON DELETE CASCADE,
  "evidence_type" varchar(64) NOT NULL,
  "source_reference" varchar(160) NOT NULL,
  "source_checksum_sha256" varchar(64),
  "status" "collateral_evidence_status" NOT NULL DEFAULT 'pending',
  "review_notes" text,
  "submitted_by" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reviewed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  "reviewed_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "lender_collateral_evidence_type_nonblank" CHECK (length(trim("evidence_type")) > 0),
  CONSTRAINT "lender_collateral_evidence_reference_nonblank" CHECK (length(trim("source_reference")) > 0)
);--> statement-breakpoint

CREATE TABLE "lender_collateral_events" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "case_id" bigint NOT NULL REFERENCES "lender_collateral_cases"("id") ON DELETE CASCADE,
  "event_type" varchar(64) NOT NULL,
  "previous_status" "collateral_case_status",
  "next_status" "collateral_case_status",
  "actor_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "description" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "lender_collateral_events_type_nonblank" CHECK (length(trim("event_type")) > 0)
);--> statement-breakpoint

CREATE INDEX "commercial_account_members_user_idx" ON "commercial_account_members"("user_id", "account_id");--> statement-breakpoint
CREATE INDEX "commercial_subscriptions_account_status_idx" ON "commercial_subscriptions"("account_id", "status", "current_period_end" DESC);--> statement-breakpoint
CREATE INDEX "commercial_usage_events_account_metric_time_idx" ON "commercial_usage_events"("account_id", "metric_key", "occurred_at" DESC);--> statement-breakpoint
CREATE INDEX "commercial_invoices_account_status_due_idx" ON "commercial_invoices"("account_id", "status", "due_at");--> statement-breakpoint
CREATE INDEX "lender_collateral_cases_account_status_updated_idx" ON "lender_collateral_cases"("account_id", "status", "updated_at" DESC);--> statement-breakpoint
CREATE INDEX "lender_collateral_cases_portfolio_idx" ON "lender_collateral_cases"("portfolio_id", "status");--> statement-breakpoint
CREATE INDEX "lender_collateral_evidence_case_status_idx" ON "lender_collateral_evidence"("case_id", "status");--> statement-breakpoint
CREATE INDEX "lender_collateral_events_case_created_idx" ON "lender_collateral_events"("case_id", "created_at" ASC);--> statement-breakpoint

INSERT INTO "commercial_products" ("product_key", "name", "description", "monthly_price_minor", "currency", "included_seats", "included_units")
VALUES
  ('lender-collateral-core', 'Lender Collateral Control', 'Institution-scoped collateral review, evidence workflow, portfolio controls, and auditable case activity.', 250000, 'USD', 10, '{"active_collateral_cases":250,"monthly_evidence_reviews":1000}'::jsonb),
  ('conveyancing-workspace', 'Conveyancing and Title Verification Workspace', 'Professional transaction case coordination, legal-document review, title verification, and closing workspaces.', 150000, 'USD', 10, '{"active_matters":150,"monthly_verification_requests":1000}'::jsonb),
  ('field-survey-operations', 'Field Survey and Parcel Inspection', 'Authorized field assignment, evidence capture, geometry quality review, and supervisor workflows.', 100000, 'USD', 15, '{"monthly_field_assignments":1000,"active_field_seats":15}'::jsonb)
ON CONFLICT ("product_key") DO NOTHING;
