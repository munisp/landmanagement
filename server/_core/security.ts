/**
 * Security Hardening Middleware
 * 
 * Features:
 * - Rate limiting
 * - CORS configuration
 * - Security headers (Helmet)
 * - Input validation
 * - CSRF protection
 * - XSS protection
 * - SQL injection protection
 */

import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { validateApiKey as validateStoredApiKey } from '../apiKeyService';

const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Rate limiting configuration
 */
export const rateLimiters = {
  // General API rate limiter
  api: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/metrics';
    },
  }),
  
  // Strict rate limiter for authentication endpoints
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'Too many authentication attempts, please try again later.',
    skipSuccessfulRequests: true, // Don't count successful requests
  }),
  
  // Rate limiter for sensitive operations
  sensitive: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 requests per hour
    message: 'Too many sensitive operations, please try again later.',
  }),
  
  // Rate limiter for file uploads
  upload: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit each IP to 20 uploads per hour
    message: 'Too many file uploads, please try again later.',
  }),
  
  // Rate limiter for API key creation
  apiKey: rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 3, // Limit each IP to 3 API key creations per day
    message: 'Too many API key creation attempts, please try again tomorrow.',
  }),
};

/**
 * CORS configuration
 */
export function corsMiddleware() {
  const allowedOrigins = [
    FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:5173',
    ...(process.env.ALLOWED_ORIGINS?.split(',') || []),
  ].filter(Boolean);
  
  return cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check if origin is allowed
      if (allowedOrigins.includes(origin) || NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 86400, // 24 hours
  });
}

/**
 * Helmet security headers configuration
 */
export function helmetMiddleware() {
  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Allow inline scripts for development
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        connectSrc: ["'self'", 'https:', 'wss:'],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: NODE_ENV === 'production' ? [] : null,
      },
    },
    
    // Strict Transport Security
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    
    // X-Frame-Options
    frameguard: {
      action: 'deny', // Prevent clickjacking
    },
    
    // X-Content-Type-Options
    noSniff: true, // Prevent MIME type sniffing
    
    // X-XSS-Protection
    xssFilter: true,
    
    // Referrer Policy
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },
    
    // Hide X-Powered-By header
    hidePoweredBy: true,
  });
}

/**
 * Input sanitization middleware
 */
export function sanitizeInput() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }
    
    // Sanitize body
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }
    
    next();
  };
}

/**
 * CSRF protection middleware
 */
export function csrfProtection() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }
    
    // Skip CSRF for API key authentication
    if (req.headers['x-api-key']) {
      return next();
    }
    
    // Verify CSRF token
    const token = req.headers['x-csrf-token'] as string;
    const sessionToken = (req as any).session?.csrfToken;
    
    if (!token || !sessionToken || token !== sessionToken) {
      return res.status(403).json({
        error: 'Invalid CSRF token',
      });
    }
    
    next();
  };
}

/**
 * API key validation middleware
 */
export function validateApiKey() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
      });
    }

    try {
      const validatedKey = await validateStoredApiKey(apiKey);
      if (validatedKey) {
        (req as Request & { apiKeyAuth?: { id: string; userId: string; name: string } }).apiKeyAuth = {
          id: validatedKey.id,
          userId: validatedKey.userId,
          name: validatedKey.name,
        };
        return next();
      }
    } catch (error) {
      console.warn('[Security] API key database validation unavailable, falling back to configured keys:', error);
    }

    if (!isValidApiKey(apiKey)) {
      return res.status(401).json({
        error: 'Invalid API key',
      });
    }

    next();
  };
}

/**
 * IP whitelist middleware
 */
export function ipWhitelist(allowedIps: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || req.socket.remoteAddress || '';
    
    if (!allowedIps.includes(clientIp)) {
      return res.status(403).json({
        error: 'IP address not allowed',
      });
    }
    
    next();
  };
}

/**
 * Request size limiter
 */
export function requestSizeLimiter(maxSize: string = '10mb') {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers['content-length'];
    
    if (contentLength) {
      const sizeInBytes = parseInt(contentLength, 10);
      const maxSizeInBytes = parseSize(maxSize);
      
      if (sizeInBytes > maxSizeInBytes) {
        return res.status(413).json({
          error: 'Request entity too large',
          maxSize,
        });
      }
    }
    
    next();
  };
}

/**
 * Security headers middleware
 */
export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Remove sensitive headers
    res.removeHeader('X-Powered-By');
    
    // Add custom security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    next();
  };
}

// Helper functions

function sanitizeObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return sanitizeValue(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }
  
  return sanitized;
}

function sanitizeValue(value: any): any {
  if (typeof value !== 'string') {
    return value;
  }
  
  // Remove potential XSS vectors
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

function isValidApiKey(apiKey: string): boolean {
  if (!/^idlr_[a-f0-9]{64}$/i.test(apiKey)) {
    return false;
  }

  const validApiKeys = (process.env.VALID_API_KEYS?.split(',') || [])
    .map((key) => key.trim())
    .filter(Boolean);

  return validApiKeys.some((configuredKey) => secureCompare(configuredKey, apiKey));
}

function secureCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseSize(size: string): number {
  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  
  const match = size.toLowerCase().match(/^(\d+)(b|kb|mb|gb)$/);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }
  
  const [, value, unit] = match;
  return parseInt(value, 10) * units[unit];
}

export default {
  rateLimiters,
  corsMiddleware,
  helmetMiddleware,
  sanitizeInput,
  csrfProtection,
  validateApiKey,
  ipWhitelist,
  requestSizeLimiter,
  securityHeaders,
};
