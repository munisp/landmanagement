import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';
import { securityEvents } from './metrics';

// ============================================================================
// Field-Level Encryption
// ============================================================================

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function resolveEncryptionKey(): string {
  const configuredKey = process.env.ENCRYPTION_KEY?.trim();

  if (configuredKey) {
    if (!/^[a-fA-F0-9]{64}$/.test(configuredKey)) {
      throw new Error('ENCRYPTION_KEY must be a 64-character hexadecimal string');
    }
    return configuredKey;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY must be set in production');
  }

  logger.warn('ENCRYPTION_KEY not set; using deterministic development fallback key');
  return crypto.createHash('sha256').update('idlr-pts-dev-encryption-key').digest('hex');
}

const ENCRYPTION_KEY = resolveEncryptionKey();

export class FieldEncryption {
  private key: Buffer;

  constructor() {
    this.key = Buffer.from(ENCRYPTION_KEY, 'hex');
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  encryptObject<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
    const result = { ...obj };
    for (const field of fields) {
      if (result[field] !== undefined && result[field] !== null) {
        result[field] = this.encrypt(String(result[field])) as any;
      }
    }
    return result;
  }

  decryptObject<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
    const result = { ...obj };
    for (const field of fields) {
      if (result[field] !== undefined && result[field] !== null) {
        try {
          result[field] = this.decrypt(String(result[field])) as any;
        } catch (error) {
          logger.error({ error, field }, 'Failed to decrypt field');
        }
      }
    }
    return result;
  }
}

export const fieldEncryption = new FieldEncryption();

// ============================================================================
// Web Application Firewall (WAF)
// ============================================================================

interface WAFRule {
  id: string;
  name: string;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: 'log' | 'block';
}

const WAF_RULES: WAFRule[] = [
  // SQL Injection
  {
    id: 'SQL_001',
    name: 'SQL Injection - UNION',
    pattern: /(\bunion\b.*\bselect\b|\bselect\b.*\bunion\b)/i,
    severity: 'critical',
    action: 'block'
  },
  {
    id: 'SQL_002',
    name: 'SQL Injection - Comments',
    pattern: /(--|\#|\/\*|\*\/)/,
    severity: 'high',
    action: 'block'
  },
  {
    id: 'SQL_003',
    name: 'SQL Injection - OR 1=1',
    pattern: /(\bor\b\s+\d+\s*=\s*\d+|\band\b\s+\d+\s*=\s*\d+)/i,
    severity: 'critical',
    action: 'block'
  },
  
  // XSS
  {
    id: 'XSS_001',
    name: 'XSS - Script Tag',
    pattern: /<script[^>]*>[\s\S]*?<\/script>/i,
    severity: 'critical',
    action: 'block'
  },
  {
    id: 'XSS_002',
    name: 'XSS - Event Handlers',
    pattern: /\bon\w+\s*=\s*["']?[^"']*["']?/i,
    severity: 'high',
    action: 'block'
  },
  {
    id: 'XSS_003',
    name: 'XSS - JavaScript Protocol',
    pattern: /javascript:/i,
    severity: 'high',
    action: 'block'
  },
  
  // Path Traversal
  {
    id: 'PATH_001',
    name: 'Path Traversal',
    pattern: /(\.\.|\/etc\/|\/var\/|\/usr\/|\/bin\/|\/sbin\/)/i,
    severity: 'high',
    action: 'block'
  },
  
  // Command Injection
  {
    id: 'CMD_001',
    name: 'Command Injection',
    pattern: /[;&|`$()]/,
    severity: 'critical',
    action: 'block'
  },
  
  // LDAP Injection
  {
    id: 'LDAP_001',
    name: 'LDAP Injection',
    pattern: /(\*|\(|\)|\||&)/,
    severity: 'medium',
    action: 'log'
  },
  
  // XXE
  {
    id: 'XXE_001',
    name: 'XML External Entity',
    pattern: /<!ENTITY/i,
    severity: 'high',
    action: 'block'
  }
];

export class WAF {
  private rules: WAFRule[];
  private blockedIPs: Set<string>;
  private suspiciousIPs: Map<string, number>;

  constructor() {
    this.rules = WAF_RULES;
    this.blockedIPs = new Set();
    this.suspiciousIPs = new Map();
    
    // Clean up suspicious IPs every hour
    setInterval(() => {
      this.suspiciousIPs.clear();
    }, 60 * 60 * 1000);
  }

  checkRequest(req: Request): { allowed: boolean; violations: string[] } {
    const violations: string[] = [];
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    // Check if IP is blocked
    if (this.blockedIPs.has(ip)) {
      logger.warn({ ip }, 'Blocked IP attempted access');
          securityEvents.labels('blocked_ip', 'failure').inc();
      return { allowed: false, violations: ['IP_BLOCKED'] };
    }

    // Check all request data
    const dataToCheck = [
      ...Object.values(req.query || {}),
      ...Object.values(req.body || {}),
      ...Object.values(req.params || {}),
      req.url
    ].filter(val => typeof val === 'string');

    for (const data of dataToCheck) {
      for (const rule of this.rules) {
        if (rule.pattern.test(data)) {
          violations.push(rule.id);
          
          logger.warn({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            ip,
            url: req.url,
            method: req.method,
            data: data.substring(0, 100)
          }, 'WAF rule violation');

          securityEvents.labels('waf_violation', 'failure').inc();

          if (rule.action === 'block') {
            this.recordSuspiciousActivity(ip);
            return { allowed: false, violations };
          }
        }
      }
    }

    return { allowed: true, violations };
  }

  private recordSuspiciousActivity(ip: string): void {
    const count = (this.suspiciousIPs.get(ip) || 0) + 1;
    this.suspiciousIPs.set(ip, count);

    // Block IP after 5 violations
    if (count >= 5) {
      this.blockedIPs.add(ip);
      logger.error({ ip, violations: count }, 'IP blocked due to repeated violations');
      securityEvents.labels('ip_auto_blocked', 'failure').inc();
    }
  }

  blockIP(ip: string): void {
    this.blockedIPs.add(ip);
    logger.info({ ip }, 'IP manually blocked');
  }

  unblockIP(ip: string): void {
    this.blockedIPs.delete(ip);
    this.suspiciousIPs.delete(ip);
    logger.info({ ip }, 'IP unblocked');
  }

  getBlockedIPs(): string[] {
    return Array.from(this.blockedIPs);
  }
}

export const waf = new WAF();

// WAF Middleware
export function wafMiddleware(req: Request, res: Response, next: NextFunction): void {
  const result = waf.checkRequest(req);
  
  if (!result.allowed) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Request blocked by Web Application Firewall',
      violations: result.violations
    });
    return;
  }

  if (result.violations.length > 0) {
    logger.warn({ violations: result.violations, url: req.url }, 'Request triggered WAF rules (logged only)');
  }

  next();
}

// ============================================================================
// Intrusion Detection System (IDS)
// ============================================================================

interface SecurityEvent {
  timestamp: Date;
  ip: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, any>;
}

export class IntrusionDetectionSystem {
  private events: SecurityEvent[];
  private maxEvents: number;

  constructor() {
    this.events = [];
    this.maxEvents = 10000;
  }

  recordEvent(event: Omit<SecurityEvent, 'timestamp'>): void {
    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: new Date()
    };

    this.events.push(fullEvent);
    
    // Keep only recent events
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Log critical events
    if (event.severity === 'critical') {
      logger.error({ event: fullEvent }, 'Critical security event detected');
      securityEvents.labels('critical_event', 'failure').inc();
    }

    // Analyze patterns
    this.analyzePatterns(event.ip);
  }

  private analyzePatterns(ip: string): void {
    const recentEvents = this.events.filter(e => 
      e.ip === ip && 
      e.timestamp > new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
    );

    // Detect brute force
    const authFailures = recentEvents.filter(e => e.type === 'auth_failure');
    if (authFailures.length >= 5) {
      this.recordEvent({
        ip,
        type: 'brute_force_detected',
        severity: 'critical',
        details: { attempts: authFailures.length }
      });
      waf.blockIP(ip);
    }

    // Detect scanning
    const uniqueUrls = new Set(recentEvents.map(e => e.details.url));
    if (uniqueUrls.size >= 20) {
      this.recordEvent({
        ip,
        type: 'scanning_detected',
        severity: 'high',
        details: { urls: uniqueUrls.size }
      });
    }

    // Detect high request rate
    if (recentEvents.length >= 100) {
      this.recordEvent({
        ip,
        type: 'high_request_rate',
        severity: 'medium',
        details: { requests: recentEvents.length }
      });
    }
  }

  getRecentEvents(limit: number = 100): SecurityEvent[] {
    return this.events.slice(-limit);
  }

  getEventsByIP(ip: string, limit: number = 100): SecurityEvent[] {
    return this.events.filter(e => e.ip === ip).slice(-limit);
  }

  getEventsBySeverity(severity: SecurityEvent['severity']): SecurityEvent[] {
    return this.events.filter(e => e.severity === severity);
  }
}

export const ids = new IntrusionDetectionSystem();

// IDS Middleware
export function idsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  
  // Record request
  ids.recordEvent({
    ip,
    type: 'http_request',
    severity: 'low',
    details: {
      method: req.method,
      url: req.url,
      userAgent: req.get('user-agent')
    }
  });

  // Monitor response
  const originalSend = res.send;
  res.send = function(data: any): Response {
    if (res.statusCode === 401 || res.statusCode === 403) {
      ids.recordEvent({
        ip,
        type: 'auth_failure',
        severity: 'medium',
        details: {
          url: req.url,
          statusCode: res.statusCode
        }
      });
    }
    
    if (res.statusCode >= 500) {
      ids.recordEvent({
        ip,
        type: 'server_error',
        severity: 'high',
        details: {
          url: req.url,
          statusCode: res.statusCode
        }
      });
    }

    return originalSend.call(this, data);
  };

  next();
}

// ============================================================================
// Security Headers
// ============================================================================

export function advancedSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Content Security Policy
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.manus.im",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));

  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // Remove server header
  res.removeHeader('X-Powered-By');

  next();
}

// ============================================================================
// Secrets Rotation
// ============================================================================

export class SecretsRotation {
  private rotationSchedule: Map<string, Date>;

  constructor() {
    this.rotationSchedule = new Map();
  }

  scheduleRotation(secretName: string, daysUntilRotation: number): void {
    const rotationDate = new Date();
    rotationDate.setDate(rotationDate.getDate() + daysUntilRotation);
    this.rotationSchedule.set(secretName, rotationDate);
  }

  checkRotationDue(): string[] {
    const now = new Date();
    const dueSecrets: string[] = [];

    for (const entry of Array.from(this.rotationSchedule.entries())) {
      const [secretName, rotationDate] = entry;
      if (now >= rotationDate) {
        dueSecrets.push(secretName);
      }
    }

    return dueSecrets;
  }

  generateSecureSecret(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
}

export const secretsRotation = new SecretsRotation();

// Schedule rotation for critical secrets (90 days)
secretsRotation.scheduleRotation('JWT_SECRET', 90);
secretsRotation.scheduleRotation('ENCRYPTION_KEY', 90);
secretsRotation.scheduleRotation('API_KEYS', 30);

// ============================================================================
// Security Audit Logger
// ============================================================================

export class SecurityAuditLogger {
  logSecurityEvent(event: {
    type: string;
    user?: string;
    ip?: string;
    action: string;
    resource?: string;
    result: 'success' | 'failure';
    details?: Record<string, any>;
  }): void {
    logger.info({
      ...event,
      timestamp: new Date().toISOString(),
      category: 'security_audit'
    }, `Security Event: ${event.type}`);

    securityEvents.labels(event.type, event.result).inc();
  }
}

export const securityAuditLogger = new SecurityAuditLogger();
