/**
 * Security Monitoring Service
 * Tracks security events, detects threats, and manages IP blocking
 */

import { requireDb } from './db';
import { users } from '../drizzle/schema';
import { eq, and, gte, sql, desc } from 'drizzle-orm';

export type SecurityEventType =
  | 'login_failed'
  | 'login_success'
  | 'account_locked'
  | 'unusual_access'
  | 'role_changed'
  | 'multiple_ips'
  | 'suspicious_activity'
  | 'ip_blocked'
  | 'ip_unblocked';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEvent {
  id: number;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  userId: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  details: Record<string, any> | null;
  createdAt: Date;
}

export interface BlockedIP {
  id: number;
  ipAddress: string;
  reason: string;
  blockedBy: number | null;
  blockedAt: Date;
  expiresAt: Date | null;
  isPermanent: boolean;
  unblockedAt: Date | null;
  unblockedBy: number | null;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;
const FAILED_ATTEMPT_WINDOW_MINUTES = 15;

/**
 * Log a security event
 */
export async function logSecurityEvent(
  eventType: SecurityEventType,
  severity: SecuritySeverity,
  options: {
    userId?: number;
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, any>;
  }
): Promise<{ success: boolean; eventId?: number }> {
  try {
    const db = await requireDb();

    const result = await db.execute(sql`
      INSERT INTO security_events (event_type, severity, user_id, ip_address, user_agent, details, created_at)
      VALUES (
        ${eventType},
        ${severity},
        ${options.userId || null},
        ${options.ipAddress || null},
        ${options.userAgent || null},
        ${options.details ? JSON.stringify(options.details) : null},
        NOW()
      )
      RETURNING id
    `);

    const eventId = (Array.from(result)[0] as any)?.id;

    console.log(`[Security] Event logged: ${eventType} (${severity}) - Event ID: ${eventId}`);

    return { success: true, eventId };
  } catch (error) {
    console.error('[Security] Failed to log security event:', error);
    return { success: false };
  }
}

/**
 * Record a login attempt
 */
export async function recordLoginAttempt(
  email: string,
  ipAddress: string,
  success: boolean,
  options?: {
    userId?: number;
    failureReason?: string;
  }
): Promise<{ success: boolean; shouldLockAccount: boolean }> {
  try {
    const db = await requireDb();

    // Record the attempt
    await db.execute(sql`
      INSERT INTO login_attempts (user_id, email, ip_address, success, failure_reason, created_at)
      VALUES (
        ${options?.userId || null},
        ${email},
        ${ipAddress},
        ${success},
        ${options?.failureReason || null},
        NOW()
      )
    `);

    if (success) {
      // Log successful login
      await logSecurityEvent('login_success', 'low', {
        userId: options?.userId,
        ipAddress,
        details: { email },
      });

      return { success: true, shouldLockAccount: false };
    }

    // Check failed attempts in the window
    const result = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM login_attempts
      WHERE email = ${email}
        AND success = false
        AND created_at >= NOW() - INTERVAL '${FAILED_ATTEMPT_WINDOW_MINUTES} minutes'
    `);

    const failedCount = Number((Array.from(result)[0] as any)?.count || 0);

    // Log failed login
    await logSecurityEvent('login_failed', failedCount >= MAX_FAILED_ATTEMPTS - 1 ? 'high' : 'medium', {
      ipAddress,
      details: { email, failedCount },
    });

    if (failedCount >= MAX_FAILED_ATTEMPTS) {
      // Lock the account
      if (options?.userId) {
        await db
          .update(users)
          .set({
            suspendedAt: new Date(),
            suspendedReason: `Account locked due to ${failedCount} failed login attempts`,
          })
          .where(eq(users.id, options.userId));

        await logSecurityEvent('account_locked', 'critical', {
          userId: options.userId,
          ipAddress,
          details: { email, failedCount },
        });
      }

      // Consider blocking the IP
      await considerIPBlock(ipAddress, `${failedCount} failed login attempts for ${email}`);

      return { success: true, shouldLockAccount: true };
    }

    return { success: true, shouldLockAccount: false };
  } catch (error) {
    console.error('[Security] Failed to record login attempt:', error);
    return { success: false, shouldLockAccount: false };
  }
}

/**
 * Check if an IP is blocked
 */
export async function isIPBlocked(ipAddress: string): Promise<boolean> {
  try {
    const db = await requireDb();

    const result = await db.execute(sql`
      SELECT id
      FROM blocked_ips
      WHERE ip_address = ${ipAddress}
        AND unblocked_at IS NULL
        AND (is_permanent = true OR expires_at > NOW())
      LIMIT 1
    `);

    return Array.from(result).length > 0;
  } catch (error) {
    console.error('[Security] Failed to check IP block:', error);
    return false;
  }
}

/**
 * Block an IP address
 */
export async function blockIP(
  ipAddress: string,
  reason: string,
  options?: {
    blockedBy?: number;
    durationMinutes?: number;
    isPermanent?: boolean;
  }
): Promise<{ success: boolean }> {
  try {
    const db = await requireDb();

    const expiresAt = options?.isPermanent
      ? null
      : new Date(Date.now() + (options?.durationMinutes || 60) * 60 * 1000);

    await db.execute(sql`
      INSERT INTO blocked_ips (ip_address, reason, blocked_by, blocked_at, expires_at, is_permanent)
      VALUES (
        ${ipAddress},
        ${reason},
        ${options?.blockedBy || null},
        NOW(),
        ${expiresAt},
        ${options?.isPermanent || false}
      )
      ON CONFLICT (ip_address) DO UPDATE
      SET reason = EXCLUDED.reason,
          blocked_by = EXCLUDED.blocked_by,
          blocked_at = EXCLUDED.blocked_at,
          expires_at = EXCLUDED.expires_at,
          is_permanent = EXCLUDED.is_permanent,
          unblocked_at = NULL,
          unblocked_by = NULL
    `);

    await logSecurityEvent('ip_blocked', 'high', {
      ipAddress,
      details: { reason, isPermanent: options?.isPermanent, expiresAt },
    });

    console.log(`[Security] IP blocked: ${ipAddress} - ${reason}`);

    return { success: true };
  } catch (error) {
    console.error('[Security] Failed to block IP:', error);
    return { success: false };
  }
}

/**
 * Unblock an IP address
 */
export async function unblockIP(
  ipAddress: string,
  unblockedBy?: number
): Promise<{ success: boolean }> {
  try {
    const db = await requireDb();

    await db.execute(sql`
      UPDATE blocked_ips
      SET unblocked_at = NOW(),
          unblocked_by = ${unblockedBy || null}
      WHERE ip_address = ${ipAddress}
        AND unblocked_at IS NULL
    `);

    await logSecurityEvent('ip_unblocked', 'low', {
      ipAddress,
      details: { unblockedBy },
    });

    console.log(`[Security] IP unblocked: ${ipAddress}`);

    return { success: true };
  } catch (error) {
    console.error('[Security] Failed to unblock IP:', error);
    return { success: false };
  }
}

/**
 * Consider blocking an IP based on suspicious activity
 */
async function considerIPBlock(ipAddress: string, reason: string): Promise<void> {
  // Check recent failed attempts from this IP
  const db = await requireDb();

  const result = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM login_attempts
    WHERE ip_address = ${ipAddress}
      AND success = false
      AND created_at >= NOW() - INTERVAL '1 hour'
  `);

  const failedCount = Number((Array.from(result)[0] as any)?.count || 0);

  if (failedCount >= 10) {
    // Block for 1 hour
    await blockIP(ipAddress, `Automatic block: ${reason}`, {
      durationMinutes: 60,
    });
  }
}

/**
 * Detect unusual access patterns
 */
export async function detectUnusualAccess(
  userId: number,
  ipAddress: string
): Promise<{ isUnusual: boolean; reason?: string }> {
  try {
    const db = await requireDb();

    // Check for multiple IPs in short time
    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT ip_address) as ip_count
      FROM login_attempts
      WHERE user_id = ${userId}
        AND success = true
        AND created_at >= NOW() - INTERVAL '1 hour'
    `);

    const ipCount = Number((Array.from(result)[0] as any)?.ip_count || 0);

    if (ipCount >= 3) {
      await logSecurityEvent('multiple_ips', 'high', {
        userId,
        ipAddress,
        details: { ipCount },
      });

      return {
        isUnusual: true,
        reason: `User accessed from ${ipCount} different IPs in the last hour`,
      };
    }

    // Check for unusual hours (e.g., 2 AM - 5 AM)
    const hour = new Date().getHours();
    if (hour >= 2 && hour <= 5) {
      await logSecurityEvent('unusual_access', 'medium', {
        userId,
        ipAddress,
        details: { hour },
      });

      return {
        isUnusual: true,
        reason: `Access at unusual hour: ${hour}:00`,
      };
    }

    return { isUnusual: false };
  } catch (error) {
    console.error('[Security] Failed to detect unusual access:', error);
    return { isUnusual: false };
  }
}

/**
 * Get security events
 */
export async function getSecurityEvents(
  filters?: {
    eventType?: SecurityEventType;
    severity?: SecuritySeverity;
    userId?: number;
    startDate?: Date;
    endDate?: Date;
  },
  limit = 100
): Promise<SecurityEvent[]> {
  try {
    const db = await requireDb();

    let query = sql`
      SELECT *
      FROM security_events
      WHERE 1=1
    `;

    if (filters?.eventType) {
      query = sql`${query} AND event_type = ${filters.eventType}`;
    }

    if (filters?.severity) {
      query = sql`${query} AND severity = ${filters.severity}`;
    }

    if (filters?.userId) {
      query = sql`${query} AND user_id = ${filters.userId}`;
    }

    if (filters?.startDate) {
      query = sql`${query} AND created_at >= ${filters.startDate}`;
    }

    if (filters?.endDate) {
      query = sql`${query} AND created_at <= ${filters.endDate}`;
    }

    query = sql`${query} ORDER BY created_at DESC LIMIT ${limit}`;

    const result = await db.execute(query);

    return Array.from(result).map((row: any) => ({
      id: row.id,
      eventType: row.event_type,
      severity: row.severity,
      userId: row.user_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      details: row.details,
      createdAt: new Date(row.created_at),
    }));
  } catch (error) {
    console.error('[Security] Failed to get security events:', error);
    return [];
  }
}

/**
 * Get blocked IPs
 */
export async function getBlockedIPs(includeUnblocked = false): Promise<BlockedIP[]> {
  try {
    const db = await requireDb();

    const result = await db.execute(sql`
      SELECT *
      FROM blocked_ips
      WHERE ${includeUnblocked ? sql`1=1` : sql`unblocked_at IS NULL`}
      ORDER BY blocked_at DESC
    `);

    return Array.from(result).map((row: any) => ({
      id: row.id,
      ipAddress: row.ip_address,
      reason: row.reason,
      blockedBy: row.blocked_by,
      blockedAt: new Date(row.blocked_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      isPermanent: row.is_permanent,
      unblockedAt: row.unblocked_at ? new Date(row.unblocked_at) : null,
      unblockedBy: row.unblocked_by,
    }));
  } catch (error) {
    console.error('[Security] Failed to get blocked IPs:', error);
    return [];
  }
}

/**
 * Get security statistics
 */
export async function getSecurityStats(
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalEvents: number;
  criticalEvents: number;
  blockedIPs: number;
  failedLogins: number;
  accountLockouts: number;
}> {
  try {
    const db = await requireDb();


    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const result = await db.execute(sql`
      SELECT
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_events,
        COUNT(*) FILTER (WHERE event_type = 'login_failed') as failed_logins,
        COUNT(*) FILTER (WHERE event_type = 'account_locked') as account_lockouts
      FROM security_events
      WHERE created_at >= ${start}
        AND created_at <= ${end}
    `);

    const stats = Array.from(result)[0] as any;

    const blockedResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM blocked_ips
      WHERE unblocked_at IS NULL
    `);

    const blockedCount = Number((Array.from(blockedResult)[0] as any)?.count || 0);

    return {
      totalEvents: Number(stats.total_events || 0),
      criticalEvents: Number(stats.critical_events || 0),
      blockedIPs: blockedCount,
      failedLogins: Number(stats.failed_logins || 0),
      accountLockouts: Number(stats.account_lockouts || 0),
    };
  } catch (error) {
    console.error('[Security] Failed to get security stats:', error);
    return {
      totalEvents: 0,
      criticalEvents: 0,
      blockedIPs: 0,
      failedLogins: 0,
      accountLockouts: 0,
    };
  }
}
