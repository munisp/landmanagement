/**
 * Background Health Monitoring Job
 * 
 * Periodically checks integration health and sends alerts when issues are detected.
 * Runs every 30 seconds to monitor all external services.
 */

import { logger } from './logger';
import { checkAllIntegrations } from './integrations';
import * as alertService from './alertNotifications';

export interface HealthMonitorConfig {
  enabled: boolean;
  interval: number; // milliseconds
  alertConfig: alertService.AlertConfig;
}

let monitorInterval: NodeJS.Timeout | null = null;
let isRunning: boolean = false;
let lastCheckTime: Date | null = null;
let consecutiveFailures: Map<string, number> = new Map();

/**
 * Default configuration
 */
const defaultConfig: HealthMonitorConfig = {
  enabled: true,
  interval: 30000, // 30 seconds
  alertConfig: alertService.defaultAlertConfig,
};

/**
 * Run a single health check cycle
 */
async function runHealthCheck(config: HealthMonitorConfig): Promise<void> {
  try {
    logger.debug('Running background health check');
    
    // Check all integrations
    const health = await checkAllIntegrations();
    lastCheckTime = new Date();

    // Check and alert for each service
    const results = await alertService.checkAndAlert(health.services, config.alertConfig);

    if (results.alertsSent > 0) {
      logger.warn(
        { alertsSent: results.alertsSent, alerts: results.alerts },
        'Health check triggered alerts'
      );
    }

    // Track consecutive failures for each service
    for (const service of health.services) {
      const currentFailures = consecutiveFailures.get(service.name) || 0;

      if (service.status === 'down') {
        consecutiveFailures.set(service.name, currentFailures + 1);
        
        // Log warning after 3 consecutive failures
        if (currentFailures + 1 === 3) {
          logger.warn(
            { service: service.name, failures: currentFailures + 1 },
            'Service has failed 3 consecutive health checks'
          );
        }
      } else {
        // Reset failure count when service recovers
        if (currentFailures > 0) {
          logger.info(
            { service: service.name, previousFailures: currentFailures },
            'Service recovered after failures'
          );
          consecutiveFailures.delete(service.name);
        }
      }
    }

    logger.debug(
      {
        overall: health.overall,
        servicesUp: health.services.filter(s => s.status === 'up').length,
        servicesDown: health.services.filter(s => s.status === 'down').length,
        servicesDegraded: health.services.filter(s => s.status === 'degraded').length,
      },
      'Health check completed'
    );
  } catch (error) {
    logger.error({ error }, 'Health check failed');
  }
}

/**
 * Start the background health monitor
 */
export function startHealthMonitor(config: Partial<HealthMonitorConfig> = {}): void {
  const fullConfig: HealthMonitorConfig = {
    ...defaultConfig,
    ...config,
    alertConfig: {
      ...defaultConfig.alertConfig,
      ...(config.alertConfig || {}),
    },
  };

  if (!fullConfig.enabled) {
    logger.info('Health monitor is disabled');
    return;
  }

  if (isRunning) {
    logger.warn('Health monitor is already running');
    return;
  }

  logger.info(
    {
      interval: fullConfig.interval,
      alertsEnabled: fullConfig.alertConfig.enabled,
      alertChannels: fullConfig.alertConfig.channels,
    },
    'Starting health monitor'
  );

  // Run initial check immediately
  runHealthCheck(fullConfig).catch(error => {
    logger.error({ error }, 'Initial health check failed');
  });

  // Schedule periodic checks
  monitorInterval = setInterval(() => {
    runHealthCheck(fullConfig).catch(error => {
      logger.error({ error }, 'Scheduled health check failed');
    });
  }, fullConfig.interval);

  isRunning = true;
}

/**
 * Stop the background health monitor
 */
export function stopHealthMonitor(): void {
  if (!isRunning) {
    logger.warn('Health monitor is not running');
    return;
  }

  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }

  isRunning = false;
  logger.info('Health monitor stopped');
}

/**
 * Get monitor status
 */
export function getMonitorStatus(): {
  running: boolean;
  lastCheckTime: Date | null;
  consecutiveFailures: Record<string, number>;
} {
  return {
    running: isRunning,
    lastCheckTime,
    consecutiveFailures: Object.fromEntries(consecutiveFailures),
  };
}

/**
 * Update monitor configuration
 */
export function updateMonitorConfig(config: Partial<HealthMonitorConfig>): void {
  if (isRunning) {
    logger.info('Restarting health monitor with new configuration');
    stopHealthMonitor();
    startHealthMonitor(config);
  } else {
    logger.info('Health monitor configuration updated (not running)');
  }
}

// Auto-start monitor if enabled via environment variable
if (process.env.HEALTH_MONITOR_ENABLED !== 'false') {
  const config: Partial<HealthMonitorConfig> = {
    enabled: true,
    interval: process.env.HEALTH_MONITOR_INTERVAL
      ? parseInt(process.env.HEALTH_MONITOR_INTERVAL)
      : 30000,
    alertConfig: {
      enabled: process.env.ALERTS_ENABLED === 'true',
      channels: (process.env.ALERT_CHANNELS?.split(',') as Array<'email' | 'slack' | 'webhook'>) || [],
      thresholds: {
        responseTime: process.env.ALERT_THRESHOLD_RESPONSE_TIME
          ? parseInt(process.env.ALERT_THRESHOLD_RESPONSE_TIME)
          : 5000,
        errorRate: process.env.ALERT_THRESHOLD_ERROR_RATE
          ? parseFloat(process.env.ALERT_THRESHOLD_ERROR_RATE)
          : 0.05,
        downtime: process.env.ALERT_THRESHOLD_DOWNTIME
          ? parseInt(process.env.ALERT_THRESHOLD_DOWNTIME)
          : 300,
      },
      recipients: {
        email: process.env.ALERT_EMAIL_RECIPIENTS?.split(','),
        slack: process.env.SLACK_WEBHOOK_URL
          ? {
              webhookUrl: process.env.SLACK_WEBHOOK_URL,
              channel: process.env.SLACK_ALERT_CHANNEL,
            }
          : undefined,
      },
    },
  };

  // Start monitor after a short delay to allow server initialization
  setTimeout(() => {
    startHealthMonitor(config);
  }, 5000);
}
