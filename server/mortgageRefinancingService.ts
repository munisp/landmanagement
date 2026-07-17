import { getDb } from './db';
import {
  mortgageApplications,
  mortgagePaymentSchedule,
  mortgagePaymentTransactions,
} from '../drizzle/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * Calculate early payoff amount
 */
export async function calculateEarlyPayoff(applicationId: number): Promise<{
  remainingPrincipal: number;
  accruedInterest: number;
  earlyPayoffFee: number;
  totalPayoffAmount: number;
  savingsFromEarlyPayoff: number;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get application details
  const [application] = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.id, applicationId));

  if (!application) {
    throw new Error('Mortgage application not found');
  }

  // Get unpaid schedule entries
  const unpaidSchedule = await db
    .select()
    .from(mortgagePaymentSchedule)
    .where(
      and(
        eq(mortgagePaymentSchedule.applicationId, applicationId),
        eq(mortgagePaymentSchedule.isPaid, false)
      )
    )
    .orderBy(mortgagePaymentSchedule.paymentNumber);

  if (unpaidSchedule.length === 0) {
    return {
      remainingPrincipal: 0,
      accruedInterest: 0,
      earlyPayoffFee: 0,
      totalPayoffAmount: 0,
      savingsFromEarlyPayoff: 0,
    };
  }

  // Calculate remaining principal
  const remainingPrincipal = unpaidSchedule[0].remainingBalance;

  // Calculate accrued interest (interest for current month only)
  const currentSchedule = unpaidSchedule[0];
  const daysIntoMonth = Math.floor(
    (new Date().getTime() - new Date(currentSchedule.dueDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  const accruedInterest = Math.max(0, Math.floor((currentSchedule.interestAmount * daysIntoMonth) / 30));

  // Calculate early payoff fee (typically 1-3% of remaining principal)
  const earlyPayoffFeePercentage = 0.02; // 2%
  const earlyPayoffFee = Math.floor(remainingPrincipal * earlyPayoffFeePercentage);

  // Total payoff amount
  const totalPayoffAmount = remainingPrincipal + accruedInterest + earlyPayoffFee;

  // Calculate savings (total remaining payments minus payoff amount)
  const totalRemainingPayments = unpaidSchedule.reduce((sum, s) => sum + s.totalAmount, 0);
  const savingsFromEarlyPayoff = totalRemainingPayments - totalPayoffAmount;

  return {
    remainingPrincipal,
    accruedInterest,
    earlyPayoffFee,
    totalPayoffAmount,
    savingsFromEarlyPayoff,
  };
}

/**
 * Process early payoff
 */
export async function processEarlyPayoff(params: {
  applicationId: number;
  paymentMethod: string;
  paymentGateway?: string;
  gatewayReference?: string;
}): Promise<{ success: boolean; transactionId: string }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Calculate payoff amount
  const payoffDetails = await calculateEarlyPayoff(params.applicationId);

  if (payoffDetails.totalPayoffAmount === 0) {
    throw new Error('Mortgage already paid off');
  }

  const transactionId = `PAYOFF-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  // Record payoff transaction
  await db.insert(mortgagePaymentTransactions).values({
    transactionId,
    applicationId: params.applicationId,
    scheduleId: null, // Early payoff not tied to specific schedule
    amount: payoffDetails.totalPayoffAmount,
    principalPaid: payoffDetails.remainingPrincipal,
    interestPaid: payoffDetails.accruedInterest,
    lateFee: 0,
    paymentMethod: params.paymentMethod,
    paymentGateway: params.paymentGateway || null,
    gatewayReference: params.gatewayReference || null,
    status: 'completed',
    completedAt: new Date(),
    metadata: JSON.stringify({
      type: 'early_payoff',
      earlyPayoffFee: payoffDetails.earlyPayoffFee,
      savingsFromEarlyPayoff: payoffDetails.savingsFromEarlyPayoff,
    }),
  });

  // Mark all unpaid schedule entries as paid
  await db
    .update(mortgagePaymentSchedule)
    .set({
      isPaid: true,
      paidAmount: sql`${mortgagePaymentSchedule.totalAmount}`,
      paidAt: new Date(),
      paymentMethod: params.paymentMethod,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mortgagePaymentSchedule.applicationId, params.applicationId),
        eq(mortgagePaymentSchedule.isPaid, false)
      )
    );

  // Update application status
  await db
    .update(mortgageApplications)
    .set({
      status: 'disbursed', // Mark as completed
      updatedAt: new Date(),
      metadata: sql`jsonb_set(
        COALESCE(${mortgageApplications.metadata}, '{}'::jsonb),
        '{earlyPayoff}',
        '${JSON.stringify({
          paidOffAt: new Date().toISOString(),
          payoffAmount: payoffDetails.totalPayoffAmount,
          savingsRealized: payoffDetails.savingsFromEarlyPayoff,
        })}'::jsonb
      )`,
    })
    .where(eq(mortgageApplications.id, params.applicationId));

  console.log(`[MortgageRefinancing] Processed early payoff ${transactionId} for application ${params.applicationId}`);

  return { success: true, transactionId };
}

/**
 * Make extra principal payment
 */
export async function makeExtraPrincipalPayment(params: {
  applicationId: number;
  amount: number;
  paymentMethod: string;
  paymentGateway?: string;
  gatewayReference?: string;
}): Promise<{
  success: boolean;
  transactionId: string;
  newPayoffDate: Date;
  interestSaved: number;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get application details
  const [application] = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.id, params.applicationId));

  if (!application) {
    throw new Error('Mortgage application not found');
  }

  const transactionId = `EXTRA-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  // Record extra payment transaction
  await db.insert(mortgagePaymentTransactions).values({
    transactionId,
    applicationId: params.applicationId,
    scheduleId: null, // Extra payment not tied to specific schedule
    amount: params.amount,
    principalPaid: params.amount, // All goes to principal
    interestPaid: 0,
    lateFee: 0,
    paymentMethod: params.paymentMethod,
    paymentGateway: params.paymentGateway || null,
    gatewayReference: params.gatewayReference || null,
    status: 'completed',
    completedAt: new Date(),
    metadata: JSON.stringify({
      type: 'extra_principal',
    }),
  });

  // Recalculate payment schedule with reduced principal
  await recalculateScheduleAfterExtraPayment(params.applicationId, params.amount);

  // Calculate new payoff date and interest saved
  const updatedSchedule = await db
    .select()
    .from(mortgagePaymentSchedule)
    .where(
      and(
        eq(mortgagePaymentSchedule.applicationId, params.applicationId),
        eq(mortgagePaymentSchedule.isPaid, false)
      )
    )
    .orderBy(desc(mortgagePaymentSchedule.paymentNumber))
    .limit(1);

  const newPayoffDate = updatedSchedule[0]?.dueDate || new Date();

  // Calculate interest saved (simplified calculation)
  const monthlyRate = parseFloat(application.interestRate) / 100 / 12;
  const monthsSaved = Math.floor(params.amount / application.monthlyPayment);
  const interestSaved = Math.floor(params.amount * monthlyRate * monthsSaved);

  console.log(`[MortgageRefinancing] Processed extra payment ${transactionId} for application ${params.applicationId}`);

  return {
    success: true,
    transactionId,
    newPayoffDate,
    interestSaved,
  };
}

/**
 * Recalculate payment schedule after extra payment
 */
async function recalculateScheduleAfterExtraPayment(
  applicationId: number,
  extraPayment: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get application details
  const [application] = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.id, applicationId));

  if (!application) return;

  // Get unpaid schedule entries
  const unpaidSchedule = await db
    .select()
    .from(mortgagePaymentSchedule)
    .where(
      and(
        eq(mortgagePaymentSchedule.applicationId, applicationId),
        eq(mortgagePaymentSchedule.isPaid, false)
      )
    )
    .orderBy(mortgagePaymentSchedule.paymentNumber);

  if (unpaidSchedule.length === 0) return;

  // Reduce remaining balance by extra payment
  let remainingExtra = extraPayment;
  const interestRate = parseFloat(application.interestRate);
  const monthlyRate = interestRate / 100 / 12;

  // Update schedule entries
  for (let i = 0; i < unpaidSchedule.length; i++) {
    const entry = unpaidSchedule[i];
    
    // Apply extra payment to principal
    const newRemainingBalance = Math.max(0, entry.remainingBalance - remainingExtra);
    
    // Recalculate interest for this payment
    const newInterestAmount = Math.round(newRemainingBalance * monthlyRate);
    const newPrincipalAmount = application.monthlyPayment - newInterestAmount;
    
    await db
      .update(mortgagePaymentSchedule)
      .set({
        principalAmount: newPrincipalAmount,
        interestAmount: newInterestAmount,
        remainingBalance: Math.max(0, newRemainingBalance - newPrincipalAmount),
        updatedAt: new Date(),
      })
      .where(eq(mortgagePaymentSchedule.id, entry.id));

    // If balance is fully paid, mark remaining entries as paid
    if (newRemainingBalance <= 0) {
      await db
        .update(mortgagePaymentSchedule)
        .set({
          isPaid: true,
          paidAmount: sql`${mortgagePaymentSchedule.totalAmount}`,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mortgagePaymentSchedule.applicationId, applicationId),
            sql`${mortgagePaymentSchedule.paymentNumber} > ${entry.paymentNumber}`
          )
        );
      break;
    }

    remainingExtra = 0; // Extra payment applied
  }
}

/**
 * Calculate refinancing options
 */
export async function calculateRefinancingOptions(applicationId: number): Promise<{
  currentLoan: {
    remainingBalance: number;
    currentRate: string;
    remainingPayments: number;
    monthlyPayment: number;
  };
  refinanceOptions: Array<{
    newRate: string;
    newTerm: number;
    newMonthlyPayment: number;
    totalInterestSavings: number;
    breakEvenMonths: number;
    closingCosts: number;
  }>;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get application details
  const [application] = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.id, applicationId));

  if (!application) {
    throw new Error('Mortgage application not found');
  }

  // Get unpaid schedule
  const unpaidSchedule = await db
    .select()
    .from(mortgagePaymentSchedule)
    .where(
      and(
        eq(mortgagePaymentSchedule.applicationId, applicationId),
        eq(mortgagePaymentSchedule.isPaid, false)
      )
    );

  const remainingBalance = unpaidSchedule[0]?.remainingBalance || 0;
  const remainingPayments = unpaidSchedule.length;

  // Generate refinancing options (different rates and terms)
  const currentRate = parseFloat(application.interestRate);
  const refinanceOptions = [];

  // Option 1: Lower rate, same term
  const lowerRate1 = currentRate - 0.5;
  if (lowerRate1 > 0) {
    refinanceOptions.push(
      calculateRefinanceOption(
        remainingBalance,
        lowerRate1,
        remainingPayments,
        application.monthlyPayment,
        currentRate
      )
    );
  }

  // Option 2: Lower rate, shorter term
  const lowerRate2 = currentRate - 0.75;
  const shorterTerm = Math.max(12, Math.floor(remainingPayments * 0.75));
  if (lowerRate2 > 0) {
    refinanceOptions.push(
      calculateRefinanceOption(
        remainingBalance,
        lowerRate2,
        shorterTerm,
        application.monthlyPayment,
        currentRate
      )
    );
  }

  // Option 3: Significantly lower rate, same term
  const lowerRate3 = currentRate - 1.0;
  if (lowerRate3 > 0) {
    refinanceOptions.push(
      calculateRefinanceOption(
        remainingBalance,
        lowerRate3,
        remainingPayments,
        application.monthlyPayment,
        currentRate
      )
    );
  }

  return {
    currentLoan: {
      remainingBalance,
      currentRate: application.interestRate,
      remainingPayments,
      monthlyPayment: application.monthlyPayment,
    },
    refinanceOptions,
  };
}

/**
 * Calculate individual refinance option
 */
function calculateRefinanceOption(
  principal: number,
  newRate: number,
  termMonths: number,
  currentMonthlyPayment: number,
  currentRate: number
): {
  newRate: string;
  newTerm: number;
  newMonthlyPayment: number;
  totalInterestSavings: number;
  breakEvenMonths: number;
  closingCosts: number;
} {
  const monthlyRate = newRate / 100 / 12;
  
  // Calculate new monthly payment
  const newMonthlyPayment = Math.round(
    (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
      (Math.pow(1 + monthlyRate, termMonths) - 1)
  );

  // Calculate total interest for new loan
  const newTotalInterest = newMonthlyPayment * termMonths - principal;

  // Calculate total interest for current loan
  const currentMonthlyRate = currentRate / 100 / 12;
  const currentTotalInterest = currentMonthlyPayment * termMonths - principal;

  // Interest savings
  const totalInterestSavings = Math.max(0, currentTotalInterest - newTotalInterest);

  // Closing costs (typically 2-5% of loan amount)
  const closingCosts = Math.floor(principal * 0.03); // 3%

  // Break-even point (months to recover closing costs)
  const monthlySavings = currentMonthlyPayment - newMonthlyPayment;
  const breakEvenMonths = monthlySavings > 0 ? Math.ceil(closingCosts / monthlySavings) : 999;

  return {
    newRate: newRate.toFixed(2),
    newTerm: termMonths,
    newMonthlyPayment,
    totalInterestSavings,
    breakEvenMonths,
    closingCosts,
  };
}

/**
 * Submit refinancing application
 */
export async function submitRefinancingApplication(params: {
  originalApplicationId: number;
  newRate: string;
  newTerm: number;
  reason: string;
}): Promise<{ applicationId: string; message: string }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get original application
  const [originalApp] = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.id, params.originalApplicationId));

  if (!originalApp) {
    throw new Error('Original mortgage application not found');
  }

  // Get remaining balance
  const unpaidSchedule = await db
    .select()
    .from(mortgagePaymentSchedule)
    .where(
      and(
        eq(mortgagePaymentSchedule.applicationId, params.originalApplicationId),
        eq(mortgagePaymentSchedule.isPaid, false)
      )
    )
    .limit(1);

  const remainingBalance = unpaidSchedule[0]?.remainingBalance || 0;

  if (remainingBalance === 0) {
    throw new Error('Cannot refinance a fully paid mortgage');
  }

  // Calculate new monthly payment
  const monthlyRate = parseFloat(params.newRate) / 100 / 12;
  const newMonthlyPayment = Math.round(
    (remainingBalance * monthlyRate * Math.pow(1 + monthlyRate, params.newTerm)) /
      (Math.pow(1 + monthlyRate, params.newTerm) - 1)
  );

  // Create new application
  const newApplicationId = `REFI-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  await db.insert(mortgageApplications).values({
    applicationId: newApplicationId,
    transactionId: originalApp.transactionId,
    parcelId: originalApp.parcelId,
    applicantId: originalApp.applicantId,
    loanAmount: remainingBalance,
    interestRate: params.newRate,
    loanTerm: params.newTerm,
    monthlyPayment: newMonthlyPayment,
    downPayment: 0, // Refinancing doesn't require down payment
    bankName: originalApp.bankName,
    bankBranch: originalApp.bankBranch,
    loanOfficer: originalApp.loanOfficer,
    loanOfficerContact: originalApp.loanOfficerContact,
    status: 'pending',
    documents: originalApp.documents,
    metadata: JSON.stringify({
      type: 'refinancing',
      originalApplicationId: originalApp.applicationId,
      reason: params.reason,
    }),
  });

  console.log(`[MortgageRefinancing] Created refinancing application ${newApplicationId} for original ${originalApp.applicationId}`);

  return {
    applicationId: newApplicationId,
    message: 'Refinancing application submitted successfully',
  };
}
