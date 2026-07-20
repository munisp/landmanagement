CREATE INDEX IF NOT EXISTS "registry_transactions_parcel_status_idx"
  ON "registry_transactions" ("parcel_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registry_transactions_initiator_status_idx"
  ON "registry_transactions" ("initiator_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registry_transactions_type_status_idx"
  ON "registry_transactions" ("type", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registry_transactions_created_at_idx"
  ON "registry_transactions" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parcels_state_status_idx"
  ON "parcels" ("state", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parcels_land_use_status_idx"
  ON "parcels" ("land_use", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parcels_state_lga_idx"
  ON "parcels" ("state", "lga");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parcels_created_at_idx"
  ON "parcels" ("createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "titles_parcel_status_idx"
  ON "titles" ("parcel_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "titles_title_number_idx"
  ON "titles" ("title_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_requests_parcel_status_idx"
  ON "verification_requests" ("parcel_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_requests_reviewer_status_idx"
  ON "verification_requests" ("reviewer_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_payer_status_idx"
  ON "payments" ("payer_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_user_type_idx"
  ON "activity_logs" ("userId", "type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_created_at_idx"
  ON "activity_logs" ("createdAt");
