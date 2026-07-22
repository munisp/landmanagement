/**
 * Redis Cache Service
 * 
 * Provides caching functionality with TTL management and invalidation patterns.
 * Includes metrics collection for cache hits/misses.
 */

import Redis from 'ioredis';
import { logger } from './logger';
import { cacheHits, cacheMisses, cacheEvictions } from './metrics';

// Redis client instance
let redis: Redis | null = null;

// Cache configuration
const REDIS_URL = process.env.REDIS_URL?.trim();
const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_DB = parseInt(process.env.REDIS_DB || '0', 10);
const REDIS_MAX_RETRIES = parseInt(process.env.REDIS_MAX_RETRIES || '3', 10);
const REDIS_RETRY_DELAY = parseInt(process.env.REDIS_RETRY_DELAY || '1000', 10);

// Default TTL values (in seconds)
export const CacheTTL = {
  SHORT: 60,           // 1 minute
  MEDIUM: 300,         // 5 minutes
  LONG: 1800,          // 30 minutes
  VERY_LONG: 3600,     // 1 hour
  DAY: 86400,          // 24 hours
} as const;

/**
 * Initialize Redis connection
 */
export function initializeCache(): void {
  if (!CACHE_ENABLED) {
    logger.info('Redis cache explicitly disabled');
    return;
  }
  if (!REDIS_URL) {
    if (process.env.NODE_ENV === 'test') {
      logger.info('Redis cache is not configured for this test process');
      return;
    }
    throw new Error('REDIS_URL must be configured when CACHE_ENABLED is not false');
  }
  if (redis) {
    logger.warn('Cache already initialized');
    return;
  }

  try {
    redis = new Redis(REDIS_URL, {
      password: REDIS_PASSWORD,
      db: REDIS_DB,
      maxRetriesPerRequest: REDIS_MAX_RETRIES,
      retryStrategy: (times: number) => {
        if (times > REDIS_MAX_RETRIES) {
          logger.error('Redis max retries exceeded');
          return null;
        }
        const delay = Math.min(times * REDIS_RETRY_DELAY, 3000);
        return delay;
      },
      lazyConnect: true,
    });

    redis.on('connect', () => {
      logger.info('Redis connected');
    });

    redis.on('error', (error) => {
      logger.error({ error: error.message }, 'Redis connection error');
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redis.on('reconnecting', () => {
      logger.info('Redis reconnecting');
    });

    // Attempt to connect
    redis.connect().catch((error) => {
      logger.error({ error: error.message }, 'Failed to connect to Redis');
    });

  } catch (error) {
    logger.error({ error }, 'Failed to initialize Redis');
  }
}

/**
 * Get Redis client instance
 */
export function getRedisClient(): Redis | null {
  return redis;
}

/**
 * Check if cache is available
 */
export function isCacheAvailable(): boolean {
  return redis !== null && redis.status === 'ready';
}

/**
 * Get value from cache
 */
export async function get<T>(key: string): Promise<T | null> {
  if (!isCacheAvailable()) {
    logger.debug({ key }, 'Cache not available, skipping get');
    return null;
  }

  try {
    const value = await redis!.get(key);
    
    if (value === null) {
      cacheMisses.inc();
      logger.debug({ key }, 'Cache miss');
      return null;
    }

    cacheHits.inc();
    logger.debug({ key }, 'Cache hit');
    return JSON.parse(value) as T;
  } catch (error) {
    logger.error({ key, error }, 'Cache get error');
    cacheMisses.inc();
    return null;
  }
}

/**
 * Set value in cache with TTL
 */
export async function set(
  key: string,
  value: any,
  ttl: number = CacheTTL.MEDIUM
): Promise<void> {
  if (!isCacheAvailable()) {
    logger.debug({ key }, 'Cache not available, skipping set');
    return;
  }

  try {
    const serialized = JSON.stringify(value);
    await redis!.setex(key, ttl, serialized);
    logger.debug({ key, ttl }, 'Cache set');
  } catch (error) {
    logger.error({ key, error }, 'Cache set error');
  }
}

/**
 * Delete value from cache
 */
export async function del(key: string): Promise<void> {
  if (!isCacheAvailable()) {
    logger.debug({ key }, 'Cache not available, skipping del');
    return;
  }

  try {
    await redis!.del(key);
    cacheEvictions.inc();
    logger.debug({ key }, 'Cache delete');
  } catch (error) {
    logger.error({ key, error }, 'Cache delete error');
  }
}

/**
 * Invalidate cache by pattern
 * 
 * @example
 * // Invalidate all property caches
 * await invalidate('property:*');
 * 
 * // Invalidate specific user's caches
 * await invalidate('user:123:*');
 */
export async function invalidate(pattern: string): Promise<number> {
  if (!isCacheAvailable()) {
    logger.debug({ pattern }, 'Cache not available, skipping invalidate');
    return 0;
  }

  try {
    const keys = await redis!.keys(pattern);
    
    if (keys.length === 0) {
      logger.debug({ pattern }, 'No keys found for pattern');
      return 0;
    }

    const deleted = await redis!.del(...keys);
    cacheEvictions.inc(deleted);
    logger.info({ pattern, count: deleted }, 'Cache invalidated');
    return deleted;
  } catch (error) {
    logger.error({ pattern, error }, 'Cache invalidate error');
    return 0;
  }
}

/**
 * Get multiple values from cache
 */
export async function mget<T>(keys: string[]): Promise<(T | null)[]> {
  if (!isCacheAvailable() || keys.length === 0) {
    return keys.map(() => null);
  }

  try {
    const values = await redis!.mget(...keys);
    
    return values.map((value, index) => {
      if (value === null) {
        cacheMisses.inc();
        logger.debug({ key: keys[index] }, 'Cache miss');
        return null;
      }
      
      cacheHits.inc();
      logger.debug({ key: keys[index] }, 'Cache hit');
      return JSON.parse(value) as T;
    });
  } catch (error) {
    logger.error({ keys, error }, 'Cache mget error');
    cacheMisses.inc(keys.length);
    return keys.map(() => null);
  }
}

/**
 * Set multiple values in cache
 */
export async function mset(
  entries: Array<{ key: string; value: any; ttl?: number }>
): Promise<void> {
  if (!isCacheAvailable() || entries.length === 0) {
    return;
  }

  try {
    const pipeline = redis!.pipeline();
    
    for (const entry of entries) {
      const serialized = JSON.stringify(entry.value);
      const ttl = entry.ttl || CacheTTL.MEDIUM;
      pipeline.setex(entry.key, ttl, serialized);
    }
    
    await pipeline.exec();
    logger.debug({ count: entries.length }, 'Cache mset');
  } catch (error) {
    logger.error({ error }, 'Cache mset error');
  }
}

/**
 * Check if key exists in cache
 */
export async function exists(key: string): Promise<boolean> {
  if (!isCacheAvailable()) {
    return false;
  }

  try {
    const result = await redis!.exists(key);
    return result === 1;
  } catch (error) {
    logger.error({ key, error }, 'Cache exists error');
    return false;
  }
}

/**
 * Get remaining TTL for a key
 */
export async function ttl(key: string): Promise<number> {
  if (!isCacheAvailable()) {
    return -2;
  }

  try {
    return await redis!.ttl(key);
  } catch (error) {
    logger.error({ key, error }, 'Cache ttl error');
    return -2;
  }
}

/**
 * Extend TTL for a key
 */
export async function expire(key: string, ttl: number): Promise<boolean> {
  if (!isCacheAvailable()) {
    return false;
  }

  try {
    const result = await redis!.expire(key, ttl);
    return result === 1;
  } catch (error) {
    logger.error({ key, error }, 'Cache expire error');
    return false;
  }
}

/**
 * Flush all cache
 * WARNING: Use with caution in production
 */
export async function flushAll(): Promise<void> {
  if (!isCacheAvailable()) {
    return;
  }

  try {
    await redis!.flushdb();
    logger.warn('Cache flushed');
  } catch (error) {
    logger.error({ error }, 'Cache flush error');
  }
}

/**
 * Get cache statistics
 */
export async function getStats(): Promise<{
  connected: boolean;
  status: string;
  dbSize: number;
  memory: string;
}> {
  if (!redis) {
    return {
      connected: false,
      status: 'not_initialized',
      dbSize: 0,
      memory: '0',
    };
  }

  try {
    const dbSize = await redis.dbsize();
    const info = await redis.info('memory');
    const memoryMatch = info.match(/used_memory_human:(.+)/);
    const memory = memoryMatch ? memoryMatch[1].trim() : '0';

    return {
      connected: redis.status === 'ready',
      status: redis.status,
      dbSize,
      memory,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get cache stats');
    return {
      connected: false,
      status: redis.status,
      dbSize: 0,
      memory: '0',
    };
  }
}

/**
 * Close Redis connection
 */
export async function closeCache(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis connection closed');
  }
}

/**
 * Cache key builders for consistent naming
 */
export const CacheKeys = {
  property: (id: string) => `property:${id}`,
  propertyList: (filters: string) => `property:list:${filters}`,
  transaction: (id: string) => `transaction:${id}`,
  transactionList: (filters: string) => `transaction:list:${filters}`,
  user: (id: string) => `user:${id}`,
  userPermissions: (id: string) => `user:${id}:permissions`,
  search: (query: string) => `search:${query}`,
  analytics: (type: string, period: string) => `analytics:${type}:${period}`,
  report: (id: string) => `report:${id}`,
} as const;

// Initialize cache on module load
initializeCache();
