import { getDb } from './db';
import { sql } from 'drizzle-orm';

export class ExecutiveAnalyticsService {
  /**
   * Get executive KPIs for dashboard
   */
  static async getExecutiveKPIs(startDate: Date, endDate: Date) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const result = await db.execute(sql`
      SELECT 
        COALESCE(SUM(transaction_count), 0) as total_transactions,
        COALESCE(SUM(transaction_volume), 0) as total_volume,
        COALESCE(SUM(parcel_registrations), 0) as total_parcels,
        COALESCE(SUM(verification_requests), 0) as total_verifications,
        COALESCE(SUM(verification_approvals), 0) as total_approvals,
        COALESCE(SUM(verification_rejections), 0) as total_rejections,
        COALESCE(AVG(avg_processing_time_hours), 0) as avg_processing_time,
        COALESCE(SUM(revenue), 0) as total_revenue,
        COALESCE(AVG(active_users), 0) as avg_active_users
      FROM analytics_daily_metrics
      WHERE date >= ${startDate.toISOString().split('T')[0]}
        AND date <= ${endDate.toISOString().split('T')[0]}
    `);

    const row = (result as any)[0];

    // Calculate approval rate
    const totalVerifications = Number(row.total_verifications) || 0;
    const approvalRate = totalVerifications > 0 
      ? (Number(row.total_approvals) / totalVerifications) * 100 
      : 0;

    return {
      totalTransactions: Number(row.total_transactions) || 0,
      totalVolume: Number(row.total_volume) || 0,
      totalParcels: Number(row.total_parcels) || 0,
      totalVerifications,
      totalApprovals: Number(row.total_approvals) || 0,
      totalRejections: Number(row.total_rejections) || 0,
      approvalRate: Math.round(approvalRate * 100) / 100,
      avgProcessingTime: Math.round((Number(row.avg_processing_time) || 0) * 100) / 100,
      totalRevenue: Number(row.total_revenue) || 0,
      avgActiveUsers: Math.round(Number(row.avg_active_users) || 0),
    };
  }

  /**
   * Get KPI trends for comparison
   */
  static async getKPITrends(currentStart: Date, currentEnd: Date, previousStart: Date, previousEnd: Date) {
    const currentKPIs = await this.getExecutiveKPIs(currentStart, currentEnd);
    const previousKPIs = await this.getExecutiveKPIs(previousStart, previousEnd);

    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100 * 100) / 100;
    };

    return {
      current: currentKPIs,
      previous: previousKPIs,
      changes: {
        transactions: calculateChange(currentKPIs.totalTransactions, previousKPIs.totalTransactions),
        volume: calculateChange(currentKPIs.totalVolume, previousKPIs.totalVolume),
        parcels: calculateChange(currentKPIs.totalParcels, previousKPIs.totalParcels),
        verifications: calculateChange(currentKPIs.totalVerifications, previousKPIs.totalVerifications),
        revenue: calculateChange(currentKPIs.totalRevenue, previousKPIs.totalRevenue),
        processingTime: calculateChange(currentKPIs.avgProcessingTime, previousKPIs.avgProcessingTime),
      },
    };
  }

  /**
   * Get daily time series data for charts
   */
  static async getDailyTimeSeries(startDate: Date, endDate: Date) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const result = await db.execute(sql`
      SELECT 
        date,
        transaction_count,
        transaction_volume,
        parcel_registrations,
        verification_requests,
        revenue,
        active_users
      FROM analytics_daily_metrics
      WHERE date >= ${startDate.toISOString().split('T')[0]}
        AND date <= ${endDate.toISOString().split('T')[0]}
      ORDER BY date ASC
    `);

    return (result as any[]).map((row: any) => ({
      date: row.date,
      transactions: Number(row.transaction_count) || 0,
      volume: Number(row.transaction_volume) || 0,
      parcels: Number(row.parcel_registrations) || 0,
      verifications: Number(row.verification_requests) || 0,
      revenue: Number(row.revenue) || 0,
      activeUsers: Number(row.active_users) || 0,
    }));
  }

  /**
   * Predictive analytics - forecast next 30 days using simple linear regression
   */
  static async predictWorkload(daysToPredict: number = 30) {
    // Get last 90 days of data for prediction
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const historicalData = await this.getDailyTimeSeries(startDate, endDate);

    if (historicalData.length < 7) {
      return {
        predictions: [],
        confidence: 0,
        trend: 'insufficient_data',
      };
    }

    // Simple linear regression for transaction count
    const n = historicalData.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    historicalData.forEach((point: any, index: number) => {
      sumX += index;
      sumY += point.transactions;
      sumXY += index * point.transactions;
      sumX2 += index * index;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Generate predictions
    const predictions = [];
    for (let i = 1; i <= daysToPredict; i++) {
      const x = n + i - 1;
      const predicted = Math.max(0, Math.round(slope * x + intercept));
      const date = new Date(endDate);
      date.setDate(date.getDate() + i);
      
      predictions.push({
        date: date.toISOString().split('T')[0],
        predictedTransactions: predicted,
        predictedVerifications: Math.round(predicted * 0.3), // Assume 30% require verification
      });
    }

    // Calculate confidence based on R-squared
    const avgY = sumY / n;
    let ssRes = 0, ssTot = 0;
    historicalData.forEach((point: any, index: number) => {
      const predicted = slope * index + intercept;
      ssRes += Math.pow(point.transactions - predicted, 2);
      ssTot += Math.pow(point.transactions - avgY, 2);
    });

    const rSquared = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;
    const confidence = Math.max(0, Math.min(100, Math.round(rSquared * 100)));

    // Determine trend
    const trend = slope > 5 ? 'increasing' : slope < -5 ? 'decreasing' : 'stable';

    return {
      predictions,
      confidence,
      trend,
      avgDailyTransactions: Math.round(sumY / n),
    };
  }

  /**
   * Get revenue breakdown by transaction type
   */
  static async getRevenueBreakdown(startDate: Date, endDate: Date) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const result = await db.execute(sql`
      SELECT
        transaction_type,
        COUNT(*)::int as count,
        COALESCE(SUM(amount), 0)::bigint as total_amount
      FROM transactions
      WHERE initiated_at >= ${startDate}
        AND initiated_at <= ${endDate}
      GROUP BY transaction_type
      ORDER BY total_amount DESC
    `);

    const byType = (result as any[]).map((row: any) => ({
      type: String(row.transaction_type)
        .split('_')
        .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      amount: Number(row.total_amount) || 0,
      count: Number(row.count) || 0,
    }));

    const total = byType.reduce((sum, item) => sum + item.amount, 0);

    return {
      byType,
      total,
    };
  }

  /**
   * Get system performance metrics
   */
  static async getSystemMetrics(hours: number = 24) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - hours);

    const result = await db.execute(sql`
      SELECT 
        metric_type,
        AVG(metric_value) as avg_value,
        MAX(metric_value) as max_value,
        MIN(metric_value) as min_value,
        COUNT(*) as sample_count
      FROM analytics_system_metrics
      WHERE timestamp >= ${startTime.toISOString()}
      GROUP BY metric_type
    `);

    return (result as any[]).map((row: any) => ({
      type: row.metric_type,
      average: Math.round((Number(row.avg_value) || 0) * 100) / 100,
      max: Math.round((Number(row.max_value) || 0) * 100) / 100,
      min: Math.round((Number(row.min_value) || 0) * 100) / 100,
      samples: Number(row.sample_count) || 0,
    }));
  }
}
