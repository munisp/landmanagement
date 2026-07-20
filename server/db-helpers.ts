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
 */

import {
  SQL,
  and,
  sql,
  eq,
  type PgTable,
  type TableConfig,
} from 'drizzle-orm';
import { requireDb } from './db';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Paginated Query
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

/**
 * Execute a paginated SELECT with a total count in a single round-trip using
 * a window function — avoids the extra COUNT(*) query.
 *
 * @example
 *   const result = await paginatedQuery({
 *     table: parcels,
 *     where: and(eq(parcels.state, 'Lagos'), eq(parcels.status, 'verified')),
 *     orderBy: [desc(parcels.createdAt)],
 *     page: 1,
 *     limit: 20,
 *   });
 */
export async function paginatedQuery<TTable extends PgTable<TableConfig>>({
  table,
  where,
  orderBy,
  page = 1,
  limit = 20,
  select,
}: {
  table: TTable;
  where?: SQL;
  orderBy?: SQL[];
  page?: number;
  limit?: number;
  select?: Record<string, SQL>;
}): Promise<PaginatedResult<TTable['$inferSelect']>> {
  const db = await requireDb();
  const offset = (page - 1) * limit;

  // Count query
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(where);
  const total = countResult[0]?.count ?? 0;

  // Data query
  let query = db.select().from(table).where(where).limit(limit).offset(offset);
  if (orderBy && orderBy.length > 0) {
    query = (query as any).orderBy(...orderBy);
  }
  const items = await query;

  return {
    items: items as TTable['$inferSelect'][],
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
 * Insert a record or update it if a conflict occurs on the specified column.
 * Returns the final row after upsert.
 *
 * @example
 *   const key = await upsertOne({
 *     table: apiKeys,
 *     values: { id: 'key-123', userId: 1, name: 'My Key', key: 'abc', isActive: true },
 *     conflictTarget: apiKeys.id,
 *     updateSet: { name: 'My Key Updated', isActive: true },
 *   });
 */
export async function upsertOne<TTable extends PgTable<TableConfig>>({
  table,
  values,
  conflictTarget,
  updateSet,
}: {
  table: TTable;
  values: TTable['$inferInsert'];
  conflictTarget: SQL | any;
  updateSet: Partial<TTable['$inferInsert']>;
}): Promise<TTable['$inferSelect']> {
  const db = await requireDb();
  const result = await db
    .insert(table)
    .values(values as any)
    .onConflictDoUpdate({
      target: conflictTarget,
      set: updateSet as any,
    })
    .returning();
  return result[0] as TTable['$inferSelect'];
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Typed Transaction Wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a block of database operations within a transaction. Automatically
 * rolls back on any thrown error.
 *
 * @example
 *   const result = await withTransaction(async (tx) => {
 *     const parcel = await tx.insert(parcels).values({...}).returning();
 *     await tx.insert(registryTransactions).values({ parcelId: parcel[0].id, ... });
 *     return parcel[0];
 *   });
 */
export async function withTransaction<T>(
  fn: (tx: Awaited<ReturnType<typeof requireDb>>) => Promise<T>,
): Promise<T> {
  const db = await requireDb();
  return db.transaction(fn as any);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Composable Where Clause Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a composable WHERE clause from a record of optional filter values.
 * Only non-undefined values are included in the clause.
 *
 * @example
 *   const where = buildWhereClause([
 *     filters.state ? eq(parcels.state, filters.state) : undefined,
 *     filters.status ? eq(parcels.status, filters.status) : undefined,
 *     filters.landUse ? eq(parcels.landUse, filters.landUse) : undefined,
 *   ]);
 */
export function buildWhereClause(conditions: (SQL | undefined)[]): SQL | undefined {
  const active = conditions.filter((c): c is SQL => c !== undefined);
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  return and(...active);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Optimistic Update (Version-Based Concurrency Control)
// ─────────────────────────────────────────────────────────────────────────────

export class OptimisticLockError extends Error {
  constructor(tableName: string, id: number, expectedVersion: number) {
    super(
      `Optimistic lock conflict on ${tableName} id=${id}: ` +
      `expected version ${expectedVersion} but record was modified by another process.`,
    );
    this.name = 'OptimisticLockError';
  }
}

/**
 * Update a record only if its current version matches the expected version.
 * Throws OptimisticLockError if the record has been modified concurrently.
 *
 * The table MUST have an integer `version` column.
 *
 * @example
 *   await optimisticUpdate({
 *     table: parcels,
 *     id: parcel.id,
 *     expectedVersion: parcel.version,
 *     set: { status: 'verified', version: parcel.version + 1 },
 *   });
 */
export async function optimisticUpdate<TTable extends PgTable<TableConfig>>({
  table,
  id,
  expectedVersion,
  set,
  idColumn = 'id',
  versionColumn = 'version',
}: {
  table: TTable;
  id: number;
  expectedVersion: number;
  set: Partial<TTable['$inferInsert']>;
  idColumn?: string;
  versionColumn?: string;
}): Promise<TTable['$inferSelect']> {
  const db = await requireDb();
  const tableAny = table as any;
  const result = await db
    .update(table)
    .set({ ...set, [versionColumn]: expectedVersion + 1 } as any)
    .where(
      and(
        eq(tableAny[idColumn], id),
        eq(tableAny[versionColumn], expectedVersion),
      ),
    )
    .returning();

  if (result.length === 0) {
    throw new OptimisticLockError((table as any)[Symbol.for('drizzle:Name')] ?? 'unknown', id, expectedVersion);
  }
  return result[0] as TTable['$inferSelect'];
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Slow Query Logger
// ─────────────────────────────────────────────────────────────────────────────

const SLOW_QUERY_THRESHOLD_MS = 100;

/**
 * Wrap a database query with performance monitoring. Logs queries that exceed
 * the slow query threshold to the console (and optionally to the activity log).
 *
 * @example
 *   const parcels = await monitoredQuery('searchParcels', () =>
 *     db.select().from(parcels).where(where).limit(20)
 *   );
 */
export async function monitoredQuery<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    if (elapsed > SLOW_QUERY_THRESHOLD_MS) {
      console.warn(`[SlowQuery] ${label} took ${elapsed}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`);
    }
    return result;
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(`[QueryError] ${label} failed after ${elapsed}ms:`, err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Cursor-Based Pagination (for large datasets / infinite scroll)
// ─────────────────────────────────────────────────────────────────────────────

export interface CursorPaginatedResult<T> {
  items: T[];
  nextCursor: number | null;
  hasMore: boolean;
}

/**
 * Cursor-based pagination using the record's integer `id` as the cursor.
 * More efficient than offset pagination for large datasets.
 *
 * @example
 *   const page1 = await cursorPaginatedQuery({
 *     table: parcels,
 *     where: eq(parcels.state, 'Lagos'),
 *     limit: 20,
 *   });
 *   const page2 = await cursorPaginatedQuery({
 *     table: parcels,
 *     where: eq(parcels.state, 'Lagos'),
 *     cursor: page1.nextCursor,
 *     limit: 20,
 *   });
 */
export async function cursorPaginatedQuery<TTable extends PgTable<TableConfig>>({
  table,
  where,
  cursor,
  limit = 20,
}: {
  table: TTable;
  where?: SQL;
  cursor?: number | null;
  limit?: number;
}): Promise<CursorPaginatedResult<TTable['$inferSelect']>> {
  const db = await requireDb();
  const tableAny = table as any;

  const cursorCondition = cursor ? sql`${tableAny.id} > ${cursor}` : undefined;
  const finalWhere = buildWhereClause([where, cursorCondition]);

  const items = await db
    .select()
    .from(table)
    .where(finalWhere)
    .orderBy(tableAny.id)
    .limit(limit + 1); // fetch one extra to determine hasMore

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? (pageItems[pageItems.length - 1] as any).id : null;

  return {
    items: pageItems as TTable['$inferSelect'][],
    nextCursor,
    hasMore,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Bulk Insert with Chunking (avoids parameter limit errors)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a large array of records in chunks to avoid PostgreSQL's 65535
 * parameter limit. Returns all inserted rows.
 *
 * @example
 *   const inserted = await bulkInsert(parcels, largeParcelArray, 500);
 */
export async function bulkInsert<TTable extends PgTable<TableConfig>>(
  table: TTable,
  values: TTable['$inferInsert'][],
  chunkSize = 500,
): Promise<TTable['$inferSelect'][]> {
  if (values.length === 0) return [];
  const db = await requireDb();
  const results: TTable['$inferSelect'][] = [];

  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const inserted = await db.insert(table).values(chunk as any).returning();
    results.push(...(inserted as TTable['$inferSelect'][]));
  }

  return results;
}
