CREATE TYPE "public"."document_type" AS ENUM('income_statement', 'employment_letter', 'bank_statement', 'tax_return', 'pay_stub', 'identification', 'proof_of_address', 'credit_report', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_verification_status" AS ENUM('pending', 'processing', 'verified', 'rejected', 'requires_review');--> statement-breakpoint
CREATE TABLE "document_verifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "document_verifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"verification_id" varchar(64) NOT NULL,
	"application_id" integer NOT NULL,
	"document_type" "document_type" NOT NULL,
	"document_url" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"status" "document_verification_status" DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp,
	"verified_by" integer,
	"ocr_text" text,
	"ocr_confidence" integer,
	"ocr_engine" varchar(50),
	"extracted_data" text,
	"fraud_score" integer,
	"fraud_flags" text,
	"authenticity_score" integer,
	"review_notes" text,
	"rejection_reason" text,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_verifications_verification_id_unique" UNIQUE("verification_id")
);
--> statement-breakpoint
CREATE TABLE "verification_audit_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verification_audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"verification_id" integer NOT NULL,
	"action" varchar(100) NOT NULL,
	"performed_by" integer,
	"previous_status" "document_verification_status",
	"new_status" "document_verification_status",
	"details" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_verifications" ADD CONSTRAINT "document_verifications_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_audit_log" ADD CONSTRAINT "verification_audit_log_verification_id_document_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."document_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_audit_log" ADD CONSTRAINT "verification_audit_log_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_verifications_application_idx" ON "document_verifications" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "document_verifications_status_idx" ON "document_verifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "document_verifications_document_type_idx" ON "document_verifications" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "verification_audit_log_verification_idx" ON "verification_audit_log" USING btree ("verification_id");--> statement-breakpoint
CREATE INDEX "verification_audit_log_created_at_idx" ON "verification_audit_log" USING btree ("createdAt");