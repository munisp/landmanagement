/**
 * Institutional Command Center with Predictive Operations
 * (next-generation feature, 2026-07-18)
 *
 * Sits above the platform dashboards and predicts backlog formation, SLA
 * breaches, dispute escalation, verification bottlenecks, integration
 * failures, and regional transaction surges BEFORE they become service
 * incidents. Maturity model: descriptive → diagnostic → predictive.
 *
 * All models are deterministic heuristics over live repository data, so the
 * center works in degraded offline environments as well.
 */

import { and, eq, lt } from 'drizzle-orm';
import { getDb } from './db';
import { agencyClearances } from '../drizzle/schema';
import * as transactionRepository from './transactionRepository';
import * as disputeRepository from './disputeRepository';
import * as verificationRepository from './verificationRepository';
import { checkAllIntegrations } from './_core/integrations';

export interface ForecastSignal {
  key: string;
  label: string;
  severity: 'info' | 'watch' | 'warning' | 'critical';
  summary: string;
  evidence: Record<string, any>;
  recommendedAction: string;
}

export interface OperationalForecast {
  postureScore: number; // 100 = fully healthy
  posture: 'strong' | 'stable' | 'strained' | 'critical';
  signals: ForecastSignal[];
  predictions: {
    backlogProjection: { days7: number; days14: number; days30: number };
    atRiskClearances: number;
    disputesLikelyToEscalate: number;
    bottleneckStage: string | null;
    integrationsDown: string[];
    surgeStates: string[];
  };
  maturityLevel: 'descriptive' | 'diagnostic' | 'predictive';
  generatedAt: string;
}

function daysSince(dateLike: any): number {
  const when = new Date(dateLike ?? Date.now());
  return Math.max(0, (Date.now() - when.getTime()) / 86400000);
}

function severityPenalty(severity: ForecastSignal['severity']): number {
  return { info: 0, watch: 4, warning: 12, critical: 25 }[severity];
}

/** Compute the full institutional forecast. */
export async function getOperationalForecast(): Promise<OperationalForecast> {
  const signals: ForecastSignal[] = [];

  // ---- Load operational data (offline-capable repositories) ----------------
  const allTransactions = transactionRepository.listTransactions({ limit: 10000 }).transactions as any[];
  const disputeStats = disputeRepository.getDisputeStats() as any;
  const allDisputes = disputeRepository.listDisputes({ limit: 10000 }).disputes as any[];
  let verificationBacklog: any[] = [];
  try {
    verificationBacklog = verificationRepository.listVerificationRequestsOffline({}, 1, 10000).requests as any[];
  } catch {
    verificationBacklog = [];
  }

  // ---- 1) Backlog formation -------------------------------------------------
  const pendingTx = allTransactions.filter((t) => !['completed', 'registered', 'cancelled'].includes(String(t.status)));
  const completedRecently = allTransactions.filter(
    (t) => ['completed', 'registered'].includes(String(t.status)) && daysSince(t.updatedAt ?? t.createdAt) <= 7
  ).length;
  const arrivedRecently = allTransactions.filter((t) => daysSince(t.createdAt) <= 7).length;
  const dailyNet = (arrivedRecently - completedRecently) / 7;
  const backlogProjection = {
    days7: Math.max(0, Math.round(pendingTx.length + dailyNet * 7)),
    days14: Math.max(0, Math.round(pendingTx.length + dailyNet * 14)),
    days30: Math.max(0, Math.round(pendingTx.length + dailyNet * 30)),
  };
  if (dailyNet > 0.5) {
    signals.push({
      key: 'backlog_formation',
      label: 'Backlog formation',
      severity: dailyNet > 3 ? 'critical' : 'warning',
      summary: `Transaction inflow exceeds completion by ~${dailyNet.toFixed(1)}/day; backlog may reach ${backlogProjection.days30} in 30 days`,
      evidence: { pending: pendingTx.length, dailyNet: Number(dailyNet.toFixed(2)), backlogProjection },
      recommendedAction: 'Add adjudication capacity or throttle intake for lower-priority transaction types',
    });
  }

  // ---- 2) SLA breach risk (agency clearances) --------------------------------
  let atRiskClearances = 0;
  const db = await getDb();
  if (db) {
    try {
      const overdue = await db
        .select()
        .from(agencyClearances)
        .where(and(
          eq(agencyClearances.status, 'pending'),
          lt(agencyClearances.slaDueAt, new Date())
        ));
      atRiskClearances = overdue.length;
      const submittedOverdue = await db
        .select()
        .from(agencyClearances)
        .where(and(
          eq(agencyClearances.status, 'submitted'),
          lt(agencyClearances.slaDueAt, new Date())
        ));
      atRiskClearances += submittedOverdue.length;
    } catch (error) {
      console.warn('[CommandCenter] Clearance SLA scan failed:', (error as Error).message);
    }
  }
  if (atRiskClearances > 0) {
    signals.push({
      key: 'sla_breach',
      label: 'SLA breach risk',
      severity: atRiskClearances >= 5 ? 'critical' : 'warning',
      summary: `${atRiskClearances} agency clearance(s) past SLA due time`,
      evidence: { atRiskClearances },
      recommendedAction: 'Escalate overdue clearances to agency liaison officers',
    });
  }

  // ---- 3) Dispute escalation forecast ----------------------------------------
  const escalationCandidates = allDisputes.filter((d: any) => {
    const ageDays = daysSince(d.filedAt ?? d.createdAt);
    return ['pending', 'filed'].includes(String(d.status)) && ageDays > 14;
  });
  if (escalationCandidates.length > 0) {
    signals.push({
      key: 'dispute_escalation',
      label: 'Dispute escalation forecast',
      severity: escalationCandidates.length >= 5 ? 'warning' : 'watch',
      summary: `${escalationCandidates.length} unresolved dispute(s) older than 14 days are likely to escalate`,
      evidence: { count: escalationCandidates.length, caseNumbers: escalationCandidates.slice(0, 5).map((d: any) => d.caseNumber) },
      recommendedAction: 'Prioritize mediation scheduling for aging disputes',
    });
  }

  // ---- 4) Verification bottleneck ---------------------------------------------
  const stageDwell = new Map<string, number>();
  for (const req of verificationBacklog) {
    const status = String(req.status ?? 'pending');
    if (['approved', 'rejected', 'completed'].includes(status)) continue;
    stageDwell.set(status, (stageDwell.get(status) ?? 0) + 1);
  }
  let bottleneckStage: string | null = null;
  let bottleneckCount = 0;
  for (const [stage, count] of stageDwell) {
    if (count > bottleneckCount) {
      bottleneckCount = count;
      bottleneckStage = stage;
    }
  }
  if (bottleneckStage && bottleneckCount >= 3) {
    signals.push({
      key: 'verification_bottleneck',
      label: 'Verification bottleneck',
      severity: bottleneckCount >= 10 ? 'warning' : 'watch',
      summary: `${bottleneckCount} verification request(s) queued at "${bottleneckStage}"`,
      evidence: { stage: bottleneckStage, count: bottleneckCount },
      recommendedAction: `Reassign verification officers to the ${bottleneckStage} stage`,
    });
  }

  // ---- 5) Integration failure risk ---------------------------------------------
  let integrationsDown: string[] = [];
  try {
    const health = await checkAllIntegrations();
    integrationsDown = health.services
      .filter((s) => s.status === 'down')
      .map((s) => s.name);
    const degraded = health.services.filter((s) => s.status === 'degraded').map((s) => s.name);
    if (integrationsDown.length || degraded.length) {
      signals.push({
        key: 'integration_failure',
        label: 'Integration failure risk',
        severity: integrationsDown.length >= 2 ? 'critical' : integrationsDown.length ? 'warning' : 'watch',
        summary: `${integrationsDown.length} integration(s) down, ${degraded.length} degraded`,
        evidence: { down: integrationsDown, degraded },
        recommendedAction: 'Fail over affected workflows and page the integration on-call rotation',
      });
    }
  } catch (error) {
    console.warn('[CommandCenter] Integration health check failed:', (error as Error).message);
  }

  // ---- 6) Regional surge detection ----------------------------------------------
  const byStateRecent = new Map<string, number>();
  const byStatePrior = new Map<string, number>();
  for (const tx of allTransactions) {
    const state = String(tx.state ?? tx.parcelState ?? 'unknown');
    const age = daysSince(tx.createdAt);
    if (age <= 30) byStateRecent.set(state, (byStateRecent.get(state) ?? 0) + 1);
    else if (age <= 60) byStatePrior.set(state, (byStatePrior.get(state) ?? 0) + 1);
  }
  const surgeStates: string[] = [];
  for (const [state, recent] of byStateRecent) {
    const prior = byStatePrior.get(state) ?? 0;
    if (recent >= 3 && recent >= prior * 2 && recent > prior) surgeStates.push(state);
  }
  if (surgeStates.length) {
    signals.push({
      key: 'regional_surge',
      label: 'Regional transaction surge',
      severity: 'watch',
      summary: `Transaction volume surging in: ${surgeStates.join(', ')}`,
      evidence: { surgeStates },
      recommendedAction: 'Pre-position field officers and verification capacity in surge states',
    });
  }

  // ---- Composite posture ---------------------------------------------------------
  const penalty = signals.reduce((sum, s) => sum + severityPenalty(s.severity), 0);
  const postureScore = Math.max(0, 100 - penalty);
  const posture = postureScore >= 85 ? 'strong' : postureScore >= 65 ? 'stable' : postureScore >= 40 ? 'strained' : 'critical';

  return {
    postureScore,
    posture,
    signals,
    predictions: {
      backlogProjection,
      atRiskClearances,
      disputesLikelyToEscalate: escalationCandidates.length,
      bottleneckStage,
      integrationsDown,
      surgeStates,
    },
    maturityLevel: signals.length > 0 ? 'predictive' : 'diagnostic',
    generatedAt: new Date().toISOString(),
  };
}

/** Compact KPI header for the command center. */
export async function getCommandCenterSummary() {
  const forecast = await getOperationalForecast();
  return {
    postureScore: forecast.postureScore,
    posture: forecast.posture,
    activeSignals: forecast.signals.length,
    criticalSignals: forecast.signals.filter((s) => s.severity === 'critical').length,
    predictions: forecast.predictions,
    generatedAt: forecast.generatedAt,
  };
}
