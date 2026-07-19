/**
 * Analytics Service
 * Provides metrics and insights for the analytics dashboard
 */

import { requireDb } from './db';
import {
  activityLogs,
  parcels,
  securityEvents,
  transactions,
  users,
} from '../drizzle/schema';
import { and, desc, gte, lte, sql } from 'drizzle-orm';

type TrendPoint = { label: string; value: number };

type FraudAlert = {
  id: string;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
  timestamp: Date;
};

type AIPrediction =
  | {
      id: number;
      type: 'Property Value';
      parcelId: string;
      predicted: number;
      confidence: number;
      trend: 'up' | 'down' | 'stable';
    }
  | {
      id: number;
      type: 'Fraud Risk';
      transactionId: string;
      riskScore: number;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      trend: 'up' | 'down' | 'stable';
    }
  | {
      id: number;
      type: 'Demand Forecast';
      period: string;
      forecast: number;
      confidence: number;
      trend: 'up' | 'down' | 'stable';
    };

/**
 * Get key metrics for dashboard
 */
export async function getKeyMetrics() {
  const db = await requireDb();


  const [transactionSummary] = await db
    .select({
      totalTransactions: sql<number>`count(*)::int`,
      totalValue: sql<number>`coalesce(sum(${transactions.amount}), 0)::int`,
      pendingApprovals: sql<number>`coalesce(sum(case when ${transactions.status} in ('initiated', 'pending') then 1 else 0 end), 0)::int`,
      avgProcessingTime: sql<number>`coalesce(avg(case when ${transactions.completedAt} is not null then extract(epoch from (${transactions.completedAt} - ${transactions.initiatedAt})) / 86400.0 end), 0)::float`,
    })
    .from(transactions);

  const [userSummary] = await db
    .select({
      activeUsers: sql<number>`count(*)::int`,
    })
    .from(users);

  const [fraudSummary] = await db
    .select({
      fraudAlerts: sql<number>`count(*)::int`,
    })
    .from(securityEvents)
    .where(sql`${securityEvents.severity} in ('high', 'critical') and ${securityEvents.resolvedAt} is null`);

  return {
    totalTransactions: transactionSummary?.totalTransactions ?? 0,
    totalValue: transactionSummary?.totalValue ?? 0,
    activeUsers: userSummary?.activeUsers ?? 0,
    pendingApprovals: transactionSummary?.pendingApprovals ?? 0,
    fraudAlerts: fraudSummary?.fraudAlerts ?? 0,
    avgProcessingTime: Number((transactionSummary?.avgProcessingTime ?? 0).toFixed(2)),
  };
}

/**
 * Get transaction trend data
 */
export async function getTransactionTrend(startDate: Date, endDate: Date) {
  const db = await requireDb();


  const rows = await db
    .select({
      bucket: sql<string>`to_char(date_trunc('month', ${transactions.createdAt}), 'YYYY-MM')`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(and(gte(transactions.createdAt, startDate), lte(transactions.createdAt, endDate)))
    .groupBy(sql`date_trunc('month', ${transactions.createdAt})`)
    .orderBy(sql`date_trunc('month', ${transactions.createdAt})`);

  const filled = fillMonthlySeries(startDate, endDate, rows.map((row) => ({ label: row.bucket, value: row.count })));
  return {
    labels: filled.map((point) => point.label),
    values: filled.map((point) => point.value),
  };
}

/**
 * Get property value distribution
 */
export async function getPropertyValueDistribution() {
  const db = await requireDb();


  const rows = await db
    .select({
      range: sql<string>`case
        when coalesce(nullif(${parcels.metadata}->>'marketValue', '')::numeric, 0) < 10000000 then '<₦10M'
        when coalesce(nullif(${parcels.metadata}->>'marketValue', '')::numeric, 0) < 50000000 then '₦10M-₦50M'
        when coalesce(nullif(${parcels.metadata}->>'marketValue', '')::numeric, 0) < 100000000 then '₦50M-₦100M'
        when coalesce(nullif(${parcels.metadata}->>'marketValue', '')::numeric, 0) < 500000000 then '₦100M-₦500M'
        else '>₦500M'
      end`,
      count: sql<number>`count(*)::int`,
    })
    .from(parcels)
    .groupBy(sql`1`);

  const orderedRanges = ['<₦10M', '₦10M-₦50M', '₦50M-₦100M', '₦100M-₦500M', '>₦500M'];
  const countMap = new Map(rows.map((row) => [row.range, row.count]));

  return {
    ranges: orderedRanges,
    counts: orderedRanges.map((range) => countMap.get(range) ?? 0),
  };
}

/**
 * Get transaction type breakdown
 */
export async function getTransactionTypeBreakdown() {
  const db = await requireDb();


  const rows = await db
    .select({
      type: transactions.transactionType,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .groupBy(transactions.transactionType)
    .orderBy(desc(sql`count(*)`));

  return {
    types: rows.map((row) => row.type),
    counts: rows.map((row) => row.count),
  };
}

/**
 * Get revenue trend with forecast
 */
export async function getRevenueTrend(startDate: Date, endDate: Date) {
  const db = await requireDb();


  const rows = await db
    .select({
      bucket: sql<string>`to_char(date_trunc('month', ${transactions.createdAt}), 'YYYY-MM')`,
      revenue: sql<number>`coalesce(sum(case when ${transactions.status} = 'completed' then ${transactions.amount} else 0 end), 0)::int`,
    })
    .from(transactions)
    .where(and(gte(transactions.createdAt, startDate), lte(transactions.createdAt, endDate)))
    .groupBy(sql`date_trunc('month', ${transactions.createdAt})`)
    .orderBy(sql`date_trunc('month', ${transactions.createdAt})`);

  const filled = fillMonthlySeries(startDate, endDate, rows.map((row) => ({ label: row.bucket, value: row.revenue })));
  const revenue = filled.map((point) => point.value);
  const forecast = buildRevenueForecast(revenue, 3);

  return {
    labels: filled.map((point) => point.label),
    revenue,
    forecast,
  };
}

/**
 * Get user activity metrics
 */
export async function getUserActivity(startDate: Date, endDate: Date) {
  const db = await requireDb();


  const activeRows = await db
    .select({
      bucket: sql<string>`to_char(date_trunc('day', ${activityLogs.createdAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(distinct ${activityLogs.userId})::int`,
    })
    .from(activityLogs)
    .where(and(gte(activityLogs.createdAt, startDate), lte(activityLogs.createdAt, endDate)))
    .groupBy(sql`date_trunc('day', ${activityLogs.createdAt})`)
    .orderBy(sql`date_trunc('day', ${activityLogs.createdAt})`);

  const newUserRows = await db
    .select({
      bucket: sql<string>`to_char(date_trunc('day', ${users.createdAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(users)
    .where(and(gte(users.createdAt, startDate), lte(users.createdAt, endDate)))
    .groupBy(sql`date_trunc('day', ${users.createdAt})`)
    .orderBy(sql`date_trunc('day', ${users.createdAt})`);

  const labels = enumerateDays(startDate, endDate);
  const activeMap = new Map(activeRows.map((row) => [row.bucket, row.count]));
  const newUserMap = new Map(newUserRows.map((row) => [row.bucket, row.count]));

  return {
    labels,
    activeUsers: labels.map((label) => activeMap.get(label) ?? 0),
    newUsers: labels.map((label) => newUserMap.get(label) ?? 0),
  };
}

/**
 * Get fraud alerts
 */
export async function getFraudAlerts(limit: number = 10): Promise<FraudAlert[]> {
  const db = await requireDb();


  const rows = await db
    .select({
      id: securityEvents.id,
      severity: securityEvents.severity,
      description: securityEvents.description,
      metadata: securityEvents.metadata,
      createdAt: securityEvents.createdAt,
    })
    .from(securityEvents)
    .where(sql`${securityEvents.severity} in ('medium', 'high', 'critical')`)
    .orderBy(desc(securityEvents.createdAt))
    .limit(limit);

  return rows.map((row) => {
    const riskLevel = normalizeRiskLevel(row.severity);
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const metadataReasons = Array.isArray(metadata.reasons)
      ? metadata.reasons.filter((item): item is string => typeof item === 'string')
      : [];

    return {
      id: `SE-${row.id}`,
      riskScore: levelToRiskScore(riskLevel),
      riskLevel,
      reasons: metadataReasons.length > 0 ? metadataReasons : [row.description],
      timestamp: row.createdAt,
    };
  });
}

/**
 * Get AI predictions
 */
export async function getAIPredictions(limit: number = 10): Promise<AIPrediction[]> {
  const db = await requireDb();


  const [parcelPrediction] = await db
    .select({
      parcelId: parcels.parcelId,
      predicted: sql<number>`coalesce(nullif(${parcels.metadata}->>'marketValue', '')::int, 0)`,
      area: parcels.area,
      updatedAt: parcels.updatedAt,
    })
    .from(parcels)
    .orderBy(desc(parcels.updatedAt))
    .limit(1);

  const [fraudPrediction] = await db
    .select({
      transactionId: transactions.transactionId,
      amount: transactions.amount,
      status: transactions.status,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .orderBy(desc(transactions.createdAt))
    .limit(1);

  const demandRows = await db
    .select({
      bucket: sql<string>`to_char(date_trunc('month', ${transactions.createdAt}), 'YYYY-MM')`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .groupBy(sql`date_trunc('month', ${transactions.createdAt})`)
    .orderBy(sql`date_trunc('month', ${transactions.createdAt}) desc`)
    .limit(6);

  const monthlyCounts = demandRows.map((row) => row.count).reverse();
  const demandForecast = buildRevenueForecast(monthlyCounts, 1)[0] ?? 0;

  const predictions: AIPrediction[] = [];

  if (parcelPrediction) {
    const baseValue = parcelPrediction.predicted > 0
      ? parcelPrediction.predicted
      : Math.max((parcelPrediction.area ?? 0) * 12000, 5000000);
    predictions.push({
      id: 1,
      type: 'Property Value',
      parcelId: parcelPrediction.parcelId,
      predicted: Math.round(baseValue * 1.04),
      confidence: baseValue > 0 ? 0.81 : 0.62,
      trend: 'up',
    });
  }

  if (fraudPrediction) {
    const riskScore = Math.min(0.95, Math.max(0.2, fraudScoreFromTransactionAmount(fraudPrediction.amount)));
    predictions.push({
      id: 2,
      type: 'Fraud Risk',
      transactionId: fraudPrediction.transactionId,
      riskScore,
      riskLevel: riskScore >= 0.85 ? 'critical' : riskScore >= 0.7 ? 'high' : riskScore >= 0.45 ? 'medium' : 'low',
      trend: fraudPrediction.status === 'pending' ? 'up' : 'stable',
    });
  }

  predictions.push({
    id: 3,
    type: 'Demand Forecast',
    period: 'Next Month',
    forecast: demandForecast,
    confidence: monthlyCounts.length >= 3 ? 0.78 : 0.58,
    trend: demandForecast >= (monthlyCounts.at(-1) ?? 0) ? 'up' : 'down',
  });

  return predictions.slice(0, limit);
}

/**
 * Export analytics data to CSV
 */
export async function exportAnalyticsData(
  dataType: 'transactions' | 'properties' | 'users',
  startDate: Date,
  endDate: Date
): Promise<string> {
  const db = await requireDb();


  if (dataType === 'transactions') {
    const rows = await db
      .select({
        date: transactions.createdAt,
        transactionId: transactions.transactionId,
        type: transactions.transactionType,
        amount: transactions.amount,
        status: transactions.status,
      })
      .from(transactions)
      .where(and(gte(transactions.createdAt, startDate), lte(transactions.createdAt, endDate)))
      .orderBy(desc(transactions.createdAt));

    return toCsv(
      ['Date', 'Transaction ID', 'Type', 'Amount', 'Status'],
      rows.map((row) => [formatDateTime(row.date), row.transactionId, row.type, String(row.amount), row.status])
    );
  }

  if (dataType === 'properties') {
    const rows = await db
      .select({
        parcelId: parcels.parcelId,
        ownerId: parcels.ownerId,
        address: parcels.address,
        city: parcels.city,
        state: parcels.state,
        status: parcels.status,
      })
      .from(parcels)
      .where(and(gte(parcels.createdAt, startDate), lte(parcels.createdAt, endDate)))
      .orderBy(desc(parcels.createdAt));

    return toCsv(
      ['Parcel ID', 'Owner ID', 'Address', 'City', 'State', 'Status'],
      rows.map((row) => [row.parcelId, String(row.ownerId), row.address ?? '', row.city ?? '', row.state ?? '', row.status])
    );
  }

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(gte(users.createdAt, startDate), lte(users.createdAt, endDate)))
    .orderBy(desc(users.createdAt));

  return toCsv(
    ['User ID', 'Name', 'Email', 'Role', 'Joined Date'],
    rows.map((row) => [
      String(row.userId),
      [row.firstName, row.lastName].filter(Boolean).join(' ').trim(),
      row.email,
      row.role,
      formatDateTime(row.createdAt),
    ])
  );
}

function fillMonthlySeries(startDate: Date, endDate: Date, points: TrendPoint[]): TrendPoint[] {
  const pointMap = new Map(points.map((point) => [point.label, point.value]));
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
  const filled: TrendPoint[] = [];

  while (cursor <= end) {
    const label = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
    filled.push({ label, value: pointMap.get(label) ?? 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return filled;
}

function enumerateDays(startDate: Date, endDate: Date): string[] {
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  const labels: string[] = [];

  while (cursor <= end) {
    labels.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return labels;
}

function buildRevenueForecast(values: number[], periods: number): number[] {
  if (values.length === 0) {
    return Array.from({ length: periods }, () => 0);
  }

  const lookback = values.slice(-3);
  const baseline = Math.round(lookback.reduce((sum, value) => sum + value, 0) / lookback.length);
  const slope = lookback.length > 1 ? Math.round((lookback.at(-1)! - lookback[0]) / (lookback.length - 1)) : 0;

  return Array.from({ length: periods }, (_, index) => Math.max(0, baseline + slope * (index + 1)));
}

function fraudScoreFromTransactionAmount(amount: number): number {
  if (amount >= 100000000) return 0.9;
  if (amount >= 50000000) return 0.76;
  if (amount >= 10000000) return 0.58;
  return 0.34;
}

function normalizeRiskLevel(level: string): 'low' | 'medium' | 'high' | 'critical' {
  if (level === 'critical' || level === 'high' || level === 'medium') {
    return level;
  }
  return 'low';
}

function levelToRiskScore(level: 'low' | 'medium' | 'high' | 'critical'): number {
  switch (level) {
    case 'critical':
      return 0.93;
    case 'high':
      return 0.78;
    case 'medium':
      return 0.56;
    default:
      return 0.28;
  }
}

function formatDateTime(value: Date | null | undefined): string {
  return value ? new Date(value).toISOString() : '';
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(headers: string[], rows: string[][]): string {
  return [headers.join(','), ...rows.map((row) => row.map((value) => escapeCsv(value ?? '')).join(','))].join('\n');
}
