/**
 * Authentication audit trail.
 *
 * Persists security-relevant authentication events (logins, token decisions,
 * WebSocket auth failures, API-key decisions) to the activity_logs table so
 * operators can investigate incidents from durable records instead of
 * ephemeral stdout. Writes are best-effort: an audit failure must never
 * break the request path, so errors are logged and swallowed.
 */
import { activityLogs } from '../drizzle/schema';
import { requireDb } from './db';

export type AuthAuditEventType =
  | 'login_success'
  | 'login_failed'
  | 'token_verified'
  | 'token_rejected'
  | 'ws_auth_failed'
  | 'preview_login_blocked'
  | 'api_key_rejected'
  | 'api_key_accepted';

export async function recordAuthEvent(params: {
  type: AuthAuditEventType;
  userId?: number | null;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await requireDb();
    await db.insert(activityLogs).values({
      userId: params.userId ?? null,
      type: params.type,
      description: params.description,
      metadata: params.metadata ?? null,
    });
  } catch (error) {
    console.warn('[AuthAudit] failed to persist event:', (error as Error).message);
  }
}
