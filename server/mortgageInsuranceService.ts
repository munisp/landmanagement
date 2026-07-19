import { requireDb } from './db';
import {
  mortgageInsurancePolicies,
  escrowAccounts,
  escrowTransactions,
  mortgageApplications,
} from '../drizzle/schema';
import { eq, and, desc, lt, sql } from 'drizzle-orm';

/**
 * Mortgage Insurance Service
 * Handles property insurance tracking and escrow account management
 */

/**
 * Calculate required insurance coverage
 */
export function calculateRequiredCoverage(loanAmount: number, propertyValue: number): {
  homeownersInsurance: number;
  pmiRequired: boolean;
  pmiAmount: number;
  totalCoverage: number;
} {
  // Homeowners insurance typically covers replacement cost (property value)
  const homeownersInsurance = propertyValue;

  // PMI (Private Mortgage Insurance) required if LTV > 80%
  const ltv = (loanAmount / propertyValue) * 100;
  const pmiRequired = ltv > 80;

  // PMI typically costs 0.5% - 1% of loan amount annually
  const pmiRate = 0.007; // 0.7%
  const pmiAmount = pmiRequired ? Math.floor(loanAmount * pmiRate) : 0;

  const totalCoverage = homeownersInsurance + (pmiRequired ? loanAmount : 0);

  return {
    homeownersInsurance,
    pmiRequired,
    pmiAmount,
    totalCoverage,
  };
}

/**
 * Calculate insurance premium
 */
export function calculateInsurancePremium(params: {
  coverageAmount: number;
  propertyValue: number;
  propertyType: string;
  location: string;
}): {
  annualPremium: number;
  monthlyPremium: number;
  premiumRate: number;
} {
  // Base premium rate (typically 0.3% - 1.5% of coverage amount)
  let premiumRate = 0.005; // 0.5%

  // Adjust based on property type
  if (params.propertyType === 'apartment') {
    premiumRate *= 0.8; // Apartments typically cheaper
  } else if (params.propertyType === 'detached') {
    premiumRate *= 1.2; // Detached homes typically more expensive
  }

  // Adjust based on location (simplified - in production would use actual risk data)
  if (params.location.toLowerCase().includes('lagos')) {
    premiumRate *= 1.1; // Higher risk in Lagos
  }

  const annualPremium = Math.floor(params.coverageAmount * premiumRate);
  const monthlyPremium = Math.floor(annualPremium / 12);

  return {
    annualPremium,
    monthlyPremium,
    premiumRate,
  };
}

/**
 * Create insurance policy
 */
export async function createInsurancePolicy(params: {
  applicationId: number;
  insuranceProvider: string;
  policyType: string;
  coverageAmount: number;
  annualPremium: number;
  effectiveDate: Date;
  expirationDate: Date;
}): Promise<{ policyId: number; policyNumber: string }> {
  const db = await requireDb();

  const policyNumber = `INS-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  const monthlyPremium = Math.floor(params.annualPremium / 12);

  // Calculate renewal date (30 days before expiration)
  const renewalDate = new Date(params.expirationDate);
  renewalDate.setDate(renewalDate.getDate() - 30);

  // Calculate next premium due date
  const nextPremiumDueDate = new Date(params.effectiveDate);
  nextPremiumDueDate.setMonth(nextPremiumDueDate.getMonth() + 1);

  const [policy] = await db
    .insert(mortgageInsurancePolicies)
    .values({
      policyNumber,
      applicationId: params.applicationId,
      insuranceProvider: params.insuranceProvider,
      policyType: params.policyType,
      coverageAmount: params.coverageAmount,
      annualPremium: params.annualPremium,
      monthlyPremium,
      effectiveDate: params.effectiveDate,
      expirationDate: params.expirationDate,
      renewalDate,
      nextPremiumDueDate,
      status: 'active',
    })
    .returning();

  console.log(`[MortgageInsurance] Created policy ${policyNumber} for application ${params.applicationId}`);

  return {
    policyId: policy.id,
    policyNumber: policy.policyNumber,
  };
}

/**
 * Create escrow account
 */
export async function createEscrowAccount(params: {
  applicationId: number;
  monthlyInsurancePremium: number;
  annualPropertyTax: number;
}): Promise<{ accountId: number; accountNumber: string }> {
  const db = await requireDb();

  const accountNumber = `ESC-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  // Calculate monthly escrow contribution (insurance + taxes + cushion)
  const monthlyTax = Math.floor(params.annualPropertyTax / 12);
  const monthlyContribution = params.monthlyInsurancePremium + monthlyTax;

  // Required balance is typically 2 months of expenses as cushion
  const requiredBalance = monthlyContribution * 2;

  const [account] = await db
    .insert(escrowAccounts)
    .values({
      accountNumber,
      applicationId: params.applicationId,
      currentBalance: 0,
      requiredBalance,
      monthlyContribution,
      isActive: true,
    })
    .returning();

  console.log(`[MortgageInsurance] Created escrow account ${accountNumber} for application ${params.applicationId}`);

  return {
    accountId: account.id,
    accountNumber: account.accountNumber,
  };
}

/**
 * Process escrow deposit
 */
export async function processEscrowDeposit(params: {
  escrowAccountId: number;
  amount: number;
  description: string;
  paymentTransactionId?: number;
}): Promise<{ transactionId: string; newBalance: number }> {
  const db = await requireDb();

  // Get current balance
  const [account] = await db
    .select()
    .from(escrowAccounts)
    .where(eq(escrowAccounts.id, params.escrowAccountId));

  if (!account) {
    throw new Error('Escrow account not found');
  }

  const newBalance = account.currentBalance + params.amount;

  // Create transaction record
  const transactionId = `ESCROW-DEP-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  await db.insert(escrowTransactions).values({
    transactionId,
    escrowAccountId: params.escrowAccountId,
    transactionType: 'deposit',
    amount: params.amount,
    description: params.description,
    paymentTransactionId: params.paymentTransactionId || null,
    balanceAfter: newBalance,
  });

  // Update account balance
  await db
    .update(escrowAccounts)
    .set({
      currentBalance: newBalance,
      updatedAt: new Date(),
    })
    .where(eq(escrowAccounts.id, params.escrowAccountId));

  console.log(`[MortgageInsurance] Processed escrow deposit ${transactionId}: ₦${params.amount}`);

  return {
    transactionId,
    newBalance,
  };
}

/**
 * Process insurance payment from escrow
 */
export async function processInsurancePaymentFromEscrow(params: {
  escrowAccountId: number;
  policyId: number;
  amount: number;
}): Promise<{ transactionId: string; newBalance: number }> {
  const db = await requireDb();

  // Get current balance
  const [account] = await db
    .select()
    .from(escrowAccounts)
    .where(eq(escrowAccounts.id, params.escrowAccountId));

  if (!account) {
    throw new Error('Escrow account not found');
  }

  if (account.currentBalance < params.amount) {
    throw new Error('Insufficient escrow balance');
  }

  const newBalance = account.currentBalance - params.amount;

  // Create transaction record
  const transactionId = `ESCROW-INS-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  await db.insert(escrowTransactions).values({
    transactionId,
    escrowAccountId: params.escrowAccountId,
    transactionType: 'insurance_payment',
    amount: -params.amount, // Negative for withdrawal
    description: 'Insurance premium payment',
    policyId: params.policyId,
    balanceAfter: newBalance,
  });

  // Update account balance
  await db
    .update(escrowAccounts)
    .set({
      currentBalance: newBalance,
      updatedAt: new Date(),
    })
    .where(eq(escrowAccounts.id, params.escrowAccountId));

  // Update policy payment tracking
  const [policy] = await db
    .select()
    .from(mortgageInsurancePolicies)
    .where(eq(mortgageInsurancePolicies.id, params.policyId));

  if (policy) {
    const nextDueDate = new Date(policy.nextPremiumDueDate || new Date());
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);

    await db
      .update(mortgageInsurancePolicies)
      .set({
        lastPremiumPaidDate: new Date(),
        nextPremiumDueDate: nextDueDate,
        updatedAt: new Date(),
      })
      .where(eq(mortgageInsurancePolicies.id, params.policyId));
  }

  console.log(`[MortgageInsurance] Processed insurance payment ${transactionId}: ₦${params.amount}`);

  return {
    transactionId,
    newBalance,
  };
}

/**
 * Get policies requiring renewal
 */
export async function getPoliciesRequiringRenewal(daysAhead: number = 30): Promise<
  Array<{
    policyId: number;
    policyNumber: string;
    applicationId: number;
    insuranceProvider: string;
    expirationDate: Date;
    daysUntilExpiration: number;
  }>
> {
  const db = await requireDb();

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const policies = await db
    .select()
    .from(mortgageInsurancePolicies)
    .where(
      and(
        eq(mortgageInsurancePolicies.status, 'active'),
        lt(mortgageInsurancePolicies.expirationDate, futureDate)
      )
    )
    .orderBy(mortgageInsurancePolicies.expirationDate);

  return policies.map((policy) => {
    const daysUntilExpiration = Math.floor(
      (new Date(policy.expirationDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      policyId: policy.id,
      policyNumber: policy.policyNumber,
      applicationId: policy.applicationId,
      insuranceProvider: policy.insuranceProvider,
      expirationDate: policy.expirationDate,
      daysUntilExpiration,
    };
  });
}

/**
 * Renew insurance policy
 */
export async function renewInsurancePolicy(params: {
  policyId: number;
  newExpirationDate: Date;
  newAnnualPremium?: number;
}): Promise<{ success: boolean; message: string }> {
  const db = await requireDb();

  const [policy] = await db
    .select()
    .from(mortgageInsurancePolicies)
    .where(eq(mortgageInsurancePolicies.id, params.policyId));

  if (!policy) {
    throw new Error('Policy not found');
  }

  const newRenewalDate = new Date(params.newExpirationDate);
  newRenewalDate.setDate(newRenewalDate.getDate() - 30);

  const updateData: any = {
    expirationDate: params.newExpirationDate,
    renewalDate: newRenewalDate,
    status: 'active',
    updatedAt: new Date(),
  };

  if (params.newAnnualPremium) {
    updateData.annualPremium = params.newAnnualPremium;
    updateData.monthlyPremium = Math.floor(params.newAnnualPremium / 12);
  }

  await db
    .update(mortgageInsurancePolicies)
    .set(updateData)
    .where(eq(mortgageInsurancePolicies.id, params.policyId));

  console.log(`[MortgageInsurance] Renewed policy ${policy.policyNumber}`);

  return {
    success: true,
    message: `Policy ${policy.policyNumber} renewed until ${params.newExpirationDate.toLocaleDateString()}`,
  };
}

/**
 * Get escrow account summary
 */
export async function getEscrowAccountSummary(escrowAccountId: number): Promise<{
  account: any;
  recentTransactions: any[];
  upcomingPayments: Array<{
    type: string;
    amount: number;
    dueDate: Date;
    description: string;
  }>;
  balanceStatus: 'sufficient' | 'low' | 'critical';
}> {
  const db = await requireDb();

  // Get account details
  const [account] = await db
    .select()
    .from(escrowAccounts)
    .where(eq(escrowAccounts.id, escrowAccountId));

  if (!account) {
    throw new Error('Escrow account not found');
  }

  // Get recent transactions
  const recentTransactions = await db
    .select()
    .from(escrowTransactions)
    .where(eq(escrowTransactions.escrowAccountId, escrowAccountId))
    .orderBy(desc(escrowTransactions.createdAt))
    .limit(10);

  // Get upcoming insurance payments
  const policies = await db
    .select()
    .from(mortgageInsurancePolicies)
    .where(
      and(
        eq(mortgageInsurancePolicies.applicationId, account.applicationId),
        eq(mortgageInsurancePolicies.status, 'active')
      )
    );

  const upcomingPayments = policies.map((policy) => ({
    type: 'insurance_premium',
    amount: policy.monthlyPremium,
    dueDate: policy.nextPremiumDueDate || new Date(),
    description: `${policy.policyType} - ${policy.insuranceProvider}`,
  }));

  // Determine balance status
  let balanceStatus: 'sufficient' | 'low' | 'critical';
  const balanceRatio = account.currentBalance / account.requiredBalance;
  if (balanceRatio >= 1.0) {
    balanceStatus = 'sufficient';
  } else if (balanceRatio >= 0.5) {
    balanceStatus = 'low';
  } else {
    balanceStatus = 'critical';
  }

  return {
    account,
    recentTransactions,
    upcomingPayments,
    balanceStatus,
  };
}

/**
 * Process automatic insurance payments (scheduled job)
 */
export async function processAutomaticInsurancePayments(): Promise<{
  processed: number;
  failed: number;
  details: Array<{ policyNumber: string; status: string; message: string }>;
}> {
  const db = await requireDb();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get policies with premium due today
  const duePolices = await db
    .select()
    .from(mortgageInsurancePolicies)
    .where(
      and(
        eq(mortgageInsurancePolicies.status, 'active'),
        sql`${mortgageInsurancePolicies.nextPremiumDueDate} >= ${today}`,
        sql`${mortgageInsurancePolicies.nextPremiumDueDate} < ${tomorrow}`
      )
    );

  let processed = 0;
  let failed = 0;
  const details: Array<{ policyNumber: string; status: string; message: string }> = [];

  for (const policy of duePolices) {
    try {
      // Get escrow account for this application
      const [escrowAccount] = await db
        .select()
        .from(escrowAccounts)
        .where(
          and(
            eq(escrowAccounts.applicationId, policy.applicationId),
            eq(escrowAccounts.isActive, true)
          )
        );

      if (!escrowAccount) {
        failed++;
        details.push({
          policyNumber: policy.policyNumber,
          status: 'failed',
          message: 'No active escrow account found',
        });
        continue;
      }

      // Process payment from escrow
      await processInsurancePaymentFromEscrow({
        escrowAccountId: escrowAccount.id,
        policyId: policy.id,
        amount: policy.monthlyPremium,
      });

      processed++;
      details.push({
        policyNumber: policy.policyNumber,
        status: 'success',
        message: `Paid ₦${policy.monthlyPremium.toLocaleString()} from escrow`,
      });
    } catch (error: any) {
      failed++;
      details.push({
        policyNumber: policy.policyNumber,
        status: 'failed',
        message: error.message || 'Unknown error',
      });
    }
  }

  console.log(`[MortgageInsurance] Processed ${processed} automatic payments, ${failed} failed`);

  return {
    processed,
    failed,
    details,
  };
}
