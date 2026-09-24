import { defineConfig, devices } from '@playwright/test';

/**
 * The "no visual change" harness for the Tailwind-utilities -> BEM refactor:
 * `npm run test:bem` (record a new baseline with `npm run test:bem:update`).
 *
 * Two checks, both against a PRODUCTION server on :3100 (`next build` runs in
 * the npm script, not in `webServer`; see the header of
 * `playwright.vitals.config.ts` for why):
 *
 *   e2e/bem/screenshots.spec.ts       pixel-exact screenshots (maxDiffPixels: 0)
 *   e2e/bem/computed-styles.spec.ts   getComputedStyle for every element, plus
 *                                     :hover / :focus-visible / :active /
 *                                     :disabled deltas, diffed property by property
 *
 * Baselines live in e2e/bem/__baseline__/. The PNGs are gitignored
 * (/e2e/**\/*.png); they are platform-specific (darwin font rasterisation) and
 * only meant to live for the duration of the refactor.
 *
 * Only Chromium: the computed-style spec forces pseudo-classes over CDP.
 */
const PORT = 3100;

export default defineConfig({
  testDir: './e2e/bem',
  // Each state is its own page in its own context, so parallel workers cannot
  // interfere with one another; the production server is stateless for GETs.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries: a baseline that only passes on the second try is not a baseline.
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  snapshotPathTemplate: '{testDir}/__baseline__/screenshots/{projectName}/{arg}{ext}',

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
  },

  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 } },
    },
  ],

  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Never reuse: whatever is on :3100 may be a stale build or a dev server
    // holding a real contact key.
    reuseExistingServer: false,
    timeout: 120_000,
    // A production server reads .env.local and would use a real delivery key.
    // NEXT_PUBLIC_FIT_PRIVATE_MODE is inlined at build time (the npm script
    // sets it for `next build`); it is repeated here for the server side.
    env: { CONTACT_DELIVERY_KEY: '', NEXT_PUBLIC_FIT_PRIVATE_MODE: '1' },
  },
});
