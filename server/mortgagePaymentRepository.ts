import { listAllMortgageApplicationRecords, updateMortgageApplicationRecord } from './mortgageApplicationRepository';
import { readJsonStore, writeJsonStore } from './jsonStore';

type MandateStatus = 'pending' | 'active' | 'suspended' | 'cancelled' | 'expired';
type GatewayProvider = 'paystack' | 'flutterwave';
type PaymentStatus = 'pending' | 'completed' | 'failed';

type MortgageApplicationRecord = {
  id: number;
  applicationId: string;
  applicantId: number;
  loanAmount: number;
  interestRate: string;
  loanTerm: number;
  monthlyPayment: number;
  outstandingBalance: number | null;
  bankName: string;
  bankBranch: string | null;
  status: string;
  approvedAt: string | null;
  disbursedAt: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
};

export interface MortgagePaymentScheduleRecord {
  id: number;
  scheduleId: string;
  applicationNumericId: number;
  applicationId: string;
  paymentNumber: number;
  dueDate: string;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  remainingBalance: number;
  isPaid: boolean;
  paidAmount: number;
  paidAt: string | null;
  paymentMethod: string | null;
  isOverdue: boolean;
  lateFee: number;
  createdAt: string;
  updatedAt: string;
}

export interface MortgagePaymentTransactionRecord {
  id: number;
  transactionId: string;
  applicationNumericId: number;
  applicationId: string;
  scheduleRecordId: number | null;
  amount: number;
  principalPaid: number;
  interestPaid: number;
  lateFee: number;
  paymentMethod: string;
  paymentGateway?: string;
  gatewayReference?: string;
  status: PaymentStatus;
  completedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface AutoDebitMandateRecord {
  id: number;
  mandateId: string;
  applicationNumericId: number;
  applicationId: string;
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
  maxAmount: number;
  frequency: 'monthly';
  startDate: string;
  endDate: string;
  gatewayProvider: GatewayProvider;
  gatewayMandateCode: string;
  status: MandateStatus;
  nextDebitAt: string;
  lastDebitAt: string | null;
  failedDebitsCount: number;
  cancellationReason: string | null;
  suspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MortgagePaymentStore {
  nextScheduleId: number;
  nextTransactionId: number;
  nextMandateId: number;
  schedules: MortgagePaymentScheduleRecord[];
  transactions: MortgagePaymentTransactionRecord[];
  mandates: AutoDebitMandateRecord[];
}


function roundCurrency(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function calculateMonthlyRate(interestRate: number) {
  return interestRate / 100 / 12;
}

function defaultStore(): MortgagePaymentStore {
  return {
    nextScheduleId: 1,
    nextTransactionId: 1,
    nextMandateId: 1,
    schedules: [],
    transactions: [],
    mandates: [],
  };
}

async function loadStore(): Promise<MortgagePaymentStore> {
  return readJsonStore<MortgagePaymentStore>('mortgage-payment-store', defaultStore);
}

async function saveStore(store: MortgagePaymentStore) {
  await writeJsonStore('mortgage-payment-store', store);
}

async function getApplicationByNumericId(applicationNumericId: number) {
  const applications = await listAllMortgageApplicationRecords();
  const application = applications.find((item) => item.id === applicationNumericId);
  if (!application) {
    throw new Error('Mortgage application not found');
  }
  return application;
}

function buildScheduleEntries(application: MortgageApplicationRecord, startingId: number) {
  const interestRate = Number.parseFloat(application.interestRate || '0');
  const monthlyRate = calculateMonthlyRate(interestRate);
  const totalPayments = application.loanTerm;
  const startDate = new Date(application.disbursedAt || application.approvedAt || application.createdAt);
  let remainingBalance = application.loanAmount;
  const entries: MortgagePaymentScheduleRecord[] = [];

  for (let paymentNumber = 1; paymentNumber <= totalPayments; paymentNumber += 1) {
    const interestAmount = roundCurrency(remainingBalance * monthlyRate);
    const principalAmount = roundCurrency(Math.max(application.monthlyPayment - interestAmount, 0));
    remainingBalance = Math.max(0, roundCurrency(remainingBalance - principalAmount));

    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + paymentNumber);

    entries.push({
      id: startingId + paymentNumber - 1,
      scheduleId: `SCHED-${application.applicationId}-${paymentNumber}`,
      applicationNumericId: application.id,
      applicationId: application.applicationId,
      paymentNumber,
      dueDate: dueDate.toISOString(),
      principalAmount,
      interestAmount,
      totalAmount: application.monthlyPayment,
      remainingBalance,
      isPaid: false,
      paidAmount: 0,
      paidAt: null,
      paymentMethod: null,
      isOverdue: false,
      lateFee: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return entries;
}

function derivePaidInstallments(application: MortgageApplicationRecord, schedule: MortgagePaymentScheduleRecord[]) {
  const targetOutstanding = application.outstandingBalance;
  if (targetOutstanding == null) {
    return 0;
  }

  let paidInstallments = 0;
  for (const entry of schedule) {
    if (entry.remainingBalance <= targetOutstanding) {
      paidInstallments = entry.paymentNumber;
      break;
    }
  }

  if (paidInstallments === 0 && targetOutstanding < application.loanAmount) {
    paidInstallments = Math.min(2, schedule.length);
  }

  return paidInstallments;
}

function markSeededPayments(
  store: MortgagePaymentStore,
  application: MortgageApplicationRecord,
  schedule: MortgagePaymentScheduleRecord[],
  paidInstallments: number
) {
  const now = new Date();
  for (const entry of schedule) {
    if (entry.paymentNumber > paidInstallments) break;
    if (entry.isPaid) continue;

    const paidAt = new Date(now);
    paidAt.setMonth(paidAt.getMonth() - (paidInstallments - entry.paymentNumber + 1));

    entry.isPaid = true;
    entry.paidAmount = entry.totalAmount;
    entry.paidAt = paidAt.toISOString();
    entry.paymentMethod = 'auto_debit';
    entry.updatedAt = entry.paidAt;

    store.transactions.push({
      id: store.nextTransactionId++,
      transactionId: `PAY-SEED-${application.applicationId}-${entry.paymentNumber}`,
      applicationNumericId: application.id,
      applicationId: application.applicationId,
      scheduleRecordId: entry.id,
      amount: entry.totalAmount,
      principalPaid: entry.principalAmount,
      interestPaid: entry.interestAmount,
      lateFee: entry.lateFee,
      paymentMethod: 'auto_debit',
      paymentGateway: 'paystack',
      gatewayReference: `seed-ref-${application.applicationId}-${entry.paymentNumber}`,
      status: 'completed',
      completedAt: entry.paidAt,
      failedAt: null,
      failureReason: null,
      createdAt: entry.paidAt,
    });
  }
}

function maybeSeedMandate(store: MortgagePaymentStore, application: MortgageApplicationRecord) {
  if (store.mandates.some((item) => item.applicationNumericId === application.id)) {
    return;
  }

  if (!['approved', 'disbursed'].includes(application.status)) {
    return;
  }

  const createdAt = new Date(application.approvedAt || application.createdAt);
  const startDate = new Date(createdAt);
  startDate.setDate(startDate.getDate() + 7);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + application.loanTerm);

  store.mandates.push({
    id: store.nextMandateId++,
    mandateId: `MANDATE-${application.applicationId}`,
    applicationNumericId: application.id,
    applicationId: application.applicationId,
    accountNumber: '0123456789',
    accountName: 'Primary Borrower',
    bankCode: '058',
    bankName: application.bankName || 'Federal Mortgage Bank of Nigeria',
    maxAmount: application.monthlyPayment,
    frequency: 'monthly',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    gatewayProvider: 'paystack',
    gatewayMandateCode: `AUTH-${application.applicationId}`,
    status: application.status === 'disbursed' ? 'active' : 'pending',
    nextDebitAt: startDate.toISOString(),
    lastDebitAt: null,
    failedDebitsCount: 0,
    cancellationReason: null,
    suspendedAt: null,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  });
}

async function ensureApplicationArtifacts(applicationNumericId: number) {
  const application = await getApplicationByNumericId(applicationNumericId);
  const store = await loadStore();

  const existingSchedule = store.schedules.filter((item) => item.applicationNumericId === applicationNumericId);
  if (existingSchedule.length === 0) {
    const generated = buildScheduleEntries(application, store.nextScheduleId);
    store.nextScheduleId += generated.length;
    const paidInstallments = derivePaidInstallments(application, generated);
    markSeededPayments(store, application, generated, paidInstallments);
    maybeSeedMandate(store, application);
    store.schedules.push(...generated);
    await saveStore(store);
  }

  return {
    application,
    store: await loadStore(),
  };
}

async function syncApplicationOutstandingBalance(applicationNumericId: number, remainingBalance: number, markDisbursed = false) {
  const now = new Date().toISOString();
  await updateMortgageApplicationRecord(applicationNumericId, (current) => ({
    outstandingBalance: remainingBalance,
    status: remainingBalance === 0 ? 'disbursed' : markDisbursed && current.status === 'approved' ? 'disbursed' : current.status,
    disbursedAt: markDisbursed && !current.disbursedAt ? now : current.disbursedAt,
    metadata: {
      ...(current.metadata ?? {}),
      lastPaymentSyncAt: now,
      repaymentStatus: remainingBalance === 0 ? 'paid_off' : 'active',
    },
  }));
}

function getScheduleForApp(store: MortgagePaymentStore, applicationNumericId: number) {
  const now = new Date();
  return store.schedules
    .filter((item) => item.applicationNumericId === applicationNumericId)
    .map((item) => ({
      ...item,
      isOverdue: !item.isPaid && new Date(item.dueDate) < now,
    }))
    .sort((a, b) => a.paymentNumber - b.paymentNumber);
}

export async function generateScheduleForApplication(applicationNumericId: number) {
  const { application } = await ensureApplicationArtifacts(applicationNumericId);
  return {
    success: true,
    applicationId: application.applicationId,
    message: 'Payment schedule generated successfully',
  };
}

export async function getScheduleForApplication(applicationNumericId: number) {
  const { store } = await ensureApplicationArtifacts(applicationNumericId);
  return getScheduleForApp(store, applicationNumericId);
}

export async function getMandateForApplication(applicationNumericId: number) {
  const { store } = await ensureApplicationArtifacts(applicationNumericId);
  const mandates = store.mandates
    .filter((item) => item.applicationNumericId === applicationNumericId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return mandates[0] ?? null;
}

export async function createMandateForApplication(input: {
  applicationId: number;
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
  gatewayProvider: GatewayProvider;
}) {
  const { application, store } = await ensureApplicationArtifacts(input.applicationId);
  const existing = store.mandates.find(
    (item) => item.applicationNumericId === input.applicationId && ['pending', 'active'].includes(item.status)
  );
  if (existing) {
    return { mandateId: existing.mandateId, authorizationUrl: `https://payments.idlr.local/mandates/${existing.mandateId}` };
  }

  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() + 7);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + application.loanTerm);

  const record: AutoDebitMandateRecord = {
    id: store.nextMandateId++,
    mandateId: `MANDATE-${Date.now()}-${String(store.nextMandateId).padStart(4, '0')}`,
    applicationNumericId: application.id,
    applicationId: application.applicationId,
    accountNumber: input.accountNumber,
    accountName: input.accountName,
    bankCode: input.bankCode,
    bankName: input.bankName,
    maxAmount: application.monthlyPayment,
    frequency: 'monthly',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    gatewayProvider: input.gatewayProvider,
    gatewayMandateCode: `AUTH-${application.applicationId}-${store.nextMandateId}`,
    status: 'pending',
    nextDebitAt: startDate.toISOString(),
    lastDebitAt: null,
    failedDebitsCount: 0,
    cancellationReason: null,
    suspendedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  store.mandates.unshift(record);
  await saveStore(store);

  return {
    mandateId: record.mandateId,
    authorizationUrl: `https://payments.idlr.local/mandates/${record.mandateId}`,
  };
}

export async function suspendMandateRecord(mandateId: string, reason: string) {
  const store = await loadStore();
  const mandate = store.mandates.find((item) => item.mandateId === mandateId);
  if (!mandate) throw new Error('Mandate not found');

  mandate.status = 'suspended';
  mandate.suspendedAt = new Date().toISOString();
  mandate.cancellationReason = reason;
  mandate.updatedAt = mandate.suspendedAt;
  await saveStore(store);

  return { success: true, message: 'Mandate suspended successfully' };
}

export async function reactivateMandateRecord(mandateId: string) {
  const store = await loadStore();
  const mandate = store.mandates.find((item) => item.mandateId === mandateId);
  if (!mandate) throw new Error('Mandate not found');

  const updatedAt = new Date().toISOString();
  mandate.status = 'active';
  mandate.suspendedAt = null;
  mandate.failedDebitsCount = 0;
  mandate.updatedAt = updatedAt;
  await saveStore(store);

  return { success: true, message: 'Mandate reactivated successfully' };
}

export async function listPaymentHistoryForApplication(applicationNumericId: number) {
  const { store } = await ensureApplicationArtifacts(applicationNumericId);
  return store.transactions
    .filter((item) => item.applicationNumericId === applicationNumericId)
    .sort((a, b) => (b.completedAt || b.createdAt).localeCompare(a.completedAt || a.createdAt));
}

function findNextUnpaidSchedule(schedule: MortgagePaymentScheduleRecord[]) {
  return schedule.find((item) => !item.isPaid) ?? null;
}

export async function makeManualPaymentRecord(input: {
  applicationId: number;
  amount: number;
  paymentMethod: string;
  paymentGateway?: string;
  gatewayReference?: string;
}) {
  const { application, store } = await ensureApplicationArtifacts(input.applicationId);
  const schedule = getScheduleForApp(store, input.applicationId);
  const nextUnpaid = findNextUnpaidSchedule(schedule);

  if (!nextUnpaid) {
    throw new Error('No unpaid mortgage installments remain');
  }

  const amount = roundCurrency(input.amount);
  if (amount <= 0) throw new Error('Payment amount must be greater than zero');
  if (amount < nextUnpaid.totalAmount) {
    throw new Error(`Minimum payment for the next installment is ₦${nextUnpaid.totalAmount.toLocaleString()}`);
  }

  const now = new Date().toISOString();
  nextUnpaid.isPaid = true;
  nextUnpaid.paidAmount = nextUnpaid.totalAmount;
  nextUnpaid.paidAt = now;
  nextUnpaid.paymentMethod = input.paymentMethod;
  nextUnpaid.updatedAt = now;

  const transaction: MortgagePaymentTransactionRecord = {
    id: store.nextTransactionId++,
    transactionId: `PAY-${Date.now()}-${store.nextTransactionId}`,
    applicationNumericId: application.id,
    applicationId: application.applicationId,
    scheduleRecordId: nextUnpaid.id,
    amount,
    principalPaid: nextUnpaid.principalAmount,
    interestPaid: nextUnpaid.interestAmount,
    lateFee: nextUnpaid.lateFee,
    paymentMethod: input.paymentMethod,
    paymentGateway: input.paymentGateway,
    gatewayReference: input.gatewayReference,
    status: 'completed',
    completedAt: now,
    failedAt: null,
    failureReason: null,
    createdAt: now,
  };

  store.transactions.unshift(transaction);
  await saveStore(store);

  const refreshed = getScheduleForApp(await loadStore(), input.applicationId);
  const remainingBalance = findNextUnpaidSchedule(refreshed)?.remainingBalance ?? 0;
  await syncApplicationOutstandingBalance(input.applicationId, remainingBalance, true);

  return {
    success: true,
    transactionId: transaction.transactionId,
    amount,
    status: 'completed',
  };
}

export async function getPaymentStatsForApplication(applicationNumericId: number) {
  const { application, store } = await ensureApplicationArtifacts(applicationNumericId);
  const schedule = getScheduleForApp(store, applicationNumericId);
  const totalPayments = schedule.length;
  const paidPayments = schedule.filter((item) => item.isPaid).length;
  const overduePayments = schedule.filter((item) => item.isOverdue).length;
  const totalPaid = schedule.filter((item) => item.isPaid).reduce((sum, item) => sum + item.paidAmount, 0);
  const totalPrincipalPaid = schedule.filter((item) => item.isPaid).reduce((sum, item) => sum + item.principalAmount, 0);
  const totalInterestPaid = schedule.filter((item) => item.isPaid).reduce((sum, item) => sum + item.interestAmount, 0);
  const remainingBalance = findNextUnpaidSchedule(schedule)?.remainingBalance ?? 0;

  return {
    totalPayments,
    paidPayments,
    overduePayments,
    remainingPayments: totalPayments - paidPayments,
    totalPaid,
    totalPrincipalPaid,
    totalInterestPaid,
    remainingBalance,
    originalLoanAmount: application.loanAmount,
    monthlyPayment: application.monthlyPayment,
    completionPercentage: totalPayments > 0 ? (paidPayments / totalPayments) * 100 : 0,
  };
}

export async function getUpcomingPaymentsForApplication(applicationNumericId: number, limit = 5) {
  const schedule = await getScheduleForApplication(applicationNumericId);
  return schedule.filter((item) => !item.isPaid).slice(0, limit);
}

export async function listAllMandatesOffline(params: { status?: MandateStatus; limit: number }) {
  const store = await loadStore();
  const mandates = store.mandates
    .filter((item) => !params.status || item.status === params.status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, params.limit);
  return mandates;
}

export async function processAutomaticDebitsOffline() {
  const store = await loadStore();
  let processed = 0;
  let successful = 0;
  let failed = 0;

  const now = new Date();
  for (const mandate of store.mandates.filter((item) => item.status === 'active' && new Date(item.nextDebitAt) <= now)) {
    try {
      const schedule = getScheduleForApp(store, mandate.applicationNumericId);
      const nextUnpaid = findNextUnpaidSchedule(schedule);
      if (!nextUnpaid) {
        continue;
      }

      const completedAt = now.toISOString();
      nextUnpaid.isPaid = true;
      nextUnpaid.paidAmount = nextUnpaid.totalAmount;
      nextUnpaid.paidAt = completedAt;
      nextUnpaid.paymentMethod = 'auto_debit';
      nextUnpaid.updatedAt = completedAt;

      store.transactions.unshift({
        id: store.nextTransactionId++,
        transactionId: `PAY-AUTO-${Date.now()}-${store.nextTransactionId}`,
        applicationNumericId: mandate.applicationNumericId,
        applicationId: mandate.applicationId,
        scheduleRecordId: nextUnpaid.id,
        amount: nextUnpaid.totalAmount,
        principalPaid: nextUnpaid.principalAmount,
        interestPaid: nextUnpaid.interestAmount,
        lateFee: nextUnpaid.lateFee,
        paymentMethod: 'auto_debit',
        paymentGateway: mandate.gatewayProvider,
        gatewayReference: `auto-${mandate.mandateId}-${nextUnpaid.paymentNumber}`,
        status: 'completed',
        completedAt,
        failedAt: null,
        failureReason: null,
        createdAt: completedAt,
      });

      const nextDebitDate = new Date(mandate.nextDebitAt);
      nextDebitDate.setMonth(nextDebitDate.getMonth() + 1);
      mandate.lastDebitAt = completedAt;
      mandate.nextDebitAt = nextDebitDate.toISOString();
      mandate.failedDebitsCount = 0;
      mandate.updatedAt = completedAt;

      const refreshed = getScheduleForApp(store, mandate.applicationNumericId);
      const remainingBalance = findNextUnpaidSchedule(refreshed)?.remainingBalance ?? 0;
      await syncApplicationOutstandingBalance(mandate.applicationNumericId, remainingBalance, true);

      processed += 1;
      successful += 1;
    } catch {
      mandate.failedDebitsCount += 1;
      mandate.updatedAt = new Date().toISOString();
      if (mandate.failedDebitsCount >= 3) {
        mandate.status = 'suspended';
        mandate.suspendedAt = new Date().toISOString();
      }
      processed += 1;
      failed += 1;
    }
  }

  await saveStore(store);
  return { processed, successful, failed };
}

export async function calculateEarlyPayoffOffline(applicationNumericId: number) {
  const { application, store } = await ensureApplicationArtifacts(applicationNumericId);
  const schedule = getScheduleForApp(store, applicationNumericId);
  const unpaid = schedule.filter((item) => !item.isPaid);
  const remainingPrincipal = unpaid.reduce((sum, item) => sum + item.principalAmount, 0);
  const accruedInterest = unpaid.reduce((sum, item) => sum + item.interestAmount, 0);
  const payoffFee = roundCurrency(remainingPrincipal * 0.02);
  const totalPayoffAmount = remainingPrincipal + accruedInterest + payoffFee;
  const interestSavings = accruedInterest;

  return {
    applicationId: application.applicationId,
    remainingPrincipal,
    accruedInterest,
    payoffFee,
    earlyPayoffFee: payoffFee,
    totalPayoffAmount,
    interestSavings,
    savingsFromEarlyPayoff: interestSavings,
    unpaidInstallments: unpaid.length,
  };
}

export async function processEarlyPayoffOffline(input: {
  applicationId: number;
  paymentMethod: string;
  paymentGateway?: string;
  gatewayReference?: string;
}) {
  const { application, store } = await ensureApplicationArtifacts(input.applicationId);
  const payoff = await calculateEarlyPayoffOffline(input.applicationId);
  const now = new Date().toISOString();

  const schedule = getScheduleForApp(store, input.applicationId);
  for (const item of schedule.filter((entry) => !entry.isPaid)) {
    item.isPaid = true;
    item.paidAmount = item.totalAmount;
    item.paidAt = now;
    item.paymentMethod = input.paymentMethod;
    item.updatedAt = now;
  }

  store.transactions.unshift({
    id: store.nextTransactionId++,
    transactionId: `PAYOFF-${Date.now()}-${store.nextTransactionId}`,
    applicationNumericId: application.id,
    applicationId: application.applicationId,
    scheduleRecordId: null,
    amount: payoff.totalPayoffAmount,
    principalPaid: payoff.remainingPrincipal,
    interestPaid: payoff.accruedInterest,
    lateFee: payoff.payoffFee,
    paymentMethod: input.paymentMethod,
    paymentGateway: input.paymentGateway,
    gatewayReference: input.gatewayReference,
    status: 'completed',
    completedAt: now,
    failedAt: null,
    failureReason: null,
    createdAt: now,
  });

  await saveStore(store);
  await syncApplicationOutstandingBalance(input.applicationId, 0, true);

  return {
    success: true,
    transactionId: `PAYOFF-${application.applicationId}`,
    totalPaid: payoff.totalPayoffAmount,
    status: 'completed',
  };
}

export async function makeExtraPrincipalPaymentOffline(input: {
  applicationId: number;
  amount: number;
  paymentMethod: string;
  paymentGateway?: string;
  gatewayReference?: string;
}) {
  const { application, store } = await ensureApplicationArtifacts(input.applicationId);
  const amount = roundCurrency(input.amount);
  if (amount <= 0) {
    throw new Error('Extra payment amount must be greater than zero');
  }

  const schedule = getScheduleForApp(store, input.applicationId);
  const nextUnpaid = findNextUnpaidSchedule(schedule);
  const previousBalance = nextUnpaid?.remainingBalance ?? 0;
  const updatedBalance = Math.max(0, previousBalance - amount);
  const now = new Date().toISOString();

  for (const item of schedule.filter((entry) => !entry.isPaid)) {
    item.remainingBalance = Math.max(0, item.remainingBalance - amount);
    item.updatedAt = now;
  }

  store.transactions.unshift({
    id: store.nextTransactionId++,
    transactionId: `PAY-EXTRA-${Date.now()}-${store.nextTransactionId}`,
    applicationNumericId: application.id,
    applicationId: application.applicationId,
    scheduleRecordId: nextUnpaid?.id ?? null,
    amount,
    principalPaid: amount,
    interestPaid: 0,
    lateFee: 0,
    paymentMethod: input.paymentMethod,
    paymentGateway: input.paymentGateway,
    gatewayReference: input.gatewayReference,
    status: 'completed',
    completedAt: now,
    failedAt: null,
    failureReason: null,
    createdAt: now,
  });

  await saveStore(store);
  await syncApplicationOutstandingBalance(input.applicationId, updatedBalance, true);

  return {
    success: true,
    transactionId: `PAY-EXTRA-${application.applicationId}`,
    principalReduction: amount,
    previousBalance,
    newBalance: updatedBalance,
    interestSaved: roundCurrency(amount * 0.18),
    termReductionMonths: Math.max(1, Math.round(amount / Math.max(application.monthlyPayment, 1))),
  };
}

export async function calculateRefinancingOptionsOffline(applicationNumericId: number) {
  const { application, store } = await ensureApplicationArtifacts(applicationNumericId);
  const schedule = getScheduleForApp(store, applicationNumericId);
  const remainingBalance = findNextUnpaidSchedule(schedule)?.remainingBalance ?? 0;
  const currentRate = Number.parseFloat(application.interestRate || '0');
  const options = [
    { provider: 'Federal Mortgage Bank of Nigeria', rate: Math.max(currentRate - 2.5, 12), term: 180 },
    { provider: 'First Home Finance', rate: Math.max(currentRate - 1.75, 12.5), term: 144 },
    { provider: 'Lagos Housing Finance', rate: Math.max(currentRate - 1.25, 13), term: 120 },
  ].map((option) => {
    const monthlyRate = calculateMonthlyRate(option.rate);
    const denominator = Math.pow(1 + monthlyRate, option.term) - 1;
    const monthlyPayment = denominator > 0
      ? roundCurrency((remainingBalance * monthlyRate * Math.pow(1 + monthlyRate, option.term)) / denominator)
      : roundCurrency(remainingBalance / Math.max(option.term, 1));

    return {
      provider: option.provider,
      newRate: option.rate.toFixed(2),
      newTerm: option.term,
      monthlyPayment,
      totalCost: monthlyPayment * option.term,
      monthlySavings: Math.max(0, application.monthlyPayment - monthlyPayment),
    };
  });

  return {
    applicationId: application.applicationId,
    currentRate: application.interestRate,
    currentMonthlyPayment: application.monthlyPayment,
    remainingBalance,
    options,
    refinanceOptions: options,
  };
}

export async function submitRefinancingApplicationOffline(input: {
  originalApplicationId: number;
  newRate: string;
  newTerm: number;
  reason: string;
}) {
  const application = await getApplicationByNumericId(input.originalApplicationId);
  return {
    success: true,
    originalApplicationId: application.applicationId,
    refinancingApplicationId: `REFI-${application.applicationId}-${Date.now()}`,
    submittedAt: new Date().toISOString(),
    status: 'under_review',
    proposedRate: input.newRate,
    proposedTerm: input.newTerm,
    reason: input.reason,
  };
}
