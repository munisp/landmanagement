/**
 * Health Check and Readiness Probes
 *
 * Features:
 * - Liveness probe (is the service running?)
 * - Readiness probe (is the service ready to accept traffic?)
 * - Detailed health status for all dependencies
 * - Graceful degradation across optional middleware
 */

import type { Request, Response } from 'express';
import { getDb } from '../db';
import { getStats as getCacheStats } from './cache';
import {
  checkElasticsearchConnection,
  checkFabricConnection,
  checkKafkaConnection,
  checkMojalooConnection,
  checkTemporalConnection,
  checkTigerBeetleConnection,
} from './integrations';

const db = getDb();

type CheckStatus = 'up' | 'down' | 'degraded';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    [key: string]: {
      status: CheckStatus;
      message?: string;
      responseTime?: number;
      details?: any;
    };
  };
}

function mapIntegrationStatus(status: 'up' | 'down' | 'degraded' | 'not_configured'): CheckStatus {
  if (status === 'up') return 'up';
  if (status === 'down') return 'down';
  return 'degraded';
}

/**
 * Liveness probe - basic health check
 * Returns 200 if the service process is running.
 */
export async function livenessProbe(req: Request, res: Response) {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.APP_VERSION || '1.0.0',
  });
}

/**
 * Readiness probe - service is ready if critical dependencies are available.
 * Database is considered critical. Optional middleware contributes degradation.
 */
export async function readinessProbe(req: Request, res: Response) {
  const health = await checkHealth();
  const statusCode = health.checks.database?.status === 'up' ? 200 : 503;
  res.status(statusCode).json(health);
}

/**
 * Full health endpoint.
 */
export async function healthCheck(req: Request, res: Response) {
  const health = await checkHealth();
  const statusCode = health.status === 'unhealthy' ? 503 : 200;
  res.status(statusCode).json(health);
}

/**
 * Check health of all dependencies.
 */
export async function checkHealth(): Promise<HealthStatus> {
  const checks: HealthStatus['checks'] = {};

  checks.database = await checkDatabase();
  checks.redis = await checkRedis();
  checks.blockchain = await checkBlockchain();
  checks.payment = await checkPayment();
  checks.messaging = await checkMessaging();
  checks.workflow = await checkWorkflow();
  checks.search = await checkSearch();

  const statuses = Object.values(checks).map((check) => check.status);
  const hasDown = statuses.includes('down');
  const hasDegraded = statuses.includes('degraded');

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (checks.database?.status === 'down') {
    overallStatus = 'unhealthy';
  } else if (hasDown || hasDegraded) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.APP_VERSION || '1.0.0',
    checks,
  };
}

async function checkDatabase() {
  const start = Date.now();

  try {
    const dbInstance = await db;
    if (!dbInstance) {
      throw new Error('Database not initialized');
    }

    await dbInstance.execute('SELECT 1');

    return {
      status: 'up' as const,
      responseTime: Date.now() - start,
      message: 'Database connection healthy',
    };
  } catch (error) {
    return {
      status: 'down' as const,
      message: error instanceof Error ? error.message : 'Database connection failed',
      responseTime: Date.now() - start,
    };
  }
}

async function checkRedis() {
  const start = Date.now();

  try {
    const stats = await getCacheStats();

    if (!process.env.REDIS_URL) {
      return {
        status: 'degraded' as const,
        message: 'Redis not configured',
        responseTime: Date.now() - start,
        details: stats,
      };
    }

    if (!stats.connected) {
      return {
        status: 'degraded' as const,
        message: `Redis unavailable (${stats.status})`,
        responseTime: Date.now() - start,
        details: stats,
      };
    }

    return {
      status: 'up' as const,
      message: 'Redis cache connected',
      responseTime: Date.now() - start,
      details: stats,
    };
  } catch (error) {
    return {
      status: 'degraded' as const,
      message: error instanceof Error ? error.message : 'Redis connection failed',
      responseTime: Date.now() - start,
    };
  }
}

async function checkBlockchain() {
  const start = Date.now();

  try {
    const status = await checkFabricConnection();
    return {
      status: mapIntegrationStatus(status.status),
      message: status.message,
      responseTime: status.responseTime ?? Date.now() - start,
      details: status.details,
    };
  } catch (error) {
    return {
      status: 'degraded' as const,
      message: error instanceof Error ? error.message : 'Blockchain service check failed',
      responseTime: Date.now() - start,
    };
  }
}

async function checkPayment() {
  const start = Date.now();

  try {
    const [mojaloop, tigerbeetle] = await Promise.all([
      checkMojalooConnection(),
      checkTigerBeetleConnection(),
    ]);

    const normalized = [mojaloop, tigerbeetle].map((item) => mapIntegrationStatus(item.status));
    const anyUp = normalized.includes('up');
    const anyConfigured = [mojaloop.status, tigerbeetle.status].some((item) => item !== 'not_configured');

    return {
      status: anyUp ? 'up' as const : anyConfigured ? 'degraded' as const : 'degraded' as const,
      message: anyUp
        ? 'At least one payment or ledger integration is available'
        : anyConfigured
          ? 'Configured payment integrations are currently unavailable'
          : 'Payment integrations not configured',
      responseTime: Date.now() - start,
      details: {
        mojaloop,
        tigerbeetle,
      },
    };
  } catch (error) {
    return {
      status: 'degraded' as const,
      message: error instanceof Error ? error.message : 'Payment service check failed',
      responseTime: Date.now() - start,
    };
  }
}

async function checkMessaging() {
  const start = Date.now();

  try {
    const kafka = await checkKafkaConnection();
    return {
      status: mapIntegrationStatus(kafka.status),
      message: kafka.message,
      responseTime: kafka.responseTime ?? Date.now() - start,
      details: kafka.details,
    };
  } catch (error) {
    return {
      status: 'degraded' as const,
      message: error instanceof Error ? error.message : 'Messaging service check failed',
      responseTime: Date.now() - start,
    };
  }
}

async function checkWorkflow() {
  const start = Date.now();

  try {
    const temporal = await checkTemporalConnection();
    return {
      status: mapIntegrationStatus(temporal.status),
      message: temporal.message,
      responseTime: temporal.responseTime ?? Date.now() - start,
      details: temporal.details,
    };
  } catch (error) {
    return {
      status: 'degraded' as const,
      message: error instanceof Error ? error.message : 'Workflow service check failed',
      responseTime: Date.now() - start,
    };
  }
}

async function checkSearch() {
  const start = Date.now();

  try {
    const elasticsearch = await checkElasticsearchConnection();
    return {
      status: mapIntegrationStatus(elasticsearch.status),
      message: elasticsearch.message,
      responseTime: elasticsearch.responseTime ?? Date.now() - start,
      details: elasticsearch.details,
    };
  } catch (error) {
    return {
      status: 'degraded' as const,
      message: error instanceof Error ? error.message : 'Search service check failed',
      responseTime: Date.now() - start,
    };
  }
}

/**
 * Startup probe - check if the service has started successfully.
 */
export async function startupProbe(req: Request, res: Response) {
  const isReady = await checkStartup();

  if (isReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.status(503).json({
    status: 'starting',
    timestamp: new Date().toISOString(),
  });
}

async function checkStartup(): Promise<boolean> {
  try {
    const dbInstance = await db;
    if (!dbInstance) return false;
    await dbInstance.execute('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export default {
  livenessProbe,
  readinessProbe,
  healthCheck,
  startupProbe,
  checkHealth,
};
