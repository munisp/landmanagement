import { requireDb } from './db';
import {
  mortgageApplications,
  loanPools,
  loanPoolLoans,
  investors,
  poolInvestments,
  investmentDistributions,
  servicingRightsTransfers,
  mortgageBrokers,
  brokerCommissions,
} from '../drizzle/schema';
import { eq, sql, and, gte, lte, desc } from 'drizzle-orm';

/**
 * Regulatory Compliance Reporting Service
 * Generates automated reports for CBN (Central Bank of Nigeria) and SEC (Securities and Exchange Commission)
 */

export interface CBNComplianceReport {
  reportId: string;
  reportType: 'cbn_monthly' | 'cbn_quarterly' | 'cbn_annual';
  reportPeriod: { start: Date; end: Date };
  generatedAt: Date;
  summary: {
    totalLoansOriginated: number;
    totalLoanAmount: number;
    averageLoanSize: number;
    totalBorrowers: number;
    averageInterestRate: number;
    loansByRiskTier: Record<string, { count: number; amount: number }>;
    delinquencyRate: number;
    defaultRate: number;
  };
  loanPerformanceMetrics: any[];
  riskMetrics: any;
  capitalAdequacyRatio: number;
}

export interface SECDisclosureReport {
  reportId: string;
  reportType: 'sec_quarterly' | 'sec_annual';
  reportPeriod: { start: Date; end: Date };
  generatedAt: Date;
  poolPerformance: any[];
  investorDisclosures: any[];
  securitizationActivity: {
    poolsCreated: number;
    totalSecuritized: number;
    averagePoolSize: number;
  };
  servicingTransfers: any[];
  complianceStatus: {
    disclosuresFiled: number;
    pendingDisclosures: number;
    overdueDisclosures: number;
  };
}

/**
 * Generate CBN compliance report
 */
export async function generateCBNReport(
  reportType: 'cbn_monthly' | 'cbn_quarterly' | 'cbn_annual',
  startDate: Date,
  endDate: Date
): Promise<CBNComplianceReport> {
  const db = await requireDb();
  
  const reportId = `CBN-${reportType.toUpperCase()}-${Date.now()}`;
  
  // Get loans originated in period
  const loansInPeriod = await db
    .select()
    .from(mortgageApplications)
    .where(
      and(
        eq(mortgageApplications.status, 'approved'),
        gte(mortgageApplications.createdAt, startDate),
        lte(mortgageApplications.createdAt, endDate)
      )
    );
  
  // Calculate summary metrics
  const totalLoansOriginated = loansInPeriod.length;
  const totalLoanAmount = loansInPeriod.reduce((sum, loan) => sum + loan.loanAmount, 0);
  const averageLoanSize = totalLoansOriginated > 0 ? Math.floor(totalLoanAmount / totalLoansOriginated) : 0;
  
  // Calculate average interest rate
  const totalInterestRate = loansInPeriod.reduce((sum, loan) => {
    const rate = typeof loan.interestRate === 'string' ? parseFloat(loan.interestRate) : loan.interestRate;
    return sum + rate;
  }, 0);
  const averageInterestRate = totalLoansOriginated > 0 
    ? Math.floor((totalInterestRate / totalLoansOriginated) * 100) / 100 
    : 0;
  
  // Group by risk tier (simplified - would use actual credit scores)
  const loansByRiskTier: Record<string, { count: number; amount: number }> = {
    aaa: { count: 0, amount: 0 },
    aa: { count: 0, amount: 0 },
    a: { count: 0, amount: 0 },
    bbb: { count: 0, amount: 0 },
    bb: { count: 0, amount: 0 },
    b: { count: 0, amount: 0 },
  };
  
  for (const loan of loansInPeriod) {
    // Simplified risk calculation
    const loanToValue = (loan.loanAmount / (loan.loanAmount * 1.2)) * 100;
    let tier = 'bbb';
    if (loanToValue < 60) tier = 'aaa';
    else if (loanToValue < 70) tier = 'aa';
    else if (loanToValue < 80) tier = 'a';
    else if (loanToValue < 85) tier = 'bbb';
    else if (loanToValue < 90) tier = 'bb';
    else tier = 'b';
    
    loansByRiskTier[tier].count++;
    loansByRiskTier[tier].amount += loan.loanAmount;
  }
  
  // Calculate delinquency and default rates (simplified)
  const delinquencyRate = 0; // Would calculate from payment history
  const defaultRate = 0; // Would calculate from loan status
  
  // Loan performance metrics
  const loanPerformanceMetrics = loansInPeriod.map((loan) => ({
    applicationId: loan.applicationId,
    loanAmount: loan.loanAmount,
    interestRate: loan.interestRate,
    loanTerm: loan.loanTerm,
    status: loan.status,
    originationDate: loan.createdAt,
  }));
  
  // Risk metrics
  const riskMetrics = {
    totalExposure: totalLoanAmount,
    weightedAverageRisk: 'BBB', // Would calculate based on portfolio
    concentrationRisk: 'Low', // Would calculate based on diversification
  };
  
  // Capital adequacy ratio (simplified)
  const capitalAdequacyRatio = 15.5; // Would calculate based on actual capital and risk-weighted assets
  
  const report: CBNComplianceReport = {
    reportId,
    reportType,
    reportPeriod: { start: startDate, end: endDate },
    generatedAt: new Date(),
    summary: {
      totalLoansOriginated,
      totalLoanAmount,
      averageLoanSize,
      totalBorrowers: totalLoansOriginated, // Simplified
      averageInterestRate,
      loansByRiskTier,
      delinquencyRate,
      defaultRate,
    },
    loanPerformanceMetrics,
    riskMetrics,
    capitalAdequacyRatio,
  };
  
  return report;
}

/**
 * Generate SEC disclosure report
 */
export async function generateSECReport(
  reportType: 'sec_quarterly' | 'sec_annual',
  startDate: Date,
  endDate: Date
): Promise<SECDisclosureReport> {
  const db = await requireDb();
  
  const reportId = `SEC-${reportType.toUpperCase()}-${Date.now()}`;
  
  // Get pools created in period
  const poolsInPeriod = await db
    .select()
    .from(loanPools)
    .where(
      and(
        gte(loanPools.createdAt, startDate),
        lte(loanPools.createdAt, endDate)
      )
    );
  
  // Pool performance
  const poolPerformance = await Promise.all(
    poolsInPeriod.map(async (pool) => {
      const poolLoansData = await db
        .select()
        .from(loanPoolLoans)
        .where(eq(loanPoolLoans.poolId, pool.id));
      
      const investmentsData = await db
        .select()
        .from(poolInvestments)
        .where(eq(poolInvestments.poolId, pool.id));
      
      const distributionsData = await db
        .select()
        .from(investmentDistributions)
        .where(eq(investmentDistributions.investmentId, pool.id)); // Note: distributions link to investments, not pools directly
      
      return {
        poolId: pool.poolId,
        poolName: pool.poolName,
        riskTier: pool.riskTier,
        status: pool.status,
        loanCount: poolLoansData.length,
        totalPrincipal: pool.totalLoanAmount,
        investorCount: investmentsData.length,
        totalDistributions: distributionsData.reduce((sum, d) => sum + d.amount, 0),
        performanceRating: 'Good', // Would calculate based on actual performance
      };
    })
  );
  
  // Investor disclosures
  const allInvestors = await db.select().from(investors);
  const investorDisclosures = await Promise.all(
    allInvestors.map(async (investor) => {
      const investorInvestments = await db
        .select()
        .from(poolInvestments)
        .where(eq(poolInvestments.investorId, investor.id));
      
      const totalInvested = investorInvestments.reduce((sum, inv) => sum + inv.investmentAmount, 0);
      const totalReturns = investorInvestments.reduce((sum, inv) => sum + inv.totalDistributions, 0);
      
      return {
        investorId: investor.investorId,
        investorName: investor.investorName,
        totalInvested,
        totalReturns,
        roi: totalInvested > 0 ? ((totalReturns / totalInvested) * 100).toFixed(2) : '0.00',
        activeInvestments: investorInvestments.filter((inv) => inv.status === 'active').length,
      };
    })
  );
  
  // Securitization activity
  const securitizationActivity = {
    poolsCreated: poolsInPeriod.length,
    totalSecuritized: poolsInPeriod.reduce((sum, pool) => sum + pool.totalLoanAmount, 0),
    averagePoolSize: poolsInPeriod.length > 0 
      ? Math.floor(poolsInPeriod.reduce((sum, pool) => sum + pool.totalLoanAmount, 0) / poolsInPeriod.length)
      : 0,
  };
  
  // Servicing transfers
  const servicingTransfers = await db
    .select()
    .from(servicingRightsTransfers)
    .where(
      and(
        gte(servicingRightsTransfers.createdAt, startDate),
        lte(servicingRightsTransfers.createdAt, endDate)
      )
    );
  
  const servicingTransfersData = servicingTransfers.map((transfer) => ({
    transferId: transfer.transferId,
    poolId: transfer.poolId,
    status: transfer.status,
    transferDate: transfer.createdAt,
    completedDate: transfer.completedAt,
  }));
  
  // Compliance status
  const complianceStatus = {
    disclosuresFiled: poolsInPeriod.filter((p) => p.status === 'sold').length,
    pendingDisclosures: poolsInPeriod.filter((p) => p.status === 'active').length,
    overdueDisclosures: 0, // Would calculate based on filing deadlines
  };
  
  const report: SECDisclosureReport = {
    reportId,
    reportType,
    reportPeriod: { start: startDate, end: endDate },
    generatedAt: new Date(),
    poolPerformance,
    investorDisclosures,
    securitizationActivity,
    servicingTransfers: servicingTransfersData,
    complianceStatus,
  };
  
  return report;
}

/**
 * Generate loan performance metrics report
 */
export async function generateLoanPerformanceReport(
  startDate: Date,
  endDate: Date
): Promise<any> {
  const db = await requireDb();
  
  const loans = await db
    .select()
    .from(mortgageApplications)
    .where(
      and(
        eq(mortgageApplications.status, 'approved'),
        gte(mortgageApplications.createdAt, startDate),
        lte(mortgageApplications.createdAt, endDate)
      )
    );
  
  return {
    totalLoans: loans.length,
    totalAmount: loans.reduce((sum, loan) => sum + loan.loanAmount, 0),
    averageLoanSize: loans.length > 0 
      ? Math.floor(loans.reduce((sum, loan) => sum + loan.loanAmount, 0) / loans.length)
      : 0,
    loansByTerm: {
      short: loans.filter((l) => l.loanTerm <= 120).length,
      medium: loans.filter((l) => l.loanTerm > 120 && l.loanTerm <= 240).length,
      long: loans.filter((l) => l.loanTerm > 240).length,
    },
  };
}

/**
 * Generate investor disclosure report
 */
export async function generateInvestorDisclosureReport(
  investorId: string
): Promise<any> {
  const db = await requireDb();
  
  const investor = await db
    .select()
    .from(investors)
    .where(eq(investors.investorId, investorId))
    .limit(1);
  
  if (investor.length === 0) {
    throw new Error('Investor not found');
  }
  
  const investorData = investor[0];
  
  const investorInvestments = await db
    .select()
    .from(poolInvestments)
    .where(eq(poolInvestments.investorId, investorData.id));
  
  const totalInvested = investorInvestments.reduce((sum, inv) => sum + inv.investmentAmount, 0);
  const totalReturns = investorInvestments.reduce((sum, inv) => sum + inv.totalDistributions, 0);
  
  return {
    investorId: investorData.investorId,
    investorName: investorData.investorName,
    totalInvested,
    totalReturns,
    roi: totalInvested > 0 ? ((totalReturns / totalInvested) * 100).toFixed(2) : '0.00',
    activeInvestments: investorInvestments.filter((inv) => inv.status === 'active').length,
    investments: investorInvestments.map((inv) => ({
      investmentId: inv.investmentId,
      poolId: inv.poolId,
      amount: inv.investmentAmount,
      returns: inv.totalDistributions,
      status: inv.status,
      createdAt: inv.createdAt,
    })),
  };
}

/**
 * Generate servicing transfer notification
 */
export async function generateServicingTransferNotification(
  transferId: string
): Promise<any> {
  const db = await requireDb();
  
  const transfer = await db
    .select()
    .from(servicingRightsTransfers)
    .where(eq(servicingRightsTransfers.transferId, transferId))
    .limit(1);
  
  if (transfer.length === 0) {
    throw new Error('Transfer not found');
  }
  
  const transferData = transfer[0];
  
  return {
    transferId: transferData.transferId,
    poolId: transferData.poolId,
    fromServicer: transferData.fromServicer,
    toServicer: transferData.toServicer,
    status: transferData.status,
    transferDate: transferData.createdAt,
    completedDate: transferData.completedAt,
    notificationSent: true,
    notificationDate: new Date(),
  };
}

/**
 * Export audit trail for compliance
 */
export async function exportAuditTrail(
  startDate: Date,
  endDate: Date
): Promise<any[]> {
  const db = await requireDb();
  
  // Collect all relevant activities
  const auditTrail = [];
  
  // Loan applications
  const loans = await db
    .select()
    .from(mortgageApplications)
    .where(
      and(
        gte(mortgageApplications.createdAt, startDate),
        lte(mortgageApplications.createdAt, endDate)
      )
    )
    .orderBy(desc(mortgageApplications.createdAt));
  
  auditTrail.push(
    ...loans.map((loan) => ({
      type: 'loan_application',
      id: loan.applicationId,
      action: 'created',
      status: loan.status,
      amount: loan.loanAmount,
      timestamp: loan.createdAt,
    }))
  );
  
  // Pool creations
  const pools = await db
    .select()
    .from(loanPools)
    .where(
      and(
        gte(loanPools.createdAt, startDate),
        lte(loanPools.createdAt, endDate)
      )
    )
    .orderBy(desc(loanPools.createdAt));
  
  auditTrail.push(
    ...pools.map((pool) => ({
      type: 'loan_pool',
      id: pool.poolId,
      action: 'created',
      status: pool.status,
      amount: pool.totalLoanAmount,
      timestamp: pool.createdAt,
    }))
  );
  
  // Investments
  const allInvestments = await db
    .select()
    .from(poolInvestments)
    .where(
      and(
        gte(poolInvestments.createdAt, startDate),
        lte(poolInvestments.createdAt, endDate)
      )
    )
    .orderBy(desc(poolInvestments.createdAt));
  
  auditTrail.push(
    ...allInvestments.map((inv) => ({
      type: 'investment',
      id: inv.investmentId,
      action: 'created',
      status: inv.status,
      amount: inv.investmentAmount,
      timestamp: inv.createdAt,
    }))
  );
  
  // Sort by timestamp
  auditTrail.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  return auditTrail;
}

/**
 * Schedule automated report generation
 */
export interface ReportSchedule {
  reportType: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  lastGenerated?: Date;
  nextScheduled: Date;
}

export async function scheduleReport(
  reportType: string,
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
): Promise<ReportSchedule> {
  const now = new Date();
  let nextScheduled = new Date(now);
  
  switch (frequency) {
    case 'daily':
      nextScheduled.setDate(now.getDate() + 1);
      break;
    case 'weekly':
      nextScheduled.setDate(now.getDate() + 7);
      break;
    case 'monthly':
      nextScheduled.setMonth(now.getMonth() + 1);
      break;
    case 'quarterly':
      nextScheduled.setMonth(now.getMonth() + 3);
      break;
    case 'annual':
      nextScheduled.setFullYear(now.getFullYear() + 1);
      break;
  }
  
  return {
    reportType,
    frequency,
    nextScheduled,
  };
}
