/**
 * Error Tracking with Sentry
 * 
 * Features:
 * - Automatic error capture and reporting
 * - User context tracking
 * - Performance monitoring
 * - Release tracking
 * - Breadcrumb tracking
 */

import * as Sentry from '@sentry/node';
import { expressErrorHandler, expressIntegration, httpIntegration } from '@sentry/node';
import type { Request, Response, NextFunction } from 'express';

const SENTRY_DSN = process.env.SENTRY_DSN;
const NODE_ENV = process.env.NODE_ENV || 'development';
const APP_VERSION = process.env.APP_VERSION || '1.0.0';

/**
 * Initialize Sentry
 */
export function initializeSentry() {
  if (!SENTRY_DSN) {
    console.warn('[Sentry] SENTRY_DSN not configured, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: NODE_ENV,
    release: `idlr-pts-platform@${APP_VERSION}`,
    
    // Performance monitoring
    tracesSampleRate: NODE_ENV === 'production' ? 0.1 : 1.0, // 10% in production, 100% in dev
    
    // Integrations
    integrations: [
      httpIntegration(),
      expressIntegration(),
    ],
    
    // Before send hook for filtering
    beforeSend(event, hint) {
      // Don't send errors in development
      if (NODE_ENV === 'development') {
        console.log('[Sentry] Would send error:', event);
        return null;
      }
      
      // Filter out specific errors
      const error = hint.originalException;
      if (error instanceof Error) {
        // Don't send validation errors
        if (error.name === 'ValidationError') {
          return null;
        }
        
        // Don't send 404 errors
        if (error.message.includes('404')) {
          return null;
        }
      }
      
      return event;
    },
    
    // Before breadcrumb hook
    beforeBreadcrumb(breadcrumb, hint) {
      // Filter sensitive data from breadcrumbs
      if (breadcrumb.category === 'http') {
        if (breadcrumb.data?.url) {
          // Remove query parameters that might contain sensitive data
          breadcrumb.data.url = breadcrumb.data.url.split('?')[0];
        }
      }
      
      return breadcrumb;
    },
  });

  console.log('[Sentry] Initialized successfully');
}

/**
 * Express middleware for Sentry request handler
 */
export function sentryRequestHandler() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Sentry v10 handles this automatically via expressIntegration
    next();
  };
}

/**
 * Express middleware for Sentry tracing
 */
export function sentryTracingHandler() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Sentry v10 handles this automatically via expressIntegration
    next();
  };
}

/**
 * Express middleware for Sentry error handler
 */
export function sentryErrorHandler() {
  return expressErrorHandler({
    shouldHandleError(error: any) {
      // Capture all errors with status code >= 500
      return true;
    },
  });
}

/**
 * Capture exception manually
 */
export function captureException(error: Error, context?: Record<string, any>) {
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture message
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, any>) {
  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Set user context
 */
export function setUser(user: { id: string; email?: string; username?: string }) {
  Sentry.setUser(user);
}

/**
 * Clear user context
 */
export function clearUser() {
  Sentry.setUser(null);
}

/**
 * Add breadcrumb
 */
export function addBreadcrumb(breadcrumb: {
  message: string;
  category?: string;
  level?: Sentry.SeverityLevel;
  data?: Record<string, any>;
}) {
  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Start transaction for performance monitoring
 */
export function startTransaction(name: string, op: string) {
  return Sentry.startSpan({
    name,
    op,
  }, (span) => span);
}

/**
 * Flush pending events (useful before shutdown)
 */
export async function flush(timeout = 2000): Promise<boolean> {
  return Sentry.flush(timeout);
}

/**
 * Close Sentry connection
 */
export async function close(timeout = 2000): Promise<boolean> {
  return Sentry.close(timeout);
}

export default Sentry;
