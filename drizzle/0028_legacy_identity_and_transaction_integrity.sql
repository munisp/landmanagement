-- Repair legacy seeded references before enforcing the foreign keys required by
-- registry, title, payment, and workflow business paths. The identities are
-- derived from existing seeded transaction/title records; no synthetic runtime
-- fallback is introduced.

INSERT INTO "users" ("id", "openId", "name", "role") OVERRIDING SYSTEM VALUE VALUES
  (2, 'legacy:seed:chinedu-okafor-holdings', 'Chinedu Okafor Holdings', 'user'),
  (3, 'legacy:seed:musa-garba-farms', 'Musa Garba Farms', 'user'),
  (4, 'legacy:seed:industrial-assets-limited', 'Industrial Assets Limited', 'user')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

SELECT setval(
  pg_get_serial_sequence('users', 'id'),
  GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "users"), 4)
);
--> statement-breakpoint

DO $transaction_integrity$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registry_transactions_parcel_id_parcels_id_fk') THEN
    ALTER TABLE "registry_transactions"
      ADD CONSTRAINT "registry_transactions_parcel_id_parcels_id_fk"
      FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registry_transactions_initiator_id_users_id_fk') THEN
    ALTER TABLE "registry_transactions"
      ADD CONSTRAINT "registry_transactions_initiator_id_users_id_fk"
      FOREIGN KEY ("initiator_id") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registry_transactions_title_id_titles_id_fk') THEN
    ALTER TABLE "registry_transactions"
      ADD CONSTRAINT "registry_transactions_title_id_titles_id_fk"
      FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'titles_parcel_id_parcels_id_fk') THEN
    ALTER TABLE "titles"
      ADD CONSTRAINT "titles_parcel_id_parcels_id_fk"
      FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'titles_owner_id_users_id_fk') THEN
    ALTER TABLE "titles"
      ADD CONSTRAINT "titles_owner_id_users_id_fk"
      FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_payer_id_users_id_fk') THEN
    ALTER TABLE "payments"
      ADD CONSTRAINT "payments_payer_id_users_id_fk"
      FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;
END;
$transaction_integrity$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ml_training_examples_model_label_created_idx"
  ON "ml_training_examples" ("model_name", "label", "created_at" DESC);
