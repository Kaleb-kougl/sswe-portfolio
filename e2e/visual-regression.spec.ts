import { test, expect, type Page } from '@playwright/test';

/**
 * Visual regression for the scrolling page.
 *
 * The old baselines snapshotted the IDE layout and were deleted with it; these
 * regenerate on first run.
 *
 * TAMING THE BACKDROP
 * -------------------
 * The fixed 3D backdrop morphs continuously as you scroll and sways on a clock,
 * so a raw screenshot of this page is never twice the same. Two levers:
 *
 *   1. `reducedMotion: 'reduce'` — `morph-canvas.tsx` then renders `StaticBlocks`
 *      with `frameloop="demand"`: one arrangement, written once, no `useFrame`
 *      and no scroll listener (`reduced-motion.spec.ts` proves this by counting
 *      WebGL draw calls). The same media query also disables the page's own CSS
 *      transitions and smooth scrolling, per `globals.css`.
 *   2. The canvas is hidden outright with an injected stylesheet. Even one still
 *      WebGL frame is at the mercy of the GPU, the driver and antialiasing, and
 *      the block geometry is swapped in from `public/models/hero.glb` after a
 *      fetch. Hiding it keeps the diff about layout and type, which is what a
 *      snapshot can actually defend.
 *
 * NOT `mask:` — the canvas is `fixed inset-0`, i.e. the whole viewport, so
 * Playwright's mask paints the entire screenshot a flat pink and every baseline
 * comes out byte-identical and worthless. `visibility: hidden` leaves the page
 * itself in the frame.
 *
 * Skipped in CI: baselines are platform-specific (macOS vs Linux font
 * rasterisation). Run locally with
 * `npx playwright test e2e/visual-regression.spec.ts`.
 */

const SECTIONS = ['hero', 'work', 'career', 'process', 'contact'] as const;

const SHOT = {
  animations: 'disabled',
  maxDiffPixelRatio: 0.01,
  timeout: 15_000,
} as const;

async function settle(page: Page) {
  // `src/app/loading.tsx` wraps the route in a Suspense boundary; snapshotting
  // before React reveals the page would capture the fallback spinner.
  await expect(page.locator('#hero')).toBeVisible();
  await page.addStyleTag({
    // The canvas, plus the Next dev-tools indicator: the suite runs against
    // `next dev`, and its floating badge is not part of the page.
    content:
      'canvas { visibility: hidden !important; } nextjs-portal { display: none !important; }',
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

test.describe('Visual regression', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test.skip(
    () => !!process.env.CI,
    'Snapshot baselines are platform-specific and are only kept for local dev (darwin)',
  );

  for (const id of SECTIONS) {
    test(`#${id} section`, async ({ page }) => {
      await page.goto('/');
      await settle(page);

      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);

      await expect(page).toHaveScreenshot(`${id}.png`, SHOT);
    });
  }

  test('open mobile menu', async ({ page, viewport }) => {
    test.skip(
      (viewport?.width ?? 0) >= 900,
      'The menu toggle only exists below 900px',
    );

    await page.goto('/');
    await settle(page);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.locator('#nav-menu')).toBeVisible();

    await expect(page).toHaveScreenshot('nav-menu-open.png', SHOT);
  });
});
