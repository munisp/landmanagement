import type { IntegrationsHealth, IntegrationStatus } from './_core/integrations';
import { defaultAlertConfig, type AlertConfig } from './_core/alertNotifications';
import { readJsonStore, writeJsonStore } from './jsonStore';

export type IntegrationServiceName = 'fabric' | 'mojaloop' | 'tigerbeetle' | 'kafka' | 'temporal' | 'elasticsearch';

export interface IntegrationHealthSnapshot {
  service: IntegrationServiceName;
  status: IntegrationStatus['status'];
  responseTime: number | null;
  message?: string;
  lastChecked: string;
}

interface IntegrationHealthStoreData {
  alertConfig: AlertConfig;
  snapshots: IntegrationHealthSnapshot[];
}

const MAX_SNAPSHOTS = 10000;

function defaultStoreData(): IntegrationHealthStoreData {
  return {
    alertConfig: {
      ...defaultAlertConfig,
      thresholds: { ...defaultAlertConfig.thresholds },
      recipients: {
        email: process.env.ALERT_EMAIL_RECIPIENTS ? process.env.ALERT_EMAIL_RECIPIENTS.split(',').map((value) => value.trim()).filter(Boolean) : [],
        slack: process.env.SLACK_WEBHOOK_URL ? {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_ALERT_CHANNEL || undefined,
        } : undefined,
      },
      channels: process.env.ALERT_CHANNELS
        ? process.env.ALERT_CHANNELS.split(',').map((value) => value.trim()).filter((value): value is 'email' | 'slack' | 'webhook' => value === 'email' || value === 'slack' || value === 'webhook')
        : defaultAlertConfig.channels,
      enabled: process.env.ALERTS_ENABLED === 'true' || defaultAlertConfig.enabled,
    },
    snapshots: [],
  };
}

async function readStore(): Promise<IntegrationHealthStoreData> {
  return readJsonStore<IntegrationHealthStoreData>('integration-health-store', defaultStoreData);
}

async function writeStore(store: IntegrationHealthStoreData) {
  await writeJsonStore('integration-health-store', store);
}

function mapServiceName(name: string): IntegrationServiceName | null {
  switch (name) {
    case 'hyperledger_fabric':
      return 'fabric';
    case 'mojaloop':
      return 'mojaloop';
    case 'tigerbeetle':
      return 'tigerbeetle';
    case 'kafka':
      return 'kafka';
    case 'temporal':
      return 'temporal';
    case 'elasticsearch':
      return 'elasticsearch';
    default:
      return null;
  }
}

export async function recordHealthSnapshot(health: IntegrationsHealth): Promise<void> {
  const store = await readStore();
  const snapshots = [...store.snapshots];

  for (const service of health.services) {
    const mappedService = mapServiceName(service.name);
    if (!mappedService) {
      continue;
    }

    snapshots.push({
      service: mappedService,
      status: service.status,
      responseTime: service.responseTime ?? null,
      message: service.message,
      lastChecked: service.lastChecked,
    });
  }

  store.snapshots = snapshots.slice(-MAX_SNAPSHOTS);
  await writeStore(store);
}

export async function getHealthHistory(service?: IntegrationServiceName, hours: number = 24): Promise<IntegrationHealthSnapshot[]> {
  const store = await readStore();
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  return store.snapshots.filter((snapshot) => {
    const timestamp = new Date(snapshot.lastChecked).getTime();
    const matchesTime = Number.isFinite(timestamp) && timestamp >= cutoff;
    const matchesService = service ? snapshot.service === service : true;
    return matchesTime && matchesService;
  });
}

export async function getAlertConfig(): Promise<AlertConfig> {
  const store = await readStore();
  return store.alertConfig;
}

export async function updateAlertConfig(config: AlertConfig): Promise<AlertConfig> {
  const store = await readStore();
  store.alertConfig = config;
  await writeStore(store);
  return store.alertConfig;
}

export async function getUptimeStats(hours: number = 24): Promise<Record<IntegrationServiceName, { uptime: number; total: number; percentage: number }>> {
  const history = await getHealthHistory(undefined, hours);
  const services: IntegrationServiceName[] = ['fabric', 'mojaloop', 'tigerbeetle', 'kafka', 'temporal', 'elasticsearch'];

  return services.reduce((accumulator, service) => {
    const serviceHistory = history.filter((entry) => entry.service === service);
    const uptime = serviceHistory.filter((entry) => entry.status === 'up').length;
    const total = serviceHistory.length;
    accumulator[service] = {
      uptime,
      total,
      percentage: total > 0 ? Number(((uptime / total) * 100).toFixed(2)) : 0,
    };
    return accumulator;
  }, {} as Record<IntegrationServiceName, { uptime: number; total: number; percentage: number }>);
}
