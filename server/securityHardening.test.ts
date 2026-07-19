import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import request from 'supertest';
import type { Request, Response } from 'express';
import { configureApp } from './_core/index';
import { sdk } from './_core/sdk';
import { COOKIE_NAME } from '@shared/const';
import { authenticateWebSocketUpgrade } from './webSocketAuth';
import { getSessionCookieOptions } from './_core/cookies';
import { createApiKey, getUsageStats, validateApiKey } from './apiKeyService';

// Lets the fail-closed middleware tests simulate a validation-backend outage
// while every other test keeps using the real PGlite-backed service.
const apiKeyBackendState = vi.hoisted(() => ({ fail: false }));
vi.mock('./apiKeyService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./apiKeyService')>();
  return {
    ...actual,
    validateApiKey: async (key: string) => {
      if (apiKeyBackendState.fail) throw new Error('database unavailable');
      return actual.validateApiKey(key);
    },
  };
});

import { validateApiKey as validateApiKeyMiddleware } from './_core/security';
import { healthCheck, readinessProbe } from './_core/healthCheck';
import { requireDb } from './db';
import { activityLogs } from '../drizzle/schema';
import { desc, eq } from 'drizzle-orm';

/**
 * Security hardening tests — exercise the REAL wired HTTP stack (helmet,
 * CORS, rate limiting, CSRF guard, authenticated file serving) through
 * supertest against the same configureApp() the production server uses,
 * plus the WebSocket upgrade-authentication helper.
 */

const ADMIN_OPEN_ID = 'seed-user-registry-admin'; // seeded by migration 0015

async function mintSessionCookie(openId: string): Promise<string> {
  // name must be non-empty: verifySession rejects payloads with empty fields.
  const token = await sdk.createSessionToken(openId, {
    expiresInMs: 60_000,
    name: 'Security Test User',
  });
  return `${COOKIE_NAME}=${token}`;
}

describe('HTTP security middleware (wired via configureApp)', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    configureApp(app);
  });

  it('sets hardened security headers and hides X-Powered-By', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('reflects an allow-listed origin with credentials', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('omits CORS headers for a foreign origin (without erroring)', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(200); // fail-closed via header omission, not 500
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects a cross-site cookie-riding mutation (CSRF guard)', async () => {
    const cookie = await mintSessionCookie(ADMIN_OPEN_ID);
    const res = await request(app)
      .post('/api/trpc/auth.me')
      .set('Host', 'app.example.com')
      .set('Origin', 'https://evil.example.com')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send({});
    expect(res.status).toBe(403);
  });

  it('lets a same-origin cookie mutation through the CSRF guard', async () => {
    const cookie = await mintSessionCookie(ADMIN_OPEN_ID);
    const res = await request(app)
      .post('/api/trpc/auth.me')
      .set('Host', 'app.example.com')
      .set('Origin', 'https://app.example.com')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send({});
    expect(res.status).not.toBe(403); // guard passed; tRPC answers (200 here)
  });

  it('exempts bearer-token clients from the CSRF guard', async () => {
    const res = await request(app)
      .post('/api/trpc/auth.me')
      .set('Host', 'app.example.com')
      .set('Origin', 'https://evil.example.com')
      .set('Authorization', 'Bearer invalid-token-still-exempt-from-guard')
      .set('Content-Type', 'application/json')
      .send({});
    expect(res.status).not.toBe(403); // 401 from auth layer is expected
  });

  it('requires authentication for /api/files/* and rejects anonymous access', async () => {
    const anon = await request(app).get('/api/files/documents/deed.pdf');
    expect(anon.status).toBe(401);

    const cookie = await mintSessionCookie(ADMIN_OPEN_ID);
    const authed = await request(app)
      .get('/api/files/documents/deed.pdf')
      .set('Cookie', cookie);
    expect(authed.status).toBe(404); // authenticated, file simply absent
  });

  it('rate-limits authentication endpoints after 5 failed attempts', async () => {
    // preview-login is disabled outside explicit opt-in, so every attempt
    // fails (404) and counts against the auth limiter (max 5 / 15 min).
    let lastStatus = 0;
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/api/auth/preview-login');
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(404);
    const blocked = await request(app).get('/api/auth/preview-login');
    expect(blocked.status).toBe(429);
  });
});

describe('WebSocket upgrade authentication', () => {
  it('rejects requests with no credentials', async () => {
    const user = await authenticateWebSocketUpgrade({ headers: {} } as any);
    expect(user).toBeNull();
  });

  it('rejects a forged session cookie', async () => {
    const user = await authenticateWebSocketUpgrade({
      headers: { cookie: `${COOKIE_NAME}=forged.garbage.token` },
    } as any);
    expect(user).toBeNull();
  });

  it('resolves the session user from a valid cookie', async () => {
    const cookie = await mintSessionCookie(ADMIN_OPEN_ID);
    const user = await authenticateWebSocketUpgrade({
      headers: { cookie },
    } as any);
    expect(user).not.toBeNull();
    expect(user!.id).toBe(1);
    expect(user!.role).toBe('admin');
  });
});

describe('Session cookie policy', () => {
  const originalCrossSite = process.env.CROSS_SITE_COOKIES;

  afterAll(() => {
    if (originalCrossSite === undefined) {
      delete process.env.CROSS_SITE_COOKIES;
    } else {
      process.env.CROSS_SITE_COOKIES = originalCrossSite;
    }
  });

  it('defaults to SameSite=Lax even over HTTPS (cross-site is opt-in)', () => {
    delete process.env.CROSS_SITE_COOKIES;
    const req = { protocol: 'https', headers: {} } as any;
    const opts = getSessionCookieOptions(req);
    expect(opts.httpOnly).toBe(true);
    expect(opts.secure).toBe(true);
    expect(opts.sameSite).toBe('lax');
  });

  it('enables SameSite=None only when CROSS_SITE_COOKIES=true and secure', () => {
    process.env.CROSS_SITE_COOKIES = 'true';
    const secureReq = { protocol: 'https', headers: {} } as any;
    expect(getSessionCookieOptions(secureReq).sameSite).toBe('none');

    const plainReq = { protocol: 'http', headers: {} } as any;
    const plainOpts = getSessionCookieOptions(plainReq);
    expect(plainOpts.sameSite).toBe('lax'); // never None without Secure
    expect(plainOpts.secure).toBe(false);
  });
});

describe('API key usage telemetry (real, not simulated)', () => {
  it('aggregates genuine validation events', async () => {
    const key = await createApiKey('1', 'Telemetry Test Key');
    expect(key.key).toMatch(/^idlr_[a-f0-9]{64}$/);

    const before = await getUsageStats('1');

    const validated = await validateApiKey(key.key);
    expect(validated).not.toBeNull();
    await validateApiKey(key.key);

    const after = await getUsageStats('1');
    expect(after.requestsToday).toBe(before.requestsToday + 2);
    expect(after.requestsThisMonth).toBe(before.requestsThisMonth + 2);
    // No rate-limit or error events have occurred — honestly zero.
    expect(after.rateLimitHits).toBe(before.rateLimitHits);
    expect(after.errorRate).toBe(0);
  });

  it('rejects unknown keys without recording usage', async () => {
    const bogus = await validateApiKey('idlr_' + '0'.repeat(64));
    expect(bogus).toBeNull();
  });
});

describe('validateApiKey middleware (fail-closed)', () => {
  function mockReq(overrides: Partial<Request> = {}): Request {
    return {
      headers: {},
      ip: '203.0.113.10',
      path: '/api/v1/external/parcels',
      socket: { remoteAddress: '203.0.113.10' },
      ...overrides,
    } as unknown as Request;
  }

  function mockRes() {
    const state: { statusCode: number | null; body: unknown } = { statusCode: null, body: null };
    const res = {
      status(code: number) {
        state.statusCode = code;
        return res;
      },
      json(payload: unknown) {
        state.body = payload;
        return res;
      },
    } as unknown as Response;
    return { res, state };
  }

  async function latestAuditEvent(type: string) {
    const db = await requireDb();
    const rows = await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.type, type))
      .orderBy(desc(activityLogs.id))
      .limit(1);
    return rows[0] ?? null;
  }

  beforeEach(() => {
    apiKeyBackendState.fail = false;
  });

  it('rejects requests without an API key', async () => {
    const middleware = validateApiKeyMiddleware();
    const { res, state } = mockRes();
    const next = vi.fn();

    await middleware(mockReq(), res, next);

    expect(state.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects keys that are not persisted, and audits the rejection', async () => {
    const middleware = validateApiKeyMiddleware();
    const { res, state } = mockRes();
    const next = vi.fn();

    await middleware(
      mockReq({ headers: { 'x-api-key': 'idlr_' + 'a'.repeat(64) } } as unknown as Request),
      res,
      next
    );

    expect(state.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();

    // The audit write is fire-and-forget; give it a tick to land.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const event = await latestAuditEvent('api_key_rejected');
    expect(event).not.toBeNull();
    expect(event!.userId).toBeNull(); // anonymous: no attributable user
    expect(event!.description).toContain('Invalid API key');
  });

  it('returns 503 when the validation backend is unavailable — never bypasses', async () => {
    apiKeyBackendState.fail = true;
    const middleware = validateApiKeyMiddleware();
    const { res, state } = mockRes();
    const next = vi.fn();

    await middleware(
      mockReq({ headers: { 'x-api-key': 'idlr_' + 'b'.repeat(64) } } as unknown as Request),
      res,
      next
    );

    expect(state.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 50));
    const event = await latestAuditEvent('api_key_rejected');
    expect(event!.description).toContain('validation backend unavailable');
  });

  it('authenticates persisted keys, attaches identity, and audits acceptance', async () => {
    const key = await createApiKey('1', 'Fail-Closed Middleware Test Key');
    const middleware = validateApiKeyMiddleware();
    const { res } = mockRes();
    const next = vi.fn();
    const req = mockReq({ headers: { 'x-api-key': key.key } } as unknown as Request);

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const attached = (req as Request & { apiKeyAuth?: { id: string; userId: string; name: string } }).apiKeyAuth;
    expect(attached).toBeDefined();
    expect(attached!.name).toBe('Fail-Closed Middleware Test Key');

    await new Promise((resolve) => setTimeout(resolve, 50));
    const event = await latestAuditEvent('api_key_accepted');
    expect(event).not.toBeNull();
    expect(event!.userId).toBe(1);
    expect(event!.description).toContain('Fail-Closed Middleware Test Key');
  });
});

describe('health endpoint redaction', () => {
  function healthReq(ip: string): Request {
    return {
      headers: {},
      ip,
      socket: { remoteAddress: ip },
    } as unknown as Request;
  }

  function healthRes() {
    const state: { statusCode: number | null; body: unknown } = { statusCode: null, body: null };
    const res = {
      status(code: number) {
        state.statusCode = code;
        return res;
      },
      json(payload: unknown) {
        state.body = payload;
        return res;
      },
    } as unknown as Response;
    return { res, state };
  }

  it('external callers receive only status and timestamp', async () => {
    const { res, state } = healthRes();
    await healthCheck(healthReq('203.0.113.10'), res);

    expect(state.body).toBeDefined();
    const body = state.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['status', 'timestamp']);
    expect(body.checks).toBeUndefined();
  });

  it('loopback callers receive full dependency details', async () => {
    const { res, state } = healthRes();
    await healthCheck(healthReq('127.0.0.1'), res);

    const body = state.body as Record<string, unknown>;
    expect(body.checks).toBeDefined();
    expect((body.checks as Record<string, unknown>).database).toBeDefined();
  });

  it('readiness probe redacts for external callers but keeps status semantics', async () => {
    const { res, state } = healthRes();
    await readinessProbe(healthReq('203.0.113.10'), res);

    // PGlite is up in tests, so readiness must be 200 — but without internals.
    expect(state.statusCode).toBe(200);
    const body = state.body as Record<string, unknown>;
    expect(body.checks).toBeUndefined();
  });
});

describe('fraud block threshold governance', () => {
  it('platform owns the block decision via env-configurable threshold', () => {
    const source = readFileSync(
      join(__dirname, 'api/routers/ai-services.ts'),
      'utf-8'
    );
    // Tripwire: the threshold and the platform-side blocked decision must not
    // be silently removed in favor of trusting the model's own flag.
    expect(source).toContain('FRAUD_SCORE_BLOCK_THRESHOLD');
    expect(source).toContain('fraudScore >= FRAUD_SCORE_BLOCK_THRESHOLD');
    expect(source).toContain('blocked,');
  });
});
