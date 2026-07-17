/**
 * Redis-based Rate Limiting Service
 * Implements token bucket algorithm with per-user quotas
 */

import Redis from 'ioredis';

// Redis client configuration
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

export interface RateLimitConfig {
  points: number;        // Number of requests allowed
  duration: number;      // Time window in seconds
  blockDuration?: number; // How long to block after limit exceeded (seconds)
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

// Rate limit tiers
export const RATE_LIMITS = {
  // Anonymous users
  anonymous: {
    points: 10,
    duration: 60, // 10 requests per minute
    blockDuration: 300, // Block for 5 minutes
  },
  
  // Authenticated users
  authenticated: {
    points: 100,
    duration: 60, // 100 requests per minute
    blockDuration: 60,
  },
  
  // Premium users
  premium: {
    points: 500,
    duration: 60, // 500 requests per minute
    blockDuration: 30,
  },
  
  // API endpoints
  api: {
    points: 1000,
    duration: 3600, // 1000 requests per hour
    blockDuration: 300,
  },
  
  // Authentication endpoints (stricter)
  auth: {
    points: 5,
    duration: 300, // 5 requests per 5 minutes
    blockDuration: 900, // Block for 15 minutes
  },
  
  // Search endpoints
  search: {
    points: 30,
    duration: 60, // 30 searches per minute
    blockDuration: 120,
  },
  
  // File uploads
  upload: {
    points: 10,
    duration: 3600, // 10 uploads per hour
    blockDuration: 600,
  },
};

/**
 * Check rate limit using token bucket algorithm
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const bucketKey = `ratelimit:${key}`;
  const blockKey = `ratelimit:block:${key}`;
  
  try {
    // Check if currently blocked
    const blocked = await redis.get(blockKey);
    if (blocked) {
      const blockExpiry = parseInt(blocked);
      const retryAfter = Math.ceil((blockExpiry - now) / 1000);
      
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(blockExpiry),
        retryAfter,
      };
    }
    
    // Use Lua script for atomic operations
    const script = `
      local key = KEYS[1]
      local points = tonumber(ARGV[1])
      local duration = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      
      local current = redis.call('GET', key)
      
      if current == false then
        redis.call('SET', key, points - 1, 'EX', duration)
        return {points - 1, now + (duration * 1000)}
      end
      
      current = tonumber(current)
      
      if current > 0 then
        redis.call('DECR', key)
        local ttl = redis.call('TTL', key)
        return {current - 1, now + (ttl * 1000)}
      end
      
      local ttl = redis.call('TTL', key)
      return {0, now + (ttl * 1000)}
    `;
    
    const result = await redis.eval(
      script,
      1,
      bucketKey,
      config.points,
      config.duration,
      now
    ) as [number, number];
    
    const [remaining, resetAt] = result;
    
    // If limit exceeded, set block
    if (remaining <= 0 && config.blockDuration) {
      const blockExpiry = now + (config.blockDuration * 1000);
      await redis.set(blockKey, blockExpiry.toString(), 'EX', config.blockDuration);
      
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(resetAt),
        retryAfter: config.blockDuration,
      };
    }
    
    return {
      allowed: remaining >= 0,
      remaining: Math.max(0, remaining),
      resetAt: new Date(resetAt),
    };
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // Fail open - allow request if Redis is down
    return {
      allowed: true,
      remaining: config.points,
      resetAt: new Date(now + config.duration * 1000),
    };
  }
}

/**
 * Rate limit middleware for Express
 */
export function rateLimitMiddleware(
  configKey: keyof typeof RATE_LIMITS,
  keyGenerator?: (req: any) => string
) {
  return async (req: any, res: any, next: any) => {
    const config = RATE_LIMITS[configKey];
    
    // Generate rate limit key
    let key: string;
    if (keyGenerator) {
      key = keyGenerator(req);
    } else if (req.user) {
      key = `user:${req.user.id}:${configKey}`;
    } else {
      key = `ip:${req.ip}:${configKey}`;
    }
    
    const result = await checkRateLimit(key, config);
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', config.points);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());
    
    if (!result.allowed) {
      if (result.retryAfter) {
        res.setHeader('Retry-After', result.retryAfter);
      }
      
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: result.retryAfter,
        resetAt: result.resetAt,
      });
    }
    
    next();
  };
}

/**
 * Get rate limit status for a key
 */
export async function getRateLimitStatus(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const bucketKey = `ratelimit:${key}`;
  const blockKey = `ratelimit:block:${key}`;
  const now = Date.now();
  
  try {
    // Check if blocked
    const blocked = await redis.get(blockKey);
    if (blocked) {
      const blockExpiry = parseInt(blocked);
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(blockExpiry),
        retryAfter: Math.ceil((blockExpiry - now) / 1000),
      };
    }
    
    // Get current bucket value
    const current = await redis.get(bucketKey);
    const ttl = await redis.ttl(bucketKey);
    
    if (!current) {
      return {
        allowed: true,
        remaining: config.points,
        resetAt: new Date(now + config.duration * 1000),
      };
    }
    
    return {
      allowed: parseInt(current) > 0,
      remaining: Math.max(0, parseInt(current)),
      resetAt: new Date(now + ttl * 1000),
    };
  } catch (error) {
    console.error('Failed to get rate limit status:', error);
    return {
      allowed: true,
      remaining: config.points,
      resetAt: new Date(now + config.duration * 1000),
    };
  }
}

/**
 * Reset rate limit for a key
 */
export async function resetRateLimit(key: string): Promise<void> {
  const bucketKey = `ratelimit:${key}`;
  const blockKey = `ratelimit:block:${key}`;
  
  await Promise.all([
    redis.del(bucketKey),
    redis.del(blockKey),
  ]);
}

/**
 * Get rate limit statistics
 */
export async function getRateLimitStats(): Promise<{
  totalKeys: number;
  blockedKeys: number;
  topConsumers: Array<{ key: string; remaining: number }>;
}> {
  try {
    const keys = await redis.keys('ratelimit:*');
    const blockKeys = keys.filter((k: string) => k.includes(':block:'));
    
    // Get top consumers (lowest remaining counts)
    const bucketKeys = keys.filter((k: string) => !k.includes(':block:'));
    const values = await Promise.all(
      bucketKeys.slice(0, 100).map(async (k: string) => ({
        key: k.replace('ratelimit:', ''),
        remaining: parseInt(await redis.get(k) || '0'),
      }))
    );
    
    const topConsumers = values
      .sort((a: { key: string; remaining: number }, b: { key: string; remaining: number }) => a.remaining - b.remaining)
      .slice(0, 10);
    
    return {
      totalKeys: keys.length,
      blockedKeys: blockKeys.length,
      topConsumers,
    };
  } catch (error) {
    console.error('Failed to get rate limit stats:', error);
    return {
      totalKeys: 0,
      blockedKeys: 0,
      topConsumers: [],
    };
  }
}

/**
 * Burst protection - allows temporary burst above limit
 */
export async function checkRateLimitWithBurst(
  key: string,
  config: RateLimitConfig,
  burstMultiplier: number = 1.5
): Promise<RateLimitResult> {
  const burstConfig = {
    ...config,
    points: Math.floor(config.points * burstMultiplier),
  };
  
  return checkRateLimit(key, burstConfig);
}

/**
 * Sliding window rate limiter (more accurate than fixed window)
 */
export async function checkRateLimitSlidingWindow(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - (config.duration * 1000);
  const bucketKey = `ratelimit:sliding:${key}`;
  
  try {
    // Use sorted set to track requests in sliding window
    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local max_requests = tonumber(ARGV[3])
      local duration = tonumber(ARGV[4])
      
      -- Remove old entries
      redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
      
      -- Count requests in current window
      local current = redis.call('ZCARD', key)
      
      if current < max_requests then
        redis.call('ZADD', key, now, now)
        redis.call('EXPIRE', key, duration)
        return {1, max_requests - current - 1, now + (duration * 1000)}
      end
      
      return {0, 0, now + (duration * 1000)}
    `;
    
    const result = await redis.eval(
      script,
      1,
      bucketKey,
      now,
      windowStart,
      config.points,
      config.duration
    ) as [number, number, number];
    
    const [allowed, remaining, resetAt] = result;
    
    return {
      allowed: allowed === 1,
      remaining,
      resetAt: new Date(resetAt),
    };
  } catch (error) {
    console.error('Sliding window rate limit check failed:', error);
    return {
      allowed: true,
      remaining: config.points,
      resetAt: new Date(now + config.duration * 1000),
    };
  }
}

// Export Redis client for other uses
export { redis };
