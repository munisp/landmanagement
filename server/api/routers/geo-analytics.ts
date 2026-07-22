import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import { searchParcels } from '../../parcelRepository';
import { listTransactions } from '../../transactionRepository';

function monthLabel(date: Date) {
  return date.toLocaleString('en-NG', { month: 'short', timeZone: 'UTC' });
}

export const geoAnalyticsRouter = router({
  dashboard: protectedProcedure
    .input(
      z.object({
        state: z.string().optional(),
        timeRange: z.enum(['30d', '90d', '1y', 'all']).default('1y'),
      }).optional(),
    )
    .query(async ({ input }) => {
      const stateFilter = input?.state && input.state !== 'all' ? input.state : undefined;
      const parcels = (await searchParcels({ page: 1, limit: 1000 })).parcels;
      const transactions = (await listTransactions({ page: 1, limit: 1000 })).transactions;
      const filteredParcels = stateFilter ? parcels.filter((parcel) => parcel.state === stateFilter) : parcels;
      const parcelIds = new Set(filteredParcels.map((parcel) => parcel.id));
      const filteredTransactions = transactions.filter((transaction) => parcelIds.has(transaction.parcelId));

      const propertyValueData = Object.values(
        filteredParcels.reduce<Record<string, { state: string; totalValue: number; count: number; valuedCount: number; registeredCount: number }>>((acc, parcel) => {
          const key = parcel.state;
          if (!acc[key]) {
            acc[key] = { state: parcel.state, totalValue: 0, count: 0, valuedCount: 0, registeredCount: 0 };
          }
          if (parcel.estimatedValue !== null) {
            acc[key].totalValue += parcel.estimatedValue;
            acc[key].valuedCount += 1;
          }
          acc[key].count += 1;
          if (parcel.status === 'registered') {
            acc[key].registeredCount += 1;
          }
          return acc;
        }, {}),
      ).map((item) => ({
        state: item.state,
        avgValue: item.valuedCount > 0 ? Math.round(item.totalValue / item.valuedCount) : null,
        count: item.count,
        valuedCount: item.valuedCount,
        unappraisedCount: item.count - item.valuedCount,
        growth: Math.round((item.registeredCount / Math.max(item.count, 1)) * 1000) / 10,
      }));

      const landUseDistribution = Object.values(
        filteredParcels.reduce<Record<string, { type: string; count: number; totalArea: number }>>((acc, parcel) => {
          const key = parcel.landUseType;
          if (!acc[key]) {
            acc[key] = { type: parcel.landUseType, count: 0, totalArea: 0 };
          }
          acc[key].count += 1;
          acc[key].totalArea += parcel.areaSquareMeters;
          return acc;
        }, {}),
      )
        .map((item) => ({
          type: item.type,
          count: item.count,
          averageArea: Math.round(item.totalArea / Math.max(item.count, 1)),
        }))
        .sort((a, b) => b.count - a.count);

      const now = new Date();
      const trendBuckets = Array.from({ length: 6 }).map((_, index) => {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
        const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
        return {
          key,
          month: monthLabel(date),
          transactions: 0,
          value: 0,
        };
      });

      filteredTransactions.forEach((transaction) => {
        const createdAt = new Date(transaction.createdAt);
        const key = `${createdAt.getUTCFullYear()}-${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
        const bucket = trendBuckets.find((item) => item.key === key);
        if (!bucket) return;
        bucket.transactions += 1;
        bucket.value += transaction.considerationAmount;
      });

      const transactionTrends = trendBuckets.map(({ key, ...bucket }) => bucket);

      const parcelDensity = Object.values(
        filteredParcels.reduce<Record<string, { lga: string; state: string; parcelCount: number; valuedCount: number; totalArea: number; totalValue: number }>>((acc, parcel) => {
          const key = `${parcel.state}::${parcel.lga}`;
          if (!acc[key]) {
            acc[key] = {
              lga: parcel.lga,
              state: parcel.state,
              parcelCount: 0,
              valuedCount: 0,
              totalArea: 0,
              totalValue: 0,
            };
          }
          acc[key].parcelCount += 1;
          acc[key].totalArea += parcel.areaSquareMeters;
          if (parcel.estimatedValue !== null) {
            acc[key].totalValue += parcel.estimatedValue;
            acc[key].valuedCount += 1;
          }
          return acc;
        }, {}),
      )
        .map((item) => ({
          ...item,
          averageValue: item.valuedCount > 0 ? Math.round(item.totalValue / item.valuedCount) : null,
          unappraisedCount: item.parcelCount - item.valuedCount,
          averageArea: Math.round(item.totalArea / Math.max(item.parcelCount, 1)),
        }))
        .sort((a, b) => b.parcelCount - a.parcelCount);

      return {
        selectedState: stateFilter || 'all',
        propertyValueData,
        landUseDistribution,
        transactionTrends,
        parcelDensity,
      };
    }),
});
