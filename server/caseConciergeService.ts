/**
 * Citizen Self-Service Case Resolution Concierge (next-generation feature, 2026-07-18)
 *
 * Guided case intake that dynamically adapts questions based on case type,
 * dispute stage, and missing evidence — reducing front-desk load and improving
 * citizen completion rates. Sessions are deliberately ephemeral UX state
 * (in-memory with TTL); the assembled case payload is the durable output,
 * ready to hand to the disputes / verification / documents workflows.
 */

import { createHash } from 'crypto';

export type CaseType = 'dispute_filing' | 'document_submission' | 'verification_request' | 'payment_issue' | 'general_inquiry';

export interface ConciergeStep {
  stepId: string;
  question: string;
  helpText?: string;
  inputType: 'text' | 'choice' | 'number' | 'date' | 'parcel_reference' | 'document_checklist' | 'contact';
  options?: string[];
  required: boolean;
  conditionHint?: string;
}

export interface ConciergeSession {
  sessionId: string;
  userId?: number;
  caseType: CaseType;
  status: 'in_progress' | 'completed' | 'abandoned';
  currentStepId: string;
  answers: Record<string, any>;
  answeredSteps: string[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  result?: ConciergeResult;
}

export interface ConciergeResult {
  summary: string;
  recommendedAction: string;
  targetWorkflow: string;
  assembledPayload: Record<string, any>;
  missingEvidence: string[];
  nextSteps: string[];
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const sessions = new Map<string, ConciergeSession>();

const REQUIRED_EVIDENCE: Record<CaseType, string[]> = {
  dispute_filing: ['proof_of_ownership', 'supporting_documents', 'respondent_details'],
  document_submission: ['document_file', 'parcel_reference'],
  verification_request: ['identity_document', 'parcel_reference', 'survey_plan'],
  payment_issue: ['payment_reference', 'transaction_reference'],
  general_inquiry: [],
};

function buildSteps(caseType: CaseType): ConciergeStep[] {
  const common: ConciergeStep[] = [
    {
      stepId: 'contact',
      question: 'How should we reach you about this case?',
      helpText: 'Provide an email address or phone number for case updates.',
      inputType: 'contact',
      required: true,
    },
  ];

  switch (caseType) {
    case 'dispute_filing':
      return [
        {
          stepId: 'parcel_reference',
          question: 'Which parcel is this dispute about?',
          helpText: 'Enter the parcel number (e.g. LG-VI-2024-001) or survey plan number.',
          inputType: 'parcel_reference',
          required: true,
        },
        {
          stepId: 'dispute_category',
          question: 'What best describes this dispute?',
          inputType: 'choice',
          options: ['ownership', 'boundary', 'inheritance', 'fraudulent_sale', 'encroachment', 'compensation', 'other'],
          required: true,
        },
        {
          stepId: 'respondent_known',
          question: 'Do you know the other party involved?',
          inputType: 'choice',
          options: ['yes', 'no'],
          required: true,
        },
        {
          stepId: 'respondent_details',
          question: 'Provide the respondent\'s name and any contact details you have.',
          inputType: 'text',
          required: true,
          conditionHint: 'Shown because you know the other party',
        },
        {
          stepId: 'prior_attempts',
          question: 'Have you attempted to resolve this before? If yes, describe the outcome.',
          inputType: 'text',
          required: false,
        },
        {
          stepId: 'evidence_checklist',
          question: 'Which supporting documents do you have ready?',
          helpText: 'Select all that apply: proof of ownership, survey plan, purchase receipt, court documents, photographs.',
          inputType: 'document_checklist',
          options: ['proof_of_ownership', 'survey_plan', 'purchase_receipt', 'court_documents', 'photographs'],
          required: true,
        },
        ...common,
      ];
    case 'document_submission':
      return [
        {
          stepId: 'parcel_reference',
          question: 'Which parcel do these documents relate to?',
          inputType: 'parcel_reference',
          required: true,
        },
        {
          stepId: 'document_type',
          question: 'What type of document are you submitting?',
          inputType: 'choice',
          options: ['title_deed', 'survey_plan', 'purchase_agreement', 'tax_clearance', 'identity_document', 'other'],
          required: true,
        },
        {
          stepId: 'document_date',
          question: 'What is the date on the document?',
          inputType: 'date',
          required: false,
        },
        ...common,
      ];
    case 'verification_request':
      return [
        {
          stepId: 'parcel_reference',
          question: 'Which parcel should be verified?',
          inputType: 'parcel_reference',
          required: true,
        },
        {
          stepId: 'verification_purpose',
          question: 'What is this verification for?',
          inputType: 'choice',
          options: ['purchase', 'mortgage', 'inheritance', 'personal_records', 'legal', 'other'],
          required: true,
        },
        {
          stepId: 'has_survey_plan',
          question: 'Do you have the survey plan for this parcel?',
          inputType: 'choice',
          options: ['yes', 'no'],
          required: true,
        },
        ...common,
      ];
    case 'payment_issue':
      return [
        {
          stepId: 'payment_reference',
          question: 'What is the payment or transaction reference?',
          inputType: 'text',
          required: true,
        },
        {
          stepId: 'issue_type',
          question: 'What went wrong?',
          inputType: 'choice',
          options: ['charged_not_reflected', 'double_charge', 'wrong_amount', 'failed_but_debited', 'refund_pending', 'other'],
          required: true,
        },
        {
          stepId: 'amount',
          question: 'What amount is involved (NGN)?',
          inputType: 'number',
          required: true,
        },
        ...common,
      ];
    case 'general_inquiry':
    default:
      return [
        {
          stepId: 'inquiry_topic',
          question: 'What is your inquiry about?',
          inputType: 'choice',
          options: ['registration', 'transfer', 'mortgage', 'verification', 'fees', 'other'],
          required: true,
        },
        {
          stepId: 'inquiry_details',
          question: 'Describe your question or issue.',
          inputType: 'text',
          required: true,
        },
        ...common,
      ];
  }
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.status === 'in_progress' && now - new Date(session.updatedAt).getTime() > SESSION_TTL_MS) {
      session.status = 'abandoned';
    }
  }
}

function stepsFor(session: ConciergeSession): ConciergeStep[] {
  const steps = buildSteps(session.caseType);
  // Dynamic adaptation: skip conditional steps whose trigger was not met
  return steps.filter((step) => {
    if (step.stepId === 'respondent_details') {
      return session.answers.respondent_known === 'yes';
    }
    return true;
  });
}

/** Start a new concierge session; returns the first step. */
export function startSession(params: { userId?: number; caseType: CaseType }): { session: ConciergeSession; step: ConciergeStep } {
  pruneExpiredSessions();
  const sessionId = createHash('sha256')
    .update(`${params.userId ?? 'anon'}|${params.caseType}|${Date.now()}|${Math.random()}`)
    .digest('hex')
    .slice(0, 20);
  const now = new Date().toISOString();
  const session: ConciergeSession = {
    sessionId,
    userId: params.userId,
    caseType: params.caseType,
    status: 'in_progress',
    currentStepId: '',
    answers: {},
    answeredSteps: [],
    startedAt: now,
    updatedAt: now,
  };
  sessions.set(sessionId, session);
  const first = stepsFor(session)[0];
  session.currentStepId = first.stepId;
  return { session, step: first };
}

/** Submit an answer; returns the next step or the completed result. */
export function answerStep(params: {
  sessionId: string;
  stepId: string;
  answer: any;
}): { session: ConciergeSession; nextStep?: ConciergeStep; result?: ConciergeResult } {
  const session = sessions.get(params.sessionId);
  if (!session) throw new Error('Session not found or expired');
  if (session.status !== 'in_progress') throw new Error(`Session is ${session.status}`);

  const steps = stepsFor(session);
  const step = steps.find((s) => s.stepId === params.stepId);
  if (!step) throw new Error(`Step "${params.stepId}" is not applicable in the current flow`);
  if (step.stepId !== session.currentStepId) throw new Error(`Expected answer for step "${session.currentStepId}"`);
  if (step.required && (params.answer == null || params.answer === '' || (Array.isArray(params.answer) && params.answer.length === 0))) {
    throw new Error('This question requires an answer');
  }

  session.answers[step.stepId] = params.answer;
  session.answeredSteps.push(step.stepId);
  session.updatedAt = new Date().toISOString();

  // Re-evaluate flow (answering may unlock/skip conditional steps)
  const flow = stepsFor(session);
  const currentIndex = flow.findIndex((s) => s.stepId === step.stepId);
  const next = flow[currentIndex + 1];

  if (next) {
    session.currentStepId = next.stepId;
    return { session, nextStep: next };
  }

  // Flow complete — assemble the case result
  const result = assembleResult(session);
  session.status = 'completed';
  session.completedAt = new Date().toISOString();
  session.result = result;
  return { session, result };
}

function assembleResult(session: ConciergeSession): ConciergeResult {
  const a = session.answers;
  const providedEvidence: string[] = Array.isArray(a.evidence_checklist) ? a.evidence_checklist : [];
  const missingEvidence = (REQUIRED_EVIDENCE[session.caseType] ?? []).filter(
    (item) => !providedEvidence.includes(item) && a[item] == null
  );

  switch (session.caseType) {
    case 'dispute_filing':
      return {
        summary: `Dispute (${a.dispute_category}) for parcel ${a.parcel_reference}`,
        recommendedAction: 'File this dispute with the registry dispute-resolution workflow',
        targetWorkflow: 'disputes.create',
        assembledPayload: {
          parcelReference: a.parcel_reference,
          type: a.dispute_category,
          respondent: a.respondent_details ?? 'Unknown party',
          priorAttempts: a.prior_attempts ?? null,
          evidence: providedEvidence,
          contact: a.contact,
        },
        missingEvidence,
        nextSteps: [
          ...(missingEvidence.length ? [`Gather missing evidence: ${missingEvidence.join(', ')}`] : []),
          'Submit the assembled payload to the disputes workflow',
          'A mediator will be assigned within 3 business days',
        ],
      };
    case 'document_submission':
      return {
        summary: `Document submission (${a.document_type}) for parcel ${a.parcel_reference}`,
        recommendedAction: 'Upload the document record for registry validation',
        targetWorkflow: 'documents.upload',
        assembledPayload: {
          parcelReference: a.parcel_reference,
          documentType: a.document_type,
          documentDate: a.document_date ?? null,
          contact: a.contact,
        },
        missingEvidence,
        nextSteps: ['Upload the document file', 'Registry staff will validate within 5 business days'],
      };
    case 'verification_request':
      return {
        summary: `Verification request (${a.verification_purpose}) for parcel ${a.parcel_reference}`,
        recommendedAction: 'Create a parcel verification request',
        targetWorkflow: 'verification.create',
        assembledPayload: {
          parcelReference: a.parcel_reference,
          purpose: a.verification_purpose,
          hasSurveyPlan: a.has_survey_plan === 'yes',
          contact: a.contact,
        },
        missingEvidence: a.has_survey_plan === 'yes' ? missingEvidence : [...missingEvidence, 'survey_plan'],
        nextSteps: ['Submit the verification request', 'A verification officer will be assigned'],
      };
    case 'payment_issue':
      return {
        summary: `Payment issue (${a.issue_type}) on reference ${a.payment_reference}`,
        recommendedAction: 'Open a payment reconciliation ticket',
        targetWorkflow: 'support.createTicket',
        assembledPayload: {
          paymentReference: a.payment_reference,
          issueType: a.issue_type,
          amount: a.amount,
          contact: a.contact,
        },
        missingEvidence,
        nextSteps: ['Payment operations will reconcile within 2 business days'],
      };
    case 'general_inquiry':
    default:
      return {
        summary: `General inquiry (${a.inquiry_topic})`,
        recommendedAction: 'Route to the support knowledge base or a support agent',
        targetWorkflow: 'support.createTicket',
        assembledPayload: { topic: a.inquiry_topic, details: a.inquiry_details, contact: a.contact },
        missingEvidence: [],
        nextSteps: ['A support agent will respond within 1 business day'],
      };
  }
}

/** Fetch a session by id. */
export function getSession(sessionId: string): ConciergeSession | null {
  pruneExpiredSessions();
  return sessions.get(sessionId) ?? null;
}

/** List sessions (optionally for one user). */
export function listSessions(filter: { userId?: number; status?: string; limit?: number } = {}) {
  pruneExpiredSessions();
  return Array.from(sessions.values())
    .filter((s) => (filter.userId == null || s.userId === filter.userId) && (!filter.status || s.status === filter.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, filter.limit ?? 50);
}
