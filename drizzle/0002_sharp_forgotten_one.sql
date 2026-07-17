ALTER TABLE "email_queue" ADD COLUMN "status" varchar(20) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_queue" ADD COLUMN "scheduled_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "email_queue_status_idx" ON "email_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_queue_scheduled_at_idx" ON "email_queue" USING btree ("scheduled_at");