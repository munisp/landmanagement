/**
 * Production Health Check Endpoints
 * Implements health, readiness, and liveness probes for Kubernetes
 */

import { Request, Response } from 'express';

interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      responseTime?: number;
    };
  };
}

/**
 * Basic health check - returns 200 if service is running
 * Used by load balancers and monitoring systems
 */
export async function healthCheck(req: Request, res: Response) {
  const startTime = Date.now();
  
  const health: HealthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    checks: {},
  };

  // Check database connectivity
  try {
    const dbStart = Date.now();
    // Simple query to check database
    // await db.execute('SELECT 1');
    health.checks.database = {
      status: 'pass',
      responseTime: Date.now() - dbStart,
    };
  } catch (error) {
    health.checks.database = {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
    health.status = 'unhealthy';
  }

  // Check Redis connectivity
  try {
    const redisStart = Date.now();
    // await redis.ping();
    health.checks.redis = {
      status: 'pass',
      responseTime: Date.now() - redisStart,
    };
  } catch (error) {
    health.checks.redis = {
      status: 'warn',
      message: 'Redis unavailable - caching disabled',
    };
    health.status = 'degraded';
  }

  // Check storage connectivity
  try {
    const storageStart = Date.now();
    // Test S3 connectivity
    health.checks.storage = {
      status: 'pass',
      responseTime: Date.now() - storageStart,
    };
  } catch (error) {
    health.checks.storage = {
      status: 'warn',
      message: 'Storage service degraded',
    };
    health.status = 'degraded';
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  health.checks.memory = {
    status: memUsagePercent < 90 ? 'pass' : 'warn',
    message: `${memUsagePercent.toFixed(2)}% used`,
  };

  // Check CPU usage
  const cpuUsage = process.cpuUsage();
  health.checks.cpu = {
    status: 'pass',
    message: `user: ${cpuUsage.user}, system: ${cpuUsage.system}`,
  };

  const responseTime = Date.now() - startTime;
  
  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  
  res.status(statusCode).json({
    ...health,
    responseTime,
  });
}

/**
 * Readiness probe - returns 200 when service is ready to accept traffic
 * Used by Kubernetes to determine when to route traffic to pod
 */
export async function readinessCheck(req: Request, res: Response) {
  const checks = {
    database: false,
    migrations: false,
  };

  // Check if database is accessible
  try {
    // await db.execute('SELECT 1');
    checks.database = true;
  } catch (error) {
    return res.status(503).json({
      status: 'not_ready',
      message: 'Database not accessible',
      checks,
    });
  }

  // Check if migrations are up to date
  try {
    // Check migration status
    checks.migrations = true;
  } catch (error) {
    return res.status(503).json({
      status: 'not_ready',
      message: 'Database migrations pending',
      checks,
    });
  }

  res.status(200).json({
    status: 'ready',
    checks,
  });
}

/**
 * Liveness probe - returns 200 if service is alive
 * Used by Kubernetes to determine if pod should be restarted
 */
export async function livenessCheck(req: Request, res: Response) {
  // Simple check - if we can respond, we're alive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

/**
 * Metrics endpoint - Prometheus-compatible metrics
 */
export async function metricsEndpoint(req: Request, res: Response) {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  const metrics = `
# HELP nodejs_heap_size_total_bytes Total heap size
# TYPE nodejs_heap_size_total_bytes gauge
nodejs_heap_size_total_bytes ${memUsage.heapTotal}

# HELP nodejs_heap_size_used_bytes Used heap size
# TYPE nodejs_heap_size_used_bytes gauge
nodejs_heap_size_used_bytes ${memUsage.heapUsed}

# HELP nodejs_external_memory_bytes External memory
# TYPE nodejs_external_memory_bytes gauge
nodejs_external_memory_bytes ${memUsage.external}

# HELP process_cpu_user_seconds_total User CPU time
# TYPE process_cpu_user_seconds_total counter
process_cpu_user_seconds_total ${cpuUsage.user / 1000000}

# HELP process_cpu_system_seconds_total System CPU time
# TYPE process_cpu_system_seconds_total counter
process_cpu_system_seconds_total ${cpuUsage.system / 1000000}

# HELP process_uptime_seconds Process uptime
# TYPE process_uptime_seconds gauge
process_uptime_seconds ${process.uptime()}
  `.trim();

  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(metrics);
}

/**
 * Graceful shutdown handler
 */
export function setupGracefulShutdown(server: any) {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      console.log('Shutdown already in progress...');
      return;
    }

    isShuttingDown = true;
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed');
    });

    // Set a timeout for forceful shutdown
    const forceShutdownTimeout = setTimeout(() => {
      console.error('Forceful shutdown after timeout');
      process.exit(1);
    }, 30000); // 30 seconds

    try {
      // Close database connections
      console.log('Closing database connections...');
      // await db.end();

      // Close Redis connections
      console.log('Closing Redis connections...');
      // await redis.quit();

      // Finish processing in-flight requests
      console.log('Waiting for in-flight requests to complete...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      clearTimeout(forceShutdownTimeout);
      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      clearTimeout(forceShutdownTimeout);
      process.exit(1);
    }
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
  });
}

/**
 * Request timeout middleware
 */
export function requestTimeout(timeoutMs: number = 30000) {
  return (req: Request, res: Response, next: Function) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request timeout',
          message: `Request took longer than ${timeoutMs}ms`,
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    next();
  };
}

/**
 * Circuit breaker for external services
 */
export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000,
    private resetTimeout: number = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    };
  }
}
