/**
 * Prometheus Metrics Service
 * 
 * Features:
 * - HTTP request metrics (duration, count, errors)
 * - Database query metrics
 * - Business metrics (registrations, transactions, etc.)
 * - Custom metrics
 * - Automatic metric collection
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

// Create registry
export const register = new Registry();

// Collect default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register });

// HTTP Metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10], // seconds
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestErrors = new Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'error_type'],
  registers: [register],
});

// Database Metrics
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5], // seconds
  registers: [register],
});

export const dbQueryTotal = new Counter({
  name: 'db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table'],
  registers: [register],
});

export const dbQueryErrors = new Counter({
  name: 'db_query_errors_total',
  help: 'Total number of database query errors',
  labelNames: ['operation', 'table', 'error_type'],
  registers: [register],
});

export const dbConnectionPoolSize = new Gauge({
  name: 'db_connection_pool_size',
  help: 'Current size of database connection pool',
  labelNames: ['state'], // 'idle', 'active', 'waiting'
  registers: [register],
});

// Business Metrics
export const userRegistrations = new Counter({
  name: 'user_registrations_total',
  help: 'Total number of user registrations',
  labelNames: ['type'], // 'buyer', 'seller', 'broker', etc.
  registers: [register],
});

export const propertyTransactions = new Counter({
  name: 'property_transactions_total',
  help: 'Total number of property transactions',
  labelNames: ['type', 'status'], // type: 'sale', 'mortgage', etc. status: 'pending', 'completed', 'failed'
  registers: [register],
});

export const mortgageApplications = new Counter({
  name: 'mortgage_applications_total',
  help: 'Total number of mortgage applications',
  labelNames: ['status'], // 'submitted', 'approved', 'rejected'
  registers: [register],
});

export const blockchainTransactions = new Counter({
  name: 'blockchain_transactions_total',
  help: 'Total number of blockchain transactions',
  labelNames: ['operation', 'status'], // operation: 'register', 'transfer', etc.
  registers: [register],
});

export const paymentTransactions = new Counter({
  name: 'payment_transactions_total',
  help: 'Total number of payment transactions',
  labelNames: ['provider', 'status'], // provider: 'mojaloop', 'tigerbeetle', etc.
  registers: [register],
});

export const documentProcessing = new Histogram({
  name: 'document_processing_duration_seconds',
  help: 'Duration of document processing in seconds',
  labelNames: ['type'], // 'title_deed', 'mortgage_agreement', etc.
  buckets: [1, 5, 10, 30, 60, 120, 300], // seconds
  registers: [register],
});

// Cache Metrics
export const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_name'],
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_name'],
  registers: [register],
});

export const cacheEvictions = new Counter({
  name: 'cache_evictions_total',
  help: 'Total number of cache evictions',
  labelNames: ['cache_name'],
  registers: [register],
});

// Security Metrics
export const securityEvents = new Counter({
  name: 'security_events_total',
  help: 'Total number of security events',
  labelNames: ['type', 'result'],
  registers: [register],
});

// WebSocket Metrics
export const websocketConnections = new Gauge({
  name: 'websocket_connections_current',
  help: 'Current number of WebSocket connections',
  labelNames: ['type'], // 'dashboard', 'notifications', etc.
  registers: [register],
});

export const websocketMessages = new Counter({
  name: 'websocket_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['type', 'direction'], // direction: 'inbound', 'outbound'
  registers: [register],
});

// External API Metrics
export const externalApiCalls = new Counter({
  name: 'external_api_calls_total',
  help: 'Total number of external API calls',
  labelNames: ['service', 'endpoint', 'status'],
  registers: [register],
});

export const externalApiDuration = new Histogram({
  name: 'external_api_duration_seconds',
  help: 'Duration of external API calls in seconds',
  labelNames: ['service', 'endpoint'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30], // seconds
  registers: [register],
});

export const externalApiErrors = new Counter({
  name: 'external_api_errors_total',
  help: 'Total number of external API errors',
  labelNames: ['service', 'error_type'],
  registers: [register],
});

/**
 * Express middleware for automatic HTTP metrics collection
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    // Get route pattern (not the actual path with IDs)
    const route = req.route?.path || req.path;
    
    // Capture response
    const originalSend = res.send;
    res.send = function(data: any) {
      const duration = (Date.now() - start) / 1000; // Convert to seconds
      const statusCode = res.statusCode.toString();
      
      // Record metrics
      httpRequestDuration.labels(req.method, route, statusCode).observe(duration);
      httpRequestTotal.labels(req.method, route, statusCode).inc();
      
      // Record errors (4xx and 5xx)
      if (res.statusCode >= 400) {
        const errorType = res.statusCode >= 500 ? 'server_error' : 'client_error';
        httpRequestErrors.labels(req.method, route, errorType).inc();
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Record database query metric
 */
export function recordDbQuery(operation: string, table: string, duration: number, error?: Error) {
  const durationSeconds = duration / 1000;
  
  dbQueryDuration.labels(operation, table).observe(durationSeconds);
  dbQueryTotal.labels(operation, table).inc();
  
  if (error) {
    dbQueryErrors.labels(operation, table, error.name).inc();
  }
}

/**
 * Update database connection pool metrics
 */
export function updateDbPoolMetrics(total: number, idle: number, waiting: number) {
  dbConnectionPoolSize.labels('total').set(total);
  dbConnectionPoolSize.labels('idle').set(idle);
  dbConnectionPoolSize.labels('waiting').set(waiting);
}

/**
 * Record external API call metric
 */
export function recordExternalApiCall(
  service: string,
  endpoint: string,
  duration: number,
  statusCode: number
) {
  const durationSeconds = duration / 1000;
  
  externalApiDuration.labels(service, endpoint).observe(durationSeconds);
  externalApiCalls.labels(service, endpoint, statusCode.toString()).inc();
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Get metrics as JSON
 */
export async function getMetricsJSON(): Promise<any> {
  const metrics = await register.getMetricsAsJSON();
  return metrics;
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics() {
  register.resetMetrics();
}

export default register;
