import { test, expect } from '@playwright/test';

/**
 * Homepage smoke test, for the engines the rest of the homepage suite does not
 * run in (WebKit, Firefox; see `CROSS_BROWSER_SPECS` in playwright.config.ts).
 * It checks that the page renders, stays free of page errors, lays out without
 * horizontal overflow, and that the nav and the route to /fit work. The
 * Chromium-shaped specs (visual baselines, WebGL draw counts) cover the rest.
 */

const DESKTOP_MIN_WIDTH = 900;
const SECTION_IDS = ['hero', 'work', 'career', 'process', 'contact'] as const;

test.describe('Homepage smoke', () => {
  test('renders every section with no page errors and no horizontal overflow', async ({ page }) => {
    const errors: string[] = [];
    // The suite runs against `next dev`. When a source file changes mid-run,
    // Turbopack renames its HMR client chunk and an already-open page can fail
    // to fetch the old one. That chunk doesn't exist in a production build, so
    // it is the only error ignored here.
    page.on('pageerror', (err) => {
      if (!err.message.includes('/browser/dev/hmr-client/')) errors.push(err.message);
    });

    await page.goto('/');
    await expect(page.locator('#hero')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    for (const id of SECTION_IDS) await expect(page.locator(`#${id}`)).toHaveCount(1);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // Let lazy chunks (the backdrop, the demo) arrive before judging errors.
    await page.waitForLoadState('load');
    expect(errors).toEqual([]);
  });

  test('the nav reaches a section', async ({ page, viewport }) => {
    await page.goto('/');
    await expect(page.locator('#hero')).toBeVisible();

    if ((viewport?.width ?? 0) < DESKTOP_MIN_WIDTH) {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.locator('#nav-menu').getByRole('link', { name: 'Contact', exact: true }).click();
    } else {
      await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Contact', exact: true }).click();
    }
    await expect(page).toHaveURL(/#contact$/);
    await expect
      .poll(() => page.locator('#contact').evaluate((el) => el.getBoundingClientRect().top), { timeout: 5_000 })
      .toBeLessThan(200);
  });

  test('the hero links to /fit', async ({ page }) => {
    await page.goto('/');
    await page.locator('#hero').getByRole('link', { name: 'Check your role against my work' }).click();
    await page.waitForURL('**/fit');
    await expect(page.getByRole('heading', { level: 1, name: 'Check your role against my work' })).toBeVisible();
  });
});
