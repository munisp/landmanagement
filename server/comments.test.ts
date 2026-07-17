import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from './routers';
import type { User } from '../drizzle/schema';
import { getDb } from './db';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Comments API', () => {
  let testUserId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) {
      testUserId = 1001;
      return;
    }

    // Create test user
    const [user] = await db.insert(users).values({
      openId: 'test-comments-user',
      name: 'Test Comments User',
      email: 'comments@test.com',
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
    openId: 'test-comments-user',
    name: 'Test Comments User',
    email: 'comments@test.com',
    loginMethod: 'oauth',
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  });

  const getCaller = () => appRouter.createCaller({
    user: getMockUser(),
  });

  let commentId: string;

  it('should add a new comment', async () => {
    const caller = getCaller();
    const result = await caller.comments.add({
      entityType: 'parcel',
      entityId: 'TEST-PARCEL-001',
      content: 'This is a test comment for the parcel.',
    });

    expect(result).toHaveProperty('id');
    expect(typeof result.id).toBe('string');
    commentId = result.id;
  });

  it('should list comments for an entity', async () => {
    const caller = getCaller();
    const result = await caller.comments.list({
      entityType: 'parcel',
      entityId: 'TEST-PARCEL-001',
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('content');
    expect(result[0]).toHaveProperty('userName');
    expect(result[0]).toHaveProperty('createdAt');
  });

  it('should edit a comment', async () => {
    const caller = getCaller();
    await caller.comments.edit({
      id: commentId,
      content: 'This is an updated test comment.',
    });

    const comments = await caller.comments.list({
      entityType: 'parcel',
      entityId: 'TEST-PARCEL-001',
    });

    const updatedComment = comments.find(c => c.id === commentId);
    expect(updatedComment?.content).toBe('This is an updated test comment.');
  });

  it('should delete a comment', async () => {
    const caller = getCaller();
    const result = await caller.comments.delete({
      id: commentId,
    });

    expect(result.success).toBe(true);

    const comments = await caller.comments.list({
      entityType: 'parcel',
      entityId: 'TEST-PARCEL-001',
    });

    const deletedComment = comments.find(c => c.id === commentId);
    expect(deletedComment).toBeUndefined();
  });

  it('should handle comments for transactions', async () => {
    const caller = getCaller();
    const result = await caller.comments.add({
      entityType: 'transaction',
      entityId: 'TX-2024-001',
      content: 'Transaction comment test.',
    });

    expect(result).toHaveProperty('id');

    const comments = await caller.comments.list({
      entityType: 'transaction',
      entityId: 'TX-2024-001',
    });

    expect(comments.length).toBeGreaterThan(0);
    expect(comments[0].content).toBe('Transaction comment test.');

    // Cleanup
    await caller.comments.delete({ id: result.id });
  });
});
