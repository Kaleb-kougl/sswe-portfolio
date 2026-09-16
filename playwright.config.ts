import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the single-page scrolling portfolio.
 * - Desktop: Chromium at 1280×720 — above the 900px nav breakpoint
 * - Mobile: Chromium (Pixel 5) at 375×812 — below it, so the nav is collapsed
 * - Visual regression with maxDiffPixelRatio: 0.01
 *
 * Both projects run every spec; the ones that only make sense on one side of
 * the 900px breakpoint skip themselves based on `viewport.width`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 812 },
      },
    },
  ],

  /* Start the dev server before tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
