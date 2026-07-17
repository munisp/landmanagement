/**
 * Alert Notification Service
 * 
 * Sends alerts via email and Slack when integration health issues are detected.
 * Supports configurable thresholds and multiple notification channels.
 */

import { logger } from './logger';
import type { IntegrationStatus } from './integrations';
import { sendEmail } from '../emailService';

export interface AlertConfig {
  enabled: boolean;
  channels: Array<'email' | 'slack' | 'webhook'>;
  thresholds: {
    responseTime: number; // milliseconds
    errorRate: number; // 0-1 (e.g., 0.05 = 5%)
    downtime: number; // seconds
  };
  recipients?: {
    email?: string[];
    slack?: {
      webhookUrl: string;
      channel?: string;
    };
    webhook?: {
      url: string;
      headers?: Record<string, string>;
    };
  };
}

export interface Alert {
  id: string;
  service: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  details: Record<string, any>;
  timestamp: string;
  resolved: boolean;
}

// In-memory alert store (should be replaced with database in production)
const activeAlerts = new Map<string, Alert>();
const alertHistory: Alert[] = [];

/**
 * Generate alert ID
 */
function generateAlertId(service: string, type: string): string {
  return `${service}-${type}-${Date.now()}`;
}

/**
 * Check if alert should be sent based on thresholds
 */
function shouldAlert(status: IntegrationStatus, config: AlertConfig): {
  should: boolean;
  severity: 'critical' | 'warning' | 'info';
  reason: string;
} {
  // Critical: Service is down
  if (status.status === 'down') {
    return {
      should: true,
      severity: 'critical',
      reason: `Service ${status.name} is down: ${status.message}`,
    };
  }

  // Warning: Service is degraded
  if (status.status === 'degraded') {
    return {
      should: true,
      severity: 'warning',
      reason: `Service ${status.name} is degraded: ${status.message}`,
    };
  }

  // Warning: Response time exceeds threshold
  if (status.responseTime && status.responseTime > config.thresholds.responseTime) {
    return {
      should: true,
      severity: 'warning',
      reason: `Service ${status.name} response time (${status.responseTime}ms) exceeds threshold (${config.thresholds.responseTime}ms)`,
    };
  }

  return { should: false, severity: 'info', reason: '' };
}

/**
 * Send email notification
 */
async function sendEmailAlert(alert: Alert, recipients: string[]): Promise<boolean> {
  try {
    logger.info({ alert, recipients }, 'Sending email alert');

    const detailsHtml = Object.entries(alert.details)
      .map(([key, value]) => `<li><strong>${key}:</strong> ${String(value)}</li>`)
      .join('');

    const response = await sendEmail({
      to: recipients,
      subject: `[${alert.severity.toUpperCase()}] Integration Alert: ${alert.service}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h2>Integration Alert</h2>
          <p><strong>Service:</strong> ${alert.service}</p>
          <p><strong>Severity:</strong> ${alert.severity}</p>
          <p>${alert.message}</p>
          <ul>${detailsHtml}</ul>
          <p><strong>Timestamp:</strong> ${alert.timestamp}</p>
        </div>
      `,
      text: [
        'Integration Alert',
        `Service: ${alert.service}`,
        `Severity: ${alert.severity}`,
        `Message: ${alert.message}`,
        ...Object.entries(alert.details).map(([key, value]) => `${key}: ${String(value)}`),
        `Timestamp: ${alert.timestamp}`,
      ].join('\n'),
    });

    if (!response.success) {
      logger.warn({ alert, recipients, error: response.error }, 'Email alert delivery was not accepted by the configured email service');
      return false;
    }

    return true;
  } catch (error) {
    logger.error({ error, alert }, 'Failed to send email alert');
    return false;
  }
}

/**
 * Send Slack notification
 */
async function sendSlackAlert(alert: Alert, config: { webhookUrl: string; channel?: string }): Promise<boolean> {
  try {
    logger.info({ alert, channel: config.channel }, 'Sending Slack alert');

    const color = alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'good';
    
    const payload = {
      channel: config.channel,
      username: 'IDLR Integration Monitor',
      icon_emoji: ':warning:',
      attachments: [
        {
          color,
          title: `${alert.severity.toUpperCase()}: ${alert.service}`,
          text: alert.message,
          fields: Object.entries(alert.details).map(([key, value]) => ({
            title: key,
            value: String(value),
            short: true,
          })),
          footer: 'IDLR-PTS Platform',
          ts: Math.floor(new Date(alert.timestamp).getTime() / 1000),
        },
      ],
    };

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack API returned ${response.status}: ${await response.text()}`);
    }

    logger.info({ alert }, 'Slack alert sent successfully');
    return true;
  } catch (error) {
    logger.error({ error, alert }, 'Failed to send Slack alert');
    return false;
  }
}

/**
 * Send webhook notification
 */
async function sendWebhookAlert(alert: Alert, config: { url: string; headers?: Record<string, string> }): Promise<boolean> {
  try {
    logger.info({ alert, url: config.url }, 'Sending webhook alert');

    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: JSON.stringify(alert),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${await response.text()}`);
    }

    logger.info({ alert }, 'Webhook alert sent successfully');
    return true;
  } catch (error) {
    logger.error({ error, alert }, 'Failed to send webhook alert');
    return false;
  }
}

/**
 * Create and send alert
 */
export async function sendAlert(
  status: IntegrationStatus,
  config: AlertConfig
): Promise<{ sent: boolean; alert?: Alert }> {
  if (!config.enabled) {
    logger.debug('Alerts are disabled');
    return { sent: false };
  }

  const alertCheck = shouldAlert(status, config);
  if (!alertCheck.should) {
    return { sent: false };
  }

  // Check if there's already an active alert for this service
  const existingAlertKey = `${status.name}-${alertCheck.severity}`;
  if (activeAlerts.has(existingAlertKey)) {
    logger.debug({ service: status.name }, 'Alert already active for this service');
    return { sent: false };
  }

  // Create alert
  const alert: Alert = {
    id: generateAlertId(status.name, alertCheck.severity),
    service: status.name,
    severity: alertCheck.severity,
    message: alertCheck.reason,
    details: {
      status: status.status,
      responseTime: status.responseTime,
      lastChecked: status.lastChecked,
      ...status.details,
    },
    timestamp: new Date().toISOString(),
    resolved: false,
  };

  // Store alert
  activeAlerts.set(existingAlertKey, alert);
  alertHistory.push(alert);

  logger.warn({ alert }, 'Alert triggered');

  // Send notifications
  const results: boolean[] = [];

  for (const channel of config.channels) {
    switch (channel) {
      case 'email':
        if (config.recipients?.email && config.recipients.email.length > 0) {
          const sent = await sendEmailAlert(alert, config.recipients.email);
          results.push(sent);
        }
        break;

      case 'slack':
        if (config.recipients?.slack?.webhookUrl) {
          const sent = await sendSlackAlert(alert, config.recipients.slack);
          results.push(sent);
        }
        break;

      case 'webhook':
        if (config.recipients?.webhook?.url) {
          const sent = await sendWebhookAlert(alert, config.recipients.webhook);
          results.push(sent);
        }
        break;
    }
  }

  const allSent = results.length > 0 && results.every(r => r);
  
  return { sent: allSent, alert };
}

/**
 * Resolve alert
 */
export function resolveAlert(service: string, severity: 'critical' | 'warning' | 'info'): boolean {
  const alertKey = `${service}-${severity}`;
  const alert = activeAlerts.get(alertKey);

  if (!alert) {
    return false;
  }

  alert.resolved = true;
  activeAlerts.delete(alertKey);

  logger.info({ alert }, 'Alert resolved');
  return true;
}

/**
 * Get active alerts
 */
export function getActiveAlerts(): Alert[] {
  return Array.from(activeAlerts.values());
}

/**
 * Get alert history
 */
export function getAlertHistory(limit: number = 100): Alert[] {
  return alertHistory.slice(-limit);
}

/**
 * Clear alert history
 */
export function clearAlertHistory(): void {
  alertHistory.length = 0;
  logger.info('Alert history cleared');
}

/**
 * Check integration health and send alerts if needed
 */
export async function checkAndAlert(
  statuses: IntegrationStatus[],
  config: AlertConfig
): Promise<{ alertsSent: number; alerts: Alert[] }> {
  const alerts: Alert[] = [];
  let alertsSent = 0;

  for (const status of statuses) {
    const result = await sendAlert(status, config);
    if (result.sent && result.alert) {
      alerts.push(result.alert);
      alertsSent++;
    }

    // Resolve alert if service is back up
    if (status.status === 'up') {
      resolveAlert(status.name, 'critical');
      resolveAlert(status.name, 'warning');
    }
  }

  return { alertsSent, alerts };
}

/**
 * Default alert configuration
 */
export const defaultAlertConfig: AlertConfig = {
  enabled: false,
  channels: [],
  thresholds: {
    responseTime: 5000, // 5 seconds
    errorRate: 0.05, // 5%
    downtime: 300, // 5 minutes
  },
};
