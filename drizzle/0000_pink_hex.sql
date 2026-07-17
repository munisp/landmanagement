CREATE TYPE "public"."email_status" AS ENUM('pending', 'sent', 'failed', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('parcel', 'transaction');--> statement-breakpoint
CREATE TYPE "public"."notification_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('user_registration', 'suspicious_activity', 'system_error', 'verification_request', 'verification_approved', 'verification_rejected', 'transaction_initiated', 'transaction_completed', 'document_uploaded', 'role_changed', 'user_suspended');--> statement-breakpoint
CREATE TYPE "public"."report_format" AS ENUM('pdf', 'excel', 'csv');--> statement-breakpoint
CREATE TYPE "public"."report_frequency" AS ENUM('once', 'daily', 'weekly', 'monthly', 'custom');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'generating', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'surveyor', 'registrar', 'admin');--> statement-breakpoint
CREATE TYPE "public"."security_event_type" AS ENUM('failed_login', 'suspicious_activity', 'unusual_access', 'account_lockout', 'ip_blocked', 'password_reset', 'role_escalation');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"type" varchar(64) NOT NULL,
	"description" text NOT NULL,
	"metadata" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_notifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"recipient_id" integer NOT NULL,
	"type" "notification_type" NOT NULL,
	"priority" "notification_priority" DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_daily_metrics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "analytics_daily_metrics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"date" varchar(10) NOT NULL,
	"total_transactions" integer DEFAULT 0 NOT NULL,
	"total_revenue" integer DEFAULT 0 NOT NULL,
	"total_parcels" integer DEFAULT 0 NOT NULL,
	"new_parcels" integer DEFAULT 0 NOT NULL,
	"verification_requests" integer DEFAULT 0 NOT NULL,
	"verifications_approved" integer DEFAULT 0 NOT NULL,
	"verifications_rejected" integer DEFAULT 0 NOT NULL,
	"avg_processing_time_hours" integer DEFAULT 0 NOT NULL,
	"active_users" integer DEFAULT 0 NOT NULL,
	"new_users" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_daily_metrics_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "blockchain_transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "blockchain_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"transaction_type" varchar(64) NOT NULL,
	"parcel_id" varchar(64),
	"tx_hash" varchar(128) NOT NULL,
	"block_number" integer,
	"from_address" varchar(64) NOT NULL,
	"to_address" varchar(64),
	"contract_address" varchar(64),
	"gas_used" varchar(32),
	"gas_fee" varchar(32),
	"status" varchar(20) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_at" timestamp,
	CONSTRAINT "blockchain_transactions_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "blocked_ips" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "blocked_ips_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ip_address" varchar(45) NOT NULL,
	"reason" text NOT NULL,
	"blocked_by" integer NOT NULL,
	"blocked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "blocked_ips_ip_address_unique" UNIQUE("ip_address")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "comments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"entityType" "entity_type" NOT NULL,
	"entityId" varchar(64) NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_processing_results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "document_processing_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"verification_document_id" integer NOT NULL,
	"document_type" varchar(64) NOT NULL,
	"extracted_text" text,
	"extracted_data" jsonb,
	"fraud_score" integer,
	"fraud_indicators" jsonb,
	"validation_status" varchar(20) NOT NULL,
	"validated_by" integer,
	"validated_at" timestamp,
	"validation_notes" text,
	"processing_time_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "email_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"recipient_email" varchar(320) NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"failed_at" timestamp,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_queue" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "email_queue_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"recipient_email" varchar(320) NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"last_attempt_at" timestamp,
	"next_retry_at" timestamp,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_data" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "field_data_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"parcel_id" varchar(64),
	"latitude" varchar(20) NOT NULL,
	"longitude" varchar(20) NOT NULL,
	"accuracy" integer,
	"photos" jsonb,
	"notes" text,
	"form_data" jsonb,
	"sync_status" varchar(20) DEFAULT 'synced' NOT NULL,
	"captured_at" timestamp NOT NULL,
	"synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "login_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"email" varchar(320),
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text,
	"success" boolean NOT NULL,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "report_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scheduled_report_id" integer,
	"user_id" integer NOT NULL,
	"report_name" text NOT NULL,
	"report_type" varchar(64) NOT NULL,
	"format" "report_format" NOT NULL,
	"status" "report_status" NOT NULL,
	"file_url" text,
	"file_size" integer,
	"filters" text,
	"selected_fields" text,
	"error_message" text,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "report_templates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "report_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"report_type" varchar(64) NOT NULL,
	"default_fields" text,
	"default_filters" text,
	"is_system_template" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "saved_searches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"query" json NOT NULL,
	"isFavorite" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_reports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scheduled_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"report_type" varchar(64) NOT NULL,
	"frequency" "report_frequency" NOT NULL,
	"cron_expression" varchar(128),
	"format" "report_format" NOT NULL,
	"email_delivery" boolean DEFAULT false NOT NULL,
	"email_recipients" text,
	"filters" text,
	"selected_fields" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "security_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"event_type" "security_event_type" NOT NULL,
	"severity" varchar(20) NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text,
	"description" text NOT NULL,
	"metadata" jsonb,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" integer,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"suspended_at" timestamp,
	"suspended_by" integer,
	"suspension_reason" text,
	"last_active" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "verification_documents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verification_documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"verification_request_id" integer NOT NULL,
	"document_type" varchar(64) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(64) NOT NULL,
	"uploaded_by" integer NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by" integer,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verification_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"verification_request_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"action" varchar(64) NOT NULL,
	"previous_status" "verification_status",
	"new_status" "verification_status",
	"comment" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verification_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parcel_id" varchar(64) NOT NULL,
	"requester_id" integer NOT NULL,
	"reviewer_id" integer,
	"status" "verification_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"reviewed_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"blockchain_tx_hash" varchar(128),
	"notes" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_notifications" ADD CONSTRAINT "admin_notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blockchain_transactions" ADD CONSTRAINT "blockchain_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_ips" ADD CONSTRAINT "blocked_ips_blocked_by_users_id_fk" FOREIGN KEY ("blocked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processing_results" ADD CONSTRAINT "document_processing_results_verification_document_id_verification_documents_id_fk" FOREIGN KEY ("verification_document_id") REFERENCES "public"."verification_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processing_results" ADD CONSTRAINT "document_processing_results_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_data" ADD CONSTRAINT "field_data_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_history" ADD CONSTRAINT "report_history_scheduled_report_id_scheduled_reports_id_fk" FOREIGN KEY ("scheduled_report_id") REFERENCES "public"."scheduled_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_history" ADD CONSTRAINT "report_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_suspended_by_users_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_verification_request_id_verification_requests_id_fk" FOREIGN KEY ("verification_request_id") REFERENCES "public"."verification_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_history" ADD CONSTRAINT "verification_history_verification_request_id_verification_requests_id_fk" FOREIGN KEY ("verification_request_id") REFERENCES "public"."verification_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_history" ADD CONSTRAINT "verification_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_notifications_recipient_idx" ON "admin_notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "admin_notifications_type_idx" ON "admin_notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "admin_notifications_read_idx" ON "admin_notifications" USING btree ("read");--> statement-breakpoint
CREATE INDEX "admin_notifications_created_at_idx" ON "admin_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "analytics_daily_metrics_date_idx" ON "analytics_daily_metrics" USING btree ("date");--> statement-breakpoint
CREATE INDEX "blockchain_transactions_user_idx" ON "blockchain_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "blockchain_transactions_tx_hash_idx" ON "blockchain_transactions" USING btree ("tx_hash");--> statement-breakpoint
CREATE INDEX "blockchain_transactions_status_idx" ON "blockchain_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blocked_ips_ip_idx" ON "blocked_ips" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "blocked_ips_active_idx" ON "blocked_ips" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "document_processing_results_doc_idx" ON "document_processing_results" USING btree ("verification_document_id");--> statement-breakpoint
CREATE INDEX "document_processing_results_status_idx" ON "document_processing_results" USING btree ("validation_status");--> statement-breakpoint
CREATE INDEX "email_logs_status_idx" ON "email_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_logs_recipient_idx" ON "email_logs" USING btree ("recipient_email");--> statement-breakpoint
CREATE INDEX "email_queue_next_retry_idx" ON "email_queue" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX "field_data_user_idx" ON "field_data" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "field_data_parcel_idx" ON "field_data" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "field_data_sync_status_idx" ON "field_data" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "login_attempts_user_idx" ON "login_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "login_attempts_success_idx" ON "login_attempts" USING btree ("success");--> statement-breakpoint
CREATE INDEX "login_attempts_created_at_idx" ON "login_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "security_events_user_idx" ON "security_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_events_type_idx" ON "security_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "security_events_severity_idx" ON "security_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "security_events_created_at_idx" ON "security_events" USING btree ("created_at");