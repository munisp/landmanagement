-- Migration 0017: Mortgage domain consolidation.
-- 1. Extends mortgage_applications with the underwriting columns the document
--    store carried (monthly income, employment, credit, affordability, balance).
-- 2. Adds mortgage_workflow_events (lifecycle audit trail).
-- 3. Migrates any JSONB document-store rows into the relational tables.
-- 4. Restores the mortgage_decision_explanations FK (now satisfiable).
-- 5. Drops the legacy `transactions` table (zero remaining consumers; no
--    migration ever created FKs to it).

-- 1. mortgage_applications extensions ----------------------------------------
ALTER TABLE "mortgage_applications" ADD COLUMN IF NOT EXISTS "monthly_income" integer;
--> statement-breakpoint
ALTER TABLE "mortgage_applications" ADD COLUMN IF NOT EXISTS "employment_status" varchar(32);
--> statement-breakpoint
ALTER TABLE "mortgage_applications" ADD COLUMN IF NOT EXISTS "credit_score" integer;
--> statement-breakpoint
ALTER TABLE "mortgage_applications" ADD COLUMN IF NOT EXISTS "affordability_ratio" double precision;
--> statement-breakpoint
ALTER TABLE "mortgage_applications" ADD COLUMN IF NOT EXISTS "outstanding_balance" integer;
--> statement-breakpoint
ALTER TABLE "mortgage_applications" ALTER COLUMN "transaction_id" DROP NOT NULL;
--> statement-breakpoint

-- 2. workflow events ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "mortgage_workflow_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"application_id" varchar(64) NOT NULL,
	"status" "mortgage_status" NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"actor_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mortgage_workflow_events_application_idx" ON "mortgage_workflow_events" USING btree ("application_id");
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'mortgage_workflow_events_actor_id_users_id_fk'
	) THEN
		ALTER TABLE "mortgage_workflow_events"
			ADD CONSTRAINT "mortgage_workflow_events_actor_id_users_id_fk"
			FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id")
			ON DELETE no action ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

-- 3. JSONB document-store data migration (idempotent) -------------------------
INSERT INTO "mortgage_applications" (
	"application_id", "transaction_id", "parcel_id", "applicant_id",
	"loan_amount", "interest_rate", "loan_term", "monthly_payment", "down_payment",
	"monthly_income", "employment_status", "credit_score", "affordability_ratio", "outstanding_balance",
	"bank_name", "bank_branch", "loan_officer", "loan_officer_contact",
	"status", "rejection_reason",
	"submitted_at", "reviewed_at", "approved_at", "rejected_at", "disbursed_at",
	"metadata", "createdAt", "updatedAt"
)
SELECT
	a->>'applicationId',
	a->>'transactionId',
	(a->>'parcelId')::integer,
	(a->>'applicantId')::integer,
	(a->>'loanAmount')::integer,
	a->>'interestRate',
	(a->>'loanTerm')::integer,
	(a->>'monthlyPayment')::integer,
	(a->>'downPayment')::integer,
	(a->>'monthlyIncome')::integer,
	a->>'employmentStatus',
	(a->>'creditScore')::integer,
	(a->>'affordabilityRatio')::double precision,
	(a->>'outstandingBalance')::integer,
	COALESCE(a->>'bankName', 'Unknown'),
	a->>'bankBranch',
	a->>'loanOfficer',
	a->>'loanOfficerContact',
	COALESCE(a->>'status', 'pending')::mortgage_status,
	a->>'rejectionReason',
	COALESCE((a->>'submittedAt')::timestamptz, now()),
	(a->>'reviewedAt')::timestamptz,
	(a->>'approvedAt')::timestamptz,
	(a->>'rejectedAt')::timestamptz,
	(a->>'disbursedAt')::timestamptz,
	COALESCE(a->'metadata', '{}'::jsonb),
	COALESCE((a->>'createdAt')::timestamptz, now()),
	COALESCE((a->>'updatedAt')::timestamptz, now())
FROM "repository_stores" s,
	LATERAL jsonb_array_elements(s."data"->'applications') a
WHERE s."collection" = 'mortgage-application-store'
	AND EXISTS (SELECT 1 FROM "users" u WHERE u."id" = (a->>'applicantId')::integer)
	AND EXISTS (SELECT 1 FROM "parcels" p WHERE p."id" = (a->>'parcelId')::integer)
ON CONFLICT ("application_id") DO NOTHING;
--> statement-breakpoint

INSERT INTO "mortgage_workflow_events" ("application_id", "status", "title", "description", "actor_id", "created_at")
SELECT
	e->>'applicationId',
	COALESCE(e->>'status', 'pending')::mortgage_status,
	COALESCE(e->>'title', 'Workflow event'),
	e->>'description',
	(e->>'actorId')::integer,
	COALESCE((e->>'createdAt')::timestamptz, now())
FROM "repository_stores" s,
	LATERAL jsonb_array_elements(s."data"->'workflowEvents') e
WHERE s."collection" = 'mortgage-application-store'
	AND EXISTS (SELECT 1 FROM "mortgage_applications" m WHERE m."application_id" = e->>'applicationId')
	AND NOT EXISTS (
		SELECT 1 FROM "mortgage_workflow_events" w
		WHERE w."application_id" = e->>'applicationId'
			AND w."status" = COALESCE(e->>'status', 'pending')::mortgage_status
			AND w."created_at" = COALESCE((e->>'createdAt')::timestamptz, now())
	);
--> statement-breakpoint

-- 4. restore mortgage_decision_explanations FK (now satisfiable) --------------
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'mortgage_decision_explanations_application_id_mortgage_applica'
	) AND NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'mortgage_decision_explanations_application_id_mortgage_applications_id_fk'
	) THEN
		ALTER TABLE "mortgage_decision_explanations"
			ADD CONSTRAINT "mortgage_decision_explanations_application_id_mortgage_applications_id_fk"
			FOREIGN KEY ("application_id") REFERENCES "public"."mortgage_applications"("id")
			ON DELETE no action ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

-- 5. drop the legacy transactions table ---------------------------------------
-- The 0014 repair migration created inline FKs from the 8 domain tables to the
-- legacy transactions.transaction_id code; those constraints must go first.
ALTER TABLE "mortgage_applications" DROP CONSTRAINT IF EXISTS "mortgage_applications_transaction_id_fkey";
--> statement-breakpoint
ALTER TABLE "tax_clearances" DROP CONSTRAINT IF EXISTS "tax_clearances_transaction_id_fkey";
--> statement-breakpoint
ALTER TABLE "insurance_policies" DROP CONSTRAINT IF EXISTS "insurance_policies_transaction_id_fkey";
--> statement-breakpoint
ALTER TABLE "legal_documents" DROP CONSTRAINT IF EXISTS "legal_documents_transaction_id_fkey";
--> statement-breakpoint
ALTER TABLE "cadastral_surveys" DROP CONSTRAINT IF EXISTS "cadastral_surveys_transaction_id_fkey";
--> statement-breakpoint
ALTER TABLE "environmental_assessments" DROP CONSTRAINT IF EXISTS "environmental_assessments_transaction_id_fkey";
--> statement-breakpoint
ALTER TABLE "public_notices" DROP CONSTRAINT IF EXISTS "public_notices_transaction_id_fkey";
--> statement-breakpoint
ALTER TABLE "land_use_plans" DROP CONSTRAINT IF EXISTS "land_use_plans_transaction_id_fkey";
--> statement-breakpoint
DROP TABLE IF EXISTS "transactions";
