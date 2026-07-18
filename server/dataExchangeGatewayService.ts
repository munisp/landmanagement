/**
 * Privacy-Aware Data Exchange Gateway (next-generation feature, 2026-07-18)
 *
 * Runtime control plane for outbound personal/transaction data: every export
 * is authorized against consent status, role authorization, jurisdiction
 * rules, and purpose limitation BEFORE data leaves the platform. Every
 * decision (allow / deny / conditional) is persisted to an audit trail.
 *
 * Offline-capable: decisions and audits still work when PostgreSQL is down.
 */

import { and, desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { dataExchangeAudits } from '../drizzle/schema';
import * as gdpr from './gdpr';

export type ExchangeDecision = 'allowed' | 'denied' | 'conditional';

export interface ExchangeRequest {
  subjectUserId: number;
  requestorUserId?: number;
  requestorRole: string;
  purpose: string;
  jurisdiction?: string;
  dataCategories: string[];
}

export interface ExchangeAuthorization {
  decision: ExchangeDecision;
  reasons: string[];
  conditions: string[];
  auditId?: number;
  evaluatedAt: string;
}

interface PurposePolicy {
  allowedRoles: string[];
  allowedCategories: string[];
  requiresConsent: boolean;
  legalBasis: 'consent' | 'legal_obligation' | 'public_task' | 'legitimate_interest';
}

/**
 * Purpose-limitation policy map. Extend via DATA_EXCHANGE_POLICY_JSON env var
 * (JSON object merged over these defaults).
 */
const DEFAULT_PURPOSE_POLICIES: Record<string, PurposePolicy> = {
  mortgage_underwriting: {
    allowedRoles: ['admin', 'registrar', 'bank_officer', 'loan_officer'],
    allowedCategories: ['identity', 'financial', 'property', 'contact'],
    requiresConsent: true,
    legalBasis: 'consent',
  },
  tax_clearance: {
    allowedRoles: ['admin', 'registrar', 'agency_officer', 'tax_officer'],
    allowedCategories: ['identity', 'property', 'financial'],
    requiresConsent: false,
    legalBasis: 'legal_obligation',
  },
  identity_verification: {
    allowedRoles: ['admin', 'registrar', 'surveyor', 'agency_officer', 'bank_officer'],
    allowedCategories: ['identity', 'contact'],
    requiresConsent: true,
    legalBasis: 'consent',
  },
  statistical_reporting: {
    allowedRoles: ['admin', 'registrar', 'analyst', 'agency_officer'],
    allowedCategories: ['property', 'transaction_metadata'],
    requiresConsent: false,
    legalBasis: 'public_task',
  },
  dispute_resolution: {
    allowedRoles: ['admin', 'registrar', 'mediator'],
    allowedCategories: ['identity', 'property', 'contact', 'case'],
    requiresConsent: false,
    legalBasis: 'legitimate_interest',
  },
};

function loadPolicies(): Record<string, PurposePolicy> {
  const raw = process.env.DATA_EXCHANGE_POLICY_JSON;
  if (!raw) return DEFAULT_PURPOSE_POLICIES;
  try {
    return { ...DEFAULT_PURPOSE_POLICIES, ...(JSON.parse(raw) as Record<string, PurposePolicy>) };
  } catch {
    console.warn('[DataExchange] Invalid DATA_EXCHANGE_POLICY_JSON — using defaults');
    return DEFAULT_PURPOSE_POLICIES;
  }
}

const ALLOWED_JURISDICTIONS = new Set((process.env.DATA_EXCHANGE_JURISDICTIONS ?? 'NG').split(',').map((j) => j.trim().toUpperCase()));

const memoryAudits: Array<ExchangeAuthorization & { id: number; request: ExchangeRequest }> = [];
let memoryId = 1;

async function hasPendingErasure(subjectUserId: number): Promise<boolean> {
  try {
    const activity = await gdpr.getGDPRActivity(subjectUserId);
    return (activity as any[]).some((entry) => {
      const action = String(entry.action ?? entry.activityType ?? '').toLowerCase();
      return action.includes('erasure') || action.includes('forgotten') || action.includes('delete');
    });
  } catch {
    return false; // offline: cannot confirm — do not block solely on this check
  }
}

async function hasActiveConsent(subjectUserId: number, purpose: string): Promise<boolean> {
  try {
    const history = await gdpr.getConsentHistory(subjectUserId);
    const relevant = (history as any[])
      .filter((record) => String(record.purpose ?? '').toLowerCase() === purpose.toLowerCase())
      .sort((a, b) => new Date(b.createdAt ?? b.timestamp ?? 0).getTime() - new Date(a.createdAt ?? a.timestamp ?? 0).getTime());
    if (!relevant.length) return false;
    const latest = relevant[0] as any;
    return Boolean(latest.granted ?? latest.consented ?? latest.status === 'granted');
  } catch {
    return false;
  }
}

/** Authorize an outbound data exchange and persist the audit record. */
export async function authorizeExchange(request: ExchangeRequest): Promise<ExchangeAuthorization> {
  const policies = loadPolicies();
  const reasons: string[] = [];
  const conditions: string[] = [];
  let decision: ExchangeDecision = 'allowed';

  const policy = policies[request.purpose];
  if (!policy) {
    decision = 'denied';
    reasons.push(`Purpose "${request.purpose}" is not a recognized exchange purpose`);
  } else {
    // Role authorization
    if (!policy.allowedRoles.includes(request.requestorRole)) {
      decision = 'denied';
      reasons.push(`Role "${request.requestorRole}" is not authorized for purpose "${request.purpose}"`);
    }
    // Category minimization
    const outOfScope = request.dataCategories.filter((c) => !policy.allowedCategories.includes(c));
    if (outOfScope.length > 0) {
      if (decision === 'allowed') decision = 'conditional';
      conditions.push(`Remove out-of-scope data categories: ${outOfScope.join(', ')}`);
    }
    // Consent (when the legal basis requires it)
    if (policy.requiresConsent) {
      const consented = await hasActiveConsent(request.subjectUserId, request.purpose);
      if (!consented) {
        decision = 'denied';
        reasons.push(`No active consent from subject for purpose "${request.purpose}"`);
      }
    }
  }

  // Pending erasure blocks all exports regardless of purpose
  if (decision !== 'denied' && (await hasPendingErasure(request.subjectUserId))) {
    decision = 'denied';
    reasons.push('Subject has a pending erasure / right-to-be-forgotten request');
  }

  // Jurisdiction
  const jurisdiction = (request.jurisdiction ?? 'NG').toUpperCase();
  if (decision !== 'denied' && !ALLOWED_JURISDICTIONS.has(jurisdiction)) {
    if (decision === 'allowed') decision = 'conditional';
    conditions.push(`Cross-border transfer to ${jurisdiction} requires documented safeguards and approval trail`);
  }

  if (decision === 'allowed' && reasons.length === 0) {
    reasons.push('All policy checks passed');
  }

  const authorization: ExchangeAuthorization = {
    decision,
    reasons,
    conditions,
    evaluatedAt: new Date().toISOString(),
  };

  // Persist audit
  const db = await getDb();
  if (db) {
    try {
      const inserted = await db
        .insert(dataExchangeAudits)
        .values({
          subjectUserId: request.subjectUserId,
          requestorUserId: request.requestorUserId ?? null,
          requestorRole: request.requestorRole,
          purpose: request.purpose,
          jurisdiction,
          dataCategories: request.dataCategories,
          decision,
          decisionReasons: reasons,
          conditions,
        })
        .returning();
      authorization.auditId = inserted[0]?.id;
      return authorization;
    } catch (error) {
      console.warn('[DataExchange] Audit persist failed, using memory fallback:', (error as Error).message);
    }
  }
  const id = memoryId++;
  memoryAudits.unshift({ ...authorization, id, request });
  authorization.auditId = id;
  return authorization;
}

/** List exchange audit records. */
export async function listExchangeAudits(filter: {
  subjectUserId?: number;
  decision?: ExchangeDecision;
  purpose?: string;
  limit?: number;
} = {}) {
  const db = await getDb();
  if (db) {
    try {
      const conditions = [] as any[];
      if (filter.subjectUserId) conditions.push(eq(dataExchangeAudits.subjectUserId, filter.subjectUserId));
      if (filter.decision) conditions.push(eq(dataExchangeAudits.decision, filter.decision));
      if (filter.purpose) conditions.push(eq(dataExchangeAudits.purpose, filter.purpose));
      const rows = await db
        .select()
        .from(dataExchangeAudits)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(dataExchangeAudits.createdAt))
        .limit(filter.limit ?? 100);
      return rows.map((row: any) => ({
        id: row.id,
        subjectUserId: row.subjectUserId,
        requestorUserId: row.requestorUserId ?? undefined,
        requestorRole: row.requestorRole,
        purpose: row.purpose,
        jurisdiction: row.jurisdiction,
        dataCategories: (row.dataCategories as string[]) ?? [],
        decision: row.decision,
        reasons: (row.decisionReasons as string[]) ?? [],
        conditions: (row.conditions as string[]) ?? [],
        createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
      }));
    } catch (error) {
      console.warn('[DataExchange] Audit list failed, using memory fallback:', (error as Error).message);
    }
  }
  return memoryAudits
    .filter((a) =>
      (!filter.subjectUserId || a.request.subjectUserId === filter.subjectUserId) &&
      (!filter.decision || a.decision === filter.decision) &&
      (!filter.purpose || a.request.purpose === filter.purpose)
    )
    .slice(0, filter.limit ?? 100)
    .map((a) => ({
      id: a.id,
      subjectUserId: a.request.subjectUserId,
      requestorUserId: a.request.requestorUserId,
      requestorRole: a.request.requestorRole,
      purpose: a.request.purpose,
      jurisdiction: a.request.jurisdiction ?? 'NG',
      dataCategories: a.request.dataCategories,
      decision: a.decision,
      reasons: a.reasons,
      conditions: a.conditions,
      createdAt: a.evaluatedAt,
    }));
}

/** Expose the active purpose policy map for admin UIs. */
export function getPurposePolicies() {
  return loadPolicies();
}
