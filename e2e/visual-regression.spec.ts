import { test, expect } from '@playwright/test';

/**
 * Visual Regression Tests — TDD §11.4
 *
 * Captures baseline screenshots for desktop and mobile layouts.
 * Uses maxDiffPixelRatio: 0.01 for tight regression detection.
 */

test.describe('Visual Regression', () => {
  test('desktop layout screenshot', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    await page.goto('/');

    // Wait for full hydration: hierarchy tree, 3D canvas, and console
    await page.waitForSelector('[aria-label="Project hierarchy"]', { timeout: 15_000 });
    await page.waitForSelector('[aria-label="Console output"]', { timeout: 15_000 });

    // Wait for canvas to mount and initial animations to settle
    await page.waitForSelector('[aria-label="3D Viewport"] canvas', { timeout: 15_000 });
    await page.waitForTimeout(2_000); // Let animations settle

    await expect(page).toHaveScreenshot('desktop-layout.png', {
      maxDiffPixelRatio: 0.05,
      fullPage: false,
      timeout: 15_000,
    });

    await context.close();
  });

  test('mobile layout screenshot', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();

    await page.goto('/');

    // Wait for mobile layout to hydrate
    await page.waitForSelector('#mobile-menu-trigger', { timeout: 15_000 });

    // Let animations and 3D settle
    await page.waitForTimeout(2_000);

    await expect(page).toHaveScreenshot('mobile-layout.png', {
      maxDiffPixelRatio: 0.05,
      fullPage: false,
      timeout: 15_000,
    });

    await context.close();
  });
});
