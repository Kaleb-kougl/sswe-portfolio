import { defineConfig, devices } from '@playwright/test';

import { VITALS_SPEC } from './playwright.vitals.config';

/**
 * Playwright configuration for the single-page scrolling portfolio.
 * - Desktop: Chromium at 1280×720 — above the 900px nav breakpoint
 * - Mobile: Chromium (Pixel 5) at 375×812 — below it, so the nav is collapsed
 * - Visual regression with maxDiffPixelRatio: 0.01
 *
 * Both projects run every spec here; the ones that only make sense on one side
 * of the 900px breakpoint skip themselves based on `viewport.width`.
 *
 * `e2e/midrange-phone.spec.ts` is deliberately excluded. It measures Core Web
 * Vitals, which are meaningless against `next dev` — unminified modules,
 * compiled on request — so it runs from `playwright.vitals.config.ts` against
 * a production server instead (`npm run test:vitals`). See the header there.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: VITALS_SPEC,
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
    // Force the contact form into its unconfigured state for the whole suite.
    // Next's dev server reads .env.local, so a developer with a real
    // CONTACT_DELIVERY_KEY set would otherwise have these tests POST to the
    // live Formspree endpoint — burning quota, and mailing them if it were
    // accepted. contact-form.spec.ts asserts the 503 path by design, so the
    // absence of a key is the condition under test, not an accident.
    env: { CONTACT_DELIVERY_KEY: '' },
  },
});
