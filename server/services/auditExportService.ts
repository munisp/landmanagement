import { getDb } from "../db";
import { activityLogs } from "../../drizzle/schema";
import { and, between, eq, sql } from "drizzle-orm";

export interface AuditExportOptions {
  format: "csv" | "json";
  startDate?: Date;
  endDate?: Date;
  userId?: number;
  type?: string;
}

/**
 * Export audit logs to CSV format
 */
export async function exportAuditLogsToCSV(options: AuditExportOptions): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // Build query with filters
  const conditions = [];
  if (options.startDate && options.endDate) {
    conditions.push(between(activityLogs.createdAt, options.startDate, options.endDate));
  }
  if (options.userId) {
    conditions.push(eq(activityLogs.userId, options.userId));
  }
  if (options.type) {
    conditions.push(eq(activityLogs.type, options.type));
  }

  const logs = await db
    .select()
    .from(activityLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(activityLogs.createdAt);

  // Generate CSV
  const headers = ["ID", "User ID", "Type", "Description", "Metadata", "Created At"];
  const rows = logs.map((log) => [
    log.id,
    log.userId,
    log.type,
    log.description,
    JSON.stringify(log.metadata || {}),
    log.createdAt.toISOString(),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  return csvContent;
}

/**
 * Export audit logs to JSON format
 */
export async function exportAuditLogsToJSON(options: AuditExportOptions): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // Build query with filters
  const conditions = [];
  if (options.startDate && options.endDate) {
    conditions.push(between(activityLogs.createdAt, options.startDate, options.endDate));
  }
  if (options.userId) {
    conditions.push(eq(activityLogs.userId, options.userId));
  }
  if (options.type) {
    conditions.push(eq(activityLogs.type, options.type));
  }

  const logs = await db
    .select()
    .from(activityLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(activityLogs.createdAt);

  return JSON.stringify(
    {
      exportDate: new Date().toISOString(),
      filters: options,
      totalRecords: logs.length,
      records: logs.map((log) => ({
        id: log.id,
        userId: log.userId,
        type: log.type,
        description: log.description,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
      })),
    },
    null,
    2
  );
}

/**
 * Get audit log statistics
 */
export async function getAuditLogStats(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const conditions = [];
  if (startDate && endDate) {
    conditions.push(between(activityLogs.createdAt, startDate, endDate));
  }

  const stats = await db
    .select({
      type: activityLogs.type,
      count: sql<number>`count(*)::int`,
    })
    .from(activityLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(activityLogs.type);

  return stats;
}
