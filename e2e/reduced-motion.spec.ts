import { test, expect, type Page } from '@playwright/test';

/**
 * `prefers-reduced-motion: reduce`.
 *
 * `morph-canvas.tsx` reads the query through `useReducedMotion` and swaps the
 * scroll-driven `MorphingBlocks` for `StaticBlocks` with `frameloop="demand"`:
 * one still arrangement, written once, no `useFrame`, no scroll listener. The
 * page itself must lose nothing — all five sections still render.
 *
 * HOW "DOES NOT ANIMATE" IS MEASURED
 * ----------------------------------
 * Not by diffing screenshots of the canvas: a WebGL surface read back through
 * the compositor is not stable enough to carry that assertion, and it says
 * nothing about why. Instead the WebGL draw entry points are counted. The
 * backdrop is deliberately ONE draw call per frame, so the counter is a direct
 * frame counter — 0 new draws over a window means the render loop is not
 * running, which is exactly the claim.
 *
 * Playwright 1.61 moved `reducedMotion` under `contextOptions`; setting it at
 * the top level of `test.use` is no longer a recognised option.
 */

const SECTION_IDS = ['hero', 'work', 'career', 'process', 'contact'] as const;

/** A two-second window is ~120 frames of a live loop, and 0 of a stopped one. */
const SAMPLE_MS = 2_000;

type DrawCounter = { __draws: number };

/** Must be installed before any page script runs, hence `addInitScript`. */
async function countWebGLDraws(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as DrawCounter).__draws = 0;
    const proto = (
      window as unknown as {
        WebGL2RenderingContext?: { prototype: Record<string, unknown> };
      }
    ).WebGL2RenderingContext?.prototype;
    if (!proto) return;

    for (const name of [
      'drawElementsInstanced',
      'drawArraysInstanced',
      'drawElements',
      'drawArrays',
    ]) {
      const original = proto[name] as ((...args: unknown[]) => unknown) | undefined;
      if (typeof original !== 'function') continue;
      proto[name] = function (this: unknown, ...args: unknown[]) {
        (window as unknown as DrawCounter).__draws++;
        return original.apply(this, args);
      };
    }
  });
}

const drawsSoFar = (page: Page) =>
  page.evaluate(() => (window as unknown as DrawCounter).__draws);

async function openSettledPage(page: Page) {
  await countWebGLDraws(page);
  await page.goto('/');
  // The route is behind a Suspense boundary (`src/app/loading.tsx`), so the
  // real page only appears once React reveals it.
  await expect(page.locator('#hero')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  // Let the first paint and the hero.glb geometry swap finish.
  await page.waitForTimeout(SAMPLE_MS);
}

test.describe('Reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the media query really is emulated', async ({ page }) => {
    await page.goto('/');
    const reduce = await page.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    expect(reduce).toBe(true);
  });

  test('all five sections still render', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#hero')).toBeVisible();

    for (const id of SECTION_IDS) {
      const section = page.locator(`#${id}`);
      await expect(section).toHaveCount(1);
      await section.scrollIntoViewIfNeeded();
      await expect(section).toBeVisible();
    }

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(4);
  });

  test('the 3D backdrop does not animate, idle or on scroll', async ({
    page,
  }) => {
    await openSettledPage(page);

    const afterLoad = await drawsSoFar(page);

    await page.waitForTimeout(SAMPLE_MS);
    const idleDraws = (await drawsSoFar(page)) - afterLoad;
    expect(idleDraws, 'the backdrop kept redrawing while the page sat idle').toBe(0);

    await page.locator('#process').scrollIntoViewIfNeeded();
    await page.waitForTimeout(SAMPLE_MS);
    const scrollDraws = (await drawsSoFar(page)) - afterLoad;
    expect(scrollDraws, 'the backdrop redrew in response to scroll').toBe(0);

    // The still arrangement is painted — it just is not repainted.
    expect(afterLoad).toBeGreaterThan(0);
  });
});

test.describe('Motion allowed (control)', () => {
  // The reduced-motion assertion above is only meaningful if the backdrop
  // demonstrably DOES run when motion is allowed — and it now runs on BOTH
  // projects. This used to skip itself on the touch/phone layout, because
  // `morph-canvas.tsx` gated the animation on `(max-width: 767px)` and every
  // phone got the still regardless of the media query above. That gate is
  // gone: the scene animates everywhere it is not asked to stop (reduced
  // motion, save-data) or measured failing to keep up, so on the phone project
  // this control is no longer vacuous — it is the sharper half of the pair.
  // See `backdrop-capability.spec.ts` for the phone case in its own right.

  test('the backdrop runs a live render loop', async ({ page }) => {
    await openSettledPage(page);

    const afterLoad = await drawsSoFar(page);
    await page.waitForTimeout(SAMPLE_MS);
    const idleDraws = (await drawsSoFar(page)) - afterLoad;

    // ~60fps over two seconds; 30 is a floor a stopped loop can never reach.
    expect(idleDraws).toBeGreaterThan(30);
  });
});
