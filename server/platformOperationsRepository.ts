import { checkAllIntegrations, type IntegrationStatus } from './_core/integrations';
import { getBackupRecoveryState } from './backupRecoveryRepository';
import { getRateLimitStats } from './rateLimit';

export type ReadinessStatus = 'healthy' | 'degraded' | 'unhealthy';
export type JourneyStatus = 'passing' | 'warning' | 'failing';

export interface ReadinessDomain {
  name: string;
  status: ReadinessStatus;
  score: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  services: IntegrationStatus[];
  summary: string;
  recommendedActions: string[];
}

export interface SyntheticJourneyResult {
  id: string;
  name: string;
  status: JourneyStatus;
  score: number;
  dependencies: string[];
  summary: string;
  recommendedActions: string[];
}

export interface PlatformOperationsOverview {
  generatedAt: string;
  overallStatus: ReadinessStatus;
  readinessScore: number;
  counts: {
    healthy: number;
    degraded: number;
    unhealthy: number;
    notConfigured: number;
  };
  domains: ReadinessDomain[];
  backupPosture: {
    lastBackup: string;
    nextBackup: string;
    recoveryPointCount: number;
    recentFailureCount: number;
    geoRedundancyStatus: ReadinessStatus;
    summary: string;
  };
  abuseDefensePosture: {
    blockedSubjects: number;
    trackedSubjects: number;
    publicFormDefense: ReadinessStatus;
    corsMode: 'strict' | 'permissive';
    captchaConfigured: boolean;
    bruteForceProtection: boolean;
    summary: string;
  };
  syntheticJourneys: SyntheticJourneyResult[];
  externalServiceEndpoints: {
    goBridgeConfigured: boolean;
    rustControlPlaneConfigured: boolean;
    pythonLakehouseConfigured: boolean;
  };
  crossLanguageSignals: {
    goBridge: Record<string, unknown> | null;
    rustControlPlane: Record<string, unknown> | null;
    pythonLakehouse: Record<string, unknown> | null;
  };
}

function scoreStatus(status: IntegrationStatus['status']): number {
  switch (status) {
    case 'up':
      return 100;
    case 'degraded':
      return 65;
    case 'not_configured':
      return 35;
    case 'down':
    default:
      return 10;
  }
}

function normalizeStatus(score: number): ReadinessStatus {
  if (score >= 80) return 'healthy';
  if (score >= 50) return 'degraded';
  return 'unhealthy';
}

function toJourneyStatus(score: number): JourneyStatus {
  if (score >= 80) return 'passing';
  if (score >= 50) return 'warning';
  return 'failing';
}

function summarizeDomain(name: string, services: IntegrationStatus[]): ReadinessDomain {
  const healthy = services.filter((service) => service.status === 'up').length;
  const degraded = services.filter((service) => service.status === 'degraded').length;
  const unhealthy = services.filter((service) => service.status === 'down' || service.status === 'not_configured').length;
  const score = services.length
    ? Math.round(services.reduce((total, service) => total + scoreStatus(service.status), 0) / services.length)
    : 0;
  const status = normalizeStatus(score);

  const recommendedActions = services
    .filter((service) => service.status !== 'up')
    .map((service) => {
      const reason = service.message ? `: ${service.message}` : '';
      return `Review ${service.name}${reason}`;
    })
    .slice(0, 4);

  const statusText = unhealthy > 0 ? `${unhealthy} dependency issue(s)` : 'all dependencies responsive';
  const latencyText = services.some((service) => (service.responseTime ?? 0) > 1500)
    ? 'High latency detected on at least one dependency.'
    : 'Latency remains within expected bounds.';

  return {
    name,
    status,
    score,
    healthy,
    degraded,
    unhealthy,
    services,
    summary: `${name} readiness is ${status}. ${statusText}. ${latencyText}`,
    recommendedActions,
  };
}

async function fetchJsonSignal(url: string | undefined): Promise<Record<string, unknown> | null> {
  if (!url) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        status: 'unavailable',
        statusCode: response.status,
        endpoint: url,
      };
    }

    const data = await response.json();
    return {
      endpoint: url,
      ...(typeof data === 'object' && data !== null ? data : { value: data }),
    };
  } catch (error) {
    return {
      endpoint: url,
      status: 'unavailable',
      message: error instanceof Error ? error.message : 'Signal fetch failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildSyntheticJourneys(domains: ReadinessDomain[], backupPosture: PlatformOperationsOverview['backupPosture'], abuseDefensePosture: PlatformOperationsOverview['abuseDefensePosture']): SyntheticJourneyResult[] {
  const domainMap = new Map(domains.map((domain) => [domain.name, domain]));
  const identity = domainMap.get('Identity & Policy');
  const workflow = domainMap.get('Workflow & Messaging');
  const settlement = domainMap.get('Settlement & Ledger');
  const analytics = domainMap.get('Analytics & Discovery');
  const security = domainMap.get('Gateway & Security');

  const journeys: Array<{ id: string; name: string; dependencies: string[]; score: number; summary: string; recommendedActions: string[] }> = [
    {
      id: 'public-verification',
      name: 'Public verification and intake',
      dependencies: ['Identity & Policy', 'Gateway & Security'],
      score: Math.round(((identity?.score ?? 50) + (security?.score ?? 50) + (abuseDefensePosture.publicFormDefense === 'healthy' ? 90 : abuseDefensePosture.publicFormDefense === 'degraded' ? 65 : 35)) / 3),
      summary: 'Evaluates whether public-facing verification and intake routes have sufficient identity, gateway, and abuse-defense support.',
      recommendedActions: abuseDefensePosture.publicFormDefense === 'healthy' ? [] : ['Strengthen CAPTCHA or challenge configuration for public routes.', 'Review CORS allow-list and auth throttling posture.'],
    },
    {
      id: 'field-sync',
      name: 'Field capture and offline sync recovery',
      dependencies: ['Workflow & Messaging', 'Identity & Policy'],
      score: Math.round(((workflow?.score ?? 50) + (identity?.score ?? 50)) / 2),
      summary: 'Estimates whether queued field operations can be synchronized safely once connectivity is restored.',
      recommendedActions: workflow?.status === 'healthy' ? [] : ['Review Temporal, Dapr, Fluvio, or Kafka connectivity for sync orchestration.'],
    },
    {
      id: 'settlement-flow',
      name: 'Settlement and title transfer orchestration',
      dependencies: ['Settlement & Ledger', 'Workflow & Messaging'],
      score: Math.round(((settlement?.score ?? 50) + (workflow?.score ?? 50)) / 2),
      summary: 'Evaluates the multi-step payment, ledger, and transfer backbone that supports secure transaction completion.',
      recommendedActions: settlement?.status === 'healthy' ? [] : ['Review Mojaloop, TigerBeetle, and Fabric connectivity before high-value settlement operations.'],
    },
    {
      id: 'analytics-search',
      name: 'Analytics, search, and decision support',
      dependencies: ['Analytics & Discovery'],
      score: analytics?.score ?? 50,
      summary: 'Estimates whether search, analytics, explainability, and intelligence surfaces can operate with dependable backend support.',
      recommendedActions: analytics?.status === 'healthy' ? [] : ['Review Elasticsearch and lakehouse readiness before relying on advanced discovery or analytics.'],
    },
    {
      id: 'backup-restore',
      name: 'Backup, recovery, and regional resilience',
      dependencies: ['Backup posture'],
      score: Math.round((backupPosture.geoRedundancyStatus === 'healthy' ? 90 : backupPosture.geoRedundancyStatus === 'degraded' ? 65 : 35) - Math.min(backupPosture.recentFailureCount * 10, 30)),
      summary: 'Assesses whether current backup execution and geo-redundancy posture support resilient recovery operations.',
      recommendedActions: backupPosture.recentFailureCount === 0 ? [] : ['Investigate recent failed backups and validate restore-point freshness.'],
    },
  ];

  return journeys.map((journey) => ({
    ...journey,
    score: Math.max(0, Math.min(100, journey.score)),
    status: toJourneyStatus(Math.max(0, Math.min(100, journey.score))),
  }));
}

export async function getPlatformOperationsOverview(): Promise<PlatformOperationsOverview> {
  const goReadinessUrl = process.env.GO_OPS_BRIDGE_URL ? `${process.env.GO_OPS_BRIDGE_URL.replace(/\/$/, '')}/readiness` : undefined;
  const rustReadinessUrl = process.env.RUST_CONTROL_PLANE_URL ? `${process.env.RUST_CONTROL_PLANE_URL.replace(/\/$/, '')}/readiness` : undefined;
  const pythonLakehouseUrl = process.env.LAKEHOUSE_API_URL ? `${process.env.LAKEHOUSE_API_URL.replace(/\/$/, '')}/analytics/title-risk/portfolio-summary` : undefined;

  const [health, backupState, rateLimitStats, goBridgeSignal, rustControlPlaneSignal, pythonLakehouseSignal] = await Promise.all([
    checkAllIntegrations(),
    getBackupRecoveryState(),
    getRateLimitStats(),
    fetchJsonSignal(goReadinessUrl),
    fetchJsonSignal(rustReadinessUrl),
    fetchJsonSignal(pythonLakehouseUrl),
  ]);

  const counts = {
    healthy: health.services.filter((service) => service.status === 'up').length,
    degraded: health.services.filter((service) => service.status === 'degraded').length,
    unhealthy: health.services.filter((service) => service.status === 'down').length,
    notConfigured: health.services.filter((service) => service.status === 'not_configured').length,
  };

  const domains = [
    summarizeDomain('Identity & Policy', health.services.filter((service) => ['keycloak', 'permify'].includes(service.name))),
    summarizeDomain('Gateway & Security', health.services.filter((service) => ['apisix', 'openappsec'].includes(service.name))),
    summarizeDomain('Workflow & Messaging', health.services.filter((service) => ['temporal', 'dapr', 'fluvio', 'kafka'].includes(service.name))),
    summarizeDomain('Settlement & Ledger', health.services.filter((service) => ['mojaloop', 'tigerbeetle', 'hyperledger_fabric'].includes(service.name))),
    summarizeDomain('Analytics & Discovery', health.services.filter((service) => ['elasticsearch', 'lakehouse'].includes(service.name))),
  ];

  const readinessScore = domains.length
    ? Math.round(domains.reduce((total, domain) => total + domain.score, 0) / domains.length)
    : 0;

  const recentFailureCount = backupState.recentBackups.filter((backup) => backup.status === 'failed').length;
  const location = backupState.schedule.location.toLowerCase();
  const geoRedundancyStatus: ReadinessStatus = location.includes('geo-redundant') || location.includes('frankfurt')
    ? 'healthy'
    : location.includes('regional')
      ? 'degraded'
      : 'unhealthy';

  const backupPosture = {
    lastBackup: backupState.schedule.lastBackup,
    nextBackup: backupState.schedule.nextBackup,
    recoveryPointCount: backupState.recoveryPoints.length,
    recentFailureCount,
    geoRedundancyStatus,
    summary: recentFailureCount === 0
      ? 'Backup posture is stable and recovery points are available.'
      : `Backup posture needs attention because ${recentFailureCount} recent backup run(s) failed.`,
  };

  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://localhost:5173',
    ...(process.env.ALLOWED_ORIGINS?.split(',').map((entry) => entry.trim()).filter(Boolean) || []),
  ];

  const abuseDefensePosture = {
    blockedSubjects: rateLimitStats.blockedKeys,
    trackedSubjects: rateLimitStats.totalKeys,
    publicFormDefense: process.env.RECAPTCHA_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY
      ? 'healthy' as const
      : rateLimitStats.blockedKeys > 0
        ? 'degraded' as const
        : 'unhealthy' as const,
    corsMode: allowedOrigins.length > 3 ? 'permissive' as const : 'strict' as const,
    captchaConfigured: Boolean(process.env.RECAPTCHA_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY),
    bruteForceProtection: true,
    summary: (process.env.RECAPTCHA_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY)
      ? 'Public-route abuse defense includes challenge support and brute-force throttling.'
      : 'Brute-force throttling is present, but public challenge verification is not yet configured.',
  };

  const syntheticJourneys = buildSyntheticJourneys(domains, backupPosture, abuseDefensePosture);

  return {
    generatedAt: new Date().toISOString(),
    overallStatus: normalizeStatus(Math.round((readinessScore + (backupPosture.geoRedundancyStatus === 'healthy' ? 90 : backupPosture.geoRedundancyStatus === 'degraded' ? 65 : 35)) / 2)),
    readinessScore,
    counts,
    domains,
    backupPosture,
    abuseDefensePosture,
    syntheticJourneys,
    externalServiceEndpoints: {
      goBridgeConfigured: Boolean(process.env.GO_OPS_BRIDGE_URL),
      rustControlPlaneConfigured: Boolean(process.env.RUST_CONTROL_PLANE_URL),
      pythonLakehouseConfigured: Boolean(process.env.LAKEHOUSE_API_URL),
    },
    crossLanguageSignals: {
      goBridge: goBridgeSignal,
      rustControlPlane: rustControlPlaneSignal,
      pythonLakehouse: pythonLakehouseSignal,
    },
  };
}
