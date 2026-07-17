import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from './routers';
import type { User } from '../drizzle/schema';
import { getDb } from './db';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Activity Logs API', () => {
  let testUserId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) {
      testUserId = 801;
      return;
    }

    // Create test user
    const [user] = await db.insert(users).values({
      openId: 'test-activity-user',
      name: 'Test Activity User',
      email: 'activity@test.com',
      loginMethod: 'oauth',
      role: 'user',
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
    openId: 'test-activity-user',
    name: 'Test Activity User',
    email: 'activity@test.com',
    loginMethod: 'oauth',
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  });

  const getCaller = () => appRouter.createCaller({
    user: getMockUser(),
  });

  it('should list activity logs', async () => {
    const caller = getCaller();
    const result = await caller.activityLogs.list({
      limit: 10,
    });

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('type');
      expect(result[0]).toHaveProperty('userName');
      expect(result[0]).toHaveProperty('createdAt');
    }
  });

  it('should list activity logs with limit', async () => {
    const caller = getCaller();
    const result = await caller.activityLogs.list({
      limit: 5,
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('should return typed activity records', async () => {
    const caller = getCaller();
    const result = await caller.activityLogs.list({
      limit: 10,
    });

    expect(Array.isArray(result)).toBe(true);
    result.forEach(log => {
      expect(typeof log.type).toBe('string');
      expect(typeof log.description).toBe('string');
    });
  });

  it('should preserve limit constraints for activity records', async () => {
    const caller = getCaller();
    const result = await caller.activityLogs.list({
      limit: 3,
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
