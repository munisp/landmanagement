/**
 * Integration Health Router
 * 
 * Provides endpoints for monitoring external service integrations.
 * Includes health checks, status monitoring, and alerting.
 */

import { router, publicProcedure, protectedProcedure } from '../../_core/trpc';
import { z } from 'zod';
import {
  checkAllIntegrations,
  checkFabricConnection,
  checkMojalooConnection,
  checkTigerBeetleConnection,
  checkKafkaConnection,
  checkTemporalConnection,
  checkElasticsearchConnection,
  checkKeycloakConnection,
  checkApisixConnection,
  checkPermifyConnection,
  checkDaprConnection,
  checkFluvioConnection,
  checkOpenAppSecConnection,
  checkLakehouseConnection,
  getIntegrationConfig,
  type IntegrationsHealth,
} from '../../_core/integrations';
import * as cache from '../../_core/cache';
import { logger } from '../../_core/logger';
import * as alertService from '../../_core/alertNotifications';
import {
  recordHealthSnapshot,
  getHealthHistory,
  getUptimeStats,
  getAlertConfig as getStoredAlertConfig,
  updateAlertConfig as updateStoredAlertConfig,
} from '../../integrationHealthStore';

/**
 * Integration Health Router
 */
export const integrationHealthRouter = router({
  /**
   * Get overall integration health status
   */
  getStatus: publicProcedure
    .query(async (): Promise<IntegrationsHealth> => {
      const cacheKey = 'integration:health:all';
      
      // Try to get from cache (30 seconds TTL)
      const cached = await cache.get<IntegrationsHealth>(cacheKey);
      if (cached) {
        logger.debug('Integration health cache hit');
        return cached;
      }

      // Cache miss - check all integrations
      logger.debug('Integration health cache miss');
      const health = await checkAllIntegrations();

      // Store in cache for 30 seconds
      await cache.set(cacheKey, health, 30);
      await recordHealthSnapshot(health);

      return health;
    }),

  /**
   * Get specific integration status
   */
  getServiceStatus: publicProcedure
    .input(z.object({
      service: z.enum(['fabric', 'mojaloop', 'tigerbeetle', 'kafka', 'temporal', 'elasticsearch', 'keycloak', 'apisix', 'permify', 'dapr', 'fluvio', 'openappsec', 'lakehouse']),
    }))
    .query(async ({ input }) => {
      const cacheKey = `integration:health:${input.service}`;
      
      // Try to get from cache (30 seconds TTL)
      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        logger.debug({ service: input.service }, 'Service health cache hit');
        return cached;
      }

      // Cache miss - check specific service
      logger.debug({ service: input.service }, 'Service health cache miss');
      
      let status;
      switch (input.service) {
        case 'fabric':
          status = await checkFabricConnection();
          break;
        case 'mojaloop':
          status = await checkMojalooConnection();
          break;
        case 'tigerbeetle':
          status = await checkTigerBeetleConnection();
          break;
        case 'kafka':
          status = await checkKafkaConnection();
          break;
        case 'temporal':
          status = await checkTemporalConnection();
          break;
        case 'elasticsearch':
          status = await checkElasticsearchConnection();
          break;
        case 'keycloak':
          status = await checkKeycloakConnection();
          break;
        case 'apisix':
          status = await checkApisixConnection();
          break;
        case 'permify':
          status = await checkPermifyConnection();
          break;
        case 'dapr':
          status = await checkDaprConnection();
          break;
        case 'fluvio':
          status = await checkFluvioConnection();
          break;
        case 'openappsec':
          status = await checkOpenAppSecConnection();
          break;
        case 'lakehouse':
          status = await checkLakehouseConnection();
          break;
      }

      // Store in cache for 30 seconds
      await cache.set(cacheKey, status, 30);
      await recordHealthSnapshot({
        overall: status.status === 'up' ? 'healthy' : status.status === 'degraded' ? 'degraded' : 'unhealthy',
        services: [status],
        timestamp: new Date().toISOString(),
      });

      return status;
    }),

  /**
   * Get integration configuration status
   */
  getConfig: protectedProcedure
    .query(async () => {
      return getIntegrationConfig();
    }),

  /**
   * Force refresh integration health (clears cache)
   */
  refresh: protectedProcedure
    .mutation(async () => {
      await cache.invalidate('integration:health:*');
      logger.info('Integration health cache cleared');
      
      // Return fresh status
      const health = await checkAllIntegrations();
      await recordHealthSnapshot(health);
      return health;
    }),

  /**
   * Get integration health history (last 24 hours)
   */
  getHistory: protectedProcedure
    .input(z.object({
      service: z.enum(['fabric', 'mojaloop', 'tigerbeetle', 'kafka', 'temporal', 'elasticsearch']).optional(),
      hours: z.number().default(24),
    }))
    .query(async ({ input }) => {
      const dataPoints = await getHealthHistory(input.service, input.hours);
      return {
        service: input.service || 'all',
        hours: input.hours,
        dataPoints,
        total: dataPoints.length,
      };
    }),

  /**
   * Get integration uptime statistics
   */
  getUptime: publicProcedure
    .query(async () => {
      const cacheKey = 'integration:uptime:stats';
      
      // Try to get from cache (5 minutes TTL)
      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        return cached;
      }

      const stats = await getUptimeStats(24);

      // Store in cache for 5 minutes
      await cache.set(cacheKey, stats, cache.CacheTTL.MEDIUM);

      return stats;
    }),

  /**
   * Test integration connection (admin only)
   */
  testConnection: protectedProcedure
    .input(z.object({
      service: z.enum(['fabric', 'mojaloop', 'tigerbeetle', 'kafka', 'temporal', 'elasticsearch', 'keycloak', 'apisix', 'permify', 'dapr', 'fluvio', 'openappsec', 'lakehouse']),
    }))
    .mutation(async ({ input }) => {
      logger.info({ service: input.service }, 'Testing integration connection');
      
      let result;
      switch (input.service) {
        case 'fabric':
          result = await checkFabricConnection();
          break;
        case 'mojaloop':
          result = await checkMojalooConnection();
          break;
        case 'tigerbeetle':
          result = await checkTigerBeetleConnection();
          break;
        case 'kafka':
          result = await checkKafkaConnection();
          break;
        case 'temporal':
          result = await checkTemporalConnection();
          break;
        case 'elasticsearch':
          result = await checkElasticsearchConnection();
          break;
      }

      return {
        service: input.service,
        tested: true,
        ...result,
      };
    }),

  /**
   * Get integration alerts configuration
   */
  getAlerts: protectedProcedure
    .query(async () => {
      return await getStoredAlertConfig();
    }),

  /**
   * Update integration alerts configuration
   */
  updateAlerts: protectedProcedure
    .input(z.object({
      enabled: z.boolean(),
      channels: z.array(z.enum(['email', 'slack', 'webhook'])),
      thresholds: z.object({
        responseTime: z.number(),
        errorRate: z.number(),
        downtime: z.number(),
      }),
      recipients: z.object({
        email: z.array(z.string()).optional(),
        slack: z.object({
          webhookUrl: z.string(),
          channel: z.string().optional(),
        }).optional(),
        webhook: z.object({
          url: z.string(),
          headers: z.record(z.string(), z.string()).optional(),
        }).optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const config = await updateStoredAlertConfig(input);
      logger.info({ config }, 'Alert configuration updated');
      
      return {
        success: true,
        message: 'Alert configuration saved',
        config,
      };
    }),

  /**
   * Get active alerts
   */
  getActiveAlerts: protectedProcedure
    .query(async () => {
      return alertService.getActiveAlerts();
    }),

  /**
   * Get alert history
   */
  getAlertHistory: protectedProcedure
    .input(z.object({
      limit: z.number().default(100),
    }))
    .query(async ({ input }) => {
      return alertService.getAlertHistory(input.limit);
    }),

  /**
   * Resolve alert
   */
  resolveAlert: protectedProcedure
    .input(z.object({
      service: z.string(),
      severity: z.enum(['critical', 'warning', 'info']),
    }))
    .mutation(async ({ input }) => {
      const resolved = alertService.resolveAlert(input.service, input.severity);
      return { success: resolved };
    }),

  /**
   * Clear alert history
   */
  clearAlertHistory: protectedProcedure
    .mutation(async () => {
      alertService.clearAlertHistory();
      return { success: true };
    }),

  /**
   * Test alert notification
   */
  testAlert: protectedProcedure
    .input(z.object({
      service: z.string(),
      severity: z.enum(['critical', 'warning', 'info']),
      config: z.object({
        enabled: z.boolean(),
        channels: z.array(z.enum(['email', 'slack', 'webhook'])),
        thresholds: z.object({
          responseTime: z.number(),
          errorRate: z.number(),
          downtime: z.number(),
        }),
        recipients: z.object({
          email: z.array(z.string()).optional(),
          slack: z.object({
            webhookUrl: z.string(),
            channel: z.string().optional(),
          }).optional(),
          webhook: z.object({
            url: z.string(),
            headers: z.record(z.string(), z.string()).optional(),
          }).optional(),
        }).optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      // Create a test integration status
      const testStatus = {
        name: input.service,
        status: input.severity === 'critical' ? 'down' as const : 'degraded' as const,
        message: 'This is a test alert',
        lastChecked: new Date().toISOString(),
        details: { test: true },
      };

      const result = await alertService.sendAlert(testStatus, input.config);
      return result;
    }),
});
