import { requireDb } from './db';
import { apiKeys, apiKeyUsageEvents } from '../drizzle/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import crypto from 'crypto';

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
  const db = await requireDb();
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
  const db = await requireDb();
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
  const db = await requireDb();
  await db
    .update(apiKeys)
    .set({ isActive: false })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, parseInt(userId))));
}

/**
 * Rotate an API key (revoke old, create new with same name)
 */
export async function rotateApiKey(userId: string, keyId: string): Promise<ApiKey> {
  const db = await requireDb();
  
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
  const db = await requireDb();
  
  // Get all keys for the user
  const userKeys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, parseInt(userId)));
  
  const totalKeys = userKeys.length;
  const activeKeys = userKeys.filter(k => k.isActive).length;

  // Real aggregates from the api_key_usage_events table — no simulation.
  // Events are recorded by validateApiKey on every validated request; rate
  // limit hits and errors are recorded by the enforcing gateway/middleware.
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const keyIds = userKeys.map(k => k.id);
  const emptyStats = {
    totalKeys,
    activeKeys,
    requestsToday: 0,
    requestsThisMonth: 0,
    rateLimitHits: 0,
    errorRate: 0,
  };
  if (keyIds.length === 0) {
    return emptyStats;
  }

  const events = await db
    .select({ event: apiKeyUsageEvents.event, createdAt: apiKeyUsageEvents.createdAt })
    .from(apiKeyUsageEvents)
    .where(inArray(apiKeyUsageEvents.keyId, keyIds));

  let requestsToday = 0;
  let requestsThisMonth = 0;
  let rateLimitHits = 0;
  let errorCount = 0;
  let totalRequests = 0;
  for (const e of events) {
    if (e.event === 'request') {
      totalRequests += 1;
      if (e.createdAt >= startOfDay) requestsToday += 1;
      if (e.createdAt >= startOfMonth) requestsThisMonth += 1;
    } else if (e.event === 'rate_limit_hit') {
      rateLimitHits += 1;
    } else if (e.event === 'error') {
      errorCount += 1;
    }
  }
  const errorRate = totalRequests + errorCount > 0
    ? (errorCount / (totalRequests + errorCount)) * 100
    : 0;

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
  const db = await requireDb();
  
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
  
  // Update last used timestamp, increment request count, and record a real
  // usage event so getUsageStats aggregates observed traffic.
  await db
    .update(apiKeys)
    .set({
      lastUsedAt: new Date(),
      requestCount: sql`${apiKeys.requestCount} + 1`,
    })
    .where(eq(apiKeys.id, apiKey.id));
  await db.insert(apiKeyUsageEvents).values({ keyId: apiKey.id, event: 'request' });
  
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
