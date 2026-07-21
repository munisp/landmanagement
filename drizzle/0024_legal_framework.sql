DO $legal_migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_signatures') THEN
    CREATE TABLE "document_signatures" (
      "id" serial PRIMARY KEY,
      "document_id" varchar(255) NOT NULL UNIQUE,
      "document_type" varchar(100) NOT NULL,
      "parcel_id" varchar(255),
      "document_hash" varchar(64) NOT NULL,
      "signature" text NOT NULL,
      "chain_entry_hash" varchar(64) NOT NULL,
      "chain_sequence" integer NOT NULL DEFAULT 1,
      "signed_by" integer,
      "signed_at" timestamptz NOT NULL DEFAULT now(),
      "legally_binding" boolean NOT NULL DEFAULT true,
      "legal_basis" text,
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gazette_notices') THEN
    CREATE TABLE "gazette_notices" (
      "id" serial PRIMARY KEY,
      "gnn" varchar(50) NOT NULL UNIQUE,
      "notice_type" varchar(100) NOT NULL,
      "status" varchar(50) NOT NULL DEFAULT 'PENDING',
      "state_code" varchar(3) NOT NULL,
      "lga_code" varchar(10),
      "title" text NOT NULL,
      "description" text,
      "authorized_by" varchar(255) NOT NULL,
      "authorizer_title" varchar(255),
      "legal_basis" text,
      "document_hash" varchar(64),
      "effective_date" date,
      "submitted_by" integer,
      "submitted_at" timestamptz NOT NULL DEFAULT now(),
      "published_at" timestamptz,
      "gazette_volume" varchar(50),
      "gazette_page" integer,
      "legally_binding" boolean NOT NULL DEFAULT false,
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gazette_parcel_links') THEN
    CREATE TABLE "gazette_parcel_links" (
      "id" serial PRIMARY KEY,
      "gazette_id" integer NOT NULL,
      "parcel_id" varchar(255) NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'identity_verifications') THEN
    CREATE TABLE "identity_verifications" (
      "id" serial PRIMARY KEY,
      "user_id" integer,
      "nin" varchar(11),
      "bvn" varchar(11),
      "verification_status" varchar(50) NOT NULL DEFAULT 'PENDING',
      "verification_method" varchar(50) NOT NULL DEFAULT 'NIN',
      "verified_name" varchar(255),
      "verified_dob" date,
      "verified_phone" varchar(20),
      "biometric_score" numeric(5,4),
      "nimc_reference" varchar(100),
      "verified_at" timestamptz,
      "expires_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    );
  END IF;
  BEGIN CREATE INDEX IF NOT EXISTS "idx_doc_sigs_parcel" ON "document_signatures"("parcel_id"); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN CREATE INDEX IF NOT EXISTS "idx_gazette_state" ON "gazette_notices"("state_code","status"); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN CREATE INDEX IF NOT EXISTS "idx_identity_user" ON "identity_verifications"("user_id"); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN CREATE INDEX IF NOT EXISTS "idx_identity_nin" ON "identity_verifications"("nin"); EXCEPTION WHEN OTHERS THEN NULL; END;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Legal framework migration skipped: %', SQLERRM;
END;
$legal_migration$;
