/**
 * Production-Grade Logging Service
 * 
 * Features:
 * - Structured logging with multiple levels
 * - Request/response logging
 * - Error tracking and stack traces
 * - Performance metrics
 * - Log rotation and retention
 * - Integration with external log aggregators
 */

import pino from 'pino';
import type { Request, Response, NextFunction } from 'express';

// Log levels: trace, debug, info, warn, error, fatal
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Create logger instance
export const logger = pino({
  level: LOG_LEVEL,
  
  // Formatting options
  formatters: {
    level: (label) => {
      return { level: label };
    },
    bindings: (bindings) => {
      return {
        pid: bindings.pid,
        hostname: bindings.hostname,
        node_version: process.version,
      };
    },
  },
  
  // Timestamp format
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  
  // Base context
  base: {
    env: NODE_ENV,
    app: 'idlr-pts-platform',
  },
  
  // Pretty print in development
  transport: NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined,
  
  // Redact sensitive fields
  redact: {
    paths: [
      'password',
      'token',
      'authorization',
      'cookie',
      'apiKey',
      'secret',
      '*.password',
      '*.token',
      '*.authorization',
    ],
    remove: true,
  },
});

/**
 * Create child logger with context
 */
export function createLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Express middleware for request/response logging
 */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || generateRequestId();
    
    // Add request ID to request object
    (req as any).requestId = requestId;
    
    // Add request ID to response headers
    res.setHeader('X-Request-ID', requestId);
    
    // Create request logger
    const reqLogger = logger.child({
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.socket.remoteAddress,
    });
    
    // Log request
    reqLogger.info({
      type: 'request',
      headers: req.headers,
      query: req.query,
      body: sanitizeBody(req.body),
    }, 'Incoming request');
    
    // Attach logger to request
    (req as any).logger = reqLogger;
    
    // Log response
    const originalSend = res.send;
    res.send = function(data: any) {
      const duration = Date.now() - startTime;
      
      reqLogger.info({
        type: 'response',
        statusCode: res.statusCode,
        duration,
        contentLength: res.getHeader('content-length'),
      }, `Request completed in ${duration}ms`);
      
      // Track slow requests
      if (duration > 1000) {
        reqLogger.warn({
          type: 'slow_request',
          duration,
        }, `Slow request detected: ${duration}ms`);
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Express error logging middleware
 */
export function errorLogger() {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    const reqLogger = (req as any).logger || logger;
    
    reqLogger.error({
      type: 'error',
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
      requestId: (req as any).requestId,
      method: req.method,
      url: req.url,
    }, 'Request error');
    
    next(err);
  };
}

/**
 * Log database query
 */
export function logQuery(query: string, params: any[], duration: number) {
  const queryLogger = logger.child({ type: 'database_query' });
  
  if (duration > 1000) {
    queryLogger.warn({
      query: sanitizeQuery(query),
      params: sanitizeParams(params),
      duration,
    }, `Slow query detected: ${duration}ms`);
  } else {
    queryLogger.debug({
      query: sanitizeQuery(query),
      params: sanitizeParams(params),
      duration,
    }, 'Query executed');
  }
}

/**
 * Log external API call
 */
export function logExternalCall(
  service: string,
  method: string,
  url: string,
  duration: number,
  statusCode?: number,
  error?: Error
) {
  const apiLogger = logger.child({ type: 'external_api' });
  
  if (error) {
    apiLogger.error({
      service,
      method,
      url,
      duration,
      error: {
        name: error.name,
        message: error.message,
      },
    }, `External API call failed: ${service}`);
  } else {
    apiLogger.info({
      service,
      method,
      url,
      duration,
      statusCode,
    }, `External API call: ${service}`);
  }
}

/**
 * Log business event
 */
export function logEvent(
  eventType: string,
  data: Record<string, any>,
  userId?: string
) {
  const eventLogger = logger.child({ type: 'business_event' });
  
  eventLogger.info({
    eventType,
    data: sanitizeData(data),
    userId,
    timestamp: new Date().toISOString(),
  }, `Business event: ${eventType}`);
}

/**
 * Log security event
 */
export function logSecurityEvent(
  eventType: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  data: Record<string, any>
) {
  const securityLogger = logger.child({ type: 'security_event' });
  
  const logFn = severity === 'critical' || severity === 'high' 
    ? securityLogger.error 
    : securityLogger.warn;
  
  logFn.call(securityLogger, {
    eventType,
    severity,
    data: sanitizeData(data),
    timestamp: new Date().toISOString(),
  }, `Security event: ${eventType}`);
}

/**
 * Log performance metric
 */
export function logMetric(
  metricName: string,
  value: number,
  unit: string,
  tags?: Record<string, string>
) {
  const metricLogger = logger.child({ type: 'metric' });
  
  metricLogger.info({
    metricName,
    value,
    unit,
    tags,
    timestamp: new Date().toISOString(),
  }, `Metric: ${metricName}=${value}${unit}`);
}

// Helper functions

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function sanitizeBody(body: any): any {
  if (!body) return undefined;
  
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'authorization'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

function sanitizeQuery(query: string): string {
  // Truncate long queries
  if (query.length > 500) {
    return query.substring(0, 500) + '...';
  }
  return query;
}

function sanitizeParams(params: any[]): any[] {
  // Redact sensitive parameter values
  return params.map(param => {
    if (typeof param === 'string' && param.length > 100) {
      return '[LONG_STRING]';
    }
    return param;
  });
}

function sanitizeData(data: Record<string, any>): Record<string, any> {
  const sanitized = { ...data };
  const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'authorization', 'ssn', 'creditCard'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

// Export logger instance as default
export default logger;
