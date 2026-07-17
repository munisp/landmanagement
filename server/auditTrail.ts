/**
 * Comprehensive Audit Trail System
 * Immutable blockchain-backed logging for compliance and security
 */

import crypto from 'crypto';

export interface AuditLog {
  id: string;
  timestamp: Date;
  userId: number;
  userName: string;
  action: AuditAction;
  entityType: 'parcel' | 'transaction' | 'document' | 'user' | 'system';
  entityId: string;
  changes?: AuditChange[];
  metadata?: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  hash: string; // Cryptographic hash for tamper detection
  previousHash: string; // Chain to previous log entry
  blockchainTxId?: string; // Optional blockchain transaction ID
}

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'approve'
  | 'reject'
  | 'transfer'
  | 'verify'
  | 'export'
  | 'import';

export interface AuditChange {
  field: string;
  oldValue: any;
  newValue: any;
}

export interface AuditQuery {
  userId?: number;
  action?: AuditAction | AuditAction[];
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}

/**
 * Audit Trail Service
 */
export class AuditTrailService {
  private logs: Map<string, AuditLog> = new Map();
  private lastHash: string = '0'.repeat(64); // Genesis hash

  /**
   * Log an audit event
   */
  async log(event: Omit<AuditLog, 'id' | 'timestamp' | 'hash' | 'previousHash'>): Promise<AuditLog> {
    const id = this.generateId();
    const timestamp = new Date();
    const previousHash = this.lastHash;

    // Create audit log entry
    const auditLog: AuditLog = {
      id,
      timestamp,
      previousHash,
      ...event,
      hash: '', // Will be calculated
    };

    // Calculate cryptographic hash
    auditLog.hash = this.calculateHash(auditLog);
    this.lastHash = auditLog.hash;

    // Store log
    this.logs.set(id, auditLog);

    // Optionally record on blockchain for critical actions
    if (this.isCriticalAction(event.action)) {
      auditLog.blockchainTxId = await this.recordOnBlockchain(auditLog);
    }

    console.log(`[Audit] Logged ${event.action} by user ${event.userId} on ${event.entityType}/${event.entityId}`);

    return auditLog;
  }

  /**
   * Log creation event
   */
  async logCreate(
    userId: number,
    userName: string,
    entityType: AuditLog['entityType'],
    entityId: string,
    data: any,
    metadata: { ipAddress: string; userAgent: string }
  ): Promise<AuditLog> {
    return this.log({
      userId,
      userName,
      action: 'create',
      entityType,
      entityId,
      changes: [{ field: '_all', oldValue: null, newValue: data }],
      metadata: { data },
      ...metadata,
    });
  }

  /**
   * Log update event
   */
  async logUpdate(
    userId: number,
    userName: string,
    entityType: AuditLog['entityType'],
    entityId: string,
    changes: AuditChange[],
    metadata: { ipAddress: string; userAgent: string }
  ): Promise<AuditLog> {
    return this.log({
      userId,
      userName,
      action: 'update',
      entityType,
      entityId,
      changes,
      ...metadata,
    });
  }

  /**
   * Log delete event
   */
  async logDelete(
    userId: number,
    userName: string,
    entityType: AuditLog['entityType'],
    entityId: string,
    data: any,
    metadata: { ipAddress: string; userAgent: string }
  ): Promise<AuditLog> {
    return this.log({
      userId,
      userName,
      action: 'delete',
      entityType,
      entityId,
      changes: [{ field: '_all', oldValue: data, newValue: null }],
      metadata: { data },
      ...metadata,
    });
  }

  /**
   * Query audit logs
   */
  async query(query: AuditQuery): Promise<{ logs: AuditLog[]; total: number }> {
    let filtered = Array.from(this.logs.values());

    // Apply filters
    if (query.userId) {
      filtered = filtered.filter(log => log.userId === query.userId);
    }

    if (query.action) {
      const actions = Array.isArray(query.action) ? query.action : [query.action];
      filtered = filtered.filter(log => actions.includes(log.action));
    }

    if (query.entityType) {
      filtered = filtered.filter(log => log.entityType === query.entityType);
    }

    if (query.entityId) {
      filtered = filtered.filter(log => log.entityId === query.entityId);
    }

    if (query.startDate) {
      filtered = filtered.filter(log => log.timestamp >= query.startDate!);
    }

    if (query.endDate) {
      filtered = filtered.filter(log => log.timestamp <= query.endDate!);
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const total = filtered.length;

    // Pagination
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      logs: filtered.slice(start, end),
      total,
    };
  }

  /**
   * Get entity history
   */
  async getEntityHistory(entityType: string, entityId: string): Promise<AuditLog[]> {
    const result = await this.query({ entityType: entityType as any, entityId, pageSize: 1000 });
    return result.logs;
  }

  /**
   * Get user activity
   */
  async getUserActivity(userId: number, days: number = 30): Promise<AuditLog[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await this.query({ userId, startDate, pageSize: 1000 });
    return result.logs;
  }

  /**
   * Verify audit trail integrity
   */
  async verifyIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const logs = Array.from(this.logs.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    let previousHash = '0'.repeat(64);

    for (const log of logs) {
      // Verify hash chain
      if (log.previousHash !== previousHash) {
        errors.push(`Hash chain broken at log ${log.id}: expected previous hash ${previousHash}, got ${log.previousHash}`);
      }

      // Verify hash calculation
      const { hash, ...logWithoutHash } = log;
      const calculatedHash = this.calculateHash(logWithoutHash);
      if (log.hash !== calculatedHash) {
        errors.push(`Hash mismatch at log ${log.id}: expected ${calculatedHash}, got ${log.hash}`);
      }

      previousHash = log.hash;
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Export audit logs for compliance
   */
  async exportLogs(query: AuditQuery, format: 'json' | 'csv'): Promise<string> {
    const result = await this.query({ ...query, pageSize: 100000 });

    if (format === 'json') {
      return JSON.stringify(result.logs, null, 2);
    } else {
      // CSV format
      const headers = [
        'ID',
        'Timestamp',
        'User ID',
        'User Name',
        'Action',
        'Entity Type',
        'Entity ID',
        'Changes',
        'IP Address',
        'Hash',
      ];

      const rows = result.logs.map(log => [
        log.id,
        log.timestamp.toISOString(),
        log.userId.toString(),
        log.userName,
        log.action,
        log.entityType,
        log.entityId,
        JSON.stringify(log.changes),
        log.ipAddress,
        log.hash,
      ]);

      return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }
  }

  /**
   * Get audit statistics
   */
  async getStatistics(days: number = 30): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = Array.from(this.logs.values()).filter(log => log.timestamp >= startDate);

    const byAction = new Map<string, number>();
    const byUser = new Map<number, number>();
    const byEntityType = new Map<string, number>();

    logs.forEach(log => {
      byAction.set(log.action, (byAction.get(log.action) || 0) + 1);
      byUser.set(log.userId, (byUser.get(log.userId) || 0) + 1);
      byEntityType.set(log.entityType, (byEntityType.get(log.entityType) || 0) + 1);
    });

    return {
      total: logs.length,
      byAction: Object.fromEntries(byAction),
      byUser: Object.fromEntries(byUser),
      byEntityType: Object.fromEntries(byEntityType),
      topUsers: Array.from(byUser.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([userId, count]) => ({ userId, count })),
    };
  }

  /**
   * Calculate cryptographic hash for audit log
   */
  private calculateHash(log: Omit<AuditLog, 'hash'>): string {
    const data = JSON.stringify({
      id: log.id,
      timestamp: log.timestamp.toISOString(),
      userId: log.userId,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      changes: log.changes,
      previousHash: log.previousHash,
    });

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Check if action is critical and should be recorded on blockchain
   */
  private isCriticalAction(action: AuditAction): boolean {
    return ['create', 'delete', 'transfer', 'approve'].includes(action);
  }

  /**
   * Record audit log on blockchain
   */
  private async recordOnBlockchain(log: AuditLog): Promise<string> {
    // In production, submit to blockchain network
    console.log(`[Audit] Recording on blockchain: ${log.id}`);

    // Mock blockchain transaction ID
    return `bc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique ID for audit log
   */
  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Compare two objects and generate change list
   */
  static compareObjects(oldObj: any, newObj: any): AuditChange[] {
    const changes: AuditChange[] = [];
    const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

    allKeys.forEach(key => {
      const oldValue = oldObj?.[key];
      const newValue = newObj?.[key];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field: key,
          oldValue,
          newValue,
        });
      }
    });

    return changes;
  }
}

/**
 * Audit middleware for Express
 */
export function auditMiddleware(auditService: AuditTrailService) {
  return async (req: any, res: any, next: any) => {
    // Capture original methods
    const originalJson = res.json;
    const originalSend = res.send;

    // Override response methods to capture audit data
    res.json = function (data: any) {
      if (req.user && req.auditAction) {
        auditService.log({
          userId: req.user.id,
          userName: req.user.name,
          action: req.auditAction,
          entityType: req.auditEntityType || 'system',
          entityId: req.auditEntityId || 'unknown',
          changes: req.auditChanges,
          metadata: req.auditMetadata,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent') || 'unknown',
        });
      }

      return originalJson.call(this, data);
    };

    next();
  };
}

export const auditTrailService = new AuditTrailService();
