-- Migration 0012: Move core domain repositories (parcels, registry transactions,
-- payments, titles) from JSON file stores to PostgreSQL persistence.
-- Also removes the instant-payment simulation: all payments are persisted as
-- 'pending' and reach 'completed' only through explicit confirmation.

-- 1. Parcels: extend the existing table with the fields the domain repository
--    actually serves (survey/LGA metadata, valuation, verification trail).
ALTER TYPE "public"."parcel_status" ADD VALUE IF NOT EXISTS 'pending_verification';--> statement-breakpoint
ALTER TYPE "public"."parcel_status" ADD VALUE IF NOT EXISTS 'verified';--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN IF NOT EXISTS "parcel_number" varchar(64);--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN IF NOT EXISTS "lga" varchar(128);--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN IF NOT EXISTS "ward" varchar(128);--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN IF NOT EXISTS "estimated_value" bigint;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN IF NOT EXISTS "geometry_geojson" text;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN IF NOT EXISTS "boundary_coordinates" text;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN IF NOT EXISTS "surveyor_id" varchar(64);--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN IF NOT EXISTS "verifier_id" varchar(64);--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN IF NOT EXISTS "verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN IF NOT EXISTS "notes" text;--> statement-breakpoint
ALTER TABLE "parcels" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "parcels" ALTER COLUMN "address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "parcels" ALTER COLUMN "area" TYPE double precision USING "area"::double precision;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "parcels_parcel_number_key" ON "parcels" ("parcel_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parcels_lga_idx" ON "parcels" ("lga");--> statement-breakpoint

-- 2. Registry transactions (workflow state machine for transfers, mortgages,
--    title perfection). Distinct from the legacy "transactions" table which is
--    consumed by smart-contract/reporting services.
CREATE TABLE IF NOT EXISTS "registry_transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "registry_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" varchar(64) NOT NULL,
	"parcel_id" integer NOT NULL,
	"initiator_id" integer NOT NULL,
	"initiator_name" varchar(255) NOT NULL,
	"counterparty_name" varchar(255),
	"title_id" integer,
	"status" varchar(32) DEFAULT 'pending_approval' NOT NULL,
	"consideration_amount" bigint DEFAULT 0 NOT NULL,
	"workflow_stage" varchar(64) DEFAULT 'submission' NOT NULL,
	"payment_status" varchar(16) DEFAULT 'unpaid' NOT NULL,
	"document_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"external_reference" varchar(128),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registry_transactions_parcel_idx" ON "registry_transactions" ("parcel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registry_transactions_status_idx" ON "registry_transactions" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "registry_transactions_external_ref_key" ON "registry_transactions" ("external_reference");--> statement-breakpoint

-- 3. Payments (real persisted payment records; completion only via confirmation).
CREATE TABLE IF NOT EXISTS "payments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"transaction_id" integer NOT NULL REFERENCES "registry_transactions"("id"),
	"payer_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	"fee_amount" bigint NOT NULL,
	"total_amount" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"method" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"reference" varchar(64) NOT NULL,
	"receipt_number" varchar(64),
	"channel_reference" varchar(128),
	"bank_name" varchar(255),
	"bank_account_name" varchar(255),
	"bank_account_number" varchar(32),
	"ussd_code" varchar(64),
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_reference_key" ON "payments" ("reference");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_transaction_idx" ON "payments" ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments" ("status");--> statement-breakpoint

-- 4. Titles (ownership instruments per parcel).
CREATE TABLE IF NOT EXISTS "titles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "titles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title_number" varchar(64) NOT NULL,
	"parcel_id" integer NOT NULL,
	"owner_id" integer NOT NULL,
	"owner_name" varchar(255) NOT NULL,
	"ownership_type" varchar(32) NOT NULL,
	"ownership_percentage" integer DEFAULT 100 NOT NULL,
	"title_type" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'pending_verification' NOT NULL,
	"issued_at" timestamp,
	"verified_at" timestamp,
	"encumbrance_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "titles_title_number_key" ON "titles" ("title_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "titles_parcel_idx" ON "titles" ("parcel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "titles_owner_idx" ON "titles" ("owner_id");--> statement-breakpoint

-- 5. Seed data (idempotent). Replaces the JSON file-store bootstrap records so
--    a fresh database serves the same baseline domain content the platform
--    previously seeded on first run.
INSERT INTO "parcels" ("id", "parcel_id", "owner_id", "address", "city", "state", "country", "latitude", "longitude", "area", "land_use", "status", "survey_plan_number", "parcel_number", "lga", "ward", "estimated_value", "geometry_geojson", "boundary_coordinates", "surveyor_id", "verifier_id", "verified_at", "notes", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES
	(1, 'LG-VI-2024-001', NULL, '123 Ahmadu Bello Way, Victoria Island', 'Victoria Island', 'Lagos', 'Nigeria', '6.4281', '3.4219', 1200.5, 'residential', 'verified', 'SP/2024/001', 'LG-VI-2024-001', 'Victoria Island', 'Ward 1', 150000000, '{"type":"Polygon","coordinates":[]}', '6.4281,3.4219;6.4285,3.4219;6.4285,3.4225;6.4281,3.4225', 'system', 'registry-admin', '2024-01-20T10:00:00.000Z', 'Prime coastal residential parcel with clear survey history.', '2024-01-15T09:00:00.000Z', '2024-01-20T10:00:00.000Z'),
	(2, 'AB-FCT-2024-002', NULL, '45 Herbert Macaulay Way, Garki', 'Garki', 'Abuja', 'Nigeria', '9.0428', '7.4891', 850, 'commercial', 'registered', 'SP/2024/002', 'AB-FCT-2024-002', 'Garki', 'Ward 3', 200000000, '{"type":"Polygon","coordinates":[]}', '9.0428,7.4891;9.0430,7.4891;9.0430,7.4895;9.0428,7.4895', 'system', 'registry-admin', '2024-02-12T13:00:00.000Z', 'Commercial asset with completed registry workflow.', '2024-02-10T09:00:00.000Z', '2024-02-12T13:00:00.000Z'),
	(3, 'KN-KN-2024-003', NULL, 'Plot 12 Murtala Mohammed Road', 'Kano Municipal', 'Kano', 'Nigeria', '12.0022', '8.5919', 2500, 'agricultural', 'pending_verification', 'SP/2024/003', 'KN-KN-2024-003', 'Kano Municipal', 'Ward 5', 50000000, '{"type":"Polygon","coordinates":[]}', '12.0022,8.5919;12.0027,8.5919;12.0027,8.5925;12.0022,8.5925', 'surveyor-1', NULL, NULL, 'Awaiting land office verification and title perfection.', '2024-03-01T09:00:00.000Z', '2024-03-01T09:00:00.000Z'),
	(4, 'LG-IK-2024-004', NULL, 'Plot 8 Industrial Avenue, Ikeja', 'Ikeja', 'Lagos', 'Nigeria', '6.6018', '3.3515', 3000, 'industrial', 'verified', 'SP/2024/004', 'LG-IK-2024-004', 'Ikeja', 'Ward 2', 300000000, '{"type":"Polygon","coordinates":[]}', '6.6018,3.3515;6.6022,3.3515;6.6022,3.3521;6.6018,3.3521', 'system', 'registry-admin', '2024-01-25T12:00:00.000Z', 'Industrial plot cleared for secured lending workflows.', '2024-01-20T09:00:00.000Z', '2024-01-25T12:00:00.000Z'),
	(5, 'AB-MA-2024-005', NULL, '15 Aguiyi Ironsi Street, Maitama', 'Maitama', 'Abuja', 'Nigeria', '9.0952', '7.4956', 1500, 'residential', 'verified', 'SP/2024/005', 'AB-MA-2024-005', 'Maitama', 'Ward 1', 250000000, '{"type":"Polygon","coordinates":[]}', '9.0952,7.4956;9.0956,7.4956;9.0956,7.4960;9.0952,7.4960', 'system', 'registry-admin', '2024-02-05T14:00:00.000Z', 'High-value residential parcel suitable for premium mortgage products.', '2024-02-01T09:00:00.000Z', '2024-02-05T14:00:00.000Z')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "registry_transactions" ("id", "type", "parcel_id", "initiator_id", "initiator_name", "counterparty_name", "title_id", "status", "consideration_amount", "workflow_stage", "payment_status", "document_status", "notes", "created_at", "updated_at") OVERRIDING SYSTEM VALUE VALUES
	(1, 'transfer', 1, 1, 'Amina Bello', 'Femi Adeyemi', 1, 'pending_approval', 175000000, 'registry_review', 'pending', 'verified', 'Awaiting registrar approval before payment release.', '2024-03-10T09:00:00.000Z', '2024-03-12T14:00:00.000Z'),
	(2, 'mortgage_registration', 4, 4, 'Industrial Assets Limited', 'Unity Commercial Bank', 4, 'registered', 120000000, 'registry_completed', 'paid', 'verified', 'Mortgage interest fully noted on title.', '2024-02-15T09:00:00.000Z', '2024-02-20T15:00:00.000Z'),
	(3, 'title_perfection', 3, 3, 'Musa Garba Farms', NULL, 3, 'in_review', 3500000, 'governor_consent', 'paid', 'submitted', 'Consent package submitted to state land bureau.', '2024-03-05T10:00:00.000Z', '2024-03-09T12:00:00.000Z')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "titles" ("id", "title_number", "parcel_id", "owner_id", "owner_name", "ownership_type", "ownership_percentage", "title_type", "status", "issued_at", "verified_at", "encumbrance_notes", "created_at", "updated_at") OVERRIDING SYSTEM VALUE VALUES
	(1, 'C-of-O-LG-VI-2024-001', 1, 1, 'Amina Bello', 'sole', 100, 'certificate_of_occupancy', 'verified', '2024-01-22T09:00:00.000Z', '2024-01-22T09:00:00.000Z', NULL, '2024-01-18T09:00:00.000Z', '2024-01-22T09:00:00.000Z'),
	(2, 'R-of-O-AB-FCT-2024-002', 2, 2, 'Chinedu Okafor Holdings', 'corporate', 100, 'right_of_occupancy', 'registered', '2024-02-14T11:00:00.000Z', '2024-02-13T15:00:00.000Z', NULL, '2024-02-11T09:00:00.000Z', '2024-02-14T11:00:00.000Z'),
	(3, 'DEED-KN-KN-2024-003', 3, 3, 'Musa Garba Farms', 'corporate', 100, 'deed_of_assignment', 'pending_verification', NULL, NULL, 'Awaiting governor consent and registry review.', '2024-03-02T09:00:00.000Z', '2024-03-02T09:00:00.000Z'),
	(4, 'C-of-O-LG-IK-2024-004', 4, 4, 'Industrial Assets Limited', 'corporate', 100, 'certificate_of_occupancy', 'encumbered', '2024-01-27T10:30:00.000Z', '2024-01-26T17:00:00.000Z', 'Registered mortgage in favor of Unity Commercial Bank.', '2024-01-23T09:00:00.000Z', '2024-02-28T10:00:00.000Z')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "payments" ("id", "transaction_id", "payer_id", "amount", "fee_amount", "total_amount", "currency", "method", "status", "reference", "receipt_number", "channel_reference", "bank_name", "bank_account_name", "bank_account_number", "paid_at", "created_at", "updated_at") OVERRIDING SYSTEM VALUE VALUES
	(1, 2, 4, 120000000, 3900000, 123900000, 'NGN', 'bank_transfer', 'completed', 'PAY-20240220-00001', 'RCP-20240220-00001', 'BANK-UNITY-20240220-4411', 'First Bank of Nigeria', 'IDLR-PTS Collections', '1234567890', '2024-02-20T15:30:00.000Z', '2024-02-20T15:30:00.000Z', '2024-02-20T15:30:00.000Z')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

-- 6. Keep identity sequences ahead of the seeded ids.
SELECT setval(pg_get_serial_sequence('parcels', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "parcels"), 5));--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('registry_transactions', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "registry_transactions"), 3));--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('titles', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "titles"), 4));--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('payments', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "payments"), 1));
