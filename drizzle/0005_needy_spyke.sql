CREATE TYPE "public"."payment_status" AS ENUM('pending', 'quote_received', 'reserved', 'committed', 'completed', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."mandate_status" AS ENUM('pending', 'active', 'suspended', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "auto_debit_mandates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auto_debit_mandates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"mandate_id" varchar(64) NOT NULL,
	"application_id" integer NOT NULL,
	"account_number" varchar(50) NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"bank_code" varchar(20) NOT NULL,
	"bank_name" varchar(255) NOT NULL,
	"max_amount" integer NOT NULL,
	"frequency" varchar(20) DEFAULT 'monthly' NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"gateway_provider" varchar(50) NOT NULL,
	"gateway_mandate_code" varchar(128) NOT NULL,
	"status" "mandate_status" DEFAULT 'pending' NOT NULL,
	"activated_at" timestamp,
	"suspended_at" timestamp,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"last_debit_at" timestamp,
	"next_debit_at" timestamp,
	"failed_debits_count" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auto_debit_mandates_mandate_id_unique" UNIQUE("mandate_id")
);
--> statement-breakpoint
CREATE TABLE "mortgage_payment_schedule" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mortgage_payment_schedule_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"schedule_id" varchar(64) NOT NULL,
	"application_id" integer NOT NULL,
	"payment_number" integer NOT NULL,
	"due_date" timestamp NOT NULL,
	"principal_amount" integer NOT NULL,
	"interest_amount" integer NOT NULL,
	"total_amount" integer NOT NULL,
	"remaining_balance" integer NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp,
	"payment_method" varchar(50),
	"is_overdue" boolean DEFAULT false NOT NULL,
	"late_fee" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mortgage_payment_schedule_schedule_id_unique" UNIQUE("schedule_id")
);
--> statement-breakpoint
CREATE TABLE "mortgage_payment_transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mortgage_payment_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"transaction_id" varchar(64) NOT NULL,
	"application_id" integer NOT NULL,
	"schedule_id" integer,
	"amount" integer NOT NULL,
	"principal_paid" integer NOT NULL,
	"interest_paid" integer NOT NULL,
	"late_fee" integer DEFAULT 0 NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"payment_gateway" varchar(50),
	"gateway_reference" varchar(128),
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"initiated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"failed_at" timestamp,
	"failure_reason" text,
	"receipt_url" text,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mortgage_payment_transactions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
ALTER TABLE "mortgage_payment_transactions" ADD CONSTRAINT "mortgage_payment_transactions_schedule_id_mortgage_payment_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."mortgage_payment_schedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_debit_mandates_application_idx" ON "auto_debit_mandates" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "auto_debit_mandates_status_idx" ON "auto_debit_mandates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "auto_debit_mandates_next_debit_at_idx" ON "auto_debit_mandates" USING btree ("next_debit_at");--> statement-breakpoint
CREATE INDEX "mortgage_payment_schedule_application_idx" ON "mortgage_payment_schedule" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "mortgage_payment_schedule_due_date_idx" ON "mortgage_payment_schedule" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "mortgage_payment_schedule_is_paid_idx" ON "mortgage_payment_schedule" USING btree ("is_paid");--> statement-breakpoint
CREATE INDEX "mortgage_payment_transactions_application_idx" ON "mortgage_payment_transactions" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "mortgage_payment_transactions_schedule_idx" ON "mortgage_payment_transactions" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "mortgage_payment_transactions_status_idx" ON "mortgage_payment_transactions" USING btree ("status");