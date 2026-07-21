-- Gap 1: RLS Tenant Isolation — schema columns only
-- The actual ENABLE ROW LEVEL SECURITY and CREATE POLICY statements
-- are applied at production startup via server/rlsSetup.ts (not in migrations)
-- because PGlite (used in tests) does not support RLS DDL.
DO $rls_cols$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'state_code'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "state_code" varchar(3) NOT NULL DEFAULT 'FED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'tenant_code'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "tenant_code" varchar(20) NOT NULL DEFAULT 'FED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parcels' AND column_name = 'tenant_code'
  ) THEN
    ALTER TABLE "parcels" ADD COLUMN "tenant_code" varchar(20) NOT NULL DEFAULT 'FED';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'RLS column migration skipped: %', SQLERRM;
END;
$rls_cols$;
