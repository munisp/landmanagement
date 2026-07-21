/**
 * Production RLS Setup
 * Applies PostgreSQL Row-Level Security policies at server startup.
 * This is intentionally NOT a Drizzle migration because:
 *   1. PGlite (test environment) does not support RLS DDL
 *   2. RLS policies need to be applied after the schema is fully set up
 *   3. Policies may need to be updated without a full migration
 *
 * Called from server/index.ts on production startup only.
 */

import { requireDb } from "./db";

const RLS_POLICIES = `
-- Enable RLS on core tables
ALTER TABLE "parcels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "titles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registry_transactions" ENABLE ROW LEVEL SECURITY;

-- Parcels: users can only see parcels in their state (or FED users see all)
DROP POLICY IF EXISTS "parcels_tenant_isolation" ON "parcels";
CREATE POLICY "parcels_tenant_isolation" ON "parcels"
  USING (
    current_setting('app.current_state_code', true) = 'FED'
    OR tenant_code = current_setting('app.current_state_code', true)
    OR tenant_code = 'FED'
  );

-- Titles: same tenant isolation
DROP POLICY IF EXISTS "titles_tenant_isolation" ON "titles";
CREATE POLICY "titles_tenant_isolation" ON "titles"
  USING (
    current_setting('app.current_state_code', true) = 'FED'
    OR EXISTS (
      SELECT 1 FROM "parcels" p
      WHERE p.id = "titles".parcel_id
      AND (p.tenant_code = current_setting('app.current_state_code', true) OR p.tenant_code = 'FED')
    )
  );

-- Registry transactions: same tenant isolation
DROP POLICY IF EXISTS "transactions_tenant_isolation" ON "registry_transactions";
CREATE POLICY "transactions_tenant_isolation" ON "registry_transactions"
  USING (
    current_setting('app.current_state_code', true) = 'FED'
    OR EXISTS (
      SELECT 1 FROM "parcels" p
      WHERE p.id = "registry_transactions".parcel_id
      AND (p.tenant_code = current_setting('app.current_state_code', true) OR p.tenant_code = 'FED')
    )
  );
`;

export async function applyRLSPolicies(): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    console.log("[RLS] Skipping RLS setup in test environment");
    return;
  }
  if (process.env.SKIP_RLS_SETUP === "true") {
    console.log("[RLS] Skipping RLS setup (SKIP_RLS_SETUP=true)");
    return;
  }
  try {
    const db = await requireDb();
    await db.execute(RLS_POLICIES as any);
    console.log("[RLS] Row-Level Security policies applied successfully");
  } catch (err: any) {
    // RLS setup failure is non-fatal in development; fatal in production
    if (process.env.NODE_ENV === "production") {
      console.error("[RLS] FATAL: Failed to apply RLS policies:", err.message);
      throw err;
    } else {
      console.warn("[RLS] Warning: Failed to apply RLS policies (non-fatal in dev):", err.message);
    }
  }
}

/**
 * Set the tenant context for the current database session.
 * Must be called at the start of every request.
 */
export async function setTenantContext(userId: number, stateCode: string): Promise<void> {
  const db = await requireDb();
  await db.execute(
    `SELECT set_config('app.current_user_id', '${userId}', true), set_config('app.current_state_code', '${stateCode}', true)` as any
  );
}
