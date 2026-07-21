/**
 * Tests for Drizzle ORM Query Helpers
 *
 * Verifies that all db-helpers utilities work correctly against the
 * in-memory SQLite test database.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { eq, desc } from 'drizzle-orm';
import {
  paginatedQuery,
  cursorPaginatedQuery,
  buildWhereClause,
  withTransaction,
  bulkInsert,
  monitoredQuery,
  OptimisticLockError,
} from './db-helpers';
import { requireDb } from './db';
import { registryTransactions, parcels, users } from '../drizzle/schema';

describe('Drizzle ORM Query Helpers', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // paginatedQuery
  // ─────────────────────────────────────────────────────────────────────────
  describe('paginatedQuery', () => {
    it('returns paginated results with correct metadata', async () => {
      const result = await paginatedQuery({
        table: registryTransactions,
        page: 1,
        limit: 2,
      });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 2);
      expect(result).toHaveProperty('totalPages');
      expect(result).toHaveProperty('hasNextPage');
      expect(result).toHaveProperty('hasPrevPage');
      expect(result.items.length).toBeLessThanOrEqual(2);
      expect(result.total).toBeGreaterThan(0);
    });

    it('correctly calculates hasNextPage and hasPrevPage', async () => {
      const page1 = await paginatedQuery({
        table: registryTransactions,
        page: 1,
        limit: 1,
      });
      expect(page1.hasPrevPage).toBe(false);
      if (page1.total > 1) {
        expect(page1.hasNextPage).toBe(true);
      }

      if (page1.total > 1) {
        const page2 = await paginatedQuery({
          table: registryTransactions,
          page: 2,
          limit: 1,
        });
        expect(page2.hasPrevPage).toBe(true);
      }
    });

    it('applies where clause correctly', async () => {
      const result = await paginatedQuery({
        table: registryTransactions,
        where: eq(registryTransactions.status, 'pending_approval'),
        page: 1,
        limit: 10,
      });

      for (const item of result.items) {
        expect(item.status).toBe('pending_approval');
      }
    });

    it('returns correct totalPages calculation', async () => {
      const result = await paginatedQuery({
        table: registryTransactions,
        page: 1,
        limit: 3,
      });

      const expectedTotalPages = Math.ceil(result.total / 3);
      expect(result.totalPages).toBe(expectedTotalPages);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // cursorPaginatedQuery
  // ─────────────────────────────────────────────────────────────────────────
  describe('cursorPaginatedQuery', () => {
    it('returns items with cursor metadata', async () => {
      const result = await cursorPaginatedQuery({
        table: registryTransactions,
        limit: 2,
      });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('nextCursor');
      expect(result).toHaveProperty('hasMore');
      expect(result.items.length).toBeLessThanOrEqual(2);
    });

    it('returns null nextCursor when no more items', async () => {
      // Fetch all items with a large limit
      const result = await cursorPaginatedQuery({
        table: registryTransactions,
        limit: 1000,
      });

      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('correctly paginates with cursor', async () => {
      const page1 = await cursorPaginatedQuery({
        table: registryTransactions,
        limit: 1,
      });

      if (page1.hasMore && page1.nextCursor !== null) {
        const page2 = await cursorPaginatedQuery({
          table: registryTransactions,
          cursor: page1.nextCursor,
          limit: 1,
        });

        // With descending order, page 2 items have lower IDs than page 1
        // (cursor moves backward through the ordered set)
        if (page2.items.length > 0 && page1.items.length > 0) {
          expect(page2.items[0].id).toBeLessThan(page1.items[0].id);
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // buildWhereClause
  // ─────────────────────────────────────────────────────────────────────────
  describe('buildWhereClause', () => {
    it('returns undefined for empty conditions', () => {
      const result = buildWhereClause([]);
      expect(result).toBeUndefined();
    });

    it('returns undefined when all conditions are undefined', () => {
      const result = buildWhereClause([undefined, undefined]);
      expect(result).toBeUndefined();
    });

    it('returns single condition directly', () => {
      const condition = eq(registryTransactions.status, 'pending_approval');
      const result = buildWhereClause([condition]);
      expect(result).toBeDefined();
    });

    it('combines multiple conditions with AND', () => {
      const c1 = eq(registryTransactions.status, 'pending_approval');
      const c2 = eq(registryTransactions.type, 'transfer');
      const result = buildWhereClause([c1, c2]);
      expect(result).toBeDefined();
    });

    it('filters out undefined conditions', () => {
      const c1 = eq(registryTransactions.status, 'pending_approval');
      const result = buildWhereClause([undefined, c1, undefined]);
      expect(result).toBeDefined();
    });

    it('works with actual db query', async () => {
      const db = await requireDb();
      const where = buildWhereClause([
        eq(registryTransactions.status, 'pending_approval'),
      ]);

      const rows = await db.select().from(registryTransactions).where(where).limit(5);
      for (const row of rows) {
        expect(row.status).toBe('pending_approval');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // withTransaction
  // ─────────────────────────────────────────────────────────────────────────
  describe('withTransaction', () => {
    it('executes operations within a transaction', async () => {
      const db = await requireDb();

      // Get a user to use as initiator
      const [user] = await db.select().from(users).limit(1);
      expect(user).toBeDefined();

      // Get a parcel to use
      const [parcel] = await db.select().from(parcels).limit(1);
      expect(parcel).toBeDefined();

      const result = await withTransaction(async (tx) => {
        const inserted = await tx
          .insert(registryTransactions)
          .values({
            type: 'transfer',
            parcelId: parcel.id,
            initiatorId: user.id,
            initiatorName: user.name ?? 'Test User',
            considerationAmount: 5000000,
            status: 'pending_approval',
            workflowStage: 'submission',
            paymentStatus: 'unpaid',
            documentStatus: 'pending',
          })
          .returning();
        return inserted[0];
      });

      expect(result).toBeDefined();
      expect(result.type).toBe('transfer');
      expect(result.status).toBe('pending_approval');

      // Clean up
      await db.delete(registryTransactions).where(eq(registryTransactions.id, result.id));
    });

    it('rolls back on error', async () => {
      const db = await requireDb();
      const countBefore = await db.select().from(registryTransactions);

      await expect(
        withTransaction(async (tx) => {
          // This should fail due to invalid parcel_id (not a FK in test DB but let's test the rollback)
          throw new Error('Intentional rollback test');
        }),
      ).rejects.toThrow('Intentional rollback test');

      const countAfter = await db.select().from(registryTransactions);
      expect(countAfter.length).toBe(countBefore.length);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // monitoredQuery
  // ─────────────────────────────────────────────────────────────────────────
  describe('monitoredQuery', () => {
    it('returns query results transparently', async () => {
      const db = await requireDb();

      const result = await monitoredQuery('test-query', () =>
        db.select().from(registryTransactions).limit(5),
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('propagates errors from the query', async () => {
      await expect(
        monitoredQuery('failing-query', async () => {
          throw new Error('Query failed');
        }),
      ).rejects.toThrow('Query failed');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // bulkInsert
  // ─────────────────────────────────────────────────────────────────────────
  describe('bulkInsert', () => {
    it('returns empty array for empty input', async () => {
      const result = await bulkInsert(registryTransactions, []);
      expect(result).toEqual([]);
    });

    it('inserts records in chunks', async () => {
      const db = await requireDb();
      const [user] = await db.select().from(users).limit(1);
      const [parcel] = await db.select().from(parcels).limit(1);

      const records = Array.from({ length: 5 }, (_, i) => ({
        type: 'transfer',
        parcelId: parcel.id,
        initiatorId: user.id,
        initiatorName: `Bulk User ${i}`,
        considerationAmount: 1000000 * (i + 1),
        status: 'pending_approval',
        workflowStage: 'submission',
        paymentStatus: 'unpaid',
        documentStatus: 'pending',
      }));

      const inserted = await bulkInsert(registryTransactions, records, 3);
      expect(inserted.length).toBe(5);

      // Clean up
      for (const r of inserted) {
        await db.delete(registryTransactions).where(eq(registryTransactions.id, r.id));
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // OptimisticLockError
  // ─────────────────────────────────────────────────────────────────────────
  describe('OptimisticLockError', () => {
    it('creates error with correct message', () => {
      const err = new OptimisticLockError('parcels', 42, 3);
      expect(err.name).toBe('OptimisticLockError');
      expect(err.message).toContain('parcels');
      expect(err.message).toContain('42');
      expect(err.message).toContain('3');
    });

    it('is an instance of Error', () => {
      const err = new OptimisticLockError('parcels', 1, 0);
      expect(err).toBeInstanceOf(Error);
    });
  });
});
