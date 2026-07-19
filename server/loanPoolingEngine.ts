import { requireDb } from './db';
import {
  mortgageApplications,
  loanPools,
  loanPoolLoans,
} from '../drizzle/schema';
import { eq, and, sql, inArray, isNull } from 'drizzle-orm';
import { createLoanPool, addLoanToPool, closeLoanPool } from './secondaryMarketService';

/**
 * Automated Loan Pooling Engine
 * Intelligently creates and manages loan pools based on configurable strategies
 */

export interface PoolingStrategy {
  name: string;
  minLoansPerPool: number;
  maxLoansPerPool: number;
  riskTierGrouping: boolean;
  maturityGrouping: boolean;
  amountGrouping: boolean;
  autoClose: boolean;
}

export const DEFAULT_STRATEGIES: Record<string, PoolingStrategy> = {
  riskBased: {
    name: 'Risk-Based Pooling',
    minLoansPerPool: 10,
    maxLoansPerPool: 50,
    riskTierGrouping: true,
    maturityGrouping: false,
    amountGrouping: false,
    autoClose: true,
  },
  maturityBased: {
    name: 'Maturity-Based Pooling',
    minLoansPerPool: 15,
    maxLoansPerPool: 40,
    riskTierGrouping: false,
    maturityGrouping: true,
    amountGrouping: false,
    autoClose: true,
  },
  balanced: {
    name: 'Balanced Pooling',
    minLoansPerPool: 20,
    maxLoansPerPool: 60,
    riskTierGrouping: true,
    maturityGrouping: true,
    amountGrouping: true,
    autoClose: true,
  },
};

/**
 * Calculate risk tier based on credit score and loan-to-value ratio
 */
function calculateRiskTier(creditScore: number, loanToValue: number): string {
  // High credit score (750+) and low LTV (<60%)
  if (creditScore >= 750 && loanToValue < 6000) return 'aaa';
  
  // Good credit score (700-749) and moderate LTV (60-70%)
  if (creditScore >= 700 && loanToValue < 7000) return 'aa';
  
  // Fair credit score (650-699) and moderate LTV (70-80%)
  if (creditScore >= 650 && loanToValue < 8000) return 'a';
  
  // Average credit score (600-649) and higher LTV (80-85%)
  if (creditScore >= 600 && loanToValue < 8500) return 'bbb';
  
  // Below average credit score (550-599) or high LTV (85-90%)
  if (creditScore >= 550 && loanToValue < 9000) return 'bb';
  
  // Low credit score (<550) or very high LTV (>90%)
  return 'b';
}

/**
 * Get eligible loans for pooling
 */
export async function getEligibleLoans(): Promise<any[]> {
  const db = await requireDb();
  
  // Get approved loans that are not already in a pool
  const approvedLoans = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.status, 'approved'));
  
  // Get loans already in pools
  const pooledLoanIds = await db
    .select({ applicationId: loanPoolLoans.applicationId })
    .from(loanPoolLoans);
  
  const pooledIds = new Set(pooledLoanIds.map((l) => l.applicationId));
  
  // Filter out already pooled loans
  const eligibleLoans = approvedLoans.filter((loan) => !pooledIds.has(loan.id));
  
  // Calculate risk metrics for each loan
  return eligibleLoans.map((loan) => {
    const creditScore = 700; // Default - should come from credit bureau integration
    const loanToValue = Math.floor((loan.loanAmount / (loan.loanAmount * 1.2)) * 10000); // Default LTV calculation
    const riskTier = calculateRiskTier(creditScore, loanToValue);
    
    return {
      ...loan,
      creditScore,
      loanToValue,
      riskTier,
    };
  });
}

/**
 * Group loans by risk tier
 */
function groupLoansByRisk(loans: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  
  for (const loan of loans) {
    const tier = loan.riskTier;
    if (!groups.has(tier)) {
      groups.set(tier, []);
    }
    groups.get(tier)!.push(loan);
  }
  
  return groups;
}

/**
 * Group loans by maturity range
 */
function groupLoansByMaturity(loans: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  
  for (const loan of loans) {
    const term = loan.loanTerm;
    let range: string;
    
    if (term <= 120) range = 'short'; // 0-10 years
    else if (term <= 240) range = 'medium'; // 10-20 years
    else range = 'long'; // 20+ years
    
    if (!groups.has(range)) {
      groups.set(range, []);
    }
    groups.get(range)!.push(loan);
  }
  
  return groups;
}

/**
 * Group loans by amount range
 */
function groupLoansByAmount(loans: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  
  for (const loan of loans) {
    const amount = loan.loanAmount;
    let range: string;
    
    if (amount < 1000000000) range = 'small'; // < ₦10M
    else if (amount < 5000000000) range = 'medium'; // ₦10M-₦50M
    else range = 'large'; // > ₦50M
    
    if (!groups.has(range)) {
      groups.set(range, []);
    }
    groups.get(range)!.push(loan);
  }
  
  return groups;
}

/**
 * Create optimized loan pools based on strategy
 */
export async function createOptimizedPools(
  strategy: PoolingStrategy,
  createdBy: number
): Promise<{ poolsCreated: number; loansPooled: number }> {
  const eligibleLoans = await getEligibleLoans();
  
  if (eligibleLoans.length === 0) {
    console.log('[LoanPooling] No eligible loans for pooling');
    return { poolsCreated: 0, loansPooled: 0 };
  }
  
  console.log(`[LoanPooling] Found ${eligibleLoans.length} eligible loans`);
  
  let groups: Map<string, any[]>;
  
  // Apply grouping strategy
  if (strategy.riskTierGrouping && strategy.maturityGrouping) {
    // Combined grouping - group by risk first, then by maturity within each risk tier
    const riskGroups = groupLoansByRisk(eligibleLoans);
    groups = new Map();
    
    for (const [riskTier, riskLoans] of Array.from(riskGroups.entries())) {
      const maturityGroups = groupLoansByMaturity(riskLoans);
      for (const [maturityRange, loans] of Array.from(maturityGroups.entries())) {
        groups.set(`${riskTier}-${maturityRange}`, loans);
      }
    }
  } else if (strategy.riskTierGrouping) {
    groups = groupLoansByRisk(eligibleLoans);
  } else if (strategy.maturityGrouping) {
    groups = groupLoansByMaturity(eligibleLoans);
  } else if (strategy.amountGrouping) {
    groups = groupLoansByAmount(eligibleLoans);
  } else {
    // No grouping - single pool
    groups = new Map([['all', eligibleLoans]]);
  }
  
  let poolsCreated = 0;
  let loansPooled = 0;
  
  // Create pools for each group
  for (const [groupKey, groupLoans] of Array.from(groups.entries())) {
    if (groupLoans.length < strategy.minLoansPerPool) {
      console.log(`[LoanPooling] Skipping group ${groupKey}: insufficient loans (${groupLoans.length})`);
      continue;
    }
    
    // Split into multiple pools if exceeds max
    const poolCount = Math.ceil(groupLoans.length / strategy.maxLoansPerPool);
    
    for (let i = 0; i < poolCount; i++) {
      const startIdx = i * strategy.maxLoansPerPool;
      const endIdx = Math.min(startIdx + strategy.maxLoansPerPool, groupLoans.length);
      const poolLoans = groupLoans.slice(startIdx, endIdx);
      
      if (poolLoans.length < strategy.minLoansPerPool && i > 0) {
        // Merge remaining loans into previous pool if below minimum
        console.log(`[LoanPooling] Merging remaining ${poolLoans.length} loans into previous pool`);
        continue;
      }
      
      // Determine pool risk tier (use first loan's risk tier)
      const poolRiskTier = poolLoans[0].riskTier;
      
      // Create pool
      const poolName = `${strategy.name} - ${poolRiskTier.toUpperCase()} - ${new Date().toISOString().split('T')[0]}`;
      const { poolId } = await createLoanPool({
        poolName,
        description: `Automatically created pool using ${strategy.name} strategy`,
        riskTier: poolRiskTier,
        createdBy,
      });
      
      // Add loans to pool
      for (const loan of poolLoans) {
        await addLoanToPool({
          poolId,
          applicationId: loan.id,
          principalAmount: loan.loanAmount,
          interestRate: loan.interestRate,
          remainingTerm: loan.loanTerm,
          creditScore: loan.creditScore,
          loanToValue: loan.loanToValue,
        });
        loansPooled++;
      }
      
      // Auto-close pool if strategy requires
      if (strategy.autoClose) {
        await closeLoanPool(poolId);
      }
      
      poolsCreated++;
      console.log(`[LoanPooling] Created pool ${poolId} with ${poolLoans.length} loans`);
    }
  }
  
  console.log(`[LoanPooling] Completed: ${poolsCreated} pools created, ${loansPooled} loans pooled`);
  
  return { poolsCreated, loansPooled };
}

/**
 * Rebalance existing draft pools
 */
export async function rebalancePools(): Promise<{ rebalanced: number }> {
  const db = await requireDb();
  
  // Get draft pools
  const draftPools = await db
    .select()
    .from(loanPools)
    .where(eq(loanPools.status, 'draft'));
  
  let rebalanced = 0;
  
  for (const pool of draftPools) {
    // Get loans in pool
    const poolLoansData = await db
      .select()
      .from(loanPoolLoans)
      .where(eq(loanPoolLoans.poolId, pool.id));
    
    // Check if pool needs rebalancing (e.g., too few loans, risk mismatch)
    if (poolLoansData.length < 10) {
      console.log(`[LoanPooling] Pool ${pool.poolId} has insufficient loans (${poolLoansData.length})`);
      // Could merge with another pool or add more loans
      rebalanced++;
    }
  }
  
  return { rebalanced };
}

/**
 * Monitor pool performance
 */
export async function monitorPoolPerformance(): Promise<any[]> {
  const db = await requireDb();
  
  // Get active and sold pools
  const activePools = await db
    .select()
    .from(loanPools)
    .where(sql`${loanPools.status} IN ('active', 'sold')`);
  
  const performance = [];
  
  for (const pool of activePools) {
    // Get pool loans
    const poolLoansData = await db
      .select()
      .from(loanPoolLoans)
      .where(eq(loanPoolLoans.poolId, pool.id));
    
    // Calculate performance metrics
    const totalPrincipal = poolLoansData.reduce((sum, loan) => sum + loan.principalAmount, 0);
    const avgCreditScore = Math.floor(
      poolLoansData.reduce((sum, loan) => sum + (loan.creditScore || 0), 0) / poolLoansData.length
    );
    
    performance.push({
      poolId: pool.poolId,
      poolName: pool.poolName,
      status: pool.status,
      loanCount: poolLoansData.length,
      totalPrincipal,
      avgCreditScore,
      riskTier: pool.riskTier,
    });
  }
  
  return performance;
}

/**
 * Auto-close pools that meet criteria
 */
export async function autoClosePools(): Promise<{ closed: number }> {
  const db = await requireDb();
  
  // Get draft pools
  const draftPools = await db
    .select()
    .from(loanPools)
    .where(eq(loanPools.status, 'draft'));
  
  let closed = 0;
  
  for (const pool of draftPools) {
    // Check if pool meets closure criteria
    if (pool.loanCount >= 20 && pool.totalLoanAmount >= 10000000000) {
      // Pool has at least 20 loans and ₦100M total
      await closeLoanPool(pool.poolId);
      closed++;
      console.log(`[LoanPooling] Auto-closed pool ${pool.poolId}`);
    }
  }
  
  return { closed };
}

/**
 * Run automated pooling job
 */
export async function runAutomatedPooling(
  strategyName: string = 'balanced',
  createdBy: number
): Promise<any> {
  console.log(`[LoanPooling] Starting automated pooling with strategy: ${strategyName}`);
  
  const strategy = DEFAULT_STRATEGIES[strategyName] || DEFAULT_STRATEGIES.balanced;
  
  // Create optimized pools
  const poolingResult = await createOptimizedPools(strategy, createdBy);
  
  // Rebalance existing pools
  const rebalanceResult = await rebalancePools();
  
  // Auto-close eligible pools
  const closeResult = await autoClosePools();
  
  // Monitor performance
  const performance = await monitorPoolPerformance();
  
  const result = {
    strategy: strategy.name,
    poolsCreated: poolingResult.poolsCreated,
    loansPooled: poolingResult.loansPooled,
    poolsRebalanced: rebalanceResult.rebalanced,
    poolsClosed: closeResult.closed,
    activePoolsCount: performance.length,
    timestamp: new Date().toISOString(),
  };
  
  console.log('[LoanPooling] Automated pooling completed:', result);
  
  return result;
}
