import { searchParcels } from './parcelRepository';
import { listTransactions } from './transactionRepository';

export interface ParcelDistribution {
  state: string;
  count: number;
}

export interface LandUseDistribution {
  landUse: string;
  count: number;
}

export interface TransactionTrend {
  month: string;
  count: number;
  revenue: number;
}

export interface RevenueBreakdown {
  category: string;
  amount: number;
  percentage: number;
}

export interface AnalyticsMetrics {
  totalParcels: number;
  totalTransactions: number;
  totalRevenue: number;
  averageTransactionValue: number;
  pendingTransactions: number;
  approvedTransactions: number;
}

function titleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getAllParcels() {
  const result = searchParcels({ page: 1, limit: 1000 });
  return result.parcels;
}

function getAllTransactions() {
  const result = listTransactions({ page: 1, limit: 1000 });
  return result.transactions;
}

export class AnalyticsService {
  async getParcelDistributionByState(): Promise<ParcelDistribution[]> {
    const parcels = getAllParcels();
    const grouped = parcels.reduce<Record<string, number>>((acc, parcel) => {
      acc[parcel.state] = (acc[parcel.state] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getParcelDistributionByLandUse(): Promise<LandUseDistribution[]> {
    const parcels = getAllParcels();
    const grouped = parcels.reduce<Record<string, number>>((acc, parcel) => {
      const landUse = titleCase(parcel.landUseType || 'unknown');
      acc[landUse] = (acc[landUse] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([landUse, count]) => ({ landUse, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getTransactionTrends(): Promise<TransactionTrend[]> {
    const transactions = getAllTransactions();
    const now = new Date();
    const buckets: { key: string; label: string; count: number; revenue: number }[] = [];

    for (let offset = 11; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleString('en-NG', { month: 'short', timeZone: 'UTC' });
      buckets.push({ key, label, count: 0, revenue: 0 });
    }

    transactions.forEach((transaction) => {
      const createdAt = new Date(transaction.createdAt);
      const key = `${createdAt.getUTCFullYear()}-${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.find((item) => item.key === key);
      if (!bucket) return;
      bucket.count += 1;
      bucket.revenue += transaction.considerationAmount;
    });

    return buckets.map(({ label, count, revenue }) => ({
      month: label,
      count,
      revenue,
    }));
  }

  async getRevenueBreakdown(): Promise<RevenueBreakdown[]> {
    const transactions = getAllTransactions();
    const grouped = transactions.reduce<Record<string, number>>((acc, transaction) => {
      const category = titleCase(transaction.type);
      acc[category] = (acc[category] || 0) + transaction.considerationAmount;
      return acc;
    }, {});

    const total = Object.values(grouped).reduce((sum, value) => sum + value, 0);

    return Object.entries(grouped)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  async getAnalyticsMetrics(): Promise<AnalyticsMetrics> {
    const parcels = getAllParcels();
    const transactions = getAllTransactions();
    const totalRevenue = transactions.reduce((sum, transaction) => sum + transaction.considerationAmount, 0);
    const approvedTransactions = transactions.filter((transaction) => ['registered', 'completed'].includes(transaction.status)).length;
    const pendingTransactions = transactions.filter((transaction) => ['draft', 'pending_approval', 'pending_payment', 'in_review'].includes(transaction.status)).length;

    return {
      totalParcels: parcels.length,
      totalTransactions: transactions.length,
      totalRevenue,
      averageTransactionValue: transactions.length > 0 ? totalRevenue / transactions.length : 0,
      pendingTransactions,
      approvedTransactions,
    };
  }

  async getParcelStatusDistribution(): Promise<{ status: string; count: number }[]> {
    const parcels = getAllParcels();
    const grouped = parcels.reduce<Record<string, number>>((acc, parcel) => {
      const status = titleCase(parcel.status);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getTransactionStatusDistribution(): Promise<{ status: string; count: number }[]> {
    const transactions = getAllTransactions();
    const grouped = transactions.reduce<Record<string, number>>((acc, transaction) => {
      const status = titleCase(transaction.status);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }
}

export const analyticsService = new AnalyticsService();
