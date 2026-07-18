import { readJsonStore, writeJsonStore } from './jsonStore';

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

interface MortgageStore {
  applications: MortgageApplicationRecord[];
  workflowEvents: MortgageWorkflowEvent[];
  lastNumericId: number;
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

const seedTemplates: Array<Omit<MortgageApplicationRecord, 'id' | 'applicationId' | 'applicantId' | 'transactionId' | 'createdAt' | 'updatedAt' | 'submittedAt'>> = [
  {
    propertyId: 501,
    parcelId: 501,
    loanAmount: 125000000,
    interestRate: '18.5',
    loanTerm: 240,
    loanTermMonths: 240,
    monthlyPayment: 1984500,
    downPayment: 25000000,
    monthlyIncome: 9500000,
    employmentStatus: 'employed',
    creditScore: 742,
    affordabilityRatio: 0.2089,
    outstandingBalance: 118300000,
    bankName: 'Federal Mortgage Bank of Nigeria',
    bankBranch: 'Victoria Island',
    loanOfficer: 'Amina Bello',
    loanOfficerContact: '+2348000000001',
    status: 'approved',
    rejectionReason: null,
    reviewedAt: '2026-02-05T09:30:00.000Z',
    approvedAt: '2026-02-14T09:30:00.000Z',
    rejectedAt: null,
    disbursedAt: null,
    metadata: {
      source: 'seed',
      queueStage: 'offer_accepted',
      nextAction: 'Set up borrower mandate and schedule first repayment',
      requiredDocuments: ['National ID', 'Proof of income', 'Title deed'],
    },
  },
  {
    propertyId: 502,
    parcelId: 502,
    loanAmount: 78000000,
    interestRate: '17.0',
    loanTerm: 180,
    loanTermMonths: 180,
    monthlyPayment: 1398200,
    downPayment: 12000000,
    monthlyIncome: 5600000,
    employmentStatus: 'self-employed',
    creditScore: 701,
    affordabilityRatio: 0.2497,
    outstandingBalance: null,
    bankName: 'First Bank Mortgage Services',
    bankBranch: 'Central Business District',
    loanOfficer: 'Chinedu Okafor',
    loanOfficerContact: '+2348000000002',
    status: 'under_review',
    rejectionReason: null,
    reviewedAt: '2026-03-20T08:45:00.000Z',
    approvedAt: null,
    rejectedAt: null,
    disbursedAt: null,
    metadata: {
      source: 'seed',
      queueStage: 'document_review',
      nextAction: 'Validate tax clearance and update valuation summary',
      requiredDocuments: ['Tax clearance', 'CAC documents', 'Bank statements'],
    },
  },
  {
    propertyId: 503,
    parcelId: 503,
    loanAmount: 64000000,
    interestRate: '19.25',
    loanTerm: 120,
    loanTermMonths: 120,
    monthlyPayment: 1187600,
    downPayment: 5000000,
    monthlyIncome: 2400000,
    employmentStatus: 'employed',
    creditScore: 590,
    affordabilityRatio: 0.4948,
    outstandingBalance: null,
    bankName: 'Unity Home Loans',
    bankBranch: 'Port Harcourt',
    loanOfficer: 'Grace Ekanem',
    loanOfficerContact: '+2348000000003',
    status: 'rejected',
    rejectionReason: 'Debt-service ratio exceeded the current underwriting threshold.',
    reviewedAt: '2026-02-09T10:45:00.000Z',
    approvedAt: null,
    rejectedAt: '2026-02-11T16:10:00.000Z',
    disbursedAt: null,
    metadata: {
      source: 'seed',
      queueStage: 'decision_issued',
      nextAction: 'Resubmit with revised loan amount or stronger income evidence',
      requiredDocuments: ['Updated salary slips', 'Debt obligations schedule'],
    },
  },
];

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

async function createSeededStore(): Promise<MortgageStore> {
  const now = new Date();
  const applications: MortgageApplicationRecord[] = [];
  const workflowEvents: MortgageWorkflowEvent[] = [];
  let lastNumericId = 0;

  for (const userId of [1, 2, 3]) {
    seedTemplates.forEach((seed, index) => {
      lastNumericId += 1;
      const applicationId = `MORT-2026-${String(userId).padStart(2, '0')}${String(index + 1).padStart(2, '0')}`;
      const createdAt = new Date(now.getTime() - (index + userId) * 86400000 * 7).toISOString();
      const submittedAt = createdAt;
      const updatedAt = seed.approvedAt ?? seed.rejectedAt ?? seed.reviewedAt ?? createdAt;

      applications.push({
        id: lastNumericId,
        applicationId,
        applicantId: userId,
        transactionId: `TXN-MORT-${applicationId}`,
        createdAt,
        submittedAt,
        updatedAt,
        ...seed,
      });

      workflowEvents.push(
        {
          id: `${applicationId}-submitted`,
          applicationId,
          status: 'pending',
          title: 'Application submitted',
          description: 'The borrower submitted a mortgage package for underwriting review.',
          actorId: userId,
          createdAt: submittedAt,
        },
        {
          id: `${applicationId}-review`,
          applicationId,
          status: seed.status === 'rejected' ? 'under_review' : seed.status,
          title: seed.status === 'approved' ? 'Credit and valuation review completed' : seed.status === 'rejected' ? 'Underwriting review completed' : 'Application moved to underwriting',
          description: seed.metadata.nextAction,
          actorId: 9000 + userId,
          createdAt: seed.reviewedAt ?? updatedAt,
        }
      );

      if (seed.status === 'approved' && seed.approvedAt) {
        workflowEvents.push({
          id: `${applicationId}-approved`,
          applicationId,
          status: 'approved',
          title: 'Application approved',
          description: 'Loan terms were approved and the case is ready for mandate and repayment setup.',
          actorId: 9000 + userId,
          createdAt: seed.approvedAt,
        });
      }

      if (seed.status === 'rejected' && seed.rejectedAt) {
        workflowEvents.push({
          id: `${applicationId}-rejected`,
          applicationId,
          status: 'rejected',
          title: 'Application rejected',
          description: seed.rejectionReason ?? 'The application did not satisfy underwriting conditions.',
          actorId: 9000 + userId,
          createdAt: seed.rejectedAt,
        });
      }
    });
  }

  return { applications, workflowEvents, lastNumericId };
}

async function readStore(): Promise<MortgageStore> {
  return readJsonStore<MortgageStore>('mortgage-application-store', createSeededStore);
}

async function writeStore(store: MortgageStore) {
  await writeJsonStore('mortgage-application-store', store);
}


/**
 * Internal cross-repository access (used by mortgagePaymentRepository):
 * list every application record across all applicants.
 */
export async function listAllMortgageApplicationRecords(): Promise<MortgageApplicationRecord[]> {
  const store = await readStore();
  return store.applications;
}

/**
 * Internal cross-repository access (used by mortgagePaymentRepository):
 * atomically update one application record by its numeric id.
 */
export async function updateMortgageApplicationRecord(
  numericId: number,
  update: (current: MortgageApplicationRecord) => Partial<MortgageApplicationRecord>,
): Promise<MortgageApplicationRecord | null> {
  const store = await readStore();
  const index = store.applications.findIndex((item) => item.id === numericId);
  if (index === -1) return null;
  const current = store.applications[index];
  store.applications[index] = {
    ...current,
    ...update(current),
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
  return store.applications[index];
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

function buildSeedRecordsForUser(userId: number, startingId: number) {
  const applications: MortgageApplicationRecord[] = [];
  const workflowEvents: MortgageWorkflowEvent[] = [];
  let nextId = startingId;

  seedTemplates.forEach((seed, index) => {
    nextId += 1;
    const applicationId = `MORT-2026-U${String(userId).padStart(3, '0')}-${String(index + 1).padStart(2, '0')}`;
    const createdAt = new Date(Date.now() - (index + 1) * 86400000 * 6).toISOString();
    const submittedAt = createdAt;
    const updatedAt = seed.approvedAt ?? seed.rejectedAt ?? seed.reviewedAt ?? createdAt;

    applications.push({
      id: nextId,
      applicationId,
      applicantId: userId,
      transactionId: `TXN-MORT-${applicationId}`,
      createdAt,
      submittedAt,
      updatedAt,
      ...seed,
    });

    workflowEvents.push(
      {
        id: `${applicationId}-submitted`,
        applicationId,
        status: 'pending',
        title: 'Application submitted',
        description: 'The borrower submitted a mortgage package for underwriting review.',
        actorId: userId,
        createdAt: submittedAt,
      },
      {
        id: `${applicationId}-review`,
        applicationId,
        status: seed.status === 'rejected' ? 'under_review' : seed.status,
        title: seed.status === 'approved' ? 'Credit and valuation review completed' : seed.status === 'rejected' ? 'Underwriting review completed' : 'Application moved to underwriting',
        description: seed.metadata.nextAction,
        actorId: 9000 + userId,
        createdAt: seed.reviewedAt ?? updatedAt,
      }
    );

    if (seed.status === 'approved' && seed.approvedAt) {
      workflowEvents.push({
        id: `${applicationId}-approved`,
        applicationId,
        status: 'approved',
        title: 'Application approved',
        description: 'Loan terms were approved and the case is ready for mandate and repayment setup.',
        actorId: 9000 + userId,
        createdAt: seed.approvedAt,
      });
    }

    if (seed.status === 'rejected' && seed.rejectedAt) {
      workflowEvents.push({
        id: `${applicationId}-rejected`,
        applicationId,
        status: 'rejected',
        title: 'Application rejected',
        description: seed.rejectionReason ?? 'The application did not satisfy underwriting conditions.',
        actorId: 9000 + userId,
        createdAt: seed.rejectedAt,
      });
    }
  });

  return { applications, workflowEvents, nextId };
}

async function ensureSeedRecordsForUser(userId: number) {
  const store = await readStore();
  const existing = store.applications.filter((application) => application.applicantId === userId);

  if (existing.length > 0) {
    return existing;
  }

  const seeded = buildSeedRecordsForUser(userId, store.lastNumericId);
  store.applications.push(...seeded.applications);
  store.workflowEvents.push(...seeded.workflowEvents);
  store.lastNumericId = seeded.nextId;
  await writeStore(store);

  return seeded.applications;
}

export async function seedMortgageApplications() {
  const seeded = await createSeededStore();
  await writeStore(seeded);
  return {
    totalApplications: seeded.applications.length,
    totalWorkflowEvents: seeded.workflowEvents.length,
    seededUserIds: [1, 2, 3],
  };
}

export async function listMortgageApplicationsForUser(userId: number) {
  const applications = await ensureSeedRecordsForUser(userId);
  return sortByUpdatedDate(applications);
}

export async function getMortgageApplicationById(applicationId: string, userId?: number) {
  const store = await readStore();
  const application = store.applications.find((entry) => entry.applicationId === applicationId);

  if (!application) {
    return null;
  }

  if (typeof userId === 'number' && application.applicantId !== userId) {
    return null;
  }

  return application;
}

/**
 * Look up an application by its surrogate numeric id (as opposed to the
 * public string applicationId code). Added for decisioning/analytics services
 * that reference applications by numeric foreign key.
 */
export async function getMortgageApplicationByNumericId(id: number) {
  const store = await readStore();
  return store.applications.find((entry) => Number(entry.id) === Number(id)) ?? null;
}

export async function getMortgageWorkflow(applicationId: string, userId?: number) {
  const application = await getMortgageApplicationById(applicationId, userId);
  if (!application) return null;

  const store = await readStore();
  const events = store.workflowEvents
    .filter((event) => event.applicationId === applicationId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

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
  const store = await readStore();
  const now = new Date().toISOString();
  const assessment = assessBusinessRules(input);

  const nextId = store.lastNumericId + 1;
  const applicationId = `MORT-${new Date().getUTCFullYear()}-${String(nextId).padStart(6, '0')}`;

  const isInitiallyApproved = assessment.initialStatus === 'approved';
  const isInitiallyRejected = assessment.initialStatus === 'rejected';
  const isInitiallyReviewed = ['under_review', 'approved', 'rejected'].includes(assessment.initialStatus);

  const application: MortgageApplicationRecord = {
    id: nextId,
    applicationId,
    applicantId: input.userId,
    propertyId: input.propertyId,
    parcelId: input.propertyId,
    transactionId: `TXN-MORT-${applicationId}`,
    loanAmount: Math.round(input.loanAmount),
    interestRate: input.interestRate.toFixed(2).replace(/\.00$/, ''),
    loanTerm: input.loanTerm,
    loanTermMonths: input.loanTerm,
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
    createdAt: now,
    updatedAt: now,
    metadata: {
      source: 'file_store',
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
  };

  store.applications.push(application);
  store.workflowEvents.push(
    {
      id: `${applicationId}-pending`,
      applicationId,
      status: 'pending',
      title: 'Application submitted',
      description: 'The mortgage application was captured and queued for underwriting.',
      actorId: input.userId,
      createdAt: now,
    },
    {
      id: `${applicationId}-${application.status}`,
      applicationId,
      status: application.status,
      title: buildWorkflowTitle(application.status),
      description:
        application.status === 'rejected'
          ? application.rejectionReason ?? 'The application did not satisfy underwriting policy.'
          : 'The application moved into the next processing stage based on current underwriting rules.',
      actorId: input.userId,
      createdAt: now,
    }
  );
  store.lastNumericId = nextId;
  await writeStore(store);

  return application;
}

export async function updateMortgageApplication(applicationId: string, userId: number, updates: UpdateMortgageApplicationInput) {
  const store = await readStore();
  const index = store.applications.findIndex((entry) => entry.applicationId === applicationId && entry.applicantId === userId);

  if (index === -1) {
    throw new Error('Mortgage application not found');
  }

  const current = store.applications[index];
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
  const now = new Date().toISOString();

  const updated: MortgageApplicationRecord = {
    ...current,
    propertyId: merged.propertyId,
    parcelId: merged.propertyId,
    loanAmount: Math.round(merged.loanAmount),
    interestRate: merged.interestRate.toFixed(2).replace(/\.00$/, ''),
    loanTerm: merged.loanTerm,
    loanTermMonths: merged.loanTerm,
    monthlyIncome: Math.round(merged.monthlyIncome),
    employmentStatus: merged.employmentStatus,
    creditScore: assessment.creditScore,
    monthlyPayment: assessment.monthlyPayment,
    affordabilityRatio: Number(assessment.affordabilityRatio.toFixed(4)),
    downPayment: updates.downPayment ?? current.downPayment,
    bankName: updates.bankName ?? current.bankName,
    bankBranch: updates.bankBranch ?? current.bankBranch,
    rejectionReason: assessment.initialStatus === 'rejected' ? assessment.rejectionReason : null,
    status: assessment.initialStatus === 'rejected' ? 'rejected' : 'pending',
    reviewedAt: null,
    approvedAt: null,
    rejectedAt: assessment.initialStatus === 'rejected' ? now : null,
    disbursedAt: null,
    outstandingBalance: null,
    updatedAt: now,
    metadata: {
      ...current.metadata,
      lastEditedAt: now,
      underwriting: {
        creditScore: assessment.creditScore,
        affordabilityRatio: Number(assessment.affordabilityRatio.toFixed(4)),
      },
      nextAction: assessment.initialStatus === 'rejected'
        ? 'Correct underwriting issues before attempting a new submission.'
        : 'Submit the revised package back into underwriting review.',
    },
  };

  store.applications[index] = updated;
  store.workflowEvents.push({
    id: `${applicationId}-edited-${Date.now()}`,
    applicationId,
    status: updated.status,
    title: updated.status === 'rejected' ? 'Application edited and automatically re-evaluated' : 'Application updated',
    description: updated.status === 'rejected'
      ? updated.rejectionReason ?? 'The revised application still breaches underwriting rules.'
      : 'Borrower changes were saved and the application returned to the pending queue.',
    actorId: userId,
    createdAt: now,
  });
  await writeStore(store);

  return updated;
}

export async function transitionMortgageApplicationStatus(params: {
  applicationId: string;
  actorId: number;
  nextStatus: MortgageLifecycleStatus;
  rejectionReason?: string;
}) {
  const store = await readStore();
  const index = store.applications.findIndex((entry) => entry.applicationId === params.applicationId);

  if (index === -1) {
    throw new Error('Mortgage application not found');
  }

  const current = store.applications[index];
  assertValidTransition(current.status, params.nextStatus);

  if (params.nextStatus === 'rejected' && !params.rejectionReason?.trim()) {
    throw new Error('A rejection reason is required when rejecting a mortgage application');
  }

  const now = new Date().toISOString();
  const updated: MortgageApplicationRecord = {
    ...current,
    status: params.nextStatus,
    updatedAt: now,
    reviewedAt: ['under_review', 'approved', 'rejected', 'disbursed'].includes(params.nextStatus) ? current.reviewedAt ?? now : current.reviewedAt,
    approvedAt: params.nextStatus === 'approved' ? now : current.approvedAt,
    rejectedAt: params.nextStatus === 'rejected' ? now : current.rejectedAt,
    disbursedAt: params.nextStatus === 'disbursed' ? now : current.disbursedAt,
    rejectionReason: params.nextStatus === 'rejected' ? params.rejectionReason!.trim() : current.rejectionReason,
    outstandingBalance:
      params.nextStatus === 'approved' || params.nextStatus === 'disbursed'
        ? current.outstandingBalance ?? current.loanAmount
        : current.outstandingBalance,
    metadata: {
      ...current.metadata,
      nextAction:
        params.nextStatus === 'approved'
          ? 'Generate repayment schedule and capture borrower mandate details.'
          : params.nextStatus === 'disbursed'
            ? 'Monitor the live loan and collect scheduled repayments.'
            : params.nextStatus === 'rejected'
              ? 'Communicate underwriting decision and await borrower correction or closure.'
              : params.nextStatus === 'cancelled'
                ? 'Archive the request and release any reserved workflow capacity.'
                : 'Continue underwriting checks and complete reviewer decisioning.',
    },
  };

  store.applications[index] = updated;
  store.workflowEvents.push({
    id: `${params.applicationId}-${params.nextStatus}-${Date.now()}`,
    applicationId: params.applicationId,
    status: params.nextStatus,
    title: buildWorkflowTitle(params.nextStatus),
    description:
      params.nextStatus === 'rejected'
        ? params.rejectionReason!.trim()
        : updated.metadata.nextAction,
    actorId: params.actorId,
    createdAt: now,
  });
  await writeStore(store);

  return updated;
}
