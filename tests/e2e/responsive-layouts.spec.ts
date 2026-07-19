import { test, expect } from 'playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const pages = [
  { path: '/' },
  { path: '/search' },
  { path: '/parcels/1/map' },
  { path: '/field-surveyor' },
] as const;

test.describe('Responsive layout smoke tests', () => {
  for (const viewport of viewports) {
    test.describe(viewport.name, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const pageConfig of pages) {
        test(`${pageConfig.path} renders without horizontal overflow on ${viewport.name}`, async ({ page }) => {
          await page.goto(`${BASE_URL}${pageConfig.path}`);
          await expect(page.locator('body')).toBeVisible();

          const dimensions = await page.evaluate(() => ({
            bodyScrollWidth: document.body.scrollWidth,
            viewportWidth: window.innerWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
          }));

          expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
          expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
        });
      }
    });
  }
});
