/**
 * Production-Grade Database Configuration
 * 
 * Features:
 * - Connection pooling with pg-pool
 * - Health checks and monitoring
 * - Graceful shutdown handling
 * - Connection retry logic
 * - Performance metrics
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../drizzle/schema';

// Database configuration
const connectionString = (process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || '').trim();
if (!connectionString) {
  throw new Error('POSTGRES_URL, DATABASE_URL, or TEST_DATABASE_URL must be configured for the database pool');
}

// Production-grade pool configuration
const poolConfig: PoolConfig = {
  connectionString,
  // Connection pool settings
  min: parseInt(process.env.DB_POOL_MIN || '2', 10), // Minimum connections
  max: parseInt(process.env.DB_POOL_MAX || '20', 10), // Maximum connections
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10), // 30 seconds
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10), // 10 seconds
  
  // Statement timeout (prevent long-running queries)
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10), // 30 seconds
  
  // Query timeout
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000', 10), // 30 seconds
  
  // Application name for monitoring
  application_name: process.env.APP_NAME || 'idlr-pts-platform',
  
  // SSL configuration for production
  ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false,
};

// Create connection pool
export const pool = new Pool(poolConfig);

// Pool event handlers for monitoring
pool.on('connect', (client) => {
  console.log('[Database] New client connected to pool');
  metrics.totalConnections++;
});

pool.on('acquire', (client) => {
  console.log('[Database] Client acquired from pool');
  metrics.activeConnections++;
});

pool.on('remove', (client) => {
  console.log('[Database] Client removed from pool');
  metrics.totalConnections--;
});

pool.on('error', (err, client) => {
  console.error('[Database] Unexpected error on idle client', err);
  metrics.errors++;
});

// Create Drizzle instance
export const db = drizzle(pool, { schema });

// Database metrics
export const metrics = {
  totalConnections: 0,
  activeConnections: 0,
  errors: 0,
  queries: 0,
  slowQueries: 0,
  lastHealthCheck: new Date(),
};

/**
 * Execute a query with performance monitoring
 */
export async function executeQuery<T>(
  queryFn: (db: typeof import('drizzle-orm/node-postgres').NodePgDatabase) => Promise<T>,
  queryName?: string
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await queryFn(db as any);
    const duration = Date.now() - startTime;
    
    metrics.queries++;
    
    // Log slow queries (>1000ms)
    if (duration > 1000) {
      metrics.slowQueries++;
      console.warn(`[Database] Slow query detected: ${queryName || 'unknown'} took ${duration}ms`);
    }
    
    return result;
  } catch (error) {
    metrics.errors++;
    console.error(`[Database] Query error: ${queryName || 'unknown'}`, error);
    throw error;
  }
}

/**
 * Health check for database connectivity
 */
export async function healthCheck(): Promise<{
  healthy: boolean;
  latency: number;
  poolStatus: {
    total: number;
    idle: number;
    waiting: number;
  };
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    // Simple query to test connectivity
    await pool.query('SELECT 1');
    
    const latency = Date.now() - startTime;
    metrics.lastHealthCheck = new Date();
    
    return {
      healthy: true,
      latency,
      poolStatus: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    
    return {
      healthy: false,
      latency,
      poolStatus: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get database metrics
 */
export function getMetrics() {
  return {
    ...metrics,
    pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
      max: poolConfig.max,
      min: poolConfig.min,
    },
  };
}

/**
 * Graceful shutdown - close all connections
 */
export async function shutdown(): Promise<void> {
  console.log('[Database] Closing connection pool...');
  
  try {
    await pool.end();
    console.log('[Database] Connection pool closed successfully');
  } catch (error) {
    console.error('[Database] Error closing connection pool', error);
    throw error;
  }
}

/**
 * Initialize database connection with retry logic
 */
export async function initializeDatabase(maxRetries = 5, retryDelay = 5000): Promise<void> {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      console.log(`[Database] Attempting to connect... (attempt ${retries + 1}/${maxRetries})`);
      
      const health = await healthCheck();
      
      if (health.healthy) {
        console.log(`[Database] Connected successfully (latency: ${health.latency}ms)`);
        console.log(`[Database] Pool status:`, health.poolStatus);
        return;
      }
      
      throw new Error(health.error || 'Health check failed');
    } catch (error) {
      retries++;
      
      if (retries >= maxRetries) {
        console.error('[Database] Failed to connect after maximum retries');
        throw error;
      }
      
      console.warn(`[Database] Connection failed, retrying in ${retryDelay}ms...`, error);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

// Handle process termination
process.on('SIGTERM', async () => {
  console.log('[Database] SIGTERM received, closing connections...');
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Database] SIGINT received, closing connections...');
  await shutdown();
  process.exit(0);
});

// Export for backward compatibility
export { pool as pgPool };
export default db;
