/**
 * RLS Tenant Context Middleware
 * Sets PostgreSQL session variables for Row-Level Security policies.
 * Legal basis: Nigeria Land Use Act 1978 — state-level data sovereignty.
 */
import { sql } from "drizzle-orm";

export interface TenantContext {
  userId: number;
  stateCode: string;
  role: string;
}

export async function withTenantContext(
  db: any,
  userId: number,
  stateCode: string
): Promise<void> {
  await db.execute(sql`SELECT set_config('app.current_user_id', ${String(userId)}, true)`);
  await db.execute(sql`SELECT set_config('app.current_state_code', ${stateCode}, true)`);
}

export function extractTenantContext(user: any): TenantContext {
  return {
    userId: Number(user.id),
    stateCode: user.stateCode ?? user.state_code ?? "FED",
    role: user.role ?? "user",
  };
}
