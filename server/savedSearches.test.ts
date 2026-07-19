import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from './routers';
import type { User } from '../drizzle/schema';
import { requireDb } from './db';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Saved Searches API', () => {
  let testUserId: number;

  beforeAll(async () => {
    const db = await requireDb();


    // Create test user
    const [user] = await db.insert(users).values({
      openId: 'test-searches-user',
      name: 'Test Searches User',
      email: 'searches@test.com',
      loginMethod: 'oauth',
      role: 'user',
    }).returning({ id: users.id });

    testUserId = user.id;
  });

  afterAll(async () => {
    const db = await requireDb();

    // Cleanup test user
    await db.delete(users).where(eq(users.id, testUserId));
  });

  const getMockUser = (): User => ({
    id: testUserId,
    openId: 'test-searches-user',
    name: 'Test Searches User',
    email: 'searches@test.com',
    loginMethod: 'oauth',
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  });

  const getCaller = () => appRouter.createCaller({
    user: getMockUser(),
  });

  let searchId: string;

  it('should create a new saved search', async () => {
    const caller = getCaller();
    const result = await caller.savedSearches.create({
      name: 'Lagos Commercial Properties',
      query: {
        state: 'Lagos',
        landUse: 'Commercial',
        areaMin: 500,
        areaMax: 2000,
      },
    });

    expect(result).toHaveProperty('id');
    expect(typeof result.id).toBe('string');
    searchId = result.id;
  });

  it('should list all saved searches for the user', async () => {
    const caller = getCaller();
    const result = await caller.savedSearches.list();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('name');
    expect(result[0]).toHaveProperty('query');
    expect(result[0]).toHaveProperty('isFavorite');
    expect(result[0]).toHaveProperty('createdAt');
  });

  it('should toggle favorite status', async () => {
    const caller = getCaller();
    const result = await caller.savedSearches.toggleFavorite({
      id: searchId,
    });

    expect(result.success).toBe(true);

    const searches = await caller.savedSearches.list();
    const updatedSearch = searches.find(s => s.id === searchId);
    expect(updatedSearch?.isFavorite).toBe(true);

    // Toggle back
    const caller2 = getCaller();
    await caller2.savedSearches.toggleFavorite({ id: searchId });
    const searchesAfter = await caller2.savedSearches.list();
    const searchAfter = searchesAfter.find(s => s.id === searchId);
    expect(searchAfter?.isFavorite).toBe(false);
  });

  it('should delete a saved search', async () => {
    const caller = getCaller();
    const result = await caller.savedSearches.delete({
      id: searchId,
    });

    expect(result.success).toBe(true);

    const searches = await caller.savedSearches.list();
    const deletedSearch = searches.find(s => s.id === searchId);
    expect(deletedSearch).toBeUndefined();
  });

  it('should handle multiple saved searches', async () => {
    const caller = getCaller();
    // Create multiple searches
    const search1 = await caller.savedSearches.create({
      name: 'Abuja Residential',
      query: { state: 'Abuja', landUse: 'Residential' },
    });

    const search2 = await caller.savedSearches.create({
      name: 'Kano Agricultural',
      query: { state: 'Kano', landUse: 'Agricultural' },
    });

    const searches = await caller.savedSearches.list();
    expect(searches.length).toBeGreaterThanOrEqual(2);

    // Cleanup
    await caller.savedSearches.delete({ id: search1.id });
    await caller.savedSearches.delete({ id: search2.id });
  });
});
