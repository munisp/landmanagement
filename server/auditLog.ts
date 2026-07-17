/**
 * Audit Trail & Logging System
 * Tracks all CRUD operations with user attribution
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getDb } from './db';

export interface AuditLogEntry {
  id?: number;
  userId: number;
  userName: string;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'LOGIN' | 'LOGOUT';
  entityType: 'parcel' | 'transaction' | 'title' | 'document' | 'user' | 'payment';
  entityId: number | string;
  changes?: Record<string, { old: any; new: any }>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

const AUDIT_STORE_DIR = path.join(process.cwd(), 'server', 'data');
const AUDIT_STORE_PATH = path.join(AUDIT_STORE_DIR, 'audit-log-store.json');

interface PersistedAuditLogEntry extends Omit<AuditLogEntry, 'timestamp'> {
  timestamp: string;
}

async function ensureAuditStore() {
  await fs.mkdir(AUDIT_STORE_DIR, { recursive: true });
  try {
    await fs.access(AUDIT_STORE_PATH);
  } catch {
    await fs.writeFile(AUDIT_STORE_PATH, '[]\n', 'utf8');
  }
}

async function readAuditStore(): Promise<AuditLogEntry[]> {
  await ensureAuditStore();
  const raw = await fs.readFile(AUDIT_STORE_PATH, 'utf8');
  const parsed = JSON.parse(raw) as PersistedAuditLogEntry[];

  return parsed.map((entry) => ({
    ...entry,
    timestamp: new Date(entry.timestamp),
  }));
}

async function writeAuditStore(entries: AuditLogEntry[]): Promise<void> {
  await ensureAuditStore();
  const serialized: PersistedAuditLogEntry[] = entries.map((entry) => ({
    ...entry,
    timestamp: entry.timestamp.toISOString(),
  }));

  await fs.writeFile(AUDIT_STORE_PATH, JSON.stringify(serialized, null, 2) + '\n', 'utf8');
}

/**
 * Log an audit event
 */
export async function logAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn('[Audit] Database not available, using file-backed audit store');
    }

    const existing = await readAuditStore();
    const nextId = (existing[0]?.id ?? 0) + 1;
    const auditEntry: AuditLogEntry = {
      ...entry,
      id: nextId,
      timestamp: new Date(),
    };

    existing.unshift(auditEntry);
    await writeAuditStore(existing.slice(0, 5000));

    console.log('[Audit]', {
      ...auditEntry,
      timestamp: auditEntry.timestamp.toISOString(),
    });
  } catch (error) {
    console.error('[Audit] Failed to log audit entry:', error);
  }
}

/**
 * Create audit middleware for tRPC procedures
 */
export function createAuditMiddleware() {
  return async (opts: any) => {
    const { ctx, next, path, type, rawInput } = opts;

    // Only log mutations (CREATE, UPDATE, DELETE operations)
    if (type === 'mutation' && ctx.user) {
      const actionMap: Record<string, AuditLogEntry['action']> = {
        create: 'CREATE',
        update: 'UPDATE',
        delete: 'DELETE',
        approve: 'APPROVE',
        reject: 'REJECT',
      };

      const action = Object.keys(actionMap).find((key) => path.includes(key));
      if (action) {
        await logAudit({
          userId: ctx.user.id,
          userName: ctx.user.name || ctx.user.email || 'Unknown',
          action: actionMap[action]!,
          entityType: path.split('.')[0] as AuditLogEntry['entityType'],
          entityId: rawInput?.id || 'unknown',
          ipAddress: ctx.req.ip || (ctx.req.headers['x-forwarded-for'] as string),
          userAgent: ctx.req.headers['user-agent'] as string,
        });
      }
    }

    return next();
  };
}

/**
 * Get audit logs for an entity
 */
export async function getAuditLogs(params: {
  entityType?: string;
  entityId?: number | string;
  userId?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  const logs = await readAuditStore();

  return logs
    .filter((log) => {
      if (params.entityType && log.entityType !== params.entityType) return false;
      if (params.entityId !== undefined && String(log.entityId) !== String(params.entityId)) return false;
      if (params.userId !== undefined && log.userId !== params.userId) return false;
      if (params.startDate && log.timestamp < params.startDate) return false;
      if (params.endDate && log.timestamp > params.endDate) return false;
      return true;
    })
    .slice(0, params.limit ?? 100);
}

/**
 * Export audit logs to CSV
 */
export function exportAuditLogsToCSV(logs: AuditLogEntry[]): string {
  const headers = ['ID', 'Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'IP Address'];
  const rows = logs.map((log) => [
    log.id,
    log.timestamp.toISOString(),
    log.userName,
    log.action,
    log.entityType,
    log.entityId,
    log.ipAddress || 'N/A',
  ]);

  return [headers, ...rows].map((row) => row.join(',')).join('\n');
}
