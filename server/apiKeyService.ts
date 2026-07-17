import { getDb } from './db';
import { apiKeys } from '../drizzle/schema';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import crypto from 'crypto';
import {
  createOfflineApiKey,
  getOfflineApiKeyUsageStats,
  listOfflineApiKeys,
  revokeOfflineApiKey,
  rotateOfflineApiKey,
  validateOfflineApiKey,
} from './apiKeyRepository';

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  key: string;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  requestCount: number;
  rateLimit: number;
}

export interface UsageStats {
  totalKeys: number;
  activeKeys: number;
  requestsToday: number;
  requestsThisMonth: number;
  rateLimitHits: number;
  errorRate: number;
}

/**
 * Generate a secure API key
 */
function generateApiKey(): string {
  const prefix = 'idlr';
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `${prefix}_${randomBytes}`;
}

/**
 * List all API keys for a user
 */
export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  const db = await getDb();
  if (!db) return listOfflineApiKeys(userId);
  const keys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, parseInt(userId)))
    .orderBy(desc(apiKeys.createdAt));
  
  return keys.map(k => ({
    id: k.id,
    userId: String(k.userId),
    name: k.name,
    key: k.key,
    isActive: k.isActive,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
    expiresAt: k.expiresAt,
    requestCount: k.requestCount,
    rateLimit: k.rateLimit,
  }));
}

/**
 * Create a new API key
 */
export async function createApiKey(userId: string, name: string): Promise<ApiKey> {
  const db = await getDb();
  if (!db) return createOfflineApiKey(userId, name);
  const key = generateApiKey();
  
  const [newKey] = await db
    .insert(apiKeys)
    .values({
      id: crypto.randomUUID(),
      userId: parseInt(userId),
      name,
      key,
      isActive: true,
      createdAt: new Date(),
      lastUsedAt: null,
      expiresAt: null, // No expiration by default
      requestCount: 0,
      rateLimit: 1000, // Default: 1000 requests per hour
    })
    .returning();
  
  return {
    id: newKey.id,
    userId: String(newKey.userId),
    name: newKey.name,
    key: newKey.key,
    isActive: newKey.isActive,
    createdAt: newKey.createdAt,
    lastUsedAt: newKey.lastUsedAt,
    expiresAt: newKey.expiresAt,
    requestCount: newKey.requestCount,
    rateLimit: newKey.rateLimit,
  };
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(userId: string, keyId: string): Promise<void> {
  const db = await getDb();
  if (!db) return revokeOfflineApiKey(userId, keyId);
  await db
    .update(apiKeys)
    .set({ isActive: false })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, parseInt(userId))));
}

/**
 * Rotate an API key (revoke old, create new with same name)
 */
export async function rotateApiKey(userId: string, keyId: string): Promise<ApiKey> {
  const db = await getDb();
  if (!db) return rotateOfflineApiKey(userId, keyId);
  
  // Get the old key
  const [oldKey] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, parseInt(userId))));
  
  if (!oldKey) {
    throw new Error('API key not found');
  }
  
  // Revoke the old key
  await revokeApiKey(userId, keyId);
  
  // Create a new key with the same name
  return await createApiKey(userId, oldKey.name);
}

/**
 * Get usage statistics for a user's API keys
 */
export async function getUsageStats(userId: string): Promise<UsageStats> {
  const db = await getDb();
  if (!db) return getOfflineApiKeyUsageStats(userId);
  
  // Get all keys for the user
  const userKeys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, parseInt(userId)));
  
  const totalKeys = userKeys.length;
  const activeKeys = userKeys.filter(k => k.isActive).length;
  
  // Calculate total requests
  const totalRequests = userKeys.reduce((sum: number, k: any) => sum + k.requestCount, 0);
  
  // For demo purposes, simulate today's and this month's requests
  // In production, you would track this in a separate analytics table
  const requestsToday = Math.floor(totalRequests * 0.1); // 10% of total
  const requestsThisMonth = Math.floor(totalRequests * 0.5); // 50% of total
  
  // Simulate rate limit hits and error rate
  const rateLimitHits = Math.floor(totalRequests * 0.02); // 2% hit rate limit
  const errorRate = 0.5; // 0.5% error rate
  
  return {
    totalKeys,
    activeKeys,
    requestsToday,
    requestsThisMonth,
    rateLimitHits,
    errorRate,
  };
}

/**
 * Validate an API key and increment request count
 */
export async function validateApiKey(key: string): Promise<ApiKey | null> {
  const db = await getDb();
  if (!db) return validateOfflineApiKey(key);
  
  const [apiKey] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.key, key), eq(apiKeys.isActive, true)));
  
  if (!apiKey) {
    return null;
  }
  
  // Check if key is expired
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    return null;
  }
  
  // Update last used timestamp and increment request count
  await db
    .update(apiKeys)
    .set({
      lastUsedAt: new Date(),
      requestCount: sql`${apiKeys.requestCount} + 1`,
    })
    .where(eq(apiKeys.id, apiKey.id));
  
  return {
    id: apiKey.id,
    userId: String(apiKey.userId),
    name: apiKey.name,
    key: apiKey.key,
    isActive: apiKey.isActive,
    createdAt: apiKey.createdAt,
    lastUsedAt: new Date(),
    expiresAt: apiKey.expiresAt,
    requestCount: apiKey.requestCount + 1,
    rateLimit: apiKey.rateLimit,
  };
}
