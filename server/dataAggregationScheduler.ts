import postgres from 'postgres';

/**
 * Data Aggregation Scheduler
 * Runs daily to aggregate analytics metrics from various sources
 */

const connectionString = process.env.POSTGRES_URL || 'postgresql://idlr_user:idlr_password@localhost:5432/idlr_pts';
const sql = postgres(connectionString);

export interface DailyMetrics {
  date: string;
  totalTransactions: number;
  totalRevenue: number;
  totalParcels: number;
  newParcels: number;
  verificationRequests: number;
  verificationsApproved: number;
  verificationsRejected: number;
  avgProcessingTimeHours: number;
  activeUsers: number;
  newUsers: number;
}

/**
 * Aggregate transaction data for a given date
 */
async function aggregateTransactionData(date: string): Promise<{ count: number; revenue: number }> {
  try {
    const result = await sql`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as revenue
      FROM transactions
      WHERE DATE("createdAt") = ${date}
    `;
    
    return {
      count: parseInt(result[0]?.count as string || '0'),
      revenue: parseFloat(result[0]?.revenue as string || '0'),
    };
  } catch (error) {
    console.error('[DataAggregation] Error aggregating transaction data:', error);
    return { count: 0, revenue: 0 };
  }
}

/**
 * Aggregate parcel data for a given date
 */
async function aggregateParcelData(date: string): Promise<{ total: number; new: number }> {
  try {
    const totalResult = await sql`
      SELECT COUNT(*) as count
      FROM parcels
      WHERE DATE("createdAt") <= ${date}
    `;
    
    const newResult = await sql`
      SELECT COUNT(*) as count
      FROM parcels
      WHERE DATE("createdAt") = ${date}
    `;
    
    return {
      total: parseInt(totalResult[0]?.count as string || '0'),
      new: parseInt(newResult[0]?.count as string || '0'),
    };
  } catch (error) {
    console.error('[DataAggregation] Error aggregating parcel data:', error);
    return { total: 0, new: 0 };
  }
}

/**
 * Aggregate verification data for a given date
 */
async function aggregateVerificationData(date: string): Promise<{
  requests: number;
  approved: number;
  rejected: number;
  avgProcessingHours: number;
}> {
  try {
    const result = await sql`
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        AVG(
          CASE 
            WHEN status IN ('approved', 'rejected') AND "updated_at" IS NOT NULL 
            THEN EXTRACT(EPOCH FROM ("updated_at" - "created_at")) / 3600 
            ELSE NULL 
          END
        ) as avg_processing_hours
      FROM verification_requests
      WHERE DATE("created_at") = ${date}
    `;
    
    const row = result[0];
    return {
      requests: parseInt(row?.total_requests as string || '0'),
      approved: parseInt(row?.approved as string || '0'),
      rejected: parseInt(row?.rejected as string || '0'),
      avgProcessingHours: parseFloat(row?.avg_processing_hours as string || '0'),
    };
  } catch (error) {
    console.error('[DataAggregation] Error aggregating verification data:', error);
    return { requests: 0, approved: 0, rejected: 0, avgProcessingHours: 0 };
  }
}

/**
 * Aggregate user data for a given date
 */
async function aggregateUserData(date: string): Promise<{ active: number; new: number }> {
  try {
    const activeResult = await sql`
      SELECT COUNT(DISTINCT "userId") as count
      FROM activity_logs
      WHERE DATE("createdAt") = ${date}
    `;
    
    const newResult = await sql`
      SELECT COUNT(*) as count
      FROM users
      WHERE DATE("createdAt") = ${date}
    `;
    
    return {
      active: parseInt(activeResult[0]?.count as string || '0'),
      new: parseInt(newResult[0]?.count as string || '0'),
    };
  } catch (error) {
    console.error('[DataAggregation] Error aggregating user data:', error);
    return { active: 0, new: 0 };
  }
}

/**
 * Aggregate all metrics for a given date and store in analytics_daily_metrics
 */
export async function aggregateDailyMetrics(date: string): Promise<DailyMetrics> {
  console.log(`[DataAggregation] Starting aggregation for date: ${date}`);
  
  const [transactions, parcels, verifications, users] = await Promise.all([
    aggregateTransactionData(date),
    aggregateParcelData(date),
    aggregateVerificationData(date),
    aggregateUserData(date),
  ]);
  
  const metrics: DailyMetrics = {
    date,
    totalTransactions: transactions.count,
    totalRevenue: transactions.revenue,
    totalParcels: parcels.total,
    newParcels: parcels.new,
    verificationRequests: verifications.requests,
    verificationsApproved: verifications.approved,
    verificationsRejected: verifications.rejected,
    avgProcessingTimeHours: verifications.avgProcessingHours,
    activeUsers: users.active,
    newUsers: users.new,
  };
  
  // Store in database
  try {
    await sql`
      INSERT INTO analytics_daily_metrics (
        date, total_transactions, total_revenue, total_parcels, new_parcels,
        verification_requests, verifications_approved, verifications_rejected,
        avg_processing_time_hours, active_users, new_users
      ) VALUES (
        ${date}, ${metrics.totalTransactions}, ${metrics.totalRevenue}, 
        ${metrics.totalParcels}, ${metrics.newParcels},
        ${metrics.verificationRequests}, ${metrics.verificationsApproved}, 
        ${metrics.verificationsRejected}, ${metrics.avgProcessingTimeHours},
        ${metrics.activeUsers}, ${metrics.newUsers}
      )
      ON CONFLICT (date) DO UPDATE SET
        total_transactions = EXCLUDED.total_transactions,
        total_revenue = EXCLUDED.total_revenue,
        total_parcels = EXCLUDED.total_parcels,
        new_parcels = EXCLUDED.new_parcels,
        verification_requests = EXCLUDED.verification_requests,
        verifications_approved = EXCLUDED.verifications_approved,
        verifications_rejected = EXCLUDED.verifications_rejected,
        avg_processing_time_hours = EXCLUDED.avg_processing_time_hours,
        active_users = EXCLUDED.active_users,
        new_users = EXCLUDED.new_users,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    console.log(`[DataAggregation] Successfully aggregated metrics for ${date}`);
  } catch (error) {
    console.error('[DataAggregation] Error storing metrics:', error);
    throw error;
  }
  
  return metrics;
}

/**
 * Run daily aggregation (called by cron job)
 */
export async function runDailyAggregation(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  
  try {
    await aggregateDailyMetrics(dateStr);
  } catch (error) {
    console.error('[DataAggregation] Daily aggregation failed:', error);
  }
}

/**
 * Backfill historical data
 */
export async function backfillMetrics(startDate: string, endDate: string): Promise<number> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateStr = date.toISOString().split('T')[0];
    try {
      await aggregateDailyMetrics(dateStr);
      count++;
    } catch (error) {
      console.error(`[DataAggregation] Failed to backfill ${dateStr}:`, error);
    }
  }
  
  console.log(`[DataAggregation] Backfilled ${count} days of metrics`);
  return count;
}

/**
 * Start the daily aggregation scheduler (runs at midnight)
 */
export function startAggregationScheduler(): void {
  // Run immediately on startup for yesterday
  runDailyAggregation();
  
  // Schedule daily at midnight
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    runDailyAggregation();
    // Then run every 24 hours
    setInterval(runDailyAggregation, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
  
  console.log('[DataAggregation] Scheduler started, next run at midnight');
}
