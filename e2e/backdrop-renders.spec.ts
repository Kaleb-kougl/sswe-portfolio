import { test, expect, type Page } from '@playwright/test';

/**
 * Does the backdrop render AT ALL.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Every other backdrop spec here asks whether the scene animates, stops, or
 * downgrades. None of them asked the prior question, and a real failure walked
 * straight through the gap: react-three-fiber creates its root only once
 * `react-use-measure` reports a non-zero box, that report comes exclusively
 * from a ResizeObserver delivery, and a document that is not being rendered
 * when the canvas mounts never gets one. The canvas then sits at the 300x150
 * intrinsic default HTML gives an unsized `<canvas>` — inside a host measuring
 * the full viewport — and draws nothing.
 *
 * Nothing caught it, and the reason is worth writing down, because it is a
 * lesson about assertions rather than about WebGL:
 *
 *   - the WebGL error boundary catches exceptions, and there is no exception
 *     for a component that simply never started;
 *   - the Canvas `fallback` renders when context creation FAILS, not when it
 *     is never attempted;
 *   - the host is `aria-hidden`, so the accessibility pass skips it;
 *   - the draw-call budget was a ceiling ("<= 10"), and a scene that renders
 *     nothing passes a ceiling more comfortably than a correct one does.
 *
 * That last one is the point. A budget stated as a maximum is satisfied by
 * zero. The assertions below are ranges on both sides, and the one that would
 * actually have failed is the first: the canvas's own size.
 *
 * `scripts/check-hero-budget.mjs` remains the *asset* check and is careful to
 * say it can only prove the file permits one draw call. This is the runtime
 * half it names as the follow-up.
 */

/** One second is ~60 frames of a live loop and 0 of a stopped one. */
const SAMPLE_MS = 1_000;

/** `MAX_DPR` / `MAX_DPR_SMALL` in `morph-canvas.tsx`, and their breakpoint. */
const MAX_DPR = 1.5;
const MAX_DPR_SMALL = 1.25;
const SMALL_VIEWPORT_MAX_WIDTH = 767;

/** The advertised ceiling — `MAX_DRAW_CALLS` in `scripts/check-hero-budget.mjs`. */
const DRAW_CALL_BUDGET = 10;

type Probe = { __draws: number; __frames: number };

/**
 * Counts WebGL draws and animation frames side by side.
 *
 * Draws alone cannot express "one draw call per frame" — that is a ratio, and
 * without the denominator the only assertion available is the ceiling that let
 * a blank scene through. Frames are counted with the same `requestAnimationFrame`
 * the renderer is driven by, so the two numbers are over the same window.
 */
async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const probe = window as unknown as Probe;
    probe.__draws = 0;
    probe.__frames = 0;

    const tick = () => {
      probe.__frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const proto = (
      window as unknown as { WebGL2RenderingContext?: { prototype: Record<string, unknown> } }
    ).WebGL2RenderingContext?.prototype;
    if (!proto) return;

    for (const name of ['drawElementsInstanced', 'drawArraysInstanced', 'drawElements', 'drawArrays']) {
      const original = proto[name] as ((...args: unknown[]) => unknown) | undefined;
      if (typeof original !== 'function') continue;
      proto[name] = function (this: unknown, ...args: unknown[]) {
        probe.__draws++;
        return original.apply(this, args);
      };
    }
  });
}

const sample = (page: Page) =>
  page.evaluate(() => {
    const probe = window as unknown as Probe;
    return { draws: probe.__draws, frames: probe.__frames };
  });

/** The canvas box, its host's box, and the backing store R3F gave it. */
const surfaceOf = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return null;
    const host = canvas.closest('[aria-hidden="true"]') as HTMLElement;
    const box = host.getBoundingClientRect();
    return {
      backing: { width: canvas.width, height: canvas.height },
      css: { width: canvas.clientWidth, height: canvas.clientHeight },
      host: { width: Math.round(box.width), height: Math.round(box.height) },
      dpr: window.devicePixelRatio,
    };
  });

async function openSettledPage(page: Page) {
  await page.goto('/');
  await expect(page.locator('#hero')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  // Let the first paint and the hero.glb geometry swap finish.
  await page.waitForTimeout(2_000);
}

test.describe('The backdrop is actually on screen', () => {
  test('the canvas is sized to its host, not left at the 300x150 default', async ({
    page,
    viewport,
  }) => {
    await openSettledPage(page);

    const surface = await surfaceOf(page);
    expect(surface).not.toBeNull();

    // The failure this file was written for, stated directly. 300x150 is what
    // an <canvas> measures when nothing has ever called setSize on it.
    expect(
      { width: surface!.css.width, height: surface!.css.height },
      'the canvas is still at its intrinsic default — R3F never created its root',
    ).not.toEqual({ width: 300, height: 150 });

    // ...and it is the host's size, not merely *some* size.
    expect(Math.abs(surface!.css.width - surface!.host.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(surface!.css.height - surface!.host.height)).toBeLessThanOrEqual(1);

    // The backing store follows, at the capped device pixel ratio.
    const cap = (viewport?.width ?? 0) > SMALL_VIEWPORT_MAX_WIDTH ? MAX_DPR : MAX_DPR_SMALL;
    const expected = surface!.css.width * Math.min(surface!.dpr, cap);
    expect(Math.abs(surface!.backing.width - expected)).toBeLessThanOrEqual(1);
  });

  test('draw calls per frame are inside the budget AND above zero', async ({ page }) => {
    await installProbe(page);
    await openSettledPage(page);

    const before = await sample(page);
    await page.waitForTimeout(SAMPLE_MS);
    const after = await sample(page);

    const draws = after.draws - before.draws;
    const frames = after.frames - before.frames;

    expect(frames, 'the page produced no animation frames, so nothing was measured').toBeGreaterThan(
      10,
    );
    // The half that was missing. A ceiling alone is satisfied by a scene that
    // renders nothing at all, which is exactly how this shipped broken.
    expect(draws, 'the backdrop issued no draw calls — the scene is blank').toBeGreaterThan(0);
    expect(draws / frames, 'the backdrop is over its draw-call budget').toBeLessThanOrEqual(
      DRAW_CALL_BUDGET,
    );
  });

  test('the backdrop recovers when the first ResizeObserver delivery never arrives', async ({
    page,
  }) => {
    // The bug, staged deterministically. In the wild the delivery goes missing
    // because the document is not being rendered when the canvas mounts (a
    // background tab, a page restored from the bfcache); here the observer is
    // simply replaced with one that accepts targets and never calls back, which
    // is the same thing from react-use-measure's side and does not depend on
    // the harness being able to background a tab.
    //
    // Before `canvas-measure.ts` this test fails on the first assertion with a
    // 300x150 canvas.
    await installProbe(page);
    await page.addInitScript(() => {
      class DeadResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      Object.defineProperty(window, 'ResizeObserver', { value: DeadResizeObserver });
    });

    await openSettledPage(page);

    const surface = await surfaceOf(page);
    expect(
      { width: surface!.css.width, height: surface!.css.height },
      'no ResizeObserver delivery ever arrived and nothing else measured the canvas',
    ).not.toEqual({ width: 300, height: 150 });
    expect(Math.abs(surface!.css.width - surface!.host.width)).toBeLessThanOrEqual(1);

    const before = await sample(page);
    await page.waitForTimeout(SAMPLE_MS);
    expect((await sample(page)).draws - before.draws).toBeGreaterThan(0);
  });
});
