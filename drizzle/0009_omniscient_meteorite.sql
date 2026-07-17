CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'delivered', 'failed', 'retrying');--> statement-breakpoint
CREATE TYPE "public"."webhook_event_type" AS ENUM('loan_status_changed', 'commission_paid', 'pool_created', 'pool_closed', 'application_submitted', 'application_approved', 'application_rejected', 'payment_received', 'payment_failed');--> statement-breakpoint
CREATE TABLE "webhook_delivery_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhook_delivery_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"endpoint_id" integer NOT NULL,
	"event_type" "webhook_event_type" NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"payload" text NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"http_status" integer,
	"response_body" text,
	"error_message" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_retry_at" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp,
	"signature" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhook_endpoints_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"url" varchar(500) NOT NULL,
	"secret" varchar(255) NOT NULL,
	"description" text,
	"event_types" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"last_delivery_at" timestamp,
	"total_deliveries" integer DEFAULT 0 NOT NULL,
	"successful_deliveries" integer DEFAULT 0 NOT NULL,
	"failed_deliveries" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_delivery_logs" ADD CONSTRAINT "webhook_delivery_logs_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_delivery_logs_endpoint_idx" ON "webhook_delivery_logs" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_logs_status_idx" ON "webhook_delivery_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_delivery_logs_event_type_idx" ON "webhook_delivery_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "webhook_delivery_logs_next_retry_idx" ON "webhook_delivery_logs" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_active_idx" ON "webhook_endpoints" USING btree ("active");