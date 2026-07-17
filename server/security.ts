/**
 * Advanced Security Hardening Middleware
 * Implements OWASP security best practices
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * OWASP Security Headers Middleware
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Prevent clickjacking attacks
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS filter in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://maps.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https: wss:",
    "frame-src 'self' https://www.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests"
  ].join('; '));
  
  // Strict Transport Security (HSTS)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  
  // Permissions Policy
  res.setHeader('Permissions-Policy', [
    'geolocation=(self)',
    'microphone=()',
    'camera=()',
    'payment=(self)',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'speaker=(self)'
  ].join(', '));
  
  // Remove server header
  res.removeHeader('X-Powered-By');
  
  next();
}

/**
 * SQL Injection Prevention
 * Validates and sanitizes input parameters
 */
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove SQL injection patterns
    return input
      .replace(/['";\\]/g, '') // Remove quotes and backslashes
      .replace(/--/g, '') // Remove SQL comments
      .replace(/\/\*/g, '') // Remove block comment start
      .replace(/\*\//g, '') // Remove block comment end
      .replace(/xp_/gi, '') // Remove extended stored procedures
      .replace(/exec(\s|\+)+(s|x)p\w+/gi, '') // Remove exec statements
      .trim();
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const key in input) {
      sanitized[key] = sanitizeInput(input[key]);
    }
    return sanitized;
  }
  
  return input;
}

/**
 * XSS Protection Middleware
 * Sanitizes user input to prevent cross-site scripting
 */
export function xssProtection(req: Request, res: Response, next: NextFunction) {
  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeXSS(req.query);
  }
  
  // Sanitize body parameters
  if (req.body) {
    req.body = sanitizeXSS(req.body);
  }
  
  next();
}

function sanitizeXSS(input: any): any {
  if (typeof input === 'string') {
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/<script/gi, '&lt;script')
      .replace(/<iframe/gi, '&lt;iframe')
      .replace(/<object/gi, '&lt;object')
      .replace(/<embed/gi, '&lt;embed');
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeXSS);
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const key in input) {
      sanitized[key] = sanitizeXSS(input[key]);
    }
    return sanitized;
  }
  
  return input;
}

/**
 * CSRF Token Generation and Validation
 */
const csrfTokens = new Map<string, { token: string; expires: number }>();

export function generateCSRFToken(sessionId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 3600000; // 1 hour
  
  csrfTokens.set(sessionId, { token, expires });
  
  // Clean up expired tokens
  for (const [id, data] of Array.from(csrfTokens.entries())) {
    if (data.expires < Date.now()) {
      csrfTokens.delete(id);
    }
  }
  
  return token;
}

export function validateCSRFToken(sessionId: string, token: string): boolean {
  const stored = csrfTokens.get(sessionId);
  
  if (!stored) {
    return false;
  }
  
  if (stored.expires < Date.now()) {
    csrfTokens.delete(sessionId);
    return false;
  }
  
  return stored.token === token;
}

/**
 * CSRF Protection Middleware
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF check for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  const sessionId = (req as any).session?.id || req.cookies?.sessionId;
  const token = req.headers['x-csrf-token'] as string || req.body?._csrf;
  
  if (!sessionId || !token) {
    return res.status(403).json({
      error: 'CSRF token missing',
      message: 'CSRF token is required for this request'
    });
  }
  
  if (!validateCSRFToken(sessionId, token)) {
    return res.status(403).json({
      error: 'Invalid CSRF token',
      message: 'CSRF token validation failed'
    });
  }
  
  next();
}

/**
 * Security Audit Logging
 */
export interface SecurityEvent {
  timestamp: Date;
  type: 'auth' | 'access' | 'modification' | 'error' | 'suspicious';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ip: string;
  userAgent: string;
  action: string;
  resource?: string;
  details?: any;
  success: boolean;
}

const securityLogs: SecurityEvent[] = [];
const MAX_LOGS = 10000;

export function logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>) {
  const logEntry: SecurityEvent = {
    ...event,
    timestamp: new Date(),
  };
  
  securityLogs.push(logEntry);
  
  // Keep only recent logs in memory
  if (securityLogs.length > MAX_LOGS) {
    securityLogs.shift();
  }
  
  // Log to console for critical events
  if (event.severity === 'critical') {
    console.error('[SECURITY CRITICAL]', JSON.stringify(logEntry, null, 2));
  }
  
  // In production, send to external logging service
  // sendToLogService(logEntry);
}

/**
 * Security Audit Middleware
 */
export function securityAudit(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Capture response
  const originalSend = res.send;
  res.send = function(data: any) {
    const duration = Date.now() - startTime;
    
    // Log security-relevant requests
    if (shouldLogRequest(req)) {
      logSecurityEvent({
        type: getEventType(req),
        severity: getSeverity(req, res),
        userId: (req as any).user?.id,
        ip: req.ip || req.socket.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        action: `${req.method} ${req.path}`,
        resource: req.path,
        details: {
          statusCode: res.statusCode,
          duration,
          query: req.query,
          body: sanitizeLogData(req.body),
        },
        success: res.statusCode < 400,
      });
    }
    
    return originalSend.call(this, data);
  };
  
  next();
}

function shouldLogRequest(req: Request): boolean {
  // Log authentication attempts
  if (req.path.includes('/auth') || req.path.includes('/login')) {
    return true;
  }
  
  // Log data modifications
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return true;
  }
  
  // Log admin actions
  if (req.path.includes('/admin')) {
    return true;
  }
  
  // Log failed requests
  return false;
}

function getEventType(req: Request): SecurityEvent['type'] {
  if (req.path.includes('/auth') || req.path.includes('/login')) {
    return 'auth';
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return 'modification';
  }
  return 'access';
}

function getSeverity(req: Request, res: Response): SecurityEvent['severity'] {
  // Failed authentication
  if (req.path.includes('/auth') && res.statusCode >= 400) {
    return 'high';
  }
  
  // Server errors
  if (res.statusCode >= 500) {
    return 'critical';
  }
  
  // Unauthorized access
  if (res.statusCode === 401 || res.statusCode === 403) {
    return 'medium';
  }
  
  return 'low';
}

function sanitizeLogData(data: any): any {
  if (!data) return data;
  
  const sanitized = { ...data };
  
  // Remove sensitive fields
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard', 'ssn'];
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

/**
 * Get security logs (for admin dashboard)
 */
export function getSecurityLogs(filters?: {
  type?: SecurityEvent['type'];
  severity?: SecurityEvent['severity'];
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): SecurityEvent[] {
  let logs = [...securityLogs];
  
  if (filters) {
    if (filters.type) {
      logs = logs.filter(log => log.type === filters.type);
    }
    if (filters.severity) {
      logs = logs.filter(log => log.severity === filters.severity);
    }
    if (filters.userId) {
      logs = logs.filter(log => log.userId === filters.userId);
    }
    if (filters.startDate) {
      logs = logs.filter(log => log.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
      logs = logs.filter(log => log.timestamp <= filters.endDate!);
    }
  }
  
  // Sort by timestamp descending
  logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  // Limit results
  if (filters?.limit) {
    logs = logs.slice(0, filters.limit);
  }
  
  return logs;
}

/**
 * Detect suspicious activity patterns
 */
export function detectSuspiciousActivity(): Array<{
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  affectedUsers: string[];
}> {
  const suspicious: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    affectedUsers: string[];
  }> = [];
  
  const recentLogs = securityLogs.filter(
    log => log.timestamp.getTime() > Date.now() - 3600000 // Last hour
  );
  
  // Detect multiple failed login attempts
  const failedLogins = new Map<string, number>();
  for (const log of recentLogs) {
    if (log.type === 'auth' && !log.success && log.userId) {
      failedLogins.set(log.userId, (failedLogins.get(log.userId) || 0) + 1);
    }
  }
  
  for (const [userId, count] of Array.from(failedLogins.entries())) {
    if (count >= 5) {
      suspicious.push({
        type: 'brute_force',
        description: `${count} failed login attempts detected`,
        severity: 'high',
        affectedUsers: [userId],
      });
    }
  }
  
  // Detect unusual access patterns
  const accessByIp = new Map<string, number>();
  for (const log of recentLogs) {
    accessByIp.set(log.ip, (accessByIp.get(log.ip) || 0) + 1);
  }
  
  for (const [ip, count] of Array.from(accessByIp.entries())) {
    if (count > 1000) {
      suspicious.push({
        type: 'excessive_requests',
        description: `${count} requests from IP ${ip} in the last hour`,
        severity: 'medium',
        affectedUsers: [],
      });
    }
  }
  
  return suspicious;
}

/**
 * Input validation helpers
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

export function validatePhoneNumber(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone.replace(/[\s\-()]/g, ''));
}

export function validateURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function validateFileUpload(filename: string, allowedExtensions: string[]): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? allowedExtensions.includes(ext) : false;
}

/**
 * Rate limiting for sensitive operations
 */
const operationLimits = new Map<string, { count: number; resetAt: number }>();

export function checkOperationLimit(
  key: string,
  maxOperations: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const limit = operationLimits.get(key);
  
  if (!limit || limit.resetAt < now) {
    operationLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (limit.count >= maxOperations) {
    return false;
  }
  
  limit.count++;
  return true;
}
