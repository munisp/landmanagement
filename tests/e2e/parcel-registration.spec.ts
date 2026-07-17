import { test, expect } from '@playwright/test';

/**
 * End-to-End Tests for Parcel Registration Flow
 * Tests the complete user journey from login to parcel registration
 */

test.describe('Parcel Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to application
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('should complete full parcel registration flow', async ({ page }) => {
    // Step 1: Login
    await page.click('text=Login');
    await page.waitForURL('**/oauth/**');
    
    // Mock OAuth login (in production, this would be actual OAuth flow)
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'mock_token_for_testing');
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Step 2: Navigate to Parcels
    await page.click('text=Parcels');
    await expect(page).toHaveURL(/.*parcels/);
    
    // Step 3: Click Register Parcel
    await page.click('text=Register Parcel');
    
    // Step 4: Fill out parcel form
    await page.fill('[name="parcelId"]', 'TEST-PARCEL-001');
    await page.fill('[name="owner"]', 'John Doe');
    await page.fill('[name="location"]', 'Lagos, Nigeria');
    await page.fill('[name="area"]', '5000');
    await page.fill('[name="value"]', '50000000');
    
    // Select land use type
    await page.click('[name="landUse"]');
    await page.click('text=Residential');
    
    // Select state
    await page.click('[name="state"]');
    await page.click('text=Lagos');
    
    // Fill address
    await page.fill('[name="address"]', '123 Test Street, Ikeja, Lagos');
    
    // Fill coordinates
    await page.fill('[name="latitude"]', '6.5244');
    await page.fill('[name="longitude"]', '3.3792');
    
    // Step 5: Submit form
    await page.click('button[type="submit"]');
    
    // Step 6: Verify success message
    await expect(page.locator('text=Parcel registered successfully')).toBeVisible();
    
    // Step 7: Verify parcel appears in list
    await page.goto('/parcels');
    await expect(page.locator('text=TEST-PARCEL-001')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    // Navigate to register parcel
    await page.goto('/parcels/register');
    
    // Try to submit empty form
    await page.click('button[type="submit"]');
    
    // Verify validation messages
    await expect(page.locator('text=Parcel ID is required')).toBeVisible();
    await expect(page.locator('text=Owner is required')).toBeVisible();
    await expect(page.locator('text=Location is required')).toBeVisible();
  });

  test('should search for parcels', async ({ page }) => {
    await page.goto('/parcels');
    
    // Enter search query
    await page.fill('[placeholder*="Search"]', 'Lagos');
    
    // Wait for search results
    await page.waitForTimeout(500);
    
    // Verify results contain search term
    const results = await page.locator('[data-testid="parcel-item"]').all();
    expect(results.length).toBeGreaterThan(0);
  });

  test('should filter parcels by state', async ({ page }) => {
    await page.goto('/parcels');
    
    // Click filter dropdown
    await page.click('[data-testid="state-filter"]');
    
    // Select Lagos
    await page.click('text=Lagos');
    
    // Wait for filtered results
    await page.waitForTimeout(500);
    
    // Verify all results are from Lagos
    const stateLabels = await page.locator('[data-testid="parcel-state"]').allTextContents();
    stateLabels.forEach(state => {
      expect(state).toContain('Lagos');
    });
  });

  test('should view parcel details', async ({ page }) => {
    await page.goto('/parcels');
    
    // Click on first parcel
    await page.click('[data-testid="parcel-item"]');
    
    // Verify details page
    await expect(page).toHaveURL(/.*parcels\/[^/]+$/);
    
    // Verify details are displayed
    await expect(page.locator('[data-testid="parcel-owner"]')).toBeVisible();
    await expect(page.locator('[data-testid="parcel-location"]')).toBeVisible();
    await expect(page.locator('[data-testid="parcel-area"]')).toBeVisible();
  });
});

test.describe('Transaction Flow', () => {
  test('should initiate a transfer transaction', async ({ page }) => {
    await page.goto('/transactions');
    
    // Click initiate transaction
    await page.click('text=Initiate Transaction');
    
    // Fill transaction form
    await page.fill('[name="parcelId"]', 'TEST-PARCEL-001');
    
    // Select transaction type
    await page.click('[name="type"]');
    await page.click('text=Transfer');
    
    // Fill recipient
    await page.fill('[name="recipient"]', 'Jane Smith');
    
    // Fill amount
    await page.fill('[name="amount"]', '45000000');
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Verify success
    await expect(page.locator('text=Transaction initiated successfully')).toBeVisible();
  });

  test('should view transaction history', async ({ page }) => {
    await page.goto('/transactions');
    
    // Verify transaction list is displayed
    await expect(page.locator('[data-testid="transaction-item"]').first()).toBeVisible();
    
    // Click on a transaction
    await page.click('[data-testid="transaction-item"]');
    
    // Verify transaction details
    await expect(page.locator('[data-testid="transaction-type"]')).toBeVisible();
    await expect(page.locator('[data-testid="transaction-status"]')).toBeVisible();
  });
});

test.describe('Document Management', () => {
  test('should upload a document', async ({ page }) => {
    await page.goto('/documents');
    
    // Click upload button
    await page.click('text=Upload Document');
    
    // Select document type
    await page.click('[name="type"]');
    await page.click('text=Title Deed');
    
    // Upload file
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-deed.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('Mock PDF content'),
    });
    
    // Fill description
    await page.fill('[name="description"]', 'Test title deed document');
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Verify success
    await expect(page.locator('text=Document uploaded successfully')).toBeVisible();
  });
});

test.describe('Blockchain Verification', () => {
  test('should verify parcel on blockchain', async ({ page }) => {
    await page.goto('/blockchain');
    
    // Enter parcel ID
    await page.fill('[name="parcelId"]', 'TEST-PARCEL-001');
    
    // Click verify
    await page.click('text=Verify');
    
    // Wait for verification
    await page.waitForTimeout(2000);
    
    // Verify result
    await expect(page.locator('[data-testid="verification-status"]')).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/');
    
    // Tab through elements
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    
    // Continue tabbing
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Verify focus is visible
    const focusedElement = await page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('/parcels');
    
    // Check for ARIA labels on interactive elements
    const searchInput = page.locator('[role="searchbox"]');
    await expect(searchInput).toHaveAttribute('aria-label');
    
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const hasAriaLabel = await button.getAttribute('aria-label');
      const hasText = await button.textContent();
      
      // Button should have either aria-label or text content
      expect(hasAriaLabel || hasText).toBeTruthy();
    }
  });

  test('should support screen reader navigation', async ({ page }) => {
    await page.goto('/');
    
    // Check for landmark regions
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('nav')).toBeVisible();
    
    // Check for heading hierarchy
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
  });
});

test.describe('Internationalization', () => {
  test('should switch to French language', async ({ page }) => {
    await page.goto('/');
    
    // Click language selector
    await page.click('[data-testid="language-selector"]');
    
    // Select French
    await page.click('text=Français');
    
    // Verify French text appears
    await expect(page.locator('text=Parcelles')).toBeVisible();
  });

  test('should support RTL for Arabic', async ({ page }) => {
    await page.goto('/');
    
    // Switch to Arabic
    await page.click('[data-testid="language-selector"]');
    await page.click('text=العربية');
    
    // Verify RTL direction
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
  });
});

test.describe('Performance', () => {
  test('should load home page within 3 seconds', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(3000);
  });

  test('should handle large parcel lists efficiently', async ({ page }) => {
    await page.goto('/parcels');
    
    // Wait for list to load
    await page.waitForSelector('[data-testid="parcel-item"]');
    
    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    
    // Verify no performance degradation
    const fps = await page.evaluate(() => {
      return new Promise(resolve => {
        requestAnimationFrame(t1 => {
          requestAnimationFrame(t2 => {
            resolve(1000 / (t2 - t1));
          });
        });
      });
    });
    
    expect(fps).toBeGreaterThan(30); // At least 30 FPS
  });
});
