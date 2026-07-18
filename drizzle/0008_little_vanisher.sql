CREATE TYPE "public"."broker_status" AS ENUM('pending', 'active', 'suspended', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('pending', 'approved', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."commission_tier" AS ENUM('standard', 'premium', 'platinum', 'custom');--> statement-breakpoint
CREATE TYPE "public"."distribution_type" AS ENUM('interest', 'principal', 'fee');--> statement-breakpoint
CREATE TYPE "public"."investment_status" AS ENUM('pending', 'active', 'matured', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."investor_status" AS ENUM('active', 'inactive', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."investor_type" AS ENUM('institutional', 'individual', 'fund', 'bank');--> statement-breakpoint
CREATE TYPE "public"."loan_pool_status" AS ENUM('draft', 'active', 'closed', 'sold');--> statement-breakpoint
CREATE TYPE "public"."risk_tier" AS ENUM('aaa', 'aa', 'a', 'bbb', 'bb', 'b');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('pending', 'approved', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "broker_application_submissions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "broker_application_submissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"broker_id" integer NOT NULL,
	"application_id" integer NOT NULL,
	"client_id" integer,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"submission_notes" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "broker_clients" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "broker_clients_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"broker_id" integer NOT NULL,
	"client_name" varchar(255) NOT NULL,
	"client_email" varchar(255) NOT NULL,
	"client_phone" varchar(20) NOT NULL,
	"client_nin" varchar(20),
	"added_at" timestamp DEFAULT now() NOT NULL,
	"last_contact_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broker_commission_structures" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "broker_commission_structures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"broker_id" integer NOT NULL,
	"tier" "commission_tier" NOT NULL,
	"commission_rate" integer NOT NULL,
	"min_loan_amount" integer NOT NULL,
	"max_loan_amount" integer,
	"effective_from" timestamp NOT NULL,
	"effective_to" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broker_commissions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "broker_commissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"commission_id" varchar(64) NOT NULL,
	"broker_id" integer NOT NULL,
	"application_id" integer NOT NULL,
	"loan_amount" integer NOT NULL,
	"commission_rate" integer NOT NULL,
	"commission_amount" integer NOT NULL,
	"status" "commission_status" DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp,
	"approved_by" integer,
	"paid_at" timestamp,
	"payment_reference" varchar(128),
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "broker_commissions_commission_id_unique" UNIQUE("commission_id")
);
--> statement-breakpoint
CREATE TABLE "investment_distributions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "investment_distributions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"distribution_id" varchar(64) NOT NULL,
	"investment_id" integer NOT NULL,
	"distribution_type" "distribution_type" NOT NULL,
	"amount" integer NOT NULL,
	"distribution_date" timestamp NOT NULL,
	"payment_reference" varchar(128),
	"paid_at" timestamp,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "investment_distributions_distribution_id_unique" UNIQUE("distribution_id")
);
--> statement-breakpoint
CREATE TABLE "investors" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "investors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"investor_id" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"investor_name" varchar(255) NOT NULL,
	"investor_type" "investor_type" NOT NULL,
	"contact_email" varchar(255) NOT NULL,
	"contact_phone" varchar(20) NOT NULL,
	"min_investment_amount" integer NOT NULL,
	"max_investment_amount" integer,
	"preferred_risk_tiers" text,
	"status" "investor_status" DEFAULT 'active' NOT NULL,
	"total_invested" integer DEFAULT 0 NOT NULL,
	"total_returns" integer DEFAULT 0 NOT NULL,
	"active_investments" integer DEFAULT 0 NOT NULL,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "investors_investor_id_unique" UNIQUE("investor_id")
);
--> statement-breakpoint
CREATE TABLE "loan_pool_loans" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "loan_pool_loans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"pool_id" integer NOT NULL,
	"application_id" integer NOT NULL,
	"principal_amount" integer NOT NULL,
	"interest_rate" integer NOT NULL,
	"remaining_term" integer NOT NULL,
	"credit_score" integer,
	"loan_to_value" integer,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "loan_pools" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "loan_pools_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"pool_id" varchar(64) NOT NULL,
	"pool_name" varchar(255) NOT NULL,
	"description" text,
	"risk_tier" "risk_tier" NOT NULL,
	"total_loan_amount" integer DEFAULT 0 NOT NULL,
	"average_interest_rate" integer DEFAULT 0 NOT NULL,
	"weighted_average_maturity" integer DEFAULT 0 NOT NULL,
	"loan_count" integer DEFAULT 0 NOT NULL,
	"min_loan_amount" integer,
	"max_loan_amount" integer,
	"status" "loan_pool_status" DEFAULT 'draft' NOT NULL,
	"created_by" integer NOT NULL,
	"closed_at" timestamp,
	"sold_at" timestamp,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loan_pools_pool_id_unique" UNIQUE("pool_id")
);
--> statement-breakpoint
CREATE TABLE "mortgage_brokers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mortgage_brokers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"broker_id" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"license_number" varchar(100) NOT NULL,
	"license_expiry_date" timestamp NOT NULL,
	"business_phone" varchar(20) NOT NULL,
	"business_email" varchar(255) NOT NULL,
	"business_address" text NOT NULL,
	"status" "broker_status" DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp,
	"approved_by" integer,
	"default_commission_rate" integer NOT NULL,
	"total_applications" integer DEFAULT 0 NOT NULL,
	"approved_applications" integer DEFAULT 0 NOT NULL,
	"total_commission_earned" integer DEFAULT 0 NOT NULL,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mortgage_brokers_broker_id_unique" UNIQUE("broker_id"),
	CONSTRAINT "mortgage_brokers_license_number_unique" UNIQUE("license_number")
);
--> statement-breakpoint
CREATE TABLE "pool_investments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pool_investments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"investment_id" varchar(64) NOT NULL,
	"pool_id" integer NOT NULL,
	"investor_id" integer NOT NULL,
	"investment_amount" integer NOT NULL,
	"expected_return" integer NOT NULL,
	"expected_return_rate" integer NOT NULL,
	"investment_date" timestamp DEFAULT now() NOT NULL,
	"maturity_date" timestamp NOT NULL,
	"status" "investment_status" DEFAULT 'pending' NOT NULL,
	"total_distributions" integer DEFAULT 0 NOT NULL,
	"last_distribution_date" timestamp,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pool_investments_investment_id_unique" UNIQUE("investment_id")
);
--> statement-breakpoint
CREATE TABLE "servicing_rights_transfers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "servicing_rights_transfers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"transfer_id" varchar(64) NOT NULL,
	"pool_id" integer NOT NULL,
	"from_servicer" varchar(255) NOT NULL,
	"to_servicer" varchar(255) NOT NULL,
	"transfer_date" timestamp NOT NULL,
	"transfer_fee" integer NOT NULL,
	"status" "transfer_status" DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp,
	"approved_by" integer,
	"completed_at" timestamp,
	"notes" text,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "servicing_rights_transfers_transfer_id_unique" UNIQUE("transfer_id")
);
--> statement-breakpoint
ALTER TABLE "broker_application_submissions" ADD CONSTRAINT "broker_application_submissions_broker_id_mortgage_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."mortgage_brokers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_application_submissions" ADD CONSTRAINT "broker_application_submissions_client_id_broker_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."broker_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_clients" ADD CONSTRAINT "broker_clients_broker_id_mortgage_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."mortgage_brokers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_commission_structures" ADD CONSTRAINT "broker_commission_structures_broker_id_mortgage_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."mortgage_brokers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_commissions" ADD CONSTRAINT "broker_commissions_broker_id_mortgage_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."mortgage_brokers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_commissions" ADD CONSTRAINT "broker_commissions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_distributions" ADD CONSTRAINT "investment_distributions_investment_id_pool_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."pool_investments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investors" ADD CONSTRAINT "investors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_pool_loans" ADD CONSTRAINT "loan_pool_loans_pool_id_loan_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."loan_pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_pools" ADD CONSTRAINT "loan_pools_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage_brokers" ADD CONSTRAINT "mortgage_brokers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage_brokers" ADD CONSTRAINT "mortgage_brokers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_investments" ADD CONSTRAINT "pool_investments_pool_id_loan_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."loan_pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_investments" ADD CONSTRAINT "pool_investments_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing_rights_transfers" ADD CONSTRAINT "servicing_rights_transfers_pool_id_loan_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."loan_pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing_rights_transfers" ADD CONSTRAINT "servicing_rights_transfers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "broker_application_submissions_broker_idx" ON "broker_application_submissions" USING btree ("broker_id");--> statement-breakpoint
CREATE INDEX "broker_application_submissions_application_idx" ON "broker_application_submissions" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "broker_clients_broker_idx" ON "broker_clients" USING btree ("broker_id");--> statement-breakpoint
CREATE INDEX "broker_clients_email_idx" ON "broker_clients" USING btree ("client_email");--> statement-breakpoint
CREATE INDEX "broker_commission_structures_broker_idx" ON "broker_commission_structures" USING btree ("broker_id");--> statement-breakpoint
CREATE INDEX "broker_commission_structures_tier_idx" ON "broker_commission_structures" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "broker_commissions_broker_idx" ON "broker_commissions" USING btree ("broker_id");--> statement-breakpoint
CREATE INDEX "broker_commissions_application_idx" ON "broker_commissions" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "broker_commissions_status_idx" ON "broker_commissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "investment_distributions_investment_idx" ON "investment_distributions" USING btree ("investment_id");--> statement-breakpoint
CREATE INDEX "investment_distributions_distribution_date_idx" ON "investment_distributions" USING btree ("distribution_date");--> statement-breakpoint
CREATE INDEX "investors_user_idx" ON "investors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "investors_status_idx" ON "investors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "investors_type_idx" ON "investors" USING btree ("investor_type");--> statement-breakpoint
CREATE INDEX "loan_pool_loans_pool_idx" ON "loan_pool_loans" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "loan_pool_loans_application_idx" ON "loan_pool_loans" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "loan_pools_status_idx" ON "loan_pools" USING btree ("status");--> statement-breakpoint
CREATE INDEX "loan_pools_risk_tier_idx" ON "loan_pools" USING btree ("risk_tier");--> statement-breakpoint
CREATE INDEX "mortgage_brokers_user_idx" ON "mortgage_brokers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mortgage_brokers_status_idx" ON "mortgage_brokers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pool_investments_pool_idx" ON "pool_investments" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "pool_investments_investor_idx" ON "pool_investments" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "pool_investments_status_idx" ON "pool_investments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "servicing_rights_transfers_pool_idx" ON "servicing_rights_transfers" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "servicing_rights_transfers_status_idx" ON "servicing_rights_transfers" USING btree ("status");