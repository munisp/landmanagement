import axios, { AxiosInstance } from 'axios';

const LAKEHOUSE_URL = process.env.LAKEHOUSE_API_URL || 'http://localhost:8000';

// Create axios instance with default config
const lakehouseApi: AxiosInstance = axios.create({
  baseURL: LAKEHOUSE_URL,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request/Response types
export interface ParcelAnalyticsFilters {
  state?: string;
  land_use?: string;
  area_sqm?: { $gt?: number; $lt?: number };
  [key: string]: any;
}

export interface ParcelAnalyticsRequest {
  filters?: ParcelAnalyticsFilters;
  aggregations?: string[];
  limit?: number;
}

export interface TransactionTrendsRequest {
  start_date: string;
  end_date: string;
  group_by?: 'day' | 'week' | 'month';
  metrics?: string[];
}

export interface DataIngestionRequest {
  data: any[];
  mode?: 'append' | 'overwrite' | 'merge';
}

export interface GeospatialWorkbenchRequest {
  anchor_parcel: Record<string, any>;
  nearby_parcels?: Record<string, any>[];
  local_open_dispute_count?: number;
  nearby_open_dispute_count?: number;
  active_transaction_count?: number;
}

// Health check
export async function checkLakehouseHealth(): Promise<boolean> {
  try {
    const response = await lakehouseApi.get('/health');
    return response.data.status === 'healthy';
  } catch (error) {
    console.error('[Lakehouse] Health check failed:', error);
    return false;
  }
}

// Analytics queries
export async function queryParcelAnalytics(request: ParcelAnalyticsRequest) {
  try {
    const response = await lakehouseApi.post('/analytics/parcels', request);
    return response.data;
  } catch (error: any) {
    console.error('[Lakehouse] Parcel analytics query failed:', error.message);
    throw new Error(`Lakehouse query failed: ${error.message}`);
  }
}

export async function queryTransactionTrends(request: TransactionTrendsRequest) {
  try {
    const response = await lakehouseApi.post('/analytics/transactions', request);
    return response.data;
  } catch (error: any) {
    console.error('[Lakehouse] Transaction trends query failed:', error.message);
    throw new Error(`Lakehouse query failed: ${error.message}`);
  }
}

export async function queryPropertyValues(filters: Record<string, any>) {
  try {
    const response = await lakehouseApi.post('/analytics/property-values', filters);
    return response.data;
  } catch (error: any) {
    console.error('[Lakehouse] Property values query failed:', error.message);
    throw new Error(`Lakehouse query failed: ${error.message}`);
  }
}

// Data ingestion
export async function ingestDataToLakehouse(
  tableName: string,
  request: DataIngestionRequest
) {
  try {
    const response = await lakehouseApi.post(`/ingest/${tableName}`, request);
    return response.data;
  } catch (error: any) {
    console.error(`[Lakehouse] Data ingestion to ${tableName} failed:`, error.message);
    throw new Error(`Lakehouse ingestion failed: ${error.message}`);
  }
}

export async function bulkIngestData(tables: Record<string, any[]>) {
  try {
    const response = await lakehouseApi.post('/ingest/bulk', tables);
    return response.data;
  } catch (error: any) {
    console.error('[Lakehouse] Bulk ingestion failed:', error.message);
    throw new Error(`Lakehouse bulk ingestion failed: ${error.message}`);
  }
}

// Custom SQL query (admin only)
export async function executeSQLQuery(query: string, params?: Record<string, any>) {
  try {
    const response = await lakehouseApi.post('/query/sql', { query, params });
    return response.data;
  } catch (error: any) {
    console.error('[Lakehouse] SQL query failed:', error.message);
    throw new Error(`Lakehouse SQL query failed: ${error.message}`);
  }
}

// Convenience functions for common queries
export async function getParcelsByState(state: string, limit: number = 1000) {
  return queryParcelAnalytics({
    filters: { state },
    aggregations: ['count', 'avg_area', 'total_value'],
    limit,
  });
}

export async function getTransactionVolumeByMonth(year: number) {
  return queryTransactionTrends({
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    group_by: 'month',
    metrics: ['count', 'volume'],
  });
}

export async function getPropertyValueTrends(location: string) {
  return queryPropertyValues({
    location,
    metrics: ['avg_value_per_sqm', 'median_value', 'sample_size'],
  });
}

export async function getSearchInsights() {
  try {
    const response = await lakehouseApi.get('/analytics/search-insights');
    return response.data;
  } catch (error: any) {
    console.error('[Lakehouse] Search insights query failed:', error.message);
    throw new Error(`Lakehouse search insights failed: ${error.message}`);
  }
}

export async function getGeospatialRuntimeStatus() {
  try {
    const response = await lakehouseApi.get('/analytics/geospatial/runtime-status');
    return response.data;
  } catch (error: any) {
    console.error('[Lakehouse] Geospatial runtime status query failed:', error.message);
    throw new Error(`Lakehouse geospatial runtime status failed: ${error.message}`);
  }
}

export async function getGeospatialWorkbench(request: GeospatialWorkbenchRequest) {
  try {
    const response = await lakehouseApi.post('/analytics/geospatial/workbench', request);
    return response.data;
  } catch (error: any) {
    console.error('[Lakehouse] Geospatial workbench query failed:', error.message);
    throw new Error(`Lakehouse geospatial workbench failed: ${error.message}`);
  }
}

// Batch ingestion helpers
export async function ingestParcels(parcels: any[]) {
  return ingestDataToLakehouse('parcels', { data: parcels, mode: 'append' });
}

export async function ingestTransactions(transactions: any[]) {
  return ingestDataToLakehouse('transactions', { data: transactions, mode: 'append' });
}

export async function ingestAuditLogs(logs: any[]) {
  return ingestDataToLakehouse('audit_logs', { data: logs, mode: 'append' });
}

export default {
  checkHealth: checkLakehouseHealth,
  queryParcelAnalytics,
  queryTransactionTrends,
  queryPropertyValues,
  ingestData: ingestDataToLakehouse,
  bulkIngest: bulkIngestData,
  executeSQLQuery,
  getParcelsByState,
  getTransactionVolumeByMonth,
  getPropertyValueTrends,
  getSearchInsights,
  getGeospatialRuntimeStatus,
  getGeospatialWorkbench,
  ingestParcels,
  ingestTransactions,
  ingestAuditLogs,
};
