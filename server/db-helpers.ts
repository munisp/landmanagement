/**
 * Drizzle ORM Query Helpers — Land Management Platform
 *
 * Type-safe, reusable query builder utilities that eliminate boilerplate
 * across the codebase. All helpers are generic and work with any Drizzle
 * PgTable.
 *
 * Improvements implemented:
 *   1. paginatedQuery   — offset pagination with total count in a single round-trip
 *   2. upsertOne        — insert-or-update with conflict resolution
 *   3. withTransaction  — typed DB transaction wrapper with automatic rollback
 *   4. buildWhereClause — composable filter builder for common filter patterns
 *   5. optimisticUpdate — version-based optimistic concurrency control
 *   6. slowQueryLogger  — query performance monitoring (logs queries >100ms)
 *   7. cursorPaginatedQuery — cursor-based pagination for infinite scroll
 *   8. bulkInsert       — batch insert with chunking for large datasets
 */

import {
  SQL,
  and,
  sql,
  eq,
} from 'drizzle-orm';
import { requireDb } from './db';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface CursorResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Paginated Query
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a paginated SELECT query returning items + total count.
 *
 * @example
 *   const result = await paginatedQuery({
 *     table: parcels,
 *     where: eq(parcels.status, 'registered'),
 *     page: 2,
 *     limit: 20,
 *   });
 */
export async function paginatedQuery<T = any>({
  table,
  where,
  orderBy,
  page = 1,
  limit = 20,
}: {
  table: any;
  where?: SQL;
  orderBy?: SQL[];
  page?: number;
  limit?: number;
}): Promise<PaginatedResult<T>> {
  const db = await requireDb();
  const offset = (page - 1) * limit;

  const [countResult, items] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(table)
      .where(where),
    (() => {
      let q = db.select().from(table).where(where).limit(limit).offset(offset);
      if (orderBy && orderBy.length > 0) {
        q = (q as any).orderBy(...orderBy);
      }
      return q;
    })(),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    items: items as T[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Upsert One
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a row or update it if a conflict occurs on the specified column.
 *
 * @example
 *   const row = await upsertOne({
 *     table: userPreferences,
 *     conflictTarget: userPreferences.userId,
 *     values: { userId: 1, theme: 'dark' },
 *     updateSet: { theme: 'dark', updatedAt: new Date() },
 *   });
 */
export async function upsertOne<T = any>({
  table,
  conflictTarget,
  values,
  updateSet,
}: {
  table: any;
  conflictTarget: any;
  values: Record<string, any>;
  updateSet: Record<string, any>;
}): Promise<T | null> {
  const db = await requireDb();
  const result = await db
    .insert(table)
    .values(values)
    .onConflictDoUpdate({
      target: conflictTarget,
      set: updateSet,
    })
    .returning();
  return (result[0] as T) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Typed Transaction Wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a function inside a DB transaction. Automatically rolls back on error.
 *
 * @example
 *   const result = await withTransaction(async (tx) => {
 *     await tx.insert(parcels).values({ ... });
 *     await tx.insert(titles).values({ ... });
 *     return { success: true };
 *   });
 */
export async function withTransaction<T>(
  fn: (tx: any) => Promise<T>
): Promise<T> {
  const db = await requireDb();
  return db.transaction(fn);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Composable Where Clause Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a composite WHERE clause from a partial filter object.
 * Undefined values are ignored (not included in the WHERE clause).
 *
 * @example
 *   const where = buildWhereClause({
 *     status: input.status ? eq(parcels.status, input.status) : undefined,
 *     owner: input.ownerId ? eq(parcels.ownerId, input.ownerId) : undefined,
 *   });
 */
export function buildWhereClause(
  conditions: Record<string, SQL | undefined>
): SQL | undefined {
  const active = Object.values(conditions).filter(
    (c): c is SQL => c !== undefined
  );
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  return and(...active);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Optimistic Update (Version-based Concurrency Control)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update a row only if the version matches (optimistic locking).
 * Throws if the row has been concurrently modified.
 *
 * @example
 *   await optimisticUpdate({
 *     table: parcels,
 *     id: parcelId,
 *     currentVersion: 3,
 *     updateSet: { status: 'registered', version: 4 },
 *   });
 */
export async function optimisticUpdate<T = any>({
  table,
  id,
  currentVersion,
  updateSet,
}: {
  table: any;
  id: number;
  currentVersion: number;
  updateSet: Record<string, any>;
}): Promise<T> {
  const db = await requireDb();
  const result = await db
    .update(table)
    .set({ ...updateSet, version: currentVersion + 1 })
    .where(and(eq(table.id, id), eq(table.version, currentVersion)))
    .returning();

  if (result.length === 0) {
    throw new Error(
      `Optimistic lock conflict: row ${id} was modified by another process (expected version ${currentVersion})`
    );
  }
  return result[0] as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Slow Query Logger
// ─────────────────────────────────────────────────────────────────────────────

const SLOW_QUERY_THRESHOLD_MS = 100;

/**
 * Wrap any async DB operation with performance logging.
 * Logs a warning if the query takes longer than SLOW_QUERY_THRESHOLD_MS.
 *
 * @example
 *   const result = await slowQueryLogger('listParcels', () =>
 *     db.select().from(parcels).limit(100)
 *   );
 */
export async function slowQueryLogger<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    if (elapsed > SLOW_QUERY_THRESHOLD_MS) {
      console.warn(
        `[SlowQuery] ${label} took ${elapsed}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`
      );
    }
    return result;
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(`[QueryError] ${label} failed after ${elapsed}ms:`, err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Cursor-based Pagination (for infinite scroll / mobile)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cursor-based pagination using a timestamp cursor.
 * More efficient than offset pagination for large datasets.
 *
 * @example
 *   const page = await cursorPaginatedQuery({
 *     table: adminNotifications,
 *     where: eq(adminNotifications.recipientId, userId),
 *     cursorColumn: adminNotifications.createdAt,
 *     cursor: '2024-01-15T10:30:00Z',
 *     limit: 20,
 *   });
 */
export async function cursorPaginatedQuery<T = any>({
  table,
  where,
  cursorColumn,
  cursor,
  limit = 20,
  orderDirection = 'desc',
}: {
  table: any;
  where?: SQL;
  cursorColumn?: any;
  cursor?: string | null;
  limit?: number;
  orderDirection?: 'asc' | 'desc';
}): Promise<CursorResult<T>> {
  const db = await requireDb();

  // Default cursor column to table.id if not provided
  const effectiveCursorColumn = cursorColumn ?? table.id;

  const cursorCondition = cursor
    ? orderDirection === 'desc'
      ? sql`${effectiveCursorColumn} < ${cursor.includes('T') ? new Date(cursor) : Number(cursor)}`
      : sql`${effectiveCursorColumn} > ${cursor.includes('T') ? new Date(cursor) : Number(cursor)}`
    : undefined;

  const finalWhere = buildWhereClause({
    base: where,
    cursor: cursorCondition,
  });

  const { desc: descFn, asc: ascFn } = await import('drizzle-orm');
  const orderFn = orderDirection === 'desc' ? descFn : ascFn;

  const items = await (db as any)
    .select()
    .from(table)
    .where(finalWhere)
    .orderBy(orderFn(effectiveCursorColumn))
    .limit(limit + 1); // Fetch one extra to detect hasMore

  const hasMore = items.length > limit;
  const resultItems = hasMore ? items.slice(0, limit) : items;
  const lastItem = resultItems[resultItems.length - 1];

  let nextCursor: string | null = null;
  if (hasMore && lastItem) {
    const colName = effectiveCursorColumn?.name ?? 'id';
    const val = lastItem[colName];
    if (val instanceof Date) {
      nextCursor = val.toISOString();
    } else if (val !== undefined && val !== null) {
      nextCursor = String(val);
    }
  }

  return {
    items: resultItems as T[],
    nextCursor,
    hasMore,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Bulk Insert with Chunking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a large array of rows in chunks to avoid hitting PostgreSQL's
 * parameter limit (65535 parameters per query).
 *
 * @example
 *   await bulkInsert({
 *     table: activityLogs,
 *     rows: logsArray,
 *     chunkSize: 500,
 *   });
 */
export async function bulkInsert<T = any>(
  table: any,
  rows: Record<string, any>[],
  chunkSize = 500
): Promise<T[]> {
  if (!rows || rows.length === 0) return [];
  const db = await requireDb();
  const allInserted: T[] = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const inserted = await db.insert(table).values(chunk).returning();
    allInserted.push(...(inserted as T[]));
  }
  return allInserted;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Soft Delete Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Soft-delete a row by setting deletedAt timestamp instead of removing it.
 *
 * @example
 *   await softDelete({ table: documents, id: docId });
 */
export async function softDelete({
  table,
  id,
}: {
  table: any;
  id: number;
}): Promise<void> {
  const db = await requireDb();
  await db
    .update(table)
    .set({ deletedAt: new Date() })
    .where(eq(table.id, id));
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Find or Create
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a row matching the given conditions, or create it if it doesn't exist.
 *
 * @example
 *   const { row, created } = await findOrCreate({
 *     table: notificationPreferences,
 *     where: eq(notificationPreferences.userId, userId),
 *     createValues: { userId, emailEnabled: true },
 *   });
 */
export async function findOrCreate<T = any>({
  table,
  where,
  createValues,
}: {
  table: any;
  where: SQL;
  createValues: Record<string, any>;
}): Promise<{ row: T; created: boolean }> {
  const db = await requireDb();
  const existing = await db.select().from(table).where(where).limit(1);
  if (existing.length > 0) {
    return { row: existing[0] as T, created: false };
  }
  const [created] = await db.insert(table).values(createValues).returning();
  return { row: created as T, created: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// OptimisticLockError — thrown when an optimistic update detects a version
// conflict (i.e., the row was modified by another process between read and write)
// ─────────────────────────────────────────────────────────────────────────────

export class OptimisticLockError extends Error {
  public readonly table: string;
  public readonly id: number | string;
  public readonly expectedVersion: number;

  constructor(table: string, id: number | string, expectedVersion: number) {
    super(
      `Optimistic lock conflict on table "${table}" for id ${id}: ` +
        `expected version ${expectedVersion} but row was modified by another process.`
    );
    this.name = 'OptimisticLockError';
    this.table = table;
    this.id = id;
    this.expectedVersion = expectedVersion;
    Object.setPrototypeOf(this, OptimisticLockError.prototype);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// monitoredQuery — alias for slowQueryLogger with a friendlier name
// ─────────────────────────────────────────────────────────────────────────────

export const monitoredQuery = slowQueryLogger;
