import { describe, it, expect, beforeAll } from 'vitest';
import { createApiKey, listApiKeys, revokeApiKey, rotateApiKey, getUsageStats, validateApiKey } from './apiKeyService';
import { getDb } from './db';
import { users } from '../drizzle/schema';

describe('API Key Service', () => {
  let testUserId: string;
  let testKeyId: string;
  let testKeyValue: string;

  beforeAll(async () => {
    // Get a test user ID from the database when available, otherwise use the offline seed user.
    const db = await getDb();
    if (!db) {
      testUserId = '901';
      return;
    }
    
    const usersList = await db.select().from(users).limit(1);
    if (usersList.length === 0) throw new Error('No users found in database');
    
    testUserId = String(usersList[0].id);
  });

  it('should create a new API key', async () => {
    const apiKey = await createApiKey(testUserId, 'Test Key');
    
    expect(apiKey).toBeDefined();
    expect(apiKey.id).toBeDefined();
    expect(apiKey.userId).toBe(testUserId);
    expect(apiKey.name).toBe('Test Key');
    expect(apiKey.key).toMatch(/^idlr_[a-f0-9]{64}$/);
    expect(apiKey.isActive).toBe(true);
    expect(apiKey.requestCount).toBe(0);
    expect(apiKey.rateLimit).toBe(1000);
    
    // Store for later tests
    testKeyId = apiKey.id;
    testKeyValue = apiKey.key;
  });

  it('should list all API keys for a user', async () => {
    const keys = await listApiKeys(testUserId);
    
    expect(keys).toBeDefined();
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBeGreaterThan(0);
    
    const testKey = keys.find(k => k.id === testKeyId);
    expect(testKey).toBeDefined();
    expect(testKey?.name).toBe('Test Key');
  });

  it('should validate an API key', async () => {
    const validatedKey = await validateApiKey(testKeyValue);
    
    expect(validatedKey).toBeDefined();
    expect(validatedKey?.id).toBe(testKeyId);
    expect(validatedKey?.userId).toBe(testUserId);
    expect(validatedKey?.isActive).toBe(true);
    expect(validatedKey?.requestCount).toBeGreaterThan(0); // Should increment
  });

  it('should return null for invalid API key', async () => {
    const invalidKey = await validateApiKey('invalid_key_12345');
    
    expect(invalidKey).toBeNull();
  });

  it('should get usage statistics', async () => {
    const stats = await getUsageStats(testUserId);
    
    expect(stats).toBeDefined();
    expect(stats.totalKeys).toBeGreaterThan(0);
    expect(stats.activeKeys).toBeGreaterThan(0);
    expect(stats.requestsToday).toBeGreaterThanOrEqual(0);
    expect(stats.requestsThisMonth).toBeGreaterThanOrEqual(0);
    expect(stats.rateLimitHits).toBeGreaterThanOrEqual(0);
    expect(stats.errorRate).toBeGreaterThanOrEqual(0);
  });

  it('should rotate an API key', async () => {
    const rotatedKey = await rotateApiKey(testUserId, testKeyId);
    
    expect(rotatedKey).toBeDefined();
    expect(rotatedKey.id).not.toBe(testKeyId); // Should be a new key
    expect(rotatedKey.userId).toBe(testUserId);
    expect(rotatedKey.name).toBe('Test Key'); // Same name
    expect(rotatedKey.key).not.toBe(testKeyValue); // Different key value
    expect(rotatedKey.isActive).toBe(true);
    
    // Old key should be revoked
    const oldKey = await validateApiKey(testKeyValue);
    expect(oldKey).toBeNull();
    
    // Update test variables
    testKeyId = rotatedKey.id;
    testKeyValue = rotatedKey.key;
  });

  it('should revoke an API key', async () => {
    await revokeApiKey(testUserId, testKeyId);
    
    // Key should no longer validate
    const revokedKey = await validateApiKey(testKeyValue);
    expect(revokedKey).toBeNull();
    
    // Key should still appear in list but as inactive
    const keys = await listApiKeys(testUserId);
    const testKey = keys.find(k => k.id === testKeyId);
    expect(testKey).toBeDefined();
    expect(testKey?.isActive).toBe(false);
  });

  it('should handle multiple API keys for same user', async () => {
    const key1 = await createApiKey(testUserId, 'Production Key');
    const key2 = await createApiKey(testUserId, 'Development Key');
    const key3 = await createApiKey(testUserId, 'Testing Key');
    
    const keys = await listApiKeys(testUserId);
    
    expect(keys.length).toBeGreaterThanOrEqual(3);
    expect(keys.some(k => k.name === 'Production Key')).toBe(true);
    expect(keys.some(k => k.name === 'Development Key')).toBe(true);
    expect(keys.some(k => k.name === 'Testing Key')).toBe(true);
    
    // Clean up
    await revokeApiKey(testUserId, key1.id);
    await revokeApiKey(testUserId, key2.id);
    await revokeApiKey(testUserId, key3.id);
  });
});
