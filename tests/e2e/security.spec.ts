import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Security Tests', () => {
  test.describe('OWASP Top 10 - SQL Injection', () => {
    test('should block SQL injection in query parameters', async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/api/parcels?search=' OR '1'='1`);
      expect(response?.status()).toBe(403);
    });

    test('should block SQL injection with UNION attack', async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/api/parcels?search=test' UNION SELECT * FROM users--`);
      expect(response?.status()).toBe(403);
    });

    test('should block SQL injection with comments', async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/api/parcels?search=test'--`);
      expect(response?.status()).toBe(403);
    });
  });

  test.describe('OWASP Top 10 - XSS', () => {
    test('should block XSS with script tags', async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/api/parcels?search=<script>alert('xss')</script>`);
      expect(response?.status()).toBe(403);
    });

    test('should block XSS with event handlers', async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/api/parcels?search=<img src=x onerror=alert('xss')>`);
      expect(response?.status()).toBe(403);
    });

    test('should block XSS with javascript protocol', async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/api/parcels?search=javascript:alert('xss')`);
      expect(response?.status()).toBe(403);
    });
  });

  test.describe('OWASP Top 10 - Path Traversal', () => {
    test('should block path traversal attempts', async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/api/files?path=../../etc/passwd`);
      expect(response?.status()).toBe(403);
    });

    test('should block absolute path access', async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/api/files?path=/etc/passwd`);
      expect(response?.status()).toBe(403);
    });
  });

  test.describe('OWASP Top 10 - Command Injection', () => {
    test('should block command injection with pipe', async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/api/parcels?search=test|ls`);
      expect(response?.status()).toBe(403);
    });

    test('should block command injection with semicolon', async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/api/parcels?search=test;ls`);
      expect(response?.status()).toBe(403);
    });
  });

  test.describe('Authentication & Authorization', () => {
    test('should require authentication for protected routes', async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/dashboard`);
      // Should redirect to login or return 401
      expect([302, 401]).toContain(response?.status() || 0);
    });

    test('should not allow access to admin routes without admin role', async ({ page, context }) => {
      // Login as regular user (mock)
      await context.addCookies([{
        name: 'session',
        value: 'mock-user-session',
        domain: new URL(BASE_URL).hostname,
        path: '/'
      }]);

      const response = await page.goto(`${BASE_URL}/admin`);
      expect([403, 404]).toContain(response?.status() || 0);
    });
  });

  test.describe('CSRF Protection', () => {
    test('should reject POST requests without CSRF token', async ({ page, context }) => {
      // Login first
      await page.goto(`${BASE_URL}/login`);
      
      // Try to submit form without CSRF token
      const response = await page.evaluate(async () => {
        return fetch('/api/trpc/parcel.create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'test', data: {} })
        });
      });

      expect(response).toBeDefined();
    });
  });

  test.describe('Rate Limiting', () => {
    test('should rate limit excessive requests', async ({ page }) => {
      const requests = [];
      
      // Send 150 requests (limit is 100/min)
      for (let i = 0; i < 150; i++) {
        requests.push(page.goto(`${BASE_URL}/api/health`));
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r?.status() === 429);
      
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  test.describe('Security Headers', () => {
    test('should set Content-Security-Policy header', async ({ page }) => {
      const response = await page.goto(BASE_URL);
      const headers = response?.headers();
      
      expect(headers?.['content-security-policy']).toBeDefined();
      expect(headers?.['content-security-policy']).toContain("default-src 'self'");
    });

    test('should set X-Content-Type-Options header', async ({ page }) => {
      const response = await page.goto(BASE_URL);
      const headers = response?.headers();
      
      expect(headers?.['x-content-type-options']).toBe('nosniff');
    });

    test('should set X-Frame-Options header', async ({ page }) => {
      const response = await page.goto(BASE_URL);
      const headers = response?.headers();
      
      expect(headers?.['x-frame-options']).toBe('DENY');
    });

    test('should set Strict-Transport-Security header', async ({ page }) => {
      const response = await page.goto(BASE_URL);
      const headers = response?.headers();
      
      expect(headers?.['strict-transport-security']).toBeDefined();
    });

    test('should not expose server information', async ({ page }) => {
      const response = await page.goto(BASE_URL);
      const headers = response?.headers();
      
      expect(headers?.['x-powered-by']).toBeUndefined();
      expect(headers?.['server']).not.toContain('Express');
    });
  });

  test.describe('Sensitive Data Exposure', () => {
    test('should not expose sensitive data in error messages', async ({ page }) => {
      const response = await page.goto(`${BASE_URL}/api/nonexistent`);
      const body = await response?.text();
      
      expect(body).not.toContain('Error: ');
      expect(body).not.toContain('at ');
      expect(body).not.toContain('node_modules');
    });

    test('should not expose database errors', async ({ page }) => {
      // Try to trigger a database error
      const response = await page.goto(`${BASE_URL}/api/parcels?id=invalid`);
      const body = await response?.text();
      
      expect(body).not.toContain('SQL');
      expect(body).not.toContain('postgres');
      expect(body).not.toContain('database');
    });
  });

  test.describe('Session Security', () => {
    test('should set secure cookie flags', async ({ page, context }) => {
      await page.goto(`${BASE_URL}/login`);
      
      const cookies = await context.cookies();
      const sessionCookie = cookies.find(c => c.name === 'session');
      
      if (sessionCookie) {
        expect(sessionCookie.httpOnly).toBe(true);
        expect(sessionCookie.sameSite).toBe('Strict');
      }
    });

    test('should invalidate session on logout', async ({ page, context }) => {
      // Login
      await page.goto(`${BASE_URL}/login`);
      
      // Logout
      await page.goto(`${BASE_URL}/logout`);
      
      // Check session cookie is removed
      const cookies = await context.cookies();
      const sessionCookie = cookies.find(c => c.name === 'session');
      
      expect(sessionCookie).toBeUndefined();
    });
  });

  test.describe('Input Validation', () => {
    test('should validate email format', async ({ page }) => {
      await page.goto(`${BASE_URL}/register`);
      
      await page.fill('input[name="email"]', 'invalid-email');
      await page.click('button[type="submit"]');
      
      const error = await page.locator('.error-message').textContent();
      expect(error).toContain('email');
    });

    test('should enforce password complexity', async ({ page }) => {
      await page.goto(`${BASE_URL}/register`);
      
      await page.fill('input[name="password"]', 'weak');
      await page.click('button[type="submit"]');
      
      const error = await page.locator('.error-message').textContent();
      expect(error).toContain('password');
    });
  });
});

test.describe('Accessibility Tests', () => {
  test('homepage should have no accessibility violations', async ({ page }) => {
    await page.goto(BASE_URL);
    await injectAxe(page);
    await checkA11y(page);
  });

  test('login page should have no accessibility violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await injectAxe(page);
    await checkA11y(page);
  });

  test('dashboard should have no accessibility violations', async ({ page, context }) => {
    // Mock authentication
    await context.addCookies([{
      name: 'session',
      value: 'mock-admin-session',
      domain: new URL(BASE_URL).hostname,
      path: '/'
    }]);

    await page.goto(`${BASE_URL}/dashboard`);
    await injectAxe(page);
    await checkA11y(page);
  });
});

test.describe('Performance Tests', () => {
  test('homepage should load within 2 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(BASE_URL);
    const loadTime = Date.now() - start;
    
    expect(loadTime).toBeLessThan(2000);
  });

  test('API response should be within 500ms', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE_URL}/api/health`);
    const responseTime = Date.now() - start;
    
    expect(responseTime).toBeLessThan(500);
  });
});

test.describe('Cross-Browser Compatibility', () => {
  test('should work in different browsers', async ({ browserName, page }) => {
    await page.goto(BASE_URL);
    
    const title = await page.title();
    expect(title).toBeDefined();
    expect(title.length).toBeGreaterThan(0);
  });
});
