import { requireDb } from './db';
import {
  loanPools,
  loanPoolLoans,
  investors,
  poolInvestments,
  investmentDistributions,
  servicingRightsTransfers,
  mortgageApplications,
} from '../drizzle/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';

/**
 * Secondary Market Service
 * Handles loan packaging, securitization, and investor management
 */

/**
 * Create loan pool
 */
export async function createLoanPool(params: {
  poolName: string;
  description?: string;
  riskTier: string;
  createdBy: number;
}): Promise<{ poolId: string }> {
  const db = await requireDb();
  
  const poolId = `POOL-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  
  await db.insert(loanPools).values({
    poolId,
    poolName: params.poolName,
    description: params.description || null,
    riskTier: params.riskTier as any,
    createdBy: params.createdBy,
    status: 'draft',
  });
  
  console.log(`[SecondaryMarket] Created loan pool ${poolId}`);
  
  return { poolId };
}

/**
 * Add loan to pool
 */
export async function addLoanToPool(params: {
  poolId: string;
  applicationId: number;
  principalAmount: number;
  interestRate: number;
  remainingTerm: number;
  creditScore?: number;
  loanToValue?: number;
}): Promise<{ success: boolean }> {
  const db = await requireDb();
  
  const [pool] = await db
    .select()
    .from(loanPools)
    .where(eq(loanPools.poolId, params.poolId));
  
  if (!pool) {
    throw new Error('Loan pool not found');
  }
  
  if (pool.status !== 'draft') {
    throw new Error('Can only add loans to draft pools');
  }
  
  // Verify application exists and is approved
  const [application] = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.id, params.applicationId));
  
  if (!application) {
    throw new Error('Application not found');
  }
  
  if (application.status !== 'approved') {
    throw new Error('Only approved applications can be added to pools');
  }
  
  // Check if loan is already in a pool
  const existing = await db
    .select()
    .from(loanPoolLoans)
    .where(eq(loanPoolLoans.applicationId, params.applicationId));
  
  if (existing.length > 0) {
    throw new Error('Loan is already in a pool');
  }
  
  // Add loan to pool
  await db.insert(loanPoolLoans).values({
    poolId: pool.id,
    applicationId: params.applicationId,
    principalAmount: params.principalAmount,
    interestRate: params.interestRate,
    remainingTerm: params.remainingTerm,
    creditScore: params.creditScore || null,
    loanToValue: params.loanToValue || null,
  });
  
  // Update pool statistics
  const [stats] = await db
    .select({
      totalAmount: sql<number>`sum(${loanPoolLoans.principalAmount})::int`,
      avgRate: sql<number>`avg(${loanPoolLoans.interestRate})::int`,
      avgTerm: sql<number>`avg(${loanPoolLoans.remainingTerm})::int`,
      count: sql<number>`count(*)::int`,
      minAmount: sql<number>`min(${loanPoolLoans.principalAmount})::int`,
      maxAmount: sql<number>`max(${loanPoolLoans.principalAmount})::int`,
    })
    .from(loanPoolLoans)
    .where(eq(loanPoolLoans.poolId, pool.id));
  
  await db
    .update(loanPools)
    .set({
      totalLoanAmount: stats?.totalAmount || 0,
      averageInterestRate: stats?.avgRate || 0,
      weightedAverageMaturity: stats?.avgTerm || 0,
      loanCount: stats?.count || 0,
      minLoanAmount: stats?.minAmount || 0,
      maxLoanAmount: stats?.maxAmount || 0,
      updatedAt: new Date(),
    })
    .where(eq(loanPools.id, pool.id));
  
  console.log(`[SecondaryMarket] Added loan ${params.applicationId} to pool ${params.poolId}`);
  
  return { success: true };
}

/**
 * Close loan pool (make it available for investment)
 */
export async function closeLoanPool(poolId: string): Promise<{ success: boolean }> {
  const db = await requireDb();
  
  const [pool] = await db
    .select()
    .from(loanPools)
    .where(eq(loanPools.poolId, poolId));
  
  if (!pool) {
    throw new Error('Loan pool not found');
  }
  
  if (pool.status !== 'draft') {
    throw new Error('Pool is not in draft status');
  }
  
  if (pool.loanCount === 0) {
    throw new Error('Cannot close empty pool');
  }
  
  await db
    .update(loanPools)
    .set({
      status: 'active',
      closedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(loanPools.poolId, poolId));
  
  console.log(`[SecondaryMarket] Closed loan pool ${poolId} with ${pool.loanCount} loans`);
  
  return { success: true };
}

/**
 * Get loan pool details
 */
export async function getLoanPoolDetails(poolId: string): Promise<any> {
  const db = await requireDb();
  
  const [pool] = await db
    .select()
    .from(loanPools)
    .where(eq(loanPools.poolId, poolId));
  
  if (!pool) {
    throw new Error('Loan pool not found');
  }
  
  // Get loans in pool
  const loans = await db
    .select({
      poolLoan: loanPoolLoans,
      application: mortgageApplications,
    })
    .from(loanPoolLoans)
    .leftJoin(
      mortgageApplications,
      eq(loanPoolLoans.applicationId, mortgageApplications.id)
    )
    .where(eq(loanPoolLoans.poolId, pool.id));
  
  // Get investments in pool
  const investments = await db
    .select()
    .from(poolInvestments)
    .where(eq(poolInvestments.poolId, pool.id));
  
  return {
    ...pool,
    loans: loans.map((l) => ({
      ...l.poolLoan,
      application: l.application,
    })),
    investments,
  };
}

/**
 * Get available loan pools
 */
export async function getAvailableLoanPools(params?: {
  riskTier?: string;
  minAmount?: number;
  maxAmount?: number;
}): Promise<any[]> {
  const db = await requireDb();
  
  let query = db
    .select()
    .from(loanPools)
    .where(eq(loanPools.status, 'active'));
  
  const pools = await query.orderBy(desc(loanPools.createdAt));
  
  // Apply filters
  let filtered = pools;
  if (params?.riskTier) {
    filtered = filtered.filter((p) => p.riskTier === params.riskTier);
  }
  if (params?.minAmount) {
    filtered = filtered.filter((p) => p.totalLoanAmount >= params.minAmount!);
  }
  if (params?.maxAmount) {
    filtered = filtered.filter((p) => p.totalLoanAmount <= params.maxAmount!);
  }
  
  return filtered;
}

/**
 * Register investor
 */
export async function registerInvestor(params: {
  userId: number;
  investorName: string;
  investorType: string;
  contactEmail: string;
  contactPhone: string;
  minInvestmentAmount: number;
  maxInvestmentAmount?: number;
  preferredRiskTiers?: string[];
}): Promise<{ investorId: string }> {
  const db = await requireDb();
  
  const investorId = `INV-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  
  // Check if user is already an investor
  const existing = await db
    .select()
    .from(investors)
    .where(eq(investors.userId, params.userId));
  
  if (existing.length > 0) {
    throw new Error('User is already registered as an investor');
  }
  
  await db.insert(investors).values({
    investorId,
    userId: params.userId,
    investorName: params.investorName,
    investorType: params.investorType as any,
    contactEmail: params.contactEmail,
    contactPhone: params.contactPhone,
    minInvestmentAmount: params.minInvestmentAmount,
    maxInvestmentAmount: params.maxInvestmentAmount || null,
    preferredRiskTiers: params.preferredRiskTiers ? JSON.stringify(params.preferredRiskTiers) : null,
    status: 'active',
  });
  
  console.log(`[SecondaryMarket] Registered investor ${investorId}`);
  
  return { investorId };
}

/**
 * Get investor details
 */
export async function getInvestorDetails(investorId: string): Promise<any> {
  const db = await requireDb();
  
  const [investor] = await db
    .select()
    .from(investors)
    .where(eq(investors.investorId, investorId));
  
  if (!investor) {
    throw new Error('Investor not found');
  }
  
  // Get investments
  const investments = await db
    .select({
      investment: poolInvestments,
      pool: loanPools,
    })
    .from(poolInvestments)
    .leftJoin(loanPools, eq(poolInvestments.poolId, loanPools.id))
    .where(eq(poolInvestments.investorId, investor.id));
  
  return {
    ...investor,
    preferredRiskTiers: investor.preferredRiskTiers
      ? JSON.parse(investor.preferredRiskTiers as string)
      : [],
    investments: investments.map((i) => ({
      ...i.investment,
      pool: i.pool,
    })),
  };
}

/**
 * Get investor by user ID
 */
export async function getInvestorByUserId(userId: number): Promise<any> {
  const db = await requireDb();
  
  const [investor] = await db
    .select()
    .from(investors)
    .where(eq(investors.userId, userId));
  
  if (!investor) {
    return null;
  }
  
  return {
    ...investor,
    preferredRiskTiers: investor.preferredRiskTiers
      ? JSON.parse(investor.preferredRiskTiers as string)
      : [],
  };
}

/**
 * Create investment
 */
export async function createInvestment(params: {
  investorId: string;
  poolId: string;
  investmentAmount: number;
  expectedReturnRate: number;
  maturityMonths: number;
}): Promise<{ investmentId: string }> {
  const db = await requireDb();
  
  const [investor] = await db
    .select()
    .from(investors)
    .where(eq(investors.investorId, params.investorId));
  
  if (!investor) {
    throw new Error('Investor not found');
  }
  
  if (investor.status !== 'active') {
    throw new Error('Investor account is not active');
  }
  
  const [pool] = await db
    .select()
    .from(loanPools)
    .where(eq(loanPools.poolId, params.poolId));
  
  if (!pool) {
    throw new Error('Loan pool not found');
  }
  
  if (pool.status !== 'active') {
    throw new Error('Loan pool is not available for investment');
  }
  
  // Validate investment amount
  if (params.investmentAmount < investor.minInvestmentAmount) {
    throw new Error(`Investment amount below minimum (₦${investor.minInvestmentAmount.toLocaleString()})`);
  }
  
  if (investor.maxInvestmentAmount && params.investmentAmount > investor.maxInvestmentAmount) {
    throw new Error(`Investment amount exceeds maximum (₦${investor.maxInvestmentAmount.toLocaleString()})`);
  }
  
  const investmentId = `INVEST-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  
  // Calculate expected return
  const expectedReturn = Math.floor(
    (params.investmentAmount * params.expectedReturnRate * params.maturityMonths) / (10000 * 12)
  );
  
  // Calculate maturity date
  const maturityDate = new Date();
  maturityDate.setMonth(maturityDate.getMonth() + params.maturityMonths);
  
  await db.insert(poolInvestments).values({
    investmentId,
    poolId: pool.id,
    investorId: investor.id,
    investmentAmount: params.investmentAmount,
    expectedReturn,
    expectedReturnRate: params.expectedReturnRate,
    maturityDate,
    status: 'active',
  });
  
  // Update investor metrics
  await db
    .update(investors)
    .set({
      totalInvested: sql`${investors.totalInvested} + ${params.investmentAmount}`,
      activeInvestments: sql`${investors.activeInvestments} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(investors.id, investor.id));
  
  console.log(
    `[SecondaryMarket] Created investment ${investmentId}: ₦${params.investmentAmount.toLocaleString()}`
  );
  
  return { investmentId };
}

/**
 * Create distribution
 */
export async function createDistribution(params: {
  investmentId: string;
  distributionType: string;
  amount: number;
  distributionDate: Date;
  paymentReference?: string;
}): Promise<{ distributionId: string }> {
  const db = await requireDb();
  
  const [investment] = await db
    .select()
    .from(poolInvestments)
    .where(eq(poolInvestments.investmentId, params.investmentId));
  
  if (!investment) {
    throw new Error('Investment not found');
  }
  
  const distributionId = `DIST-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  
  await db.insert(investmentDistributions).values({
    distributionId,
    investmentId: investment.id,
    distributionType: params.distributionType as any,
    amount: params.amount,
    distributionDate: params.distributionDate,
    paymentReference: params.paymentReference || null,
    paidAt: params.paymentReference ? new Date() : null,
  });
  
  // Update investment total distributions
  await db
    .update(poolInvestments)
    .set({
      totalDistributions: sql`${poolInvestments.totalDistributions} + ${params.amount}`,
      lastDistributionDate: params.distributionDate,
      updatedAt: new Date(),
    })
    .where(eq(poolInvestments.id, investment.id));
  
  // Update investor total returns
  const [investor] = await db
    .select()
    .from(investors)
    .where(eq(investors.id, investment.investorId));
  
  if (investor) {
    await db
      .update(investors)
      .set({
        totalReturns: sql`${investors.totalReturns} + ${params.amount}`,
        updatedAt: new Date(),
      })
      .where(eq(investors.id, investor.id));
  }
  
  console.log(
    `[SecondaryMarket] Created distribution ${distributionId}: ${params.distributionType} ₦${params.amount.toLocaleString()}`
  );
  
  return { distributionId };
}

/**
 * Get investment distributions
 */
export async function getInvestmentDistributions(investmentId: string): Promise<any[]> {
  const db = await requireDb();
  
  const [investment] = await db
    .select()
    .from(poolInvestments)
    .where(eq(poolInvestments.investmentId, investmentId));
  
  if (!investment) {
    throw new Error('Investment not found');
  }
  
  const distributions = await db
    .select()
    .from(investmentDistributions)
    .where(eq(investmentDistributions.investmentId, investment.id))
    .orderBy(desc(investmentDistributions.distributionDate));
  
  return distributions;
}

/**
 * Create servicing rights transfer
 */
export async function createServicingRightsTransfer(params: {
  poolId: string;
  fromServicer: string;
  toServicer: string;
  transferDate: Date;
  transferFee: number;
  notes?: string;
}): Promise<{ transferId: string }> {
  const db = await requireDb();
  
  const [pool] = await db
    .select()
    .from(loanPools)
    .where(eq(loanPools.poolId, params.poolId));
  
  if (!pool) {
    throw new Error('Loan pool not found');
  }
  
  const transferId = `TRANS-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  
  await db.insert(servicingRightsTransfers).values({
    transferId,
    poolId: pool.id,
    fromServicer: params.fromServicer,
    toServicer: params.toServicer,
    transferDate: params.transferDate,
    transferFee: params.transferFee,
    notes: params.notes || null,
    status: 'pending',
  });
  
  console.log(`[SecondaryMarket] Created servicing rights transfer ${transferId}`);
  
  return { transferId };
}

/**
 * Approve servicing rights transfer
 */
export async function approveServicingRightsTransfer(params: {
  transferId: string;
  approvedBy: number;
}): Promise<{ success: boolean }> {
  const db = await requireDb();
  
  const [transfer] = await db
    .select()
    .from(servicingRightsTransfers)
    .where(eq(servicingRightsTransfers.transferId, params.transferId));
  
  if (!transfer) {
    throw new Error('Transfer not found');
  }
  
  await db
    .update(servicingRightsTransfers)
    .set({
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: params.approvedBy,
      updatedAt: new Date(),
    })
    .where(eq(servicingRightsTransfers.transferId, params.transferId));
  
  console.log(`[SecondaryMarket] Approved servicing rights transfer ${params.transferId}`);
  
  return { success: true };
}

/**
 * Complete servicing rights transfer
 */
export async function completeServicingRightsTransfer(transferId: string): Promise<{ success: boolean }> {
  const db = await requireDb();
  
  const [transfer] = await db
    .select()
    .from(servicingRightsTransfers)
    .where(eq(servicingRightsTransfers.transferId, transferId));
  
  if (!transfer) {
    throw new Error('Transfer not found');
  }
  
  if (transfer.status !== 'approved') {
    throw new Error('Transfer must be approved before completion');
  }
  
  await db
    .update(servicingRightsTransfers)
    .set({
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(servicingRightsTransfers.transferId, transferId));
  
  console.log(`[SecondaryMarket] Completed servicing rights transfer ${transferId}`);
  
  return { success: true };
}

/**
 * Get investor performance report
 */
export async function getInvestorPerformanceReport(investorId: string): Promise<any> {
  const db = await requireDb();
  
  const [investor] = await db
    .select()
    .from(investors)
    .where(eq(investors.investorId, investorId));
  
  if (!investor) {
    throw new Error('Investor not found');
  }
  
  // Get investment summary
  const investmentSummary = await db
    .select({
      status: poolInvestments.status,
      count: sql<number>`count(*)::int`,
      totalAmount: sql<number>`sum(${poolInvestments.investmentAmount})::int`,
      totalDistributions: sql<number>`sum(${poolInvestments.totalDistributions})::int`,
    })
    .from(poolInvestments)
    .where(eq(poolInvestments.investorId, investor.id))
    .groupBy(poolInvestments.status);
  
  // Calculate ROI
  const roi =
    investor.totalInvested > 0 ? (investor.totalReturns / investor.totalInvested) * 100 : 0;
  
  return {
    investor: {
      investorId: investor.investorId,
      investorName: investor.investorName,
      investorType: investor.investorType,
      status: investor.status,
    },
    performance: {
      totalInvested: investor.totalInvested,
      totalReturns: investor.totalReturns,
      roi: roi.toFixed(2),
      activeInvestments: investor.activeInvestments,
    },
    investments: {
      summary: investmentSummary,
    },
  };
}
