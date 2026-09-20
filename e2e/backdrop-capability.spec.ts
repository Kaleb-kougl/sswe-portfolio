import { test, expect, type Page } from '@playwright/test';

/**
 * Who gets the animated backdrop, measured rather than asserted.
 *
 * `morph-canvas.tsx` used to decide with `(max-width: 767px)`: every phone, and
 * every narrow desktop window, was handed a still. It now animates by default
 * and downgrades only on evidence — the work-time watchdog in
 * `frame-watchdog.ts`, fed from the existing `useFrame` loop. These tests prove
 * both halves of that on the phone project, where the behaviour changed.
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
 * CPU throttle used to simulate a slow device — NOT to force a downgrade.
 *
 * Measured on this scene, pre-downgrade: 20x lands the desktop project at
 * ~39fps and the phone project at ~57fps, while the backdrop's own share of
 * the frame stays near a millisecond. That is the shape of the population this
 * watchdog must leave alone, and at 39fps it is on the wrong side of the 40fps
 * floor the rule used to apply.
 */
const THROTTLE_RATE = 20;

/**
 * Milliseconds burned inside every draw call to stage a real downgrade.
 *
 * Comfortably over `WATCHDOG_MAX_WORK_MS` (16), so the rolling average clears
 * the budget on the first full window rather than hovering at the edge.
 */
const EXPENSIVE_DRAW_MS = 40;

type DrawCounter = { __draws: number; __drawCostMs: number };

/**
 * Counts WebGL draws, and can make each one expensive on demand.
 *
 * The second half is how the downgrade is staged. `MorphingBlocks` brackets
 * its own frame — buffer write through `gl.render` — and the watchdog judges
 * that span, so burning time inside the draw call is burning time inside the
 * span, which is precisely the condition the rule exists to catch: a device on
 * which drawing this scene is what costs the frame.
 *
 * It replaces CPU throttling, which cannot stage this at all. Measured, the
 * scene costs under 0.1ms a frame, so even a 50x handicap only brings it to
 * ~4ms — and how many times over you have to multiply 0.1ms to clear a 16ms
 * budget depends entirely on how fast the machine running the test is. This
 * does not: the cost is absolute and the same everywhere.
 *
 * Must be installed before any page script runs, hence `addInitScript`.
 */
async function countWebGLDraws(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as DrawCounter).__draws = 0;
    (window as unknown as DrawCounter).__drawCostMs = 0;
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
        const cost = (window as unknown as DrawCounter).__drawCostMs;
        if (cost > 0) {
          // Busy-wait, deliberately: this has to occupy the main thread inside
          // the span the watchdog is timing, which a promise or a timer would
          // not. It runs only in this test.
          const until = performance.now() + cost;
          while (performance.now() < until);
        }
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

test.describe('The work-time watchdog', () => {
  // Not skipped anywhere: the watchdog is the one part of this that is not
  // about viewport width at all, and "a narrow window is not a slow GPU" is
  // half the point of the change. It has to hold on the desktop project too.

  test('a slow device keeps its animation while the scene stays cheap', async ({ page }) => {
    // The regression. This backdrop used to be downgraded for running below
    // 40fps, which is a statement about the compositor and not about the
    // device: a browser on a 30Hz display cleared the floor by being healthy
    // and was turned off anyway. The rule now judges what the frame costs, and
    // under a twentyfold CPU handicap this scene still costs about a
    // millisecond of it.
    test.setTimeout(120_000);

    await openSettledPage(page);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE_RATE });

    // Well past the ~3.7s the watchdog needs to make up its mind: 1s warm-up,
    // 20 frames of window, 2s of sustained badness.
    await page.waitForTimeout(10_000);

    const mark = await drawsSoFar(page);
    await page.waitForTimeout(SAMPLE_MS);
    const draws = (await drawsSoFar(page)) - mark;

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    expect(
      draws,
      'a slow device with a cheap backdrop was downgraded — the watchdog is judging frame rate again',
    ).toBeGreaterThan(0);
  });

  test('downgrades once when the scene itself eats the frame, and stays down', async ({ page }) => {
    test.setTimeout(120_000);

    await openSettledPage(page);

    // --- Control: it is animating to begin with --------------------------
    const beforeCost = await drawsSoFar(page);
    await page.waitForTimeout(SAMPLE_MS);
    expect(
      (await drawsSoFar(page)) - beforeCost,
      'the backdrop was not animating, so this test proves nothing',
    ).toBeGreaterThan(LIVE_FRAME_FLOOR);

    // --- Make the scene expensive ----------------------------------------
    await page.evaluate(
      (ms) => {
        (window as unknown as { __drawCostMs: number }).__drawCostMs = ms;
      },
      EXPENSIVE_DRAW_MS,
    );

    // Polled rather than slept: the exact moment is the hardware's to decide,
    // and what is under test is that it arrives at all.
    await expect
      .poll(
        async () => {
          const mark = await drawsSoFar(page);
          await page.waitForTimeout(1_000);
          return (await drawsSoFar(page)) - mark;
        },
        {
          timeout: 45_000,
          message: 'the watchdog never downgraded on a scene costing 40ms a frame',
        },
      )
      .toBeLessThanOrEqual(1);

    // --- Make it cheap again: the downgrade must not reverse -------------
    // This is the anti-oscillation claim. A watchdog that promoted the scene
    // back would restart the loop here, and a flickering backdrop is worse
    // than either state.
    await page.evaluate(() => {
      (window as unknown as { __drawCostMs: number }).__drawCostMs = 0;
    });
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
