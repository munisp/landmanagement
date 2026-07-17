import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from './routers';
import type { User } from '../drizzle/schema';
import { getDb } from './db';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Reports API', () => {
  let testUserId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) {
      testUserId = 1101;
      return;
    }

    // Create test user
    const [user] = await db.insert(users).values({
      openId: 'test-reports-user',
      name: 'Test Reports User',
      email: 'reports@test.com',
      loginMethod: 'oauth',
      role: 'admin',
    }).returning({ id: users.id });

    testUserId = user.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Cleanup test user
    await db.delete(users).where(eq(users.id, testUserId));
  });

  const getMockUser = (): User => ({
    id: testUserId,
    openId: 'test-reports-user',
    name: 'Test Reports User',
    email: 'reports@test.com',
    loginMethod: 'oauth',
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  });

  const getCaller = () => appRouter.createCaller({
    user: getMockUser(),
  });

  it('should generate a parcel registry PDF report', async () => {
    const caller = getCaller();
    const result = await caller.reports.generate({
      template: 'parcel_registry',
      format: 'pdf',
      fields: ['id', 'location', 'areaSquareMeters', 'ownerName', 'status'],
      filters: {
        state: 'Lagos',
      },
    });

    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('filename');
    expect(result).toHaveProperty('mimeType');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.filename).toContain('parcel_registry');
    expect(result.filename).toContain('.pdf');
    expect(typeof result.data).toBe('string');
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('should generate a transaction summary Excel report', async () => {
    const caller = getCaller();
    const result = await caller.reports.generate({
      template: 'transaction_summary',
      format: 'excel',
      fields: ['id', 'type', 'parcelId', 'buyerName', 'amount', 'status'],
      filters: {
        type: 'transfer',
      },
    });

    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('filename');
    expect(result).toHaveProperty('mimeType');
    expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(result.filename).toContain('transaction_summary');
    expect(result.filename).toContain('.excel');
    expect(typeof result.data).toBe('string');
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('should generate a financial overview CSV report', async () => {
    const caller = getCaller();
    const result = await caller.reports.generate({
      template: 'financial_overview',
      format: 'csv',
      fields: ['month', 'count', 'totalAmount', 'completed', 'pending'],
      filters: {},
    });

    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('filename');
    expect(result).toHaveProperty('mimeType');
    expect(result.mimeType).toBe('text/csv');
    expect(result.filename).toContain('financial_overview');
    expect(result.filename).toContain('.csv');
    expect(typeof result.data).toBe('string');
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('should generate report with sorting', async () => {
    const caller = getCaller();
    const result = await caller.reports.generate({
      template: 'parcel_registry',
      format: 'pdf',
      fields: ['id', 'location', 'areaSquareMeters'],
      filters: {},
      sorting: {
        field: 'areaSquareMeters',
        direction: 'desc',
      },
    });

    expect(result).toHaveProperty('data');
    expect(result.filename).toContain('parcel_registry');
  });

  it('should generate report with grouping', async () => {
    const caller = getCaller();
    const result = await caller.reports.generate({
      template: 'transaction_summary',
      format: 'excel',
      fields: ['type', 'status', 'amount'],
      filters: {},
      groupBy: 'type',
    });

    expect(result).toHaveProperty('data');
    expect(result.filename).toContain('transaction_summary');
  });

  it('should generate report with date range filter', async () => {
    const caller = getCaller();
    const result = await caller.reports.generate({
      template: 'financial_overview',
      format: 'csv',
      fields: ['month', 'count', 'totalAmount'],
      filters: {
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      },
    });

    expect(result).toHaveProperty('data');
    expect(result.filename).toContain('financial_overview');
  });
});
