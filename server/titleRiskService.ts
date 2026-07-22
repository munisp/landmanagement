/**
 * Autonomous Title Risk Copilot (next-generation feature, 2026-07-18)
 *
 * Continuously evaluates title-chain anomalies, dispute patterns, document
 * integrity, encumbrance exposure, transaction cadence, and valuation
 * anomalies to produce a deterministic, explainable title risk score before
 * registration, transfer, mortgage perfection, or auction release.
 *
 * All assessments and source data are loaded from configured PostgreSQL
 * repositories; database failures are surfaced rather than replaced with local state.
 */

import { and, desc, eq } from 'drizzle-orm';
import { requireDb } from './db';
import { titleRiskAssessments } from '../drizzle/schema';
import * as parcelRepository from './parcelRepository';
import * as disputeRepository from './disputeRepository';
import * as documentRepository from './documentRepository';
import * as transactionRepository from './transactionRepository';

export type RiskBand = 'low' | 'medium' | 'high' | 'critical';

export interface RiskFactor {
  key: string;
  label: string;
  weight: number;
  score: number; // 0 (no risk) - 100 (maximum risk)
  contribution: number;
  explanation: string;
}

export interface TitleRiskAssessmentResult {
  id?: number;
  parcelId: number;
  transactionId?: number;
  overallScore: number;
  riskBand: RiskBand;
  factors: RiskFactor[];
  drivers: string[];
  recommendations: string[];
  assessedAt: string;
}

const FACTOR_WEIGHTS = {
  disputeHistory: 25,
  verificationStatus: 15,
  documentIntegrity: 15,
  encumbranceExposure: 15,
  transactionCadence: 15,
  valuationAnomaly: 15,
} as const;

const OPEN_DISPUTE_STATUSES = new Set(['pending', 'filed', 'mediation', 'in_review', 'hearing_scheduled', 'escalated']);
const ACTIVE_MORTGAGE_TX_STATUSES = new Set(['pending_approval', 'in_review', 'approved', 'initiated']);
const CADENCE_WINDOW_DAYS = 90;
const CADENCE_ALERT_COUNT = 3;
const VALUATION_JUMP_RATIO = 3;

export function bandForScore(score: number): RiskBand {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Assess title risk for a parcel (optionally in the context of a transaction).
 */
export async function assessTitleRisk(params: {
  parcelId: number;
  transactionId?: number;
  assessedBy?: number;
}): Promise<TitleRiskAssessmentResult> {
  const { parcelId, transactionId, assessedBy } = params;
  const parcel = await parcelRepository.getParcelById(parcelId);
  if (!parcel) {
    throw new Error(`Parcel ${parcelId} not found`);
  }

  // --- Factor 1: dispute history -------------------------------------------
  const allDisputes = (await disputeRepository.listDisputes({ limit: 1000 })).disputes;
  const parcelDisputes = allDisputes.filter((d: any) => d.parcelId === parcelId);
  const openDisputes = parcelDisputes.filter((d: any) => OPEN_DISPUTE_STATUSES.has(String(d.status)));
  const disputeScore = clampScore(openDisputes.length * 35 + Math.max(0, parcelDisputes.length - openDisputes.length) * 10);

  // --- Factor 2: verification status ---------------------------------------
  const verificationScore =
    parcel.status === 'registered' ? 0 :
    parcel.status === 'verified' ? 15 :
    parcel.status === 'pending_verification' ? 55 : 90; // disputed
  const verificationExplanation =
    parcel.status === 'disputed'
      ? 'Parcel is currently flagged as disputed'
      : parcel.status === 'pending_verification'
        ? 'Parcel has not completed registry verification'
        : `Parcel status is ${parcel.status}`;

  // --- Factor 3: document integrity ----------------------------------------
  const documents = (await documentRepository.getDocumentsByParcel(parcelId)) as any[];
  const unverifiedDocs = documents.filter((doc) => doc && doc.verified === false);
  const documentScore =
    documents.length === 0 ? 70 : clampScore((unverifiedDocs.length / documents.length) * 100);
  const documentExplanation =
    documents.length === 0
      ? 'No supporting documents on file for this parcel'
      : unverifiedDocs.length > 0
        ? `${unverifiedDocs.length} of ${documents.length} parcel documents are unverified`
        : `All ${documents.length} parcel documents verified`;

  // --- Factor 4: encumbrance exposure (active mortgage-type transactions) ---
  const mortgageTx = (await transactionRepository
    .listTransactions({ type: 'mortgage', limit: 1000 }))
    .transactions.filter((tx: any) => tx.parcelId === parcelId && ACTIVE_MORTGAGE_TX_STATUSES.has(String(tx.status)));
  const encumbranceScore = clampScore(mortgageTx.length * 40);

  // --- Factor 5: transaction cadence ----------------------------------------
  const parcelTransactions = (await transactionRepository
    .listTransactions({ limit: 1000 }))
    .transactions.filter((tx: any) => tx.parcelId === parcelId);
  const now = new Date();
  const recentCount = parcelTransactions.filter((tx: any) => {
    const when = new Date(tx.createdAt ?? tx.initiatedAt ?? now);
    return daysBetween(when, now) <= CADENCE_WINDOW_DAYS;
  }).length;
  const cadenceScore = recentCount >= CADENCE_ALERT_COUNT ? 90 : recentCount === 2 ? 45 : recentCount === 1 ? 10 : 0;

  // --- Factor 6: valuation anomaly ------------------------------------------
  const valuedTx = parcelTransactions.filter((tx: any) => Number(tx.amount) > 0);
  let valuationScore = 0;
  let valuationExplanation = 'No transaction amounts available for valuation comparison';
  if (valuedTx.length > 0 && parcel.estimatedValue !== null && parcel.estimatedValue > 0) {
    const maxAmount = Math.max(...valuedTx.map((tx: any) => Number(tx.amount)));
    const ratio = maxAmount / parcel.estimatedValue;
    valuationScore = ratio >= VALUATION_JUMP_RATIO ? 85 : ratio >= 2 ? 50 : ratio >= 1.25 ? 25 : 5;
    valuationExplanation = `Largest transaction amount is ${ratio.toFixed(2)}x the parcel estimated value`;
  } else if (parcel.estimatedValue === null) {
    valuationExplanation = 'No verified parcel appraisal is available for valuation anomaly analysis';
  }

  const factors: RiskFactor[] = [
    {
      key: 'disputeHistory',
      label: 'Dispute history',
      weight: FACTOR_WEIGHTS.disputeHistory,
      score: disputeScore,
      contribution: Math.round((disputeScore * FACTOR_WEIGHTS.disputeHistory) / 100),
      explanation:
        openDisputes.length > 0
          ? `${openDisputes.length} open dispute(s) recorded against this parcel`
          : parcelDisputes.length > 0
            ? 'Only historical (closed) disputes recorded'
            : 'No disputes recorded',
    },
    {
      key: 'verificationStatus',
      label: 'Verification status',
      weight: FACTOR_WEIGHTS.verificationStatus,
      score: verificationScore,
      contribution: Math.round((verificationScore * FACTOR_WEIGHTS.verificationStatus) / 100),
      explanation: verificationExplanation,
    },
    {
      key: 'documentIntegrity',
      label: 'Document integrity',
      weight: FACTOR_WEIGHTS.documentIntegrity,
      score: documentScore,
      contribution: Math.round((documentScore * FACTOR_WEIGHTS.documentIntegrity) / 100),
      explanation: documentExplanation,
    },
    {
      key: 'encumbranceExposure',
      label: 'Encumbrance exposure',
      weight: FACTOR_WEIGHTS.encumbranceExposure,
      score: encumbranceScore,
      contribution: Math.round((encumbranceScore * FACTOR_WEIGHTS.encumbranceExposure) / 100),
      explanation:
        mortgageTx.length > 0
          ? `${mortgageTx.length} active mortgage transaction(s) encumber this parcel`
          : 'No active mortgage encumbrances detected',
    },
    {
      key: 'transactionCadence',
      label: 'Transaction cadence',
      weight: FACTOR_WEIGHTS.transactionCadence,
      score: cadenceScore,
      contribution: Math.round((cadenceScore * FACTOR_WEIGHTS.transactionCadence) / 100),
      explanation:
        recentCount >= CADENCE_ALERT_COUNT
          ? `${recentCount} transactions within ${CADENCE_WINDOW_DAYS} days — possible flipping or layering`
          : `${recentCount} transaction(s) in the last ${CADENCE_WINDOW_DAYS} days`,
    },
    {
      key: 'valuationAnomaly',
      label: 'Valuation anomaly',
      weight: FACTOR_WEIGHTS.valuationAnomaly,
      score: valuationScore,
      contribution: Math.round((valuationScore * FACTOR_WEIGHTS.valuationAnomaly) / 100),
      explanation: valuationExplanation,
    },
  ];

  const overallScore = clampScore(factors.reduce((sum, f) => sum + f.contribution, 0));
  const riskBand = bandForScore(overallScore);
  const drivers = factors
    .filter((f) => f.score >= 50)
    .sort((a, b) => b.contribution - a.contribution)
    .map((f) => `${f.label}: ${f.explanation}`);

  const recommendations: string[] = [];
  if (openDisputes.length > 0) recommendations.push('Suspend completion until open disputes are resolved or mediated.');
  if (parcel.status === 'pending_verification') recommendations.push('Complete registry verification before proceeding.');
  if (parcel.status === 'disputed') recommendations.push('Escalate to the dispute resolution workflow and notify stakeholders.');
  if (unverifiedDocs.length > 0 || documents.length === 0) recommendations.push('Obtain and verify all title documents before release.');
  if (mortgageTx.length > 0) recommendations.push('Obtain lender discharge or consent before transfer.');
  if (recentCount >= CADENCE_ALERT_COUNT) recommendations.push('Review transaction cadence for fraud patterns before approving.');
  if (valuationScore >= 50) recommendations.push('Commission an independent valuation review.');
  if (recommendations.length === 0) recommendations.push('No blocking issues detected; proceed with standard controls.');

  const result: TitleRiskAssessmentResult = {
    parcelId,
    transactionId,
    overallScore,
    riskBand,
    factors,
    drivers,
    recommendations,
    assessedAt: new Date().toISOString(),
  };

  // Persist to PostgreSQL — hard-fails when the database is unavailable.
  const db = await requireDb();
  const inserted = await db
    .insert(titleRiskAssessments)
    .values({
      parcelId,
      transactionId: transactionId ?? null,
      overallScore,
      riskBand,
      factorScores: factors,
      drivers,
      recommendations,
      assessedBy: assessedBy ?? null,
    })
    .returning();
  result.id = inserted[0]?.id;
  return result;
}

/** List recent assessments, optionally filtered by parcel or band. */
export async function listRiskAssessments(filter: {
  parcelId?: number;
  riskBand?: RiskBand;
  limit?: number;
}): Promise<TitleRiskAssessmentResult[]> {
  const limit = filter.limit ?? 50;
  const db = await requireDb();
  const conditions = [] as any[];
  if (filter.parcelId) conditions.push(eq(titleRiskAssessments.parcelId, filter.parcelId));
  if (filter.riskBand) conditions.push(eq(titleRiskAssessments.riskBand, filter.riskBand));
  const rows = await db
    .select()
    .from(titleRiskAssessments)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(titleRiskAssessments.assessedAt))
    .limit(limit);
  return rows.map((row: any) => ({
    id: row.id,
    parcelId: row.parcelId,
    transactionId: row.transactionId ?? undefined,
    overallScore: row.overallScore,
    riskBand: row.riskBand,
    factors: (row.factorScores as RiskFactor[]) ?? [],
    drivers: (row.drivers as string[]) ?? [],
    recommendations: (row.recommendations as string[]) ?? [],
    assessedAt: row.assessedAt?.toISOString?.() ?? String(row.assessedAt),
  }));
}

/** Portfolio-level risk summary across assessed parcels. */
export async function getPortfolioRiskSummary() {
  const assessments = await listRiskAssessments({ limit: 500 });
  const byBand: Record<RiskBand, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  let totalScore = 0;
  for (const assessment of assessments) {
    byBand[assessment.riskBand] += 1;
    totalScore += assessment.overallScore;
  }
  return {
    totalAssessments: assessments.length,
    byBand,
    averageScore: assessments.length ? Math.round(totalScore / assessments.length) : 0,
    generatedAt: new Date().toISOString(),
  };
}
