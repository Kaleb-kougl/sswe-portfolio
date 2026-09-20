import { defineConfig, devices } from '@playwright/test';

/**
 * The Core Web Vitals run: `npm run test:vitals`.
 *
 * Separate from `playwright.config.ts` for one reason, and it is not tidiness.
 * The behavioural suite runs against `next dev`, which is right for it — it
 * asserts what the page *does*, and dev and production do the same things.
 * This config asserts what the page *costs*, and dev and production emphat-
 * ically do not cost the same: dev ships unminified modules and compiles them
 * on request. An LCP taken there would be a fact about the dev server.
 *
 * So this one runs `next start` on :3100, against a real production build.
 *
 * WHY THE BUILD IS NOT IN `webServer`
 * -----------------------------------
 * It was, once: `npm run build && next start`. Next holds a build lock, so a
 * build launched from inside a Playwright webServer collides with any other
 * build — the CI step that already ran one, a second config's server, a stale
 * lock from an interrupted run — and the failure surfaces as the server never
 * coming up, which reads like a timeout and is not one. The build belongs in
 * the npm script, before Playwright starts, where it happens exactly once and
 * fails loudly on its own terms.
 *
 * `.next` is shared with `next dev`, which is safe in Next 16: dev writes to
 * `.next/dev` and the build writes the production tree beside it.
 */

/** Owned here; `playwright.config.ts` imports it to exclude the same spec. */
export const VITALS_SPEC = /midrange-phone\.spec\.ts/;

const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  testMatch: VITALS_SPEC,
  forbidOnly: !!process.env.CI,
  // Retried in CI for the same reason the main suite is, and it matters more
  // here: every figure is a timing, and a shared runner is a noisy place to
  // take one. The budgets are the published thresholds rather than this
  // build's own numbers precisely so that noise does not decide the result.
  retries: process.env.CI ? 2 : 0,
  // One at a time, always. Three throttled browsers on one machine contend for
  // the CPU they are each pretending to have less of, which would make every
  // number a measurement of how many tests are running.
  workers: 1,
  reporter: 'html',

  projects: [
    {
      name: 'midrange-phone',
      use: {
        // The Pixel 5 descriptor unmodified — its own 393×851, not the 375×812
        // the nav tests pin, because this project is not about a breakpoint.
        // The CPU and network handicaps are applied per test over CDP; the
        // spec explains what they stand in for.
        ...devices['Pixel 5'],
        baseURL: `http://localhost:${PORT}`,
        trace: 'on-first-retry',
      },
    },
  ],

  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Same reasoning as the dev server in the main config, and it matters more
    // here: this is a production server, which would read and use a real key.
    env: { CONTACT_DELIVERY_KEY: '' },
  },
});
