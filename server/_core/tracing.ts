import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
// Resource import removed due to type/value conflict
import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api';
import { logger } from './logger';

// ============================================================================
// OpenTelemetry Configuration
// ============================================================================

const TRACING_ENABLED = process.env.TRACING_ENABLED === 'true';
const METRICS_ENABLED = process.env.METRICS_ENABLED === 'true';

function requiredObservabilityConfig(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured when its observability integration is enabled`);
  return value;
}

const jaegerExporter = TRACING_ENABLED
  ? new JaegerExporter({ endpoint: requiredObservabilityConfig('JAEGER_ENDPOINT') })
  : undefined;
const prometheusPort = METRICS_ENABLED ? Number(requiredObservabilityConfig('PROMETHEUS_PORT')) : undefined;
if (prometheusPort !== undefined && (!Number.isInteger(prometheusPort) || prometheusPort < 1 || prometheusPort > 65535)) {
  throw new Error('PROMETHEUS_PORT must be a valid TCP port');
}
const prometheusExporter = prometheusPort
  ? new PrometheusExporter({ port: prometheusPort }, () => {
      logger.info({ port: prometheusPort }, 'OpenTelemetry Prometheus exporter started');
    })
  : undefined;

const sdk = new NodeSDK({
  ...(jaegerExporter ? { traceExporter: jaegerExporter } : {}),
  ...(prometheusExporter ? { metricReader: prometheusExporter } : {}),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Customize instrumentation
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Disable file system instrumentation for performance
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingRequestHook: (req) => {
          // Ignore health check endpoints
          const url = req.url || '';
          return url.includes('/health') || url.includes('/metrics');
        },
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-pg': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-redis': {
        enabled: true,
      },
    }),
  ],
});

// Start the SDK
export function startTracing(): void {
  if (!TRACING_ENABLED && !METRICS_ENABLED) {
    logger.info('OpenTelemetry exporters are disabled by configuration');
    return;
  }
  sdk.start();
  logger.info('OpenTelemetry tracing initialized');
}

// Graceful shutdown
export async function stopTracing(): Promise<void> {
  if (!TRACING_ENABLED && !METRICS_ENABLED) return;
  await sdk.shutdown();
  logger.info('OpenTelemetry tracing shut down');
}

process.on('SIGTERM', async () => {
  await stopTracing();
});

// ============================================================================
// Custom Tracing Utilities
// ============================================================================

const tracer = trace.getTracer('idlr-pts-platform');

export interface TraceOptions {
  name: string;
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Create a custom span for tracing
 */
export async function traceAsync<T>(
  options: TraceOptions,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(options.name, async (span) => {
    try {
      if (options.attributes) {
        span.setAttributes(options.attributes);
      }

      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Create a custom span for synchronous operations
 */
export function traceSync<T>(
  options: TraceOptions,
  fn: (span: Span) => T
): T {
  return tracer.startActiveSpan(options.name, (span) => {
    try {
      if (options.attributes) {
        span.setAttributes(options.attributes);
      }

      const result = fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Add custom attributes to the current span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Record an event in the current span
 */
export function recordSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

// ============================================================================
// Business Metrics Tracking
// ============================================================================

export class BusinessMetrics {
  /**
   * Track property registration
   */
  trackPropertyRegistration(propertyId: string, userId: string): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent('property_registered', {
        propertyId,
        userId,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Track transaction completion
   */
  trackTransactionComplete(transactionId: string, amount: number, currency: string): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent('transaction_completed', {
        transactionId,
        amount,
        currency,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Track user journey step
   */
  trackUserJourney(step: string, userId: string, metadata?: Record<string, any>): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent('user_journey_step', {
        step,
        userId,
        ...metadata,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Track external service call
   */
  trackExternalServiceCall(
    service: string,
    operation: string,
    duration: number,
    success: boolean
  ): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent('external_service_call', {
        service,
        operation,
        duration,
        success,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Track cache operation
   */
  trackCacheOperation(operation: 'hit' | 'miss' | 'set' | 'delete', key: string): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent('cache_operation', {
        operation,
        key,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Track database query
   */
  trackDatabaseQuery(query: string, duration: number, rowCount?: number): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent('database_query', {
        query: query.substring(0, 100), // Truncate for safety
        duration,
        rowCount: rowCount || 0,
        timestamp: Date.now(),
      });
    }
  }
}

export const businessMetrics = new BusinessMetrics();

// ============================================================================
// SLA Tracking
// ============================================================================

export interface SLAConfig {
  name: string;
  targetLatencyMs: number;
  targetSuccessRate: number; // 0-1
}

export class SLATracker {
  private slaConfigs: Map<string, SLAConfig>;
  private measurements: Map<string, { successes: number; failures: number; latencies: number[] }>;

  constructor() {
    this.slaConfigs = new Map();
    this.measurements = new Map();

    // Define SLAs
    this.defineSLA({
      name: 'property_registration',
      targetLatencyMs: 500,
      targetSuccessRate: 0.999,
    });

    this.defineSLA({
      name: 'transaction_processing',
      targetLatencyMs: 1000,
      targetSuccessRate: 0.9999,
    });

    this.defineSLA({
      name: 'search_query',
      targetLatencyMs: 200,
      targetSuccessRate: 0.99,
    });

    this.defineSLA({
      name: 'api_response',
      targetLatencyMs: 2000,
      targetSuccessRate: 0.995,
    });

    // Reset measurements every hour
    setInterval(() => {
      this.measurements.clear();
    }, 60 * 60 * 1000);
  }

  defineSLA(config: SLAConfig): void {
    this.slaConfigs.set(config.name, config);
    this.measurements.set(config.name, { successes: 0, failures: 0, latencies: [] });
  }

  recordMeasurement(slaName: string, latencyMs: number, success: boolean): void {
    const measurement = this.measurements.get(slaName);
    if (!measurement) return;

    if (success) {
      measurement.successes++;
    } else {
      measurement.failures++;
    }

    measurement.latencies.push(latencyMs);

    // Keep only last 1000 latencies
    if (measurement.latencies.length > 1000) {
      measurement.latencies.shift();
    }

    // Check SLA compliance
    this.checkSLACompliance(slaName);
  }

  private checkSLACompliance(slaName: string): void {
    const config = this.slaConfigs.get(slaName);
    const measurement = this.measurements.get(slaName);
    if (!config || !measurement) return;

    const total = measurement.successes + measurement.failures;
    if (total === 0) return;

    const successRate = measurement.successes / total;
    const p95Latency = this.calculatePercentile(measurement.latencies, 95);

    const latencyCompliant = p95Latency <= config.targetLatencyMs;
    const successRateCompliant = successRate >= config.targetSuccessRate;

    if (!latencyCompliant || !successRateCompliant) {
      logger.warn({
        slaName,
        targetLatency: config.targetLatencyMs,
        actualLatency: p95Latency,
        targetSuccessRate: config.targetSuccessRate,
        actualSuccessRate: successRate,
        latencyCompliant,
        successRateCompliant,
      }, 'SLA violation detected');
    }
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  getSLAStatus(slaName: string): {
    compliant: boolean;
    successRate: number;
    p95Latency: number;
    target: SLAConfig;
  } | null {
    const config = this.slaConfigs.get(slaName);
    const measurement = this.measurements.get(slaName);
    if (!config || !measurement) return null;

    const total = measurement.successes + measurement.failures;
    const successRate = total > 0 ? measurement.successes / total : 1;
    const p95Latency = this.calculatePercentile(measurement.latencies, 95);

    return {
      compliant:
        p95Latency <= config.targetLatencyMs &&
        successRate >= config.targetSuccessRate,
      successRate,
      p95Latency,
      target: config,
    };
  }

  getAllSLAStatus(): Map<string, ReturnType<SLATracker['getSLAStatus']>> {
    const status = new Map();
    for (const slaName of Array.from(this.slaConfigs.keys())) {
      status.set(slaName, this.getSLAStatus(slaName));
    }
    return status;
  }
}

export const slaTracker = new SLATracker();

// ============================================================================
// Performance Monitoring Middleware
// ============================================================================

import { Request, Response, NextFunction } from 'express';

export function performanceMonitoringMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  const span = trace.getActiveSpan();

  // Add request metadata to span
  if (span) {
    span.setAttributes({
      'http.method': req.method,
      'http.url': req.url,
      'http.user_agent': req.get('user-agent') || 'unknown',
    });
  }

  // Monitor response
  const originalSend = res.send;
  res.send = function (data: any): Response {
    const duration = Date.now() - startTime;
    const success = res.statusCode < 400;

    // Record SLA measurement
    slaTracker.recordMeasurement('api_response', duration, success);

    // Add response metadata to span
    if (span) {
      span.setAttributes({
        'http.status_code': res.statusCode,
        'http.response_time_ms': duration,
      });
    }

    // Log slow requests
    if (duration > 2000) {
      logger.warn({
        method: req.method,
        url: req.url,
        duration,
        statusCode: res.statusCode,
      }, 'Slow request detected');
    }

    return originalSend.call(this, data);
  };

  next();
}
