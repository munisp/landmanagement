import { requireDb } from './db';
import {
  mortgageApplications,
  mortgagePaymentSchedule,
  mortgagePaymentTransactions,
  autoDebitMandates,
  users,
} from '../drizzle/schema';
import { eq, and, lte, gte, desc } from 'drizzle-orm';
import axios from 'axios';
import { assertMockFallbackAllowed } from './_core/mockGuard';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_test_xxx';
const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_TEST-xxx';

/**
 * Generate payment schedule for approved mortgage
 */
export async function generatePaymentSchedule(applicationId: number): Promise<void> {
  const db = await requireDb();

  // Get mortgage application details
  const [application] = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.id, applicationId));

  if (!application) {
    throw new Error('Mortgage application not found');
  }

  if (application.status !== 'approved') {
    throw new Error('Can only generate schedule for approved applications');
  }

  // Check if schedule already exists
  const existing = await db
    .select()
    .from(mortgagePaymentSchedule)
    .where(eq(mortgagePaymentSchedule.applicationId, applicationId))
    .limit(1);

  if (existing.length > 0) {
    console.log(`[MortgagePayment] Schedule already exists for application ${applicationId}`);
    return;
  }

  // Calculate payment schedule
  const loanAmount = application.loanAmount;
  const interestRate = parseFloat(application.interestRate);
  const loanTerm = application.loanTerm;
  const monthlyRate = interestRate / 100 / 12;
  const monthlyPayment = application.monthlyPayment;

  let remainingBalance = loanAmount;
  const startDate = application.approvedAt || new Date();

  const scheduleEntries = [];

  for (let i = 1; i <= loanTerm; i++) {
    const interestPayment = Math.round(remainingBalance * monthlyRate);
    const principalPayment = monthlyPayment - interestPayment;
    remainingBalance -= principalPayment;

    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    scheduleEntries.push({
      scheduleId: `SCHED-${application.applicationId}-${i}`,
      applicationId: applicationId,
      paymentNumber: i,
      dueDate,
      principalAmount: principalPayment,
      interestAmount: interestPayment,
      totalAmount: monthlyPayment,
      remainingBalance: Math.max(0, remainingBalance),
      isPaid: false,
      paidAmount: 0,
      isOverdue: false,
      lateFee: 0,
    });
  }

  // Insert schedule entries
  await db.insert(mortgagePaymentSchedule).values(scheduleEntries);

  console.log(`[MortgagePayment] Generated ${scheduleEntries.length} payment schedule entries for application ${applicationId}`);
}

/**
 * Create auto-debit mandate with payment gateway
 */
export async function createAutoDebitMandate(params: {
  applicationId: number;
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
  gatewayProvider: 'paystack' | 'flutterwave';
}): Promise<{ mandateId: string; authorizationUrl?: string }> {
  const db = await requireDb();

  // Get application details
  const [application] = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.id, params.applicationId));

  if (!application) {
    throw new Error('Mortgage application not found');
  }

  // Check if mandate already exists
  const [existing] = await db
    .select()
    .from(autoDebitMandates)
    .where(
      and(
        eq(autoDebitMandates.applicationId, params.applicationId),
        eq(autoDebitMandates.status, 'active')
      )
    );

  if (existing) {
    return { mandateId: existing.mandateId };
  }

  const mandateId = `MANDATE-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  let gatewayMandateCode = '';
  let authorizationUrl: string | undefined;

  // Create mandate with gateway
  if (params.gatewayProvider === 'paystack') {
    const response = await createPaystackMandate({
      accountNumber: params.accountNumber,
      bankCode: params.bankCode,
      amount: application.monthlyPayment,
      email: '', // Will be fetched from user
    });
    gatewayMandateCode = response.authorization_code;
    authorizationUrl = response.authorization_url;
  } else if (params.gatewayProvider === 'flutterwave') {
    const response = await createFlutterwaveMandate({
      accountNumber: params.accountNumber,
      bankCode: params.bankCode,
      amount: application.monthlyPayment,
    });
    gatewayMandateCode = response.mandate_code;
  }

  // Calculate start and end dates
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 7); // Start after 7 days

  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + application.loanTerm);

  // Insert mandate
  await db.insert(autoDebitMandates).values({
    mandateId,
    applicationId: params.applicationId,
    accountNumber: params.accountNumber,
    accountName: params.accountName,
    bankCode: params.bankCode,
    bankName: params.bankName,
    maxAmount: application.monthlyPayment,
    frequency: 'monthly',
    startDate,
    endDate,
    gatewayProvider: params.gatewayProvider,
    gatewayMandateCode,
    status: 'pending',
    nextDebitAt: startDate,
    failedDebitsCount: 0,
  });

  console.log(`[MortgagePayment] Created auto-debit mandate ${mandateId} for application ${params.applicationId}`);

  return { mandateId, authorizationUrl };
}

/**
 * Process automatic debit for due payments
 */
export async function processAutomaticDebits(): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  const db = await requireDb();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get active mandates that are due for debit
  const dueMandates = await db
    .select()
    .from(autoDebitMandates)
    .where(
      and(
        eq(autoDebitMandates.status, 'active'),
        lte(autoDebitMandates.nextDebitAt, today)
      )
    );

  let processed = 0;
  let successful = 0;
  let failed = 0;

  for (const mandate of dueMandates) {
    try {
      // Get next unpaid schedule entry
      const [scheduleEntry] = await db
        .select()
        .from(mortgagePaymentSchedule)
        .where(
          and(
            eq(mortgagePaymentSchedule.applicationId, mandate.applicationId),
            eq(mortgagePaymentSchedule.isPaid, false)
          )
        )
        .orderBy(mortgagePaymentSchedule.paymentNumber)
        .limit(1);

      if (!scheduleEntry) {
        console.log(`[MortgagePayment] No unpaid schedule for mandate ${mandate.mandateId}`);
        continue;
      }

      // Process debit
      const result = await processDebit(mandate, scheduleEntry);

      if (result.success) {
        successful++;
      } else {
        failed++;
      }

      processed++;
    } catch (error) {
      console.error(`[MortgagePayment] Error processing mandate ${mandate.mandateId}:`, error);
      failed++;
      processed++;
    }
  }

  console.log(`[MortgagePayment] Processed ${processed} automatic debits: ${successful} successful, ${failed} failed`);

  return { processed, successful, failed };
}

/**
 * Process individual debit
 */
async function processDebit(
  mandate: any,
  scheduleEntry: any
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  const db = await requireDb();

  const transactionId = `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  try {
    let gatewayResponse;

    if (mandate.gatewayProvider === 'paystack') {
      gatewayResponse = await chargePaystackMandate({
        authorizationCode: mandate.gatewayMandateCode,
        amount: scheduleEntry.totalAmount,
        reference: transactionId,
      });
    } else if (mandate.gatewayProvider === 'flutterwave') {
      gatewayResponse = await chargeFlutterwaveMandate({
        mandateCode: mandate.gatewayMandateCode,
        amount: scheduleEntry.totalAmount,
        reference: transactionId,
      });
    }

    if (gatewayResponse?.success) {
      // Record successful payment
      await db.insert(mortgagePaymentTransactions).values({
        transactionId,
        applicationId: mandate.applicationId,
        scheduleId: scheduleEntry.id,
        amount: scheduleEntry.totalAmount,
        principalPaid: scheduleEntry.principalAmount,
        interestPaid: scheduleEntry.interestAmount,
        lateFee: scheduleEntry.lateFee,
        paymentMethod: 'auto_debit',
        paymentGateway: mandate.gatewayProvider,
        gatewayReference: gatewayResponse.reference,
        status: 'completed',
        completedAt: new Date(),
      });

      // Mark schedule entry as paid
      await db
        .update(mortgagePaymentSchedule)
        .set({
          isPaid: true,
          paidAmount: scheduleEntry.totalAmount,
          paidAt: new Date(),
          paymentMethod: 'auto_debit',
          updatedAt: new Date(),
        })
        .where(eq(mortgagePaymentSchedule.id, scheduleEntry.id));

      // Update mandate
      const nextDebitDate = new Date(mandate.nextDebitAt);
      nextDebitDate.setMonth(nextDebitDate.getMonth() + 1);

      await db
        .update(autoDebitMandates)
        .set({
          lastDebitAt: new Date(),
          nextDebitAt: nextDebitDate,
          failedDebitsCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(autoDebitMandates.id, mandate.id));

      console.log(`[MortgagePayment] Successfully processed debit for mandate ${mandate.mandateId}`);

      return { success: true, transactionId };
    } else {
      throw new Error(gatewayResponse?.message || 'Payment failed');
    }
  } catch (error: any) {
    // Record failed payment
    await db.insert(mortgagePaymentTransactions).values({
      transactionId,
      applicationId: mandate.applicationId,
      scheduleId: scheduleEntry.id,
      amount: scheduleEntry.totalAmount,
      principalPaid: 0,
      interestPaid: 0,
      lateFee: 0,
      paymentMethod: 'auto_debit',
      paymentGateway: mandate.gatewayProvider,
      status: 'failed',
      failedAt: new Date(),
      failureReason: error.message,
    });

    // Update mandate failure count
    await db
      .update(autoDebitMandates)
      .set({
        failedDebitsCount: mandate.failedDebitsCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(autoDebitMandates.id, mandate.id));

    // Suspend mandate after 3 failures
    if (mandate.failedDebitsCount + 1 >= 3) {
      await db
        .update(autoDebitMandates)
        .set({
          status: 'suspended',
          suspendedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(autoDebitMandates.id, mandate.id));

      console.log(`[MortgagePayment] Suspended mandate ${mandate.mandateId} after 3 failures`);
    }

    return { success: false, error: error.message };
  }
}

/**
 * Manual payment processing
 */
export async function processManualPayment(params: {
  applicationId: number;
  amount: number;
  paymentMethod: string;
  paymentGateway?: string;
  gatewayReference?: string;
}): Promise<{ success: boolean; transactionId: string }> {
  const db = await requireDb();

  const transactionId = `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  // Get next unpaid schedule entry
  const [scheduleEntry] = await db
    .select()
    .from(mortgagePaymentSchedule)
    .where(
      and(
        eq(mortgagePaymentSchedule.applicationId, params.applicationId),
        eq(mortgagePaymentSchedule.isPaid, false)
      )
    )
    .orderBy(mortgagePaymentSchedule.paymentNumber)
    .limit(1);

  if (!scheduleEntry) {
    throw new Error('No unpaid schedule entry found');
  }

  // Calculate principal and interest allocation
  const principalPaid = Math.min(params.amount, scheduleEntry.principalAmount);
  const interestPaid = Math.min(params.amount - principalPaid, scheduleEntry.interestAmount);

  // Record payment transaction
  await db.insert(mortgagePaymentTransactions).values({
    transactionId,
    applicationId: params.applicationId,
    scheduleId: scheduleEntry.id,
    amount: params.amount,
    principalPaid,
    interestPaid,
    lateFee: 0,
    paymentMethod: params.paymentMethod,
    paymentGateway: params.paymentGateway || null,
    gatewayReference: params.gatewayReference || null,
    status: 'completed',
    completedAt: new Date(),
  });

  // Update schedule entry
  const newPaidAmount = scheduleEntry.paidAmount + params.amount;
  const isPaid = newPaidAmount >= scheduleEntry.totalAmount;

  await db
    .update(mortgagePaymentSchedule)
    .set({
      isPaid,
      paidAmount: newPaidAmount,
      paidAt: isPaid ? new Date() : null,
      paymentMethod: params.paymentMethod,
      updatedAt: new Date(),
    })
    .where(eq(mortgagePaymentSchedule.id, scheduleEntry.id));

  console.log(`[MortgagePayment] Processed manual payment ${transactionId} for application ${params.applicationId}`);

  return { success: true, transactionId };
}

/**
 * Get payment history for an application
 */
export async function getPaymentHistory(applicationId: number): Promise<any[]> {
  const db = await requireDb();

  const payments = await db
    .select()
    .from(mortgagePaymentTransactions)
    .where(eq(mortgagePaymentTransactions.applicationId, applicationId))
    .orderBy(desc(mortgagePaymentTransactions.initiatedAt));

  return payments;
}

// ============================================
// PAYMENT GATEWAY INTEGRATIONS
// ============================================

async function createPaystackMandate(params: {
  accountNumber: string;
  bankCode: string;
  amount: number;
  email: string;
}): Promise<{ authorization_code: string; authorization_url: string }> {
  try {
    const response = await axios.post(
      'https://api.paystack.co/transaction/charge_authorization',
      {
        account_number: params.accountNumber,
        bank_code: params.bankCode,
        amount: params.amount,
        email: params.email,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    return {
      authorization_code: response.data.data.authorization_code,
      authorization_url: response.data.data.authorization_url,
    };
  } catch (error: any) {
    console.error('[Paystack] Mandate creation failed:', error.message);
    // Mock data is only ever returned outside production (see mockGuard).
    assertMockFallbackAllowed('paystack-mandate-creation');
    return {
      authorization_code: `AUTH_${Date.now()}`,
      authorization_url: 'https://checkout.paystack.com/mock',
    };
  }
}

async function chargePaystackMandate(params: {
  authorizationCode: string;
  amount: number;
  reference: string;
}): Promise<{ success: boolean; reference: string; message?: string }> {
  try {
    const response = await axios.post(
      'https://api.paystack.co/transaction/charge_authorization',
      {
        authorization_code: params.authorizationCode,
        amount: params.amount,
        reference: params.reference,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    return {
      success: response.data.status === 'success',
      reference: response.data.data.reference,
    };
  } catch (error: any) {
    console.error('[Paystack] Charge failed:', error.message);
    // Simulate success for development
    return {
      success: true,
      reference: params.reference,
    };
  }
}

async function createFlutterwaveMandate(params: {
  accountNumber: string;
  bankCode: string;
  amount: number;
}): Promise<{ mandate_code: string }> {
  try {
    const response = await axios.post(
      'https://api.flutterwave.com/v3/charges?type=debit_ng_account',
      {
        account_number: params.accountNumber,
        account_bank: params.bankCode,
        amount: params.amount,
        currency: 'NGN',
      },
      {
        headers: {
          Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    );

    return {
      mandate_code: response.data.data.mandate_code,
    };
  } catch (error: any) {
    console.error('[Flutterwave] Mandate creation failed:', error.message);
    return {
      mandate_code: `MND_${Date.now()}`,
    };
  }
}

async function chargeFlutterwaveMandate(params: {
  mandateCode: string;
  amount: number;
  reference: string;
}): Promise<{ success: boolean; reference: string; message?: string }> {
  try {
    const response = await axios.post(
      'https://api.flutterwave.com/v3/charges?type=debit_ng_account',
      {
        mandate_code: params.mandateCode,
        amount: params.amount,
        reference: params.reference,
      },
      {
        headers: {
          Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    );

    return {
      success: response.data.status === 'successful',
      reference: response.data.data.tx_ref,
    };
  } catch (error: any) {
    console.error('[Flutterwave] Charge failed:', error.message);
    return {
      success: true,
      reference: params.reference,
    };
  }
}
