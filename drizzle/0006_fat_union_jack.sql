CREATE TYPE "public"."insurance_policy_status" AS ENUM('pending', 'active', 'expired', 'cancelled', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."escrow_transaction_type" AS ENUM('deposit', 'withdrawal', 'insurance_payment', 'tax_payment', 'adjustment', 'refund');--> statement-breakpoint
CREATE TABLE "escrow_accounts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "escrow_accounts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"account_number" varchar(64) NOT NULL,
	"application_id" integer NOT NULL,
	"current_balance" integer DEFAULT 0 NOT NULL,
	"required_balance" integer NOT NULL,
	"monthly_contribution" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "escrow_accounts_account_number_unique" UNIQUE("account_number")
);
--> statement-breakpoint
CREATE TABLE "escrow_transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "escrow_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"transaction_id" varchar(64) NOT NULL,
	"escrow_account_id" integer NOT NULL,
	"transaction_type" "escrow_transaction_type" NOT NULL,
	"amount" integer NOT NULL,
	"description" text,
	"policy_id" integer,
	"payment_transaction_id" integer,
	"balance_after" integer NOT NULL,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "escrow_transactions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "mortgage_insurance_policies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mortgage_insurance_policies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"policy_number" varchar(64) NOT NULL,
	"application_id" integer NOT NULL,
	"insurance_provider" varchar(255) NOT NULL,
	"policy_type" varchar(100) NOT NULL,
	"coverage_amount" integer NOT NULL,
	"annual_premium" integer NOT NULL,
	"monthly_premium" integer NOT NULL,
	"effective_date" timestamp NOT NULL,
	"expiration_date" timestamp NOT NULL,
	"renewal_date" timestamp,
	"status" "insurance_policy_status" DEFAULT 'pending' NOT NULL,
	"last_premium_paid_date" timestamp,
	"next_premium_due_date" timestamp,
	"policy_document_url" text,
	"certificate_url" text,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mortgage_insurance_policies_policy_number_unique" UNIQUE("policy_number")
);
--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_escrow_account_id_escrow_accounts_id_fk" FOREIGN KEY ("escrow_account_id") REFERENCES "public"."escrow_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_policy_id_mortgage_insurance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."mortgage_insurance_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_payment_transaction_id_mortgage_payment_transactions_id_fk" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."mortgage_payment_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "escrow_accounts_application_idx" ON "escrow_accounts" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "escrow_accounts_is_active_idx" ON "escrow_accounts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "escrow_transactions_escrow_account_idx" ON "escrow_transactions" USING btree ("escrow_account_id");--> statement-breakpoint
CREATE INDEX "escrow_transactions_transaction_type_idx" ON "escrow_transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "escrow_transactions_created_at_idx" ON "escrow_transactions" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "mortgage_insurance_policies_application_idx" ON "mortgage_insurance_policies" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "mortgage_insurance_policies_status_idx" ON "mortgage_insurance_policies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mortgage_insurance_policies_expiration_idx" ON "mortgage_insurance_policies" USING btree ("expiration_date");