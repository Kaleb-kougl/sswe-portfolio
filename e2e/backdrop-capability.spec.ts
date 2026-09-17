import { test, expect, type Page } from '@playwright/test';

/**
 * Who gets the animated backdrop, measured rather than asserted.
 *
 * `morph-canvas.tsx` used to decide with `(max-width: 767px)`: every phone, and
 * every narrow desktop window, was handed a still. It now animates by default
 * and downgrades only on evidence — a frame-time watchdog inside the existing
 * `useFrame` loop. These tests prove both halves of that on the phone project,
 * where the behaviour actually changed.
 *
 * HOW ANY OF THIS IS OBSERVED
 * ---------------------------
 * By counting WebGL draw entry points, the technique `reduced-motion.spec.ts`
 * established: the backdrop is deliberately ONE draw call per frame, so the
 * counter is a frame counter. "Animating" is draws accumulating over a window;
 * "downgraded" is the same window going flat. Screenshots could not carry
 * either claim — a WebGL surface read back through the compositor is not stable
 * enough — and neither could a DOM assertion, because nothing about the still
 * and the morph differs in the DOM. They differ in whether frames happen.
 *
 * The complementary case, reduced motion measuring 0 draws, lives in
 * `reduced-motion.spec.ts` and runs on this same phone project. It is the
 * guarantee this file is not allowed to weaken.
 */

const SAMPLE_MS = 2_000;

/** ~60fps over two seconds is ~120 frames; 30 is a floor a still can never reach. */
const LIVE_FRAME_FLOOR = 30;

/** `MAX_DPR_SMALL` in `morph-canvas.tsx`, and the breakpoint it is keyed to. */
const SMALL_VIEWPORT_MAX_DPR = 1.25;
const SMALL_VIEWPORT_MAX_WIDTH = 767;

/**
 * CPU throttle used to force a downgrade.
 *
 * Measured on this scene: 20x still holds ~58fps (112 instances is almost no
 * CPU work), 50x collapses it to ~8fps. 50 is therefore the first rate that
 * actually simulates a device the watchdog is meant to catch — and the fact
 * that 20 does not is the more useful half of that measurement.
 */
const THROTTLE_RATE = 50;

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

const drawsSoFar = (page: Page) => page.evaluate(() => (window as unknown as DrawCounter).__draws);

async function openSettledPage(page: Page) {
  await countWebGLDraws(page);
  await page.goto('/');
  // The route is behind a Suspense boundary (`src/app/loading.tsx`).
  await expect(page.locator('#hero')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  // Let the first paint and the hero.glb geometry swap finish.
  await page.waitForTimeout(SAMPLE_MS);
}

test.describe('The backdrop animates on a phone', () => {
  test('a live render loop runs at a phone viewport', async ({ page, viewport }) => {
    test.skip(
      (viewport?.width ?? 0) > SMALL_VIEWPORT_MAX_WIDTH,
      'This is the phone case; the desktop control lives in reduced-motion.spec.ts',
    );

    await openSettledPage(page);

    const mark = await drawsSoFar(page);
    await page.waitForTimeout(SAMPLE_MS);
    const idleDraws = (await drawsSoFar(page)) - mark;

    // Before this change the same measurement was exactly 0: the width test
    // gave every phone `frameloop="demand"` and no `useFrame` at all.
    expect(
      idleDraws,
      'the phone backdrop is still frozen — the width gate is back',
    ).toBeGreaterThan(LIVE_FRAME_FLOOR);
  });

  test('scrolling drives the morph rather than re-rendering React', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) > SMALL_VIEWPORT_MAX_WIDTH, 'Phone case only');

    await openSettledPage(page);

    const mark = await drawsSoFar(page);
    await page.locator('#process').scrollIntoViewIfNeeded();
    await page.waitForTimeout(SAMPLE_MS);

    expect((await drawsSoFar(page)) - mark).toBeGreaterThan(LIVE_FRAME_FLOOR);
  });

  test('the canvas is capped below the device pixel ratio on a small viewport', async ({
    page,
    viewport,
  }) => {
    test.skip((viewport?.width ?? 0) > SMALL_VIEWPORT_MAX_WIDTH, 'Phone case only');

    await page.goto('/');
    await expect(page.locator('canvas')).toHaveCount(1);

    const surface = await page.evaluate(() => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      return {
        backingWidth: canvas.width,
        cssWidth: canvas.clientWidth,
        devicePixelRatio: window.devicePixelRatio,
      };
    });

    // The device asks for more than the cap, so the cap is doing something.
    expect(surface.devicePixelRatio).toBeGreaterThan(SMALL_VIEWPORT_MAX_DPR);
    // +1 for the browser rounding the backing store to whole pixels.
    expect(surface.backingWidth).toBeLessThanOrEqual(
      surface.cssWidth * SMALL_VIEWPORT_MAX_DPR + 1,
    );
  });
});

test.describe('The frame-time watchdog', () => {
  // Not skipped anywhere: the watchdog is the one part of this that is not
  // about viewport width at all, and "a narrow window is not a slow GPU" is
  // half the point of the change. It has to hold on the desktop project too.
  test('downgrades once on a device that cannot keep up, and stays down', async ({ page }) => {
    // Throttling to 1/50th speed makes every step of this slow.
    test.setTimeout(120_000);

    await openSettledPage(page);

    // --- Control: it is animating to begin with --------------------------
    const beforeThrottle = await drawsSoFar(page);
    await page.waitForTimeout(SAMPLE_MS);
    expect(
      (await drawsSoFar(page)) - beforeThrottle,
      'the backdrop was not animating, so this test proves nothing',
    ).toBeGreaterThan(LIVE_FRAME_FLOOR);

    // --- Make the device slow -------------------------------------------
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE_RATE });

    // ~1s warm-up, then 20 frames of window at ~8fps, then 2s of sustained
    // badness. Polled rather than slept: the exact moment is hardware's to
    // decide, and what is under test is that it arrives at all.
    await expect
      .poll(
        async () => {
          const mark = await drawsSoFar(page);
          await page.waitForTimeout(1_000);
          return (await drawsSoFar(page)) - mark;
        },
        {
          timeout: 45_000,
          message: 'the watchdog never downgraded on a device running at ~8fps',
        },
      )
      .toBeLessThanOrEqual(1);

    // --- Un-slow it: the downgrade must not reverse ----------------------
    // This is the anti-oscillation claim. A watchdog that promoted the scene
    // back would restart the loop here, and a flickering backdrop is worse
    // than either state.
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.waitForTimeout(SAMPLE_MS);

    const afterRecovery = await drawsSoFar(page);
    await page.waitForTimeout(SAMPLE_MS);
    expect(
      (await drawsSoFar(page)) - afterRecovery,
      'the backdrop came back after the downgrade — it is oscillating',
    ).toBe(0);

    // Scrolling must not wake it either: the still has no scroll listener.
    await page.locator('#contact').scrollIntoViewIfNeeded();
    await page.waitForTimeout(SAMPLE_MS);
    const afterScroll = await drawsSoFar(page);
    await page.waitForTimeout(SAMPLE_MS);
    expect((await drawsSoFar(page)) - afterScroll).toBe(0);

    // ...and the still is on screen: one canvas, painted, just not repainted.
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(afterScroll).toBeGreaterThan(0);
  });
});
