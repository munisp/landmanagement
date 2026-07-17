import {
  mortgageBrokers as brokers,
  brokerClients,
  brokerCommissions,
  brokerCommissionStructures,
  mortgageApplications,
} from '../drizzle/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { getDb } from './db';
import { sendEmail } from './notificationDelivery';
import fs from 'fs';
import path from 'path';

/**
 * Broker Commission Automation System
 * Automatically calculates and processes monthly commission payouts
 */

export interface CommissionCalculation {
  brokerId: number;
  brokerName: string;
  brokerEmail: string;
  period: {
    startDate: string;
    endDate: string;
  };
  closedLoans: Array<{
    applicationId: number;
    loanAmount: number;
    commissionRate: number;
    commissionAmount: number;
    closedDate: string;
  }>;
  totalCommission: number;
  status: 'pending' | 'approved' | 'paid';
}

export interface CommissionStatement {
  statementId: string;
  brokerId: number;
  period: {
    startDate: string;
    endDate: string;
  };
  totalCommission: number;
  closedLoansCount: number;
  generatedAt: string;
  pdfUrl?: string;
}

function ensureBrokerDocumentDir() {
  const dir = path.join(process.cwd(), 'server', 'data', 'broker-documents');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeBrokerDocument(fileName: string, html: string) {
  const dir = ensureBrokerDocumentDir();
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, html, 'utf-8');
  return filePath;
}

/**
 * Calculate commissions for a specific broker for a given period
 */
export async function calculateBrokerCommission(
  brokerId: number,
  startDate: Date,
  endDate: Date
): Promise<CommissionCalculation | null> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  // Get broker details
  const broker = await db
    .select()
    .from(brokers)
    .where(eq(brokers.id, brokerId))
    .limit(1);

  if (broker.length === 0) {
    return null;
  }

  const brokerData = broker[0];

  // Get commission structures for the broker. Multiple rows are used as loan-amount tiers.
  const structures = await db
    .select()
    .from(brokerCommissionStructures)
    .where(eq(brokerCommissionStructures.brokerId, brokerId));

  const activeStructures = structures
    .filter((item) => item.isActive)
    .filter((item) => item.effectiveFrom <= endDate)
    .filter((item) => !item.effectiveTo || item.effectiveTo >= startDate)
    .sort((a, b) => Number(a.minLoanAmount) - Number(b.minLoanAmount));

  if (activeStructures.length === 0) {
    // Use default commission rate from broker
    const defaultRate = Number(brokerData.defaultCommissionRate) / 100; // Convert basis points to percentage

  // Get closed loans for the period (through broker submissions)
  const closedLoans = await db
    .select({
      id: mortgageApplications.id,
      loanAmount: mortgageApplications.loanAmount,
      approvedAt: mortgageApplications.approvedAt,
    })
    .from(mortgageApplications)
    .where(
      and(
        eq(mortgageApplications.status, 'approved'),
        gte(mortgageApplications.approvedAt, startDate),
        lte(mortgageApplications.approvedAt, endDate)
      )
    );

    const loanCommissions = closedLoans.map((loan) => {
      const loanAmount = Number(loan.loanAmount);
      const commissionAmount = loanAmount * (defaultRate / 100);

      return {
        applicationId: loan.id,
        loanAmount,
        commissionRate: defaultRate,
        commissionAmount,
        closedDate: loan.approvedAt ? loan.approvedAt.toISOString() : '',
      };
    });

    const totalCommission = loanCommissions.reduce(
      (sum, loan) => sum + loan.commissionAmount,
      0
    );

    return {
      brokerId,
      brokerName: brokerData.companyName,
      brokerEmail: brokerData.businessEmail,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      closedLoans: loanCommissions,
      totalCommission,
      status: 'pending',
    };
  }

  const defaultStructure = activeStructures[0];

  // Get closed loans for the period (through broker submissions)
  const closedLoans = await db
    .select({
      id: mortgageApplications.id,
      loanAmount: mortgageApplications.loanAmount,
      approvedAt: mortgageApplications.approvedAt,
    })
    .from(mortgageApplications)
    .where(
      and(
        eq(mortgageApplications.status, 'approved'),
        gte(mortgageApplications.approvedAt, startDate),
        lte(mortgageApplications.approvedAt, endDate)
      )
    );

  // Calculate commission for each loan using the matching amount tier when available.
  const loanCommissions = closedLoans.map((loan) => {
    const loanAmount = Number(loan.loanAmount);
    const matchedStructure = activeStructures.find((item) => {
      const min = Number(item.minLoanAmount ?? 0);
      const max = item.maxLoanAmount == null ? Number.POSITIVE_INFINITY : Number(item.maxLoanAmount);
      return loanAmount >= min && loanAmount <= max;
    }) ?? defaultStructure;

    const commissionRate = Number(matchedStructure.commissionRate) / 100; // Convert basis points to percentage
    const commissionAmount = loanAmount * (commissionRate / 100);

    return {
      applicationId: loan.id,
      loanAmount,
      commissionRate,
      commissionAmount,
      closedDate: loan.approvedAt ? loan.approvedAt.toISOString() : '',
    };
  });

  const totalCommission = loanCommissions.reduce(
    (sum, loan) => sum + loan.commissionAmount,
    0
  );

  return {
    brokerId,
    brokerName: brokerData.companyName,
    brokerEmail: brokerData.businessEmail,
    period: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    closedLoans: loanCommissions,
    totalCommission,
    status: 'pending',
  };
}

/**
 * Calculate commissions for all brokers for a given period
 */
export async function calculateAllBrokerCommissions(
  startDate: Date,
  endDate: Date
): Promise<CommissionCalculation[]> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  // Get all active brokers
  const allBrokers = await db
    .select()
    .from(brokers)
    .where(eq(brokers.status, 'active'));

  const calculations: CommissionCalculation[] = [];

  for (const broker of allBrokers) {
    const calculation = await calculateBrokerCommission(
      broker.id,
      startDate,
      endDate
    );
    if (calculation && calculation.totalCommission > 0) {
      calculations.push(calculation);
    }
  }

  return calculations;
}

/**
 * Save commission calculations to database
 */
export async function saveCommissionCalculations(
  calculation: CommissionCalculation
): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const commissionIds: string[] = [];

  // Create a commission record for each closed loan
  for (const loan of calculation.closedLoans) {
    const commissionId = `COMM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await db.insert(brokerCommissions).values({
      commissionId,
      brokerId: calculation.brokerId,
      applicationId: loan.applicationId,
      loanAmount: Math.round(loan.loanAmount),
      commissionRate: Math.round(loan.commissionRate * 100), // Convert to basis points
      commissionAmount: Math.round(loan.commissionAmount),
      status: calculation.status,
    });

    commissionIds.push(commissionId);
  }

  return commissionIds;
}

/**
 * Generate commission statement (PDF)
 */
export async function generateCommissionStatement(
  calculation: CommissionCalculation
): Promise<CommissionStatement> {
  const statementId = `STMT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const generatedAt = new Date().toISOString();

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Broker Commission Statement ${statementId}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 32px; color: #1f2937; }
      h1, h2 { margin-bottom: 8px; }
      .meta, .summary { margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
      th { background: #f3f4f6; }
    </style>
  </head>
  <body>
    <h1>Broker Commission Statement</h1>
    <div class="meta">
      <p><strong>Statement ID:</strong> ${statementId}</p>
      <p><strong>Broker:</strong> ${calculation.brokerName}</p>
      <p><strong>Period:</strong> ${new Date(calculation.period.startDate).toLocaleDateString()} - ${new Date(calculation.period.endDate).toLocaleDateString()}</p>
      <p><strong>Generated:</strong> ${new Date(generatedAt).toLocaleString()}</p>
    </div>
    <div class="summary">
      <h2>Summary</h2>
      <p><strong>Closed Loans:</strong> ${calculation.closedLoans.length}</p>
      <p><strong>Total Commission:</strong> ₦${calculation.totalCommission.toLocaleString()}</p>
      <p><strong>Status:</strong> ${calculation.status}</p>
    </div>
    <table>
      <thead>
        <tr>
          <th>Application</th>
          <th>Loan Amount</th>
          <th>Rate</th>
          <th>Commission</th>
          <th>Closed Date</th>
        </tr>
      </thead>
      <tbody>
        ${calculation.closedLoans.map((loan) => `<tr><td>${loan.applicationId}</td><td>₦${loan.loanAmount.toLocaleString()}</td><td>${loan.commissionRate}%</td><td>₦${loan.commissionAmount.toLocaleString()}</td><td>${loan.closedDate ? new Date(loan.closedDate).toLocaleDateString() : '—'}</td></tr>`).join('')}
      </tbody>
    </table>
  </body>
</html>`;

  const filePath = writeBrokerDocument(`${statementId}.html`, html);

  return {
    statementId,
    brokerId: calculation.brokerId,
    period: calculation.period,
    totalCommission: calculation.totalCommission,
    closedLoansCount: calculation.closedLoans.length,
    generatedAt,
    pdfUrl: filePath,
  };
}

/**
 * Generate tax documentation (1099 form)
 */
export async function generateTaxDocumentation(
  brokerId: number,
  year: number
): Promise<{
  form1099: {
    brokerId: number;
    brokerName: string;
    taxId: string;
    year: number;
    totalIncome: number;
    quarterlyBreakdown: Array<{
      quarter: number;
      amount: number;
    }>;
    generatedAt: string;
    pdfUrl?: string;
  };
}> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  // Get broker details
  const broker = await db
    .select()
    .from(brokers)
    .where(eq(brokers.id, brokerId))
    .limit(1);

  if (broker.length === 0) {
    throw new Error('Broker not found');
  }

  const brokerData = broker[0];

  // Get all commissions for the year
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);

  const commissions = await db
    .select()
    .from(brokerCommissions)
    .where(
      and(
        eq(brokerCommissions.brokerId, brokerId),
        gte(brokerCommissions.createdAt, yearStart),
        lte(brokerCommissions.createdAt, yearEnd)
      )
    );

  // Calculate quarterly breakdown
  const quarterlyBreakdown = [
    { quarter: 1, amount: 0 },
    { quarter: 2, amount: 0 },
    { quarter: 3, amount: 0 },
    { quarter: 4, amount: 0 },
  ];

  let totalIncome = 0;

  for (const commission of commissions) {
    const amount = Number(commission.commissionAmount);
    totalIncome += amount;

    const createdAt = new Date(commission.createdAt);
    const month = createdAt.getMonth();
    const quarter = Math.floor(month / 3);
    quarterlyBreakdown[quarter].amount += amount;
  }

  const generatedAt = new Date().toISOString();
  const taxId = `BROKER-${brokerId}`;
  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>1099 Summary ${brokerId}-${year}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 32px; color: #1f2937; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
      th { background: #f3f4f6; }
    </style>
  </head>
  <body>
    <h1>Broker Tax Documentation</h1>
    <p><strong>Broker:</strong> ${brokerData.companyName}</p>
    <p><strong>Broker ID:</strong> ${brokerId}</p>
    <p><strong>Tax Reference:</strong> ${taxId}</p>
    <p><strong>Tax Year:</strong> ${year}</p>
    <p><strong>Total Income:</strong> ₦${totalIncome.toLocaleString()}</p>
    <p><strong>Generated:</strong> ${new Date(generatedAt).toLocaleString()}</p>
    <table>
      <thead>
        <tr><th>Quarter</th><th>Income</th></tr>
      </thead>
      <tbody>
        ${quarterlyBreakdown.map((quarter) => `<tr><td>Q${quarter.quarter}</td><td>₦${quarter.amount.toLocaleString()}</td></tr>`).join('')}
      </tbody>
    </table>
  </body>
</html>`;
  const filePath = writeBrokerDocument(`tax-${brokerId}-${year}-1099.html`, html);

  return {
    form1099: {
      brokerId,
      brokerName: brokerData.companyName,
      taxId,
      year,
      totalIncome,
      quarterlyBreakdown,
      generatedAt,
      pdfUrl: filePath,
    },
  };
}

/**
 * Approve commissions for payment
 */
export async function approveCommissions(
  commissionIds: string[],
  approvedBy: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  for (const commissionId of commissionIds) {
    await db
      .update(brokerCommissions)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        approvedBy,
      })
      .where(eq(brokerCommissions.commissionId, commissionId));
  }
}

/**
 * Process commission payment
 */
export async function processCommissionPayment(
  brokerId: number,
  commissionIds: string[]
): Promise<{
  success: boolean;
  transactionId?: string;
  error?: string;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  // Get broker details
  const broker = await db
    .select()
    .from(brokers)
    .where(eq(brokers.id, brokerId))
    .limit(1);

  if (broker.length === 0) {
    return { success: false, error: 'Broker not found' };
  }

  const brokerData = broker[0];

  // Calculate total amount
  let totalAmount = 0;
  for (const commissionId of commissionIds) {
    const commission = await db
      .select()
      .from(brokerCommissions)
      .where(eq(brokerCommissions.commissionId, commissionId))
      .limit(1);

    if (commission.length > 0) {
      totalAmount += Number(commission[0].commissionAmount);
    }
  }

  // In a real implementation, this would integrate with Paystack/Flutterwave
  // to process the actual payment
  const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Update commission status
  for (const commissionId of commissionIds) {
    await db
      .update(brokerCommissions)
      .set({
        status: 'paid',
        paidAt: new Date(),
        paymentReference: transactionId,
      })
      .where(eq(brokerCommissions.commissionId, commissionId));
  }

  // Send payment confirmation email
  await sendEmail({
    to: brokerData.businessEmail,
    subject: 'Commission Payment Processed',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Commission Payment Processed</h2>
        <p style="color: #666; line-height: 1.6;">
          Your commission payment has been processed successfully.
        </p>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 20px;">
          <h3 style="color: #333; margin-top: 0;">Payment Details:</h3>
          <p><strong>Amount:</strong> ₦${totalAmount.toLocaleString()}</p>
          <p><strong>Transaction ID:</strong> ${transactionId}</p>
          <p><strong>Commissions:</strong> ${commissionIds.length} loans</p>
        </div>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">
          This is an automated notification from the Broker Commission System.
        </p>
      </div>
    `,
  });

  return { success: true, transactionId };
}

/**
 * Run monthly commission payout (scheduled job)
 */
export async function runMonthlyCommissionPayout(): Promise<{
  processed: number;
  totalAmount: number;
  errors: string[];
}> {
  console.log('[CommissionAutomation] Starting monthly commission payout...');

  // Calculate period (previous month)
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  // Calculate commissions for all brokers
  const calculations = await calculateAllBrokerCommissions(startDate, endDate);

  let processed = 0;
  let totalAmount = 0;
  const errors: string[] = [];

  for (const calculation of calculations) {
    try {
      // Save calculations
      const commissionIds = await saveCommissionCalculations(calculation);

      // Generate statement
      await generateCommissionStatement(calculation);

      // Auto-approve (in production, this might require manual approval)
      await approveCommissions(commissionIds, 1); // System user

      // Process payment
      const result = await processCommissionPayment(calculation.brokerId, commissionIds);

      if (result.success) {
        processed++;
        totalAmount += calculation.totalCommission;
      } else {
        errors.push(`${calculation.brokerName}: ${result.error}`);
      }

      // Send notification email
      await sendEmail({
        to: calculation.brokerEmail,
        subject: 'Monthly Commission Statement',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Monthly Commission Statement</h2>
            <p style="color: #666; line-height: 1.6;">
              Your commission statement for ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} is ready.
            </p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 20px;">
              <h3 style="color: #333; margin-top: 0;">Summary:</h3>
              <p><strong>Closed Loans:</strong> ${calculation.closedLoans.length}</p>
              <p><strong>Total Commission:</strong> ₦${calculation.totalCommission.toLocaleString()}</p>
              <p><strong>Status:</strong> ${result.success ? 'Paid' : 'Pending'}</p>
            </div>
            <p style="color: #999; font-size: 12px; margin-top: 30px;">
              This is an automated notification from the Broker Commission System.
            </p>
          </div>
        `,
      });
    } catch (error) {
      console.error(`[CommissionAutomation] Error processing commission for ${calculation.brokerName}:`, error);
      errors.push(`${calculation.brokerName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log(`[CommissionAutomation] Processed ${processed} commissions, total: ₦${totalAmount.toLocaleString()}`);

  return { processed, totalAmount, errors };
}

/**
 * Get commission history for a broker
 */
export async function getBrokerCommissionHistory(
  brokerId: number,
  limit: number = 12
): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const history = await db
    .select()
    .from(brokerCommissions)
    .where(eq(brokerCommissions.brokerId, brokerId))
    .limit(limit);

  return history;
}

/**
 * Dispute commission
 */
export async function disputeCommission(
  commissionId: string,
  reason: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  await db
    .update(brokerCommissions)
    .set({
      status: 'cancelled', // Use cancelled status for disputes
      metadata: JSON.stringify({ disputeReason: reason, disputedAt: new Date().toISOString() }),
    })
    .where(eq(brokerCommissions.commissionId, commissionId));

  // Send notification to admins
  // (Implementation would go here)
}
