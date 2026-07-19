import { randomUUID } from 'crypto';
import { eq, desc, asc } from 'drizzle-orm';
import { requireDb } from './db';
import { mortgageApplications, mortgageWorkflowEvents } from '../drizzle/schema';

export type MortgageLifecycleStatus = 'pending' | 'under_review' | 'approved' | 'rejected' | 'disbursed' | 'cancelled';

export interface MortgageApplicationRecord {
  id: number;
  applicationId: string;
  applicantId: number;
  propertyId: number;
  parcelId: number;
  transactionId: string;
  loanAmount: number;
  interestRate: string;
  loanTerm: number;
  loanTermMonths: number;
  monthlyPayment: number;
  downPayment: number;
  monthlyIncome: number;
  employmentStatus: 'employed' | 'self-employed' | 'unemployed' | 'retired';
  creditScore: number | null;
  affordabilityRatio: number;
  outstandingBalance: number | null;
  bankName: string;
  bankBranch: string | null;
  loanOfficer: string | null;
  loanOfficerContact: string | null;
  status: MortgageLifecycleStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  disbursedAt: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, any>;
}

export interface MortgageWorkflowEvent {
  id: string;
  applicationId: string;
  status: MortgageLifecycleStatus;
  title: string;
  description: string;
  actorId: number | null;
  createdAt: string;
}

interface CreateMortgageApplicationInput {
  userId: number;
  propertyId: number;
  loanAmount: number;
  interestRate: number;
  loanTerm: number;
  monthlyIncome: number;
  employmentStatus: 'employed' | 'self-employed' | 'unemployed' | 'retired';
  creditScore?: number;
}

interface UpdateMortgageApplicationInput {
  propertyId?: number;
  loanAmount?: number;
  interestRate?: number;
  loanTerm?: number;
  monthlyIncome?: number;
  employmentStatus?: 'employed' | 'self-employed' | 'unemployed' | 'retired';
  creditScore?: number;
  downPayment?: number;
  bankName?: string;
  bankBranch?: string | null;
}

type MortgageApplicationRow = typeof mortgageApplications.$inferSelect;

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToRecord(row: MortgageApplicationRow): MortgageApplicationRecord {
  return {
    id: row.id,
    applicationId: row.applicationId,
    applicantId: row.applicantId,
    propertyId: row.parcelId,
    parcelId: row.parcelId,
    transactionId: row.transactionId ?? `TXN-MORT-${row.applicationId}`,
    loanAmount: row.loanAmount,
    interestRate: row.interestRate,
    loanTerm: row.loanTerm,
    loanTermMonths: row.loanTerm,
    monthlyPayment: row.monthlyPayment,
    downPayment: row.downPayment,
    monthlyIncome: row.monthlyIncome ?? 0,
    employmentStatus: (row.employmentStatus ?? 'employed') as MortgageApplicationRecord['employmentStatus'],
    creditScore: row.creditScore ?? null,
    affordabilityRatio: row.affordabilityRatio ?? 0,
    outstandingBalance: row.outstandingBalance ?? null,
    bankName: row.bankName,
    bankBranch: row.bankBranch ?? null,
    loanOfficer: row.loanOfficer ?? null,
    loanOfficerContact: row.loanOfficerContact ?? null,
    status: row.status as MortgageLifecycleStatus,
    rejectionReason: row.rejectionReason ?? null,
    submittedAt: toIso(row.submittedAt) ?? new Date(0).toISOString(),
    reviewedAt: toIso(row.reviewedAt),
    approvedAt: toIso(row.approvedAt),
    rejectedAt: toIso(row.rejectedAt),
    disbursedAt: toIso(row.disbursedAt),
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
    metadata: (row.metadata as Record<string, any>) ?? {},
  };
}

function eventRowToRecord(row: typeof mortgageWorkflowEvents.$inferSelect): MortgageWorkflowEvent {
  return {
    id: `WFE-${row.id}`,
    applicationId: row.applicationId,
    status: row.status as MortgageLifecycleStatus,
    title: row.title,
    description: row.description ?? '',
    actorId: row.actorId ?? null,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
  };
}

function calculateMonthlyPayment(loanAmount: number, interestRate: number, loanTerm: number) {
  const monthlyRate = interestRate / 100 / 12;
  if (!Number.isFinite(monthlyRate) || monthlyRate <= 0) {
    return Math.round(loanAmount / loanTerm);
  }

  const denominator = Math.pow(1 + monthlyRate, loanTerm) - 1;
  if (denominator <= 0) {
    return Math.round(loanAmount / loanTerm);
  }

  return Math.round(
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, loanTerm)) / denominator
  );
}

function assessBusinessRules(params: {
  monthlyIncome: number;
  loanAmount: number;
  interestRate: number;
  loanTerm: number;
  employmentStatus: CreateMortgageApplicationInput['employmentStatus'];
  creditScore?: number;
}) {
  const monthlyPayment = calculateMonthlyPayment(params.loanAmount, params.interestRate, params.loanTerm);
  const affordabilityRatio = monthlyPayment / params.monthlyIncome;
  const creditScore = params.creditScore ?? 660;

  let initialStatus: MortgageLifecycleStatus = 'under_review';
  let rejectionReason: string | null = null;
  let riskBand: 'low' | 'moderate' | 'heightened' = 'moderate';

  if (affordabilityRatio > 0.45) {
    initialStatus = 'rejected';
    rejectionReason = 'Loan amount exceeds the maximum debt-service threshold of 45% of verified monthly income.';
    riskBand = 'heightened';
  } else if (creditScore < 580) {
    initialStatus = 'rejected';
    rejectionReason = 'Credit score is below the minimum underwriting threshold for mortgage approval.';
    riskBand = 'heightened';
  } else if (affordabilityRatio <= 0.24 && creditScore >= 760 && params.employmentStatus === 'employed') {
    initialStatus = 'approved';
    riskBand = 'low';
  } else if (affordabilityRatio <= 0.28 && creditScore >= 720 && params.employmentStatus === 'employed') {
    riskBand = 'low';
  } else if (affordabilityRatio > 0.36 || creditScore < 640 || params.employmentStatus === 'unemployed') {
    riskBand = 'heightened';
  }

  const recommendedDownPayment = Math.max(Math.round(params.loanAmount * 0.2), 1000000);

  return {
    monthlyPayment,
    affordabilityRatio,
    creditScore,
    initialStatus,
    rejectionReason,
    riskBand,
    recommendedDownPayment,
  };
}

function assertValidTransition(currentStatus: MortgageLifecycleStatus, nextStatus: MortgageLifecycleStatus) {
  const allowedTransitions: Record<MortgageLifecycleStatus, MortgageLifecycleStatus[]> = {
    pending: ['under_review', 'cancelled'],
    under_review: ['approved', 'rejected', 'cancelled'],
    approved: ['disbursed', 'cancelled'],
    rejected: [],
    disbursed: [],
    cancelled: [],
  };

  if (currentStatus === nextStatus) return;
  if (!allowedTransitions[currentStatus].includes(nextStatus)) {
    throw new Error(`Invalid lifecycle transition from ${currentStatus} to ${nextStatus}`);
  }
}

function buildWorkflowTitle(status: MortgageLifecycleStatus) {
  switch (status) {
    case 'pending':
      return 'Application drafted';
    case 'under_review':
      return 'Underwriting review started';
    case 'approved':
      return 'Mortgage approved';
    case 'rejected':
      return 'Mortgage rejected';
    case 'disbursed':
      return 'Funds disbursed';
    case 'cancelled':
      return 'Application cancelled';
    default:
      return 'Workflow updated';
  }
}

function sortByUpdatedDate(applications: MortgageApplicationRecord[]) {
  return [...applications].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Internal cross-repository access: list every application record across all
 * applicants (admin/analytics flows).
 */
export async function listAllMortgageApplicationRecords(): Promise<MortgageApplicationRecord[]> {
  const db = await requireDb();
  const rows = await db.select().from(mortgageApplications);
  return rows.map(rowToRecord);
}

/**
 * Internal cross-repository access: atomically read-modify-write one
 * application record by its numeric id inside a transaction.
 */
export async function updateMortgageApplicationRecord(
  numericId: number,
  update: (current: MortgageApplicationRecord) => Partial<MortgageApplicationRecord>,
): Promise<MortgageApplicationRecord | null> {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(mortgageApplications)
      .where(eq(mortgageApplications.id, numericId))
      .for('update')
      .limit(1);
    if (!row) return null;

    const current = rowToRecord(row);
    const patch = update(current);
    const now = new Date();

    const [updated] = await tx
      .update(mortgageApplications)
      .set({
        status: patch.status ?? row.status,
        outstandingBalance: patch.outstandingBalance !== undefined ? patch.outstandingBalance : row.outstandingBalance,
        disbursedAt: patch.disbursedAt !== undefined ? (patch.disbursedAt ? new Date(patch.disbursedAt) : null) : row.disbursedAt,
        rejectionReason: patch.rejectionReason !== undefined ? patch.rejectionReason : row.rejectionReason,
        metadata: patch.metadata !== undefined ? patch.metadata : row.metadata,
        updatedAt: now,
      })
      .where(eq(mortgageApplications.id, numericId))
      .returning();

    return rowToRecord(updated);
  });
}

export async function listMortgageApplicationsForUser(userId: number) {
  const db = await requireDb();
  // Honest listing: only the caller's real applications. No auto-seeded
  // demonstration records — an empty portfolio is returned as empty.
  const rows = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.applicantId, userId))
    .orderBy(desc(mortgageApplications.updatedAt));
  return sortByUpdatedDate(rows.map(rowToRecord));
}

export async function getMortgageApplicationById(applicationId: string, userId?: number) {
  const db = await requireDb();
  const [row] = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.applicationId, applicationId))
    .limit(1);

  if (!row) return null;
  if (typeof userId === 'number' && row.applicantId !== userId) return null;

  return rowToRecord(row);
}

/**
 * Look up an application by its surrogate numeric id (as opposed to the
 * public string applicationId code). Used by decisioning/analytics services.
 */
export async function getMortgageApplicationByNumericId(id: number) {
  const db = await requireDb();
  const [row] = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.id, id))
    .limit(1);
  return row ? rowToRecord(row) : null;
}

export async function getMortgageWorkflow(applicationId: string, userId?: number) {
  const application = await getMortgageApplicationById(applicationId, userId);
  if (!application) return null;

  const db = await requireDb();
  const eventRows = await db
    .select()
    .from(mortgageWorkflowEvents)
    .where(eq(mortgageWorkflowEvents.applicationId, applicationId))
    .orderBy(asc(mortgageWorkflowEvents.createdAt));
  const events = eventRows.map(eventRowToRecord);

  return {
    application,
    events,
    currentStage: application.status,
    nextRecommendedAction:
      application.status === 'approved'
        ? 'Complete borrower mandate setup and prepare for disbursement.'
        : application.status === 'under_review'
          ? 'Finish document, valuation, and affordability review.'
          : application.status === 'rejected'
            ? 'Revise loan structure or upload stronger supporting evidence before resubmission.'
            : application.status === 'disbursed'
              ? 'Monitor repayment schedule and covenant compliance.'
              : 'Submit the application into underwriting review.',
  };
}

export async function createMortgageApplication(input: CreateMortgageApplicationInput) {
  const db = await requireDb();
  const now = new Date();
  const assessment = assessBusinessRules(input);
  const year = now.getUTCFullYear();

  const isInitiallyApproved = assessment.initialStatus === 'approved';
  const isInitiallyRejected = assessment.initialStatus === 'rejected';
  const isInitiallyReviewed = ['under_review', 'approved', 'rejected'].includes(assessment.initialStatus);

  return db.transaction(async (tx) => {
    // Identity-derived public code: insert with a unique placeholder, then
    // derive MORT-{year}-{id} from the row identity in the same transaction.
    const tempApplicationId = `MORT-PENDING-${randomUUID()}`;
    const [inserted] = await tx
      .insert(mortgageApplications)
      .values({
        applicationId: tempApplicationId,
        transactionId: null,
        parcelId: input.propertyId,
        applicantId: input.userId,
        loanAmount: Math.round(input.loanAmount),
        interestRate: input.interestRate.toFixed(2).replace(/\.00$/, ''),
        loanTerm: input.loanTerm,
        monthlyPayment: assessment.monthlyPayment,
        downPayment: assessment.recommendedDownPayment,
        monthlyIncome: Math.round(input.monthlyIncome),
        employmentStatus: input.employmentStatus,
        creditScore: assessment.creditScore,
        affordabilityRatio: Number(assessment.affordabilityRatio.toFixed(4)),
        outstandingBalance: isInitiallyApproved ? Math.round(input.loanAmount) : null,
        bankName: 'National Housing Finance Desk',
        bankBranch: 'Primary Processing Hub',
        loanOfficer: assessment.riskBand === 'low' ? 'Fast Track Desk' : 'Underwriting Team',
        loanOfficerContact: '+2347000001000',
        status: assessment.initialStatus,
        rejectionReason: assessment.rejectionReason,
        submittedAt: now,
        reviewedAt: isInitiallyReviewed ? now : null,
        approvedAt: isInitiallyApproved ? now : null,
        rejectedAt: isInitiallyRejected ? now : null,
        disbursedAt: null,
        metadata: {
          source: 'borrower_portal',
          riskBand: assessment.riskBand,
          nextAction:
            assessment.initialStatus === 'rejected'
              ? 'Reduce requested amount or improve supporting documentation before resubmission.'
              : 'Complete underwriting review and document checks.',
          underwriting: {
            creditScore: assessment.creditScore,
            affordabilityRatio: Number(assessment.affordabilityRatio.toFixed(4)),
          },
        },
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const applicationId = `MORT-${year}-${String(inserted.id).padStart(6, '0')}`;
    const [application] = await tx
      .update(mortgageApplications)
      .set({ applicationId, transactionId: `TXN-MORT-${applicationId}` })
      .where(eq(mortgageApplications.id, inserted.id))
      .returning();

    await tx.insert(mortgageWorkflowEvents).values([
      {
        applicationId,
        status: 'pending',
        title: 'Application submitted',
        description: 'The mortgage application was captured and queued for underwriting.',
        actorId: input.userId,
        createdAt: now,
      },
      {
        applicationId,
        status: application.status,
        title: buildWorkflowTitle(application.status as MortgageLifecycleStatus),
        description:
          application.status === 'rejected'
            ? application.rejectionReason ?? 'The application did not satisfy underwriting policy.'
            : 'The application moved into the next processing stage based on current underwriting rules.',
        actorId: input.userId,
        createdAt: now,
      },
    ]);

    return rowToRecord(application);
  });
}

export async function updateMortgageApplication(applicationId: string, userId: number, updates: UpdateMortgageApplicationInput) {
  const db = await requireDb();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(mortgageApplications)
      .where(eq(mortgageApplications.applicationId, applicationId))
      .for('update')
      .limit(1);

    if (!row || row.applicantId !== userId) {
      throw new Error('Mortgage application not found');
    }

    const current = rowToRecord(row);
    if (['approved', 'disbursed', 'cancelled'].includes(current.status)) {
      throw new Error('Approved, disbursed, or cancelled applications can no longer be edited');
    }

    const merged = {
      propertyId: updates.propertyId ?? current.propertyId,
      loanAmount: updates.loanAmount ?? current.loanAmount,
      interestRate: updates.interestRate ?? parseFloat(current.interestRate),
      loanTerm: updates.loanTerm ?? current.loanTerm,
      monthlyIncome: updates.monthlyIncome ?? current.monthlyIncome,
      employmentStatus: updates.employmentStatus ?? current.employmentStatus,
      creditScore: updates.creditScore ?? current.creditScore ?? 660,
    };

    const assessment = assessBusinessRules(merged);
    const now = new Date();
    const nextStatus: MortgageLifecycleStatus = assessment.initialStatus === 'rejected' ? 'rejected' : 'pending';

    const [updatedRow] = await tx
      .update(mortgageApplications)
      .set({
        parcelId: merged.propertyId,
        loanAmount: Math.round(merged.loanAmount),
        interestRate: merged.interestRate.toFixed(2).replace(/\.00$/, ''),
        loanTerm: merged.loanTerm,
        monthlyIncome: Math.round(merged.monthlyIncome),
        employmentStatus: merged.employmentStatus,
        creditScore: assessment.creditScore,
        monthlyPayment: assessment.monthlyPayment,
        affordabilityRatio: Number(assessment.affordabilityRatio.toFixed(4)),
        downPayment: updates.downPayment ?? current.downPayment,
        bankName: updates.bankName ?? current.bankName,
        bankBranch: updates.bankBranch !== undefined ? updates.bankBranch : current.bankBranch,
        rejectionReason: assessment.initialStatus === 'rejected' ? assessment.rejectionReason : null,
        status: nextStatus,
        reviewedAt: null,
        approvedAt: null,
        rejectedAt: assessment.initialStatus === 'rejected' ? now : null,
        disbursedAt: null,
        outstandingBalance: null,
        metadata: {
          ...current.metadata,
          lastEditedAt: now.toISOString(),
          underwriting: {
            creditScore: assessment.creditScore,
            affordabilityRatio: Number(assessment.affordabilityRatio.toFixed(4)),
          },
          nextAction: assessment.initialStatus === 'rejected'
            ? 'Correct underwriting issues before attempting a new submission.'
            : 'Submit the revised package back into underwriting review.',
        },
        updatedAt: now,
      })
      .where(eq(mortgageApplications.id, row.id))
      .returning();

    await tx.insert(mortgageWorkflowEvents).values({
      applicationId,
      status: nextStatus,
      title: nextStatus === 'rejected' ? 'Application edited and automatically re-evaluated' : 'Application updated',
      description: nextStatus === 'rejected'
        ? updatedRow.rejectionReason ?? 'The revised application still breaches underwriting rules.'
        : 'Borrower changes were saved and the application returned to the pending queue.',
      actorId: userId,
      createdAt: now,
    });

    return rowToRecord(updatedRow);
  });
}

export async function transitionMortgageApplicationStatus(params: {
  applicationId: string;
  actorId: number;
  nextStatus: MortgageLifecycleStatus;
  rejectionReason?: string;
}) {
  const db = await requireDb();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(mortgageApplications)
      .where(eq(mortgageApplications.applicationId, params.applicationId))
      .for('update')
      .limit(1);

    if (!row) {
      throw new Error('Mortgage application not found');
    }

    const current = rowToRecord(row);
    assertValidTransition(current.status, params.nextStatus);

    if (params.nextStatus === 'rejected' && !params.rejectionReason?.trim()) {
      throw new Error('A rejection reason is required when rejecting a mortgage application');
    }

    const now = new Date();
    const nextAction =
      params.nextStatus === 'approved'
        ? 'Generate repayment schedule and capture borrower mandate details.'
        : params.nextStatus === 'disbursed'
          ? 'Monitor the live loan and collect scheduled repayments.'
          : params.nextStatus === 'rejected'
            ? 'Communicate underwriting decision and await borrower correction or closure.'
            : params.nextStatus === 'cancelled'
              ? 'Archive the request and release any reserved workflow capacity.'
              : 'Continue underwriting checks and complete reviewer decisioning.';

    const [updatedRow] = await tx
      .update(mortgageApplications)
      .set({
        status: params.nextStatus,
        reviewedAt: ['under_review', 'approved', 'rejected', 'disbursed'].includes(params.nextStatus)
          ? (current.reviewedAt ? new Date(current.reviewedAt) : now)
          : (current.reviewedAt ? new Date(current.reviewedAt) : null),
        approvedAt: params.nextStatus === 'approved' ? now : (current.approvedAt ? new Date(current.approvedAt) : null),
        rejectedAt: params.nextStatus === 'rejected' ? now : (current.rejectedAt ? new Date(current.rejectedAt) : null),
        disbursedAt: params.nextStatus === 'disbursed' ? now : (current.disbursedAt ? new Date(current.disbursedAt) : null),
        rejectionReason: params.nextStatus === 'rejected' ? params.rejectionReason!.trim() : current.rejectionReason,
        outstandingBalance:
          params.nextStatus === 'approved' || params.nextStatus === 'disbursed'
            ? current.outstandingBalance ?? current.loanAmount
            : current.outstandingBalance,
        metadata: { ...current.metadata, nextAction },
        updatedAt: now,
      })
      .where(eq(mortgageApplications.id, row.id))
      .returning();

    await tx.insert(mortgageWorkflowEvents).values({
      applicationId: params.applicationId,
      status: params.nextStatus,
      title: buildWorkflowTitle(params.nextStatus),
      description: params.nextStatus === 'rejected' ? params.rejectionReason!.trim() : nextAction,
      actorId: params.actorId,
      createdAt: now,
    });

    return rowToRecord(updatedRow);
  });
}
