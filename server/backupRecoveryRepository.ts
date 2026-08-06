import { desc } from 'drizzle-orm';
import { rolloutRecoveryDrills } from '../drizzle/schema';
import { requireDb } from './db';

export type BackupStatus = 'completed' | 'in_progress' | 'failed';
export type RecoveryPointType = 'manual' | 'automated';

export interface BackupScheduleRecord {
  frequency: string;
  lastBackup: string | null;
  nextBackup: string | null;
  retention: string;
  location: string;
}

export interface BackupRecord {
  id: number;
  type: string;
  size: string;
  status: BackupStatus;
  timestamp: string;
  duration: string;
}

export interface RecoveryPointRecord {
  id: number;
  name: string;
  timestamp: string;
  size: string;
  type: RecoveryPointType;
}

export interface StorageMetricsRecord {
  totalBackupSize: string;
  availableSpace: string;
  usagePercentage: number | null;
  estimatedCostMonth: string;
}

export interface BackupAlertRecord {
  id: number;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string;
}

export interface RecoveryDrillRecord {
  id: number;
  scenario: string;
  outcome: 'passed' | 'warning' | 'failed';
  recoveryTime: string;
  timestamp: string;
  notes?: string;
}

export interface BackupAutomationHealth {
  replicationStatus: 'healthy' | 'degraded' | 'unhealthy';
  monitoringStatus: 'healthy' | 'degraded' | 'unhealthy';
  alertingStatus: 'healthy' | 'degraded' | 'unhealthy';
  lastDrillAt: string | null;
  lastVerifiedRestoreAt: string | null;
}

function healthFromEvidence(passed: number, failed: number): 'healthy' | 'degraded' | 'unhealthy' {
  if (passed > 0 && failed === 0) return 'healthy';
  if (passed > 0) return 'degraded';
  return 'unhealthy';
}

function recoveryTime(rto: number | null): string {
  return rto === null ? 'Not measured' : `${rto}s`;
}

/**
 * Returns only independently recorded recovery evidence. Backup execution and
 * restore actions remain with the configured backup provider; this platform
 * deliberately does not simulate successful backups or restores.
 */
export async function getBackupRecoveryState() {
  const db = await requireDb();
  const drills = await db.select().from(rolloutRecoveryDrills).orderBy(desc(rolloutRecoveryDrills.createdAt)).limit(25);
  const passed = drills.filter((drill) => drill.status === 'passed');
  const failed = drills.filter((drill) => drill.status === 'failed');
  const latest = drills[0] ?? null;
  const latestPassed = passed[0] ?? null;
  const recoveryDrills: RecoveryDrillRecord[] = drills.map((drill) => ({
    id: drill.id,
    scenario: drill.drillType,
    outcome: drill.status === 'passed' ? 'passed' : drill.status === 'failed' ? 'failed' : 'warning',
    recoveryTime: recoveryTime(drill.measuredRtoSeconds),
    timestamp: (drill.completedAt ?? drill.createdAt).toISOString(),
    notes: drill.reviewNotes ?? undefined,
  }));
  const health = healthFromEvidence(passed.length, failed.length);
  const configured = Boolean(process.env.BACKUP_EVIDENCE_REPOSITORY?.startsWith('https://'));

  return {
    schedule: {
      frequency: configured ? (process.env.BACKUP_SCHEDULE_DESCRIPTION ?? 'Configured externally') : 'Not configured',
      lastBackup: null,
      nextBackup: null,
      retention: process.env.BACKUP_RETENTION_DESCRIPTION ?? 'Not evidenced',
      location: configured ? 'Evidence repository configured' : 'Not configured',
    },
    recentBackups: [] as BackupRecord[],
    recoveryPoints: [] as RecoveryPointRecord[],
    storageMetrics: {
      totalBackupSize: 'Not reported',
      availableSpace: 'Not reported',
      usagePercentage: null,
      estimatedCostMonth: 'Not reported',
    } as StorageMetricsRecord,
    alertChannels: process.env.BACKUP_ALERT_CHANNELS?.split(',').map((item) => item.trim()).filter(Boolean) ?? [],
    recentAlerts: latest && latest.status !== 'passed'
      ? [{ id: latest.id, severity: latest.status === 'failed' ? 'critical' as const : 'warning' as const, message: `Latest recovery drill is ${latest.status}; resolve evidence gaps before rollout.`, timestamp: (latest.completedAt ?? latest.createdAt).toISOString() }]
      : [],
    recoveryDrills,
    automationHealth: {
      replicationStatus: health,
      monitoringStatus: configured ? health : 'unhealthy',
      alertingStatus: configured && (process.env.BACKUP_ALERT_CHANNELS?.trim() ?? '').length > 0 ? health : 'unhealthy',
      lastDrillAt: latest ? (latest.completedAt ?? latest.createdAt).toISOString() : null,
      lastVerifiedRestoreAt: latestPassed?.completedAt?.toISOString() ?? null,
    } as BackupAutomationHealth,
  };
}

export async function getBackupReadinessSummary() {
  const state = await getBackupRecoveryState();
  const lastDrill = state.recoveryDrills[0] ?? null;
  return {
    failedBackups: 0,
    alertChannels: state.alertChannels,
    recentAlertCount: state.recentAlerts.length,
    replicationStatus: state.automationHealth.replicationStatus,
    monitoringStatus: state.automationHealth.monitoringStatus,
    alertingStatus: state.automationHealth.alertingStatus,
    lastDrill,
    evidenceOnly: true,
  };
}

export async function initiateBackupRun(): Promise<never> {
  throw new Error('Backup execution is intentionally unavailable in the application. Run the approved external backup job and record independently reviewed recovery evidence through Nationwide Rollout Controls.');
}

export async function recordRecoveryDrill(): Promise<never> {
  throw new Error('Recovery drill outcomes must be recorded through the two-person Nationwide Rollout Controls workflow.');
}

export async function restoreFromRecoveryPoint(): Promise<never> {
  throw new Error('Restore execution is intentionally unavailable in the application. Execute the approved runbook in the isolated recovery environment and record evidence through Nationwide Rollout Controls.');
}
