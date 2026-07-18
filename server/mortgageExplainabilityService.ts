/**
 * Explainable Mortgage Decisioning Workbench (next-generation feature, 2026-07-18)
 *
 * Scores a borrower + collateral package and, crucially, shows WHICH factors
 * shaped the outcome: bureau signals, loan-to-value, down-payment strength,
 * repayment burden, documentation completeness, and collateral status.
 * Designed for regulator/auditor/lender adverse-action defensibility.
 *
 * Offline-capable: composes in-memory repositories when PostgreSQL is down.
 */

import { desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { mortgageDecisionExplanations } from '../drizzle/schema';
import * as mortgageApplicationRepository from './mortgageApplicationRepository';
import * as parcelRepository from './parcelRepository';
import * as financialIntegrationsService from './financialIntegrationsService';

export interface DecisionFactor {
  key: string;
  label: string;
  weight: number;
  score: number; // 0-100, higher is better
  contribution: number; // weighted points
  impact: 'positive' | 'neutral' | 'negative';
  explanation: string;
  evidence?: Record<string, any>;
}

export interface MortgageDecisionExplanation {
  id?: number;
  applicationId: number;
  overallScore: number;
  recommendation: 'approve' | 'approve_with_conditions' | 'manual_review' | 'decline';
  factors: DecisionFactor[];
  policyVersion: string;
  generatedAt: string;
}

const POLICY_VERSION = 'underwriting-v1.0';
const EXPECTED_DOCUMENTS = ['identity', 'income_proof', 'title_document', 'valuation_report', 'bank_statement'];

const memoryExplanations: MortgageDecisionExplanation[] = [];
let memoryId = 1;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function impactOf(score: number): DecisionFactor['impact'] {
  if (score >= 65) return 'positive';
  if (score >= 40) return 'neutral';
  return 'negative';
}

function recommendationFor(score: number): MortgageDecisionExplanation['recommendation'] {
  if (score >= 75) return 'approve';
  if (score >= 60) return 'approve_with_conditions';
  if (score >= 40) return 'manual_review';
  return 'decline';
}

function creditScoreToPoints(score: number): number {
  if (score >= 750) return 100;
  if (score >= 700) return 85;
  if (score >= 650) return 70;
  if (score >= 600) return 55;
  if (score >= 550) return 40;
  return 20;
}

/** Generate (and persist) an explainable underwriting decision. */
export async function explainApplication(params: {
  applicationId: number;
  generatedBy?: number;
}): Promise<MortgageDecisionExplanation> {
  const { applicationId, generatedBy } = params;
  const application = (await mortgageApplicationRepository.getMortgageApplicationByNumericId(applicationId)) as any;
  if (!application) throw new Error(`Mortgage application ${applicationId} not found`);

  const parcel = application.parcelId ? parcelRepository.getParcelById(application.parcelId) : undefined;

  // Bureau signal (offline-capable via guarded fallback)
  let bureau: { score: number; rating: string; factors: string[] } = { score: 0, rating: 'unknown', factors: [] };
  try {
    bureau = await financialIntegrationsService.getCreditScore(application.applicantId);
  } catch (error) {
    console.warn('[MortgageExplain] Bureau lookup failed:', (error as Error).message);
  }

  const loanAmount = Number(application.loanAmount ?? 0);
  const downPayment = Number(application.downPayment ?? 0);
  const monthlyPayment = Number(application.monthlyPayment ?? 0);
  const estimatedValue = Number(parcel?.estimatedValue ?? 0);
  const metadata = (application.metadata ?? {}) as Record<string, any>;
  const monthlyIncome = Number(metadata.monthlyIncome ?? metadata.verifiedMonthlyIncome ?? 0);
  const documents: any[] = Array.isArray(application.documents) ? application.documents : [];

  // Factor 1: creditworthiness (30)
  const creditPoints = bureau.score ? creditScoreToPoints(bureau.score) : 35;
  // Factor 2: loan-to-value (25)
  const ltv = estimatedValue > 0 ? loanAmount / estimatedValue : null;
  const ltvPoints = ltv == null ? 40 : ltv <= 0.6 ? 100 : ltv <= 0.7 ? 85 : ltv <= 0.8 ? 65 : ltv <= 0.9 ? 40 : 15;
  // Factor 3: down-payment strength (15)
  const totalPrice = loanAmount + downPayment;
  const dpRatio = totalPrice > 0 ? downPayment / totalPrice : 0;
  const dpPoints = dpRatio >= 0.4 ? 100 : dpRatio >= 0.3 ? 85 : dpRatio >= 0.2 ? 65 : dpRatio >= 0.1 ? 40 : 20;
  // Factor 4: repayment burden (15)
  const burdenRatio = monthlyIncome > 0 ? monthlyPayment / monthlyIncome : null;
  const burdenPoints = burdenRatio == null ? 50 : burdenRatio <= 0.25 ? 100 : burdenRatio <= 0.33 ? 80 : burdenRatio <= 0.4 ? 60 : burdenRatio <= 0.5 ? 35 : 15;
  // Factor 5: documentation completeness (10)
  const docKinds = new Set(documents.map((d) => String(d.kind ?? d.type ?? d.name ?? '').toLowerCase()));
  const missingDocs = EXPECTED_DOCUMENTS.filter((kind) => !Array.from(docKinds).some((k) => k.includes(kind)));
  const docPoints = documents.length === 0 ? 25 : clamp(((EXPECTED_DOCUMENTS.length - missingDocs.length) / EXPECTED_DOCUMENTS.length) * 100);
  // Factor 6: collateral status (5)
  const collateralPoints = !parcel ? 40 : parcel.status === 'registered' ? 100 : parcel.status === 'verified' ? 85 : parcel.status === 'pending_verification' ? 50 : 10;

  const factors: DecisionFactor[] = [
    {
      key: 'creditworthiness',
      label: 'Creditworthiness',
      weight: 30,
      score: creditPoints,
      contribution: Math.round((creditPoints * 30) / 100),
      impact: impactOf(creditPoints),
      explanation: bureau.score
        ? `Bureau score ${bureau.score} (${bureau.rating}); factors: ${bureau.factors.join(', ') || 'none reported'}`
        : 'No bureau score available — treated as elevated risk',
      evidence: { bureau },
    },
    {
      key: 'loanToValue',
      label: 'Loan-to-value',
      weight: 25,
      score: ltvPoints,
      contribution: Math.round((ltvPoints * 25) / 100),
      impact: impactOf(ltvPoints),
      explanation:
        ltv == null
          ? 'Collateral value unavailable — LTV cannot be confirmed'
          : `Loan is ${(ltv * 100).toFixed(1)}% of the parcel estimated value (policy ceiling 80%)`,
      evidence: { loanAmount, estimatedValue, ltv },
    },
    {
      key: 'downPaymentStrength',
      label: 'Down-payment strength',
      weight: 15,
      score: dpPoints,
      contribution: Math.round((dpPoints * 15) / 100),
      impact: impactOf(dpPoints),
      explanation: `Down payment covers ${(dpRatio * 100).toFixed(1)}% of the purchase stack`,
      evidence: { downPayment, loanAmount },
    },
    {
      key: 'repaymentBurden',
      label: 'Repayment burden',
      weight: 15,
      score: burdenPoints,
      contribution: Math.round((burdenPoints * 15) / 100),
      impact: impactOf(burdenPoints),
      explanation:
        burdenRatio == null
          ? 'Verified income not on file — affordability unconfirmed'
          : `Monthly repayment consumes ${(burdenRatio * 100).toFixed(1)}% of verified income (policy ceiling 40%)`,
      evidence: { monthlyPayment, monthlyIncome: monthlyIncome || undefined },
    },
    {
      key: 'documentationCompleteness',
      label: 'Documentation completeness',
      weight: 10,
      score: docPoints,
      contribution: Math.round((docPoints * 10) / 100),
      impact: impactOf(docPoints),
      explanation:
        missingDocs.length === 0
          ? 'All expected underwriting documents are on file'
          : `Missing documentation: ${missingDocs.join(', ')}`,
      evidence: { provided: Array.from(docKinds), missing: missingDocs },
    },
    {
      key: 'collateralStatus',
      label: 'Collateral status',
      weight: 5,
      score: collateralPoints,
      contribution: Math.round((collateralPoints * 5) / 100),
      impact: impactOf(collateralPoints),
      explanation: parcel
        ? `Collateral parcel status is ${parcel.status}`
        : 'Collateral parcel could not be resolved',
      evidence: { parcelId: application.parcelId, status: parcel?.status },
    },
  ];

  const overallScore = clamp(factors.reduce((sum, f) => sum + f.contribution, 0));
  const explanation: MortgageDecisionExplanation = {
    applicationId,
    overallScore,
    recommendation: recommendationFor(overallScore),
    factors,
    policyVersion: POLICY_VERSION,
    generatedAt: new Date().toISOString(),
  };

  const db = await getDb();
  if (db) {
    try {
      const inserted = await db
        .insert(mortgageDecisionExplanations)
        .values({
          applicationId,
          overallRecommendation: explanation.recommendation,
          overallScore,
          factors,
          policyVersion: POLICY_VERSION,
          generatedBy: generatedBy ?? null,
        })
        .returning();
      explanation.id = inserted[0]?.id;
      return explanation;
    } catch (error) {
      console.warn('[MortgageExplain] Persist failed, using memory fallback:', (error as Error).message);
    }
  }
  explanation.id = memoryId++;
  memoryExplanations.unshift(explanation);
  return explanation;
}

/** List previously generated explanations. */
export async function listExplanations(filter: { applicationId?: number; limit?: number } = {}) {
  const db = await getDb();
  if (db) {
    try {
      const conditions = filter.applicationId ? eq(mortgageDecisionExplanations.applicationId, filter.applicationId) : undefined;
      const rows = await db
        .select()
        .from(mortgageDecisionExplanations)
        .where(conditions)
        .orderBy(desc(mortgageDecisionExplanations.createdAt))
        .limit(filter.limit ?? 50);
      return rows.map((row: any) => ({
        id: row.id,
        applicationId: row.applicationId,
        overallScore: row.overallScore,
        recommendation: row.overallRecommendation,
        factors: (row.factors as DecisionFactor[]) ?? [],
        policyVersion: row.policyVersion,
        generatedAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
      }));
    } catch (error) {
      console.warn('[MortgageExplain] List failed, using memory fallback:', (error as Error).message);
    }
  }
  return memoryExplanations
    .filter((e) => !filter.applicationId || e.applicationId === filter.applicationId)
    .slice(0, filter.limit ?? 50);
}
