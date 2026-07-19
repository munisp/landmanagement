/**
 * Verification Analytics Service
 * Provides analytics and metrics for parcel verification workflow
 */

import { requireDb } from './db';
import { verificationRequests, users } from '../drizzle/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { listVerificationAnalyticsRequests } from './verificationAnalyticsRepository';

export interface VerificationMetrics {
  totalRequests: number;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  approvalRate: number;
  rejectionRate: number;
  averageProcessingTime: number; // in hours
}

export interface ReviewerPerformance {
  reviewerId: number;
  reviewerName: string | null;
  totalReviewed: number;
  approved: number;
  rejected: number;
  approvalRate: number;
  averageProcessingTime: number; // in hours
}

export interface BottleneckAnalysis {
  status: string;
  count: number;
  averageAge: number; // in hours
  oldestRequest: {
    id: number;
    parcelId: string;
    age: number; // in hours
  } | null;
}

export interface TrendData {
  date: string;
  submitted: number;
  approved: number;
  rejected: number;
}

interface OfflineVerificationRecord {
  id: number;
  parcelId: string;
  requesterId: number;
  reviewerId: number | null;
  reviewerName: string | null;
  status: 'submitted' | 'under_review' | 'approved' | 'rejected';
  createdAt: Date;
  submittedAt: Date;
  reviewedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
}

function withinRange(date: Date, start: Date, end: Date) {
  return date >= start && date <= end;
}

function getDateRange(startDate?: Date, endDate?: Date) {
  return {
    start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    end: endDate || new Date(),
  };
}

async function toOfflineRecords(): Promise<OfflineVerificationRecord[]> {
  return (await listVerificationAnalyticsRequests()).map((request) => ({
    ...request,
    createdAt: new Date(request.createdAt),
    submittedAt: new Date(request.submittedAt),
    reviewedAt: request.reviewedAt ? new Date(request.reviewedAt) : null,
    approvedAt: request.approvedAt ? new Date(request.approvedAt) : null,
    rejectedAt: request.rejectedAt ? new Date(request.rejectedAt) : null,
  }));
}

function getProcessingHours(record: OfflineVerificationRecord) {
  const end = record.approvedAt ?? record.rejectedAt;
  if (!end) return null;
  return (end.getTime() - record.submittedAt.getTime()) / (1000 * 60 * 60);
}

function formatTrendKey(date: Date, interval: 'day' | 'week' | 'month') {
  if (interval === 'month') {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  if (interval === 'week') {
    const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7));
    return `${tmp.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
  }

  return date.toISOString().slice(0, 10);
}

async function getOfflineMetrics(startDate?: Date, endDate?: Date): Promise<VerificationMetrics> {
  const { start, end } = getDateRange(startDate, endDate);
  const requests = (await toOfflineRecords()).filter((record) => withinRange(record.createdAt, start, end));

  const metrics: VerificationMetrics = {
    totalRequests: requests.length,
    approvedCount: 0,
    rejectedCount: 0,
    pendingCount: 0,
    approvalRate: 0,
    rejectionRate: 0,
    averageProcessingTime: 0,
  };

  let processedHours = 0;
  let processedCount = 0;

  for (const request of requests) {
    if (request.status === 'approved') {
      metrics.approvedCount += 1;
      const hours = getProcessingHours(request);
      if (hours != null) {
        processedHours += hours;
        processedCount += 1;
      }
    } else if (request.status === 'rejected') {
      metrics.rejectedCount += 1;
      const hours = getProcessingHours(request);
      if (hours != null) {
        processedHours += hours;
        processedCount += 1;
      }
    } else {
      metrics.pendingCount += 1;
    }
  }

  const completed = metrics.approvedCount + metrics.rejectedCount;
  if (completed > 0) {
    metrics.approvalRate = (metrics.approvedCount / completed) * 100;
    metrics.rejectionRate = (metrics.rejectedCount / completed) * 100;
  }

  if (processedCount > 0) {
    metrics.averageProcessingTime = processedHours / processedCount;
  }

  return metrics;
}

async function getOfflineReviewerPerformance(startDate?: Date, endDate?: Date): Promise<ReviewerPerformance[]> {
  const { start, end } = getDateRange(startDate, endDate);
  const requests = (await toOfflineRecords()).filter((record) => {
    const inRange = withinRange(record.createdAt, start, end);
    return inRange && !!record.reviewerId && (record.status === 'approved' || record.status === 'rejected');
  });

  const reviewerMap = new Map<number, ReviewerPerformance>();
  const timeAccumulator = new Map<number, number>();

  for (const request of requests) {
    const reviewerId = request.reviewerId!;
    if (!reviewerMap.has(reviewerId)) {
      reviewerMap.set(reviewerId, {
        reviewerId,
        reviewerName: request.reviewerName,
        totalReviewed: 0,
        approved: 0,
        rejected: 0,
        approvalRate: 0,
        averageProcessingTime: 0,
      });
      timeAccumulator.set(reviewerId, 0);
    }

    const reviewer = reviewerMap.get(reviewerId)!;
    reviewer.totalReviewed += 1;
    if (request.status === 'approved') reviewer.approved += 1;
    if (request.status === 'rejected') reviewer.rejected += 1;
    const hours = getProcessingHours(request);
    if (hours != null) {
      timeAccumulator.set(reviewerId, (timeAccumulator.get(reviewerId) ?? 0) + hours);
    }
  }

  return Array.from(reviewerMap.values())
    .map((reviewer) => ({
      ...reviewer,
      approvalRate: reviewer.totalReviewed > 0 ? (reviewer.approved / reviewer.totalReviewed) * 100 : 0,
      averageProcessingTime: reviewer.totalReviewed > 0 ? (timeAccumulator.get(reviewer.reviewerId) ?? 0) / reviewer.totalReviewed : 0,
    }))
    .sort((a, b) => b.totalReviewed - a.totalReviewed);
}

async function getOfflineBottleneckAnalysis(): Promise<BottleneckAnalysis[]> {
  const now = Date.now();
  const requests = (await toOfflineRecords()).filter((record) => record.status === 'submitted' || record.status === 'under_review');
  const grouped = new Map<string, OfflineVerificationRecord[]>();

  for (const request of requests) {
    const bucket = grouped.get(request.status) ?? [];
    bucket.push(request);
    grouped.set(request.status, bucket);
  }

  return Array.from(grouped.entries()).map(([status, items]) => {
    const ages = items.map((item) => (now - item.createdAt.getTime()) / (1000 * 60 * 60));
    const oldest = items.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null;
    return {
      status,
      count: items.length,
      averageAge: ages.reduce((sum, age) => sum + age, 0) / Math.max(ages.length, 1),
      oldestRequest: oldest
        ? {
            id: oldest.id,
            parcelId: oldest.parcelId,
            age: (now - oldest.createdAt.getTime()) / (1000 * 60 * 60),
          }
        : null,
    };
  }).sort((a, b) => b.averageAge - a.averageAge);
}

async function getOfflineVerificationTrends(startDate?: Date, endDate?: Date, interval: 'day' | 'week' | 'month' = 'day'): Promise<TrendData[]> {
  const { start, end } = getDateRange(startDate, endDate);
  const requests = (await toOfflineRecords()).filter((record) => withinRange(record.createdAt, start, end));
  const grouped = new Map<string, TrendData>();

  for (const request of requests) {
    const key = formatTrendKey(request.createdAt, interval);
    const current = grouped.get(key) ?? { date: key, submitted: 0, approved: 0, rejected: 0 };
    if (request.status === 'approved') current.approved += 1;
    else if (request.status === 'rejected') current.rejected += 1;
    else current.submitted += 1;
    grouped.set(key, current);
  }

  return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function getOfflineProcessingTimeDistribution(startDate?: Date, endDate?: Date): Promise<{ bucket: string; count: number }[]> {
  const { start, end } = getDateRange(startDate, endDate);
  const requests = (await toOfflineRecords()).filter((record) => withinRange(record.createdAt, start, end) && (record.status === 'approved' || record.status === 'rejected'));

  const distribution = new Map<string, number>([
    ['< 1 day', 0],
    ['1-3 days', 0],
    ['3-7 days', 0],
    ['1-2 weeks', 0],
    ['> 2 weeks', 0],
  ]);

  for (const request of requests) {
    const hours = getProcessingHours(request) ?? 0;
    const bucket = hours < 24 ? '< 1 day' : hours < 72 ? '1-3 days' : hours < 168 ? '3-7 days' : hours < 336 ? '1-2 weeks' : '> 2 weeks';
    distribution.set(bucket, (distribution.get(bucket) ?? 0) + 1);
  }

  return Array.from(distribution.entries()).map(([bucket, count]) => ({ bucket, count }));
}

/**
 * Get verification metrics for a time period
 */
export async function getVerificationMetrics(startDate?: Date, endDate?: Date): Promise<VerificationMetrics> {
  const db = await requireDb();

  const { start, end } = getDateRange(startDate, endDate);

  const result = await db
    .select({
      status: verificationRequests.status,
      count: sql<number>`count(*)`,
      avgProcessingTime: sql<number>`avg(EXTRACT(EPOCH FROM (COALESCE(${verificationRequests.approvedAt}, ${verificationRequests.rejectedAt}, NOW()) - ${verificationRequests.submittedAt})) / 3600)`,
    })
    .from(verificationRequests)
    .where(and(gte(verificationRequests.createdAt, start), lte(verificationRequests.createdAt, end)))
    .groupBy(verificationRequests.status);

  const metrics: VerificationMetrics = {
    totalRequests: 0,
    approvedCount: 0,
    rejectedCount: 0,
    pendingCount: 0,
    approvalRate: 0,
    rejectionRate: 0,
    averageProcessingTime: 0,
  };

  let totalProcessingTime = 0;
  let processedCount = 0;

  for (const row of result) {
    const count = Number(row.count);
    const avgTime = Number(row.avgProcessingTime || 0);
    metrics.totalRequests += count;
    if (row.status === 'approved') {
      metrics.approvedCount = count;
      totalProcessingTime += avgTime * count;
      processedCount += count;
    } else if (row.status === 'rejected') {
      metrics.rejectedCount = count;
      totalProcessingTime += avgTime * count;
      processedCount += count;
    } else if (row.status === 'submitted' || row.status === 'under_review') {
      metrics.pendingCount += count;
    }
  }

  const completedCount = metrics.approvedCount + metrics.rejectedCount;
  if (completedCount > 0) {
    metrics.approvalRate = (metrics.approvedCount / completedCount) * 100;
    metrics.rejectionRate = (metrics.rejectedCount / completedCount) * 100;
  }

  if (processedCount > 0) {
    metrics.averageProcessingTime = totalProcessingTime / processedCount;
  }

  return metrics;
}

export async function getReviewerPerformance(startDate?: Date, endDate?: Date): Promise<ReviewerPerformance[]> {
  const db = await requireDb();

  const { start, end } = getDateRange(startDate, endDate);

  const result = await db
    .select({
      reviewerId: verificationRequests.reviewerId,
      reviewerName: users.name,
      status: verificationRequests.status,
      count: sql<number>`count(*)`,
      avgProcessingTime: sql<number>`avg(EXTRACT(EPOCH FROM (COALESCE(${verificationRequests.approvedAt}, ${verificationRequests.rejectedAt}) - ${verificationRequests.submittedAt})) / 3600)`,
    })
    .from(verificationRequests)
    .leftJoin(users, eq(verificationRequests.reviewerId, users.id))
    .where(
      and(
        sql`${verificationRequests.reviewerId} IS NOT NULL`,
        sql`${verificationRequests.status} IN ('approved', 'rejected')`,
        gte(verificationRequests.createdAt, start),
        lte(verificationRequests.createdAt, end),
      ),
    )
    .groupBy(verificationRequests.reviewerId, users.name, verificationRequests.status);

  const reviewerMap = new Map<number, ReviewerPerformance>();

  for (const row of result) {
    const reviewerId = row.reviewerId!;
    const count = Number(row.count);
    const avgTime = Number(row.avgProcessingTime || 0);
    if (!reviewerMap.has(reviewerId)) {
      reviewerMap.set(reviewerId, {
        reviewerId,
        reviewerName: row.reviewerName,
        totalReviewed: 0,
        approved: 0,
        rejected: 0,
        approvalRate: 0,
        averageProcessingTime: 0,
      });
    }

    const reviewer = reviewerMap.get(reviewerId)!;
    reviewer.totalReviewed += count;
    if (row.status === 'approved') reviewer.approved = count;
    else if (row.status === 'rejected') reviewer.rejected = count;
    reviewer.averageProcessingTime += avgTime * count;
  }

  return Array.from(reviewerMap.values())
    .map((reviewer) => ({
      ...reviewer,
      approvalRate: reviewer.totalReviewed > 0 ? (reviewer.approved / reviewer.totalReviewed) * 100 : 0,
      averageProcessingTime: reviewer.totalReviewed > 0 ? reviewer.averageProcessingTime / reviewer.totalReviewed : 0,
    }))
    .sort((a, b) => b.totalReviewed - a.totalReviewed);
}

export async function getBottleneckAnalysis(): Promise<BottleneckAnalysis[]> {
  const db = await requireDb();

  const result = await db
    .select({
      status: verificationRequests.status,
      count: sql<number>`count(*)`,
      avgAge: sql<number>`avg(EXTRACT(EPOCH FROM (NOW() - ${verificationRequests.createdAt})) / 3600)`,
    })
    .from(verificationRequests)
    .where(sql`${verificationRequests.status} IN ('submitted', 'under_review')`)
    .groupBy(verificationRequests.status);

  const bottlenecks: BottleneckAnalysis[] = [];
  for (const row of result) {
    const [oldest] = await db
      .select({ id: verificationRequests.id, parcelId: verificationRequests.parcelId, createdAt: verificationRequests.createdAt })
      .from(verificationRequests)
      .where(eq(verificationRequests.status, row.status as any))
      .orderBy(verificationRequests.createdAt)
      .limit(1);

    bottlenecks.push({
      status: row.status,
      count: Number(row.count),
      averageAge: Number(row.avgAge || 0),
      oldestRequest: oldest
        ? {
            id: oldest.id,
            parcelId: oldest.parcelId,
            age: (Date.now() - oldest.createdAt.getTime()) / (1000 * 60 * 60),
          }
        : null,
    });
  }

  return bottlenecks.sort((a, b) => b.averageAge - a.averageAge);
}

export async function getVerificationTrends(startDate?: Date, endDate?: Date, interval: 'day' | 'week' | 'month' = 'day'): Promise<TrendData[]> {
  const db = await requireDb();

  const { start, end } = getDateRange(startDate, endDate);
  let dateFormat = 'YYYY-MM-DD';
  if (interval === 'week') dateFormat = 'YYYY-IW';
  if (interval === 'month') dateFormat = 'YYYY-MM';

  const result = await db.execute(sql`
    SELECT
      TO_CHAR(${verificationRequests.createdAt}, ${dateFormat}) as date,
      COUNT(*) FILTER (WHERE ${verificationRequests.status} = 'submitted' OR ${verificationRequests.status} = 'under_review') as submitted,
      COUNT(*) FILTER (WHERE ${verificationRequests.status} = 'approved') as approved,
      COUNT(*) FILTER (WHERE ${verificationRequests.status} = 'rejected') as rejected
    FROM ${verificationRequests}
    WHERE ${verificationRequests.createdAt} >= ${start}
      AND ${verificationRequests.createdAt} <= ${end}
    GROUP BY TO_CHAR(${verificationRequests.createdAt}, ${dateFormat})
    ORDER BY date ASC
  `);

  return Array.from(result).map((row: any) => ({
    date: row.date,
    submitted: Number(row.submitted || 0),
    approved: Number(row.approved || 0),
    rejected: Number(row.rejected || 0),
  }));
}

export async function getProcessingTimeDistribution(startDate?: Date, endDate?: Date): Promise<{ bucket: string; count: number }[]> {
  const db = await requireDb();

  const { start, end } = getDateRange(startDate, endDate);
  const result = await db.execute(sql`
    SELECT
      CASE
        WHEN processing_hours < 24 THEN '< 1 day'
        WHEN processing_hours < 72 THEN '1-3 days'
        WHEN processing_hours < 168 THEN '3-7 days'
        WHEN processing_hours < 336 THEN '1-2 weeks'
        ELSE '> 2 weeks'
      END as bucket,
      COUNT(*) as count
    FROM (
      SELECT
        EXTRACT(EPOCH FROM (COALESCE(${verificationRequests.approvedAt}, ${verificationRequests.rejectedAt}) - ${verificationRequests.submittedAt})) / 3600 as processing_hours
      FROM ${verificationRequests}
      WHERE ${verificationRequests.status} IN ('approved', 'rejected')
        AND ${verificationRequests.createdAt} >= ${start}
        AND ${verificationRequests.createdAt} <= ${end}
    ) as processing_times
    GROUP BY bucket
    ORDER BY
      CASE bucket
        WHEN '< 1 day' THEN 1
        WHEN '1-3 days' THEN 2
        WHEN '3-7 days' THEN 3
        WHEN '1-2 weeks' THEN 4
        ELSE 5
      END
  `);

  return Array.from(result).map((row: any) => ({
    bucket: row.bucket,
    count: Number(row.count || 0),
  }));
}
