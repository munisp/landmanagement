import { test, expect } from 'playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const languages = [
  { code: 'en', direction: 'ltr' },
  { code: 'fr', direction: 'ltr' },
  { code: 'es', direction: 'ltr' },
  { code: 'ar', direction: 'rtl' },
  { code: 'ha', direction: 'ltr' },
  { code: 'yo', direction: 'ltr' },
  { code: 'ig', direction: 'ltr' },
  { code: 'pcm', direction: 'ltr' },
  { code: 'sw', direction: 'ltr' },
] as const;

const routes = ['/', '/search', '/parcels/1/map'] as const;

test.describe('Multilingual smoke coverage', () => {
  for (const language of languages) {
    test(`${language.code} loads core public pages with correct direction metadata`, async ({ page }) => {
      await page.addInitScript((lang) => {
        window.localStorage.setItem('i18nextLng', lang);
      }, language.code);

      for (const route of routes) {
        await page.goto(`${BASE_URL}${route}`);
        await expect(page.locator('body')).toBeVisible();
        await expect(page.locator('body')).not.toContainText('undefined');

        const metadata = await page.evaluate(() => ({
          lang: document.documentElement.lang,
          dir: document.documentElement.dir || 'ltr',
          bodyScrollWidth: document.body.scrollWidth,
          viewportWidth: window.innerWidth,
        }));

        expect(metadata.lang).toBe(language.code);
        expect(metadata.dir).toBe(language.direction);
        expect(metadata.bodyScrollWidth).toBeLessThanOrEqual(metadata.viewportWidth + 1);
      }
    });
  }
});
