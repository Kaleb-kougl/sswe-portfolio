import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * The r3f-projectiles live demo: its launcher, its dialog, and the promise the
 * dialog makes to the rest of the page.
 *
 * WHAT IS ACTUALLY AT RISK HERE
 * -----------------------------
 * Three things, and they are the three things this spec spends most of its
 * effort on:
 *
 *   1. A SECOND WEBGL CONTEXT. The page already runs one — the fixed morphing
 *      backdrop, deliberately one draw call per frame. Opening this dialog
 *      starts another, drawing thousands of instances. `backdrop-power.ts`
 *      drops the backdrop's `frameloop` to `"never"` for as long as the dialog
 *      is mounted, and "it really stopped" is measured the way
 *      `reduced-motion.spec.ts` measures it: by counting WebGL draw entry
 *      points. The counter here is per-canvas, because with the demo open there
 *      are two contexts on the page and a single global tally would be
 *      dominated by the one that is supposed to be busy.
 *
 *   2. FOCUS. A modal that does not trap focus, or that drops it on the floor
 *      when it closes, is worse than no modal.
 *
 *   3. THE BADGE. Under the arena sits `N instances · 1 draw call`, which is
 *      a performance claim made to a reader who came to check one. Counting
 *      draws cannot substantiate it: `mesh.count` is the pool size, so the
 *      field issues its one instanced draw whether or not a single projectile
 *      is alive, and "the demo canvas drew something" is satisfied by the
 *      floor plane. The last describe block takes the three claims apart and
 *      measures each where it lives — the DOM, the GL entry point, the pixels.
 *
 * Playwright 1.61 moved `reducedMotion` under `contextOptions`; setting it at
 * the top level of `test.use` is no longer a recognised option.
 */

const SAMPLE_MS = 2_000;
/** ~120 frames of a live 60fps loop; 30 is a floor a stopped loop cannot reach. */
const LIVE_FRAME_FLOOR = 30;

/** `FULL_MOTION_POOL` in `projectile-demo.tsx` — the size of the instance pool. */
const INSTANCE_POOL = 4000;

/**
 * A liveness floor for the ANIMATION FRAMES in a `SAMPLE_MS` window, as
 * distinct from `LIVE_FRAME_FLOOR` above, which counts draws.
 *
 * A 2s window measures 29-33 frames here. That is not 15fps: headless Chromium
 * is not vsync-locked, and the number moves with how many workers are sharing
 * the machine (24 on a two-worker run). It is used only as a denominator and as
 * proof the loop ran at all, so the floor is set well under the observed range
 * rather than fitted to it — a stopped loop produces 0, which is the only thing
 * this needs to exclude.
 */
const SAMPLE_FRAME_FLOOR = 10;

interface DrawStats {
  /** Every draw entry point, instanced or not. */
  total: number;
  /**
   * `draw*Instanced` only. On the demo's canvas that is the projectile field
   * and nothing else — the floor plane and the wireframe grid are ordinary
   * meshes and arrive through `drawElements`. Splitting the two is what makes
   * "the whole field is one draw call" a number rather than a caption.
   */
  instanced: number;
}

interface DrawCounterWindow {
  __drawsFor: (canvas: HTMLCanvasElement) => number;
  __statsFor: (canvas: HTMLCanvasElement) => DrawStats;
  /** Animation frames, counted on the same clock the renderers are driven by. */
  __frames: number;
  /**
   * Test-only: drop the projectile field's draw on the floor, leaving the
   * static arena — lit floor, wireframe grid, fog — on screen by itself. That
   * frame is the baseline the visual diff is taken against.
   */
  __hideInstanced: boolean;
}

/**
 * Per-canvas WebGL draw counts. Must be installed before any page script runs,
 * hence `addInitScript`.
 */
async function countWebGLDraws(page: Page) {
  await page.addInitScript(() => {
    const counts = new WeakMap<HTMLCanvasElement, DrawStats>();
    const probe = window as unknown as DrawCounterWindow;

    const statsFor = (canvas: HTMLCanvasElement) => {
      let stats = counts.get(canvas);
      if (!stats) {
        stats = { total: 0, instanced: 0 };
        counts.set(canvas, stats);
      }
      return stats;
    };

    probe.__drawsFor = (canvas) => counts.get(canvas)?.total ?? 0;
    probe.__statsFor = (canvas) => ({ ...(counts.get(canvas) ?? { total: 0, instanced: 0 }) });
    probe.__frames = 0;
    probe.__hideInstanced = false;

    const tick = () => {
      probe.__frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

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
      const isInstanced = name.endsWith('Instanced');
      proto[name] = function (this: { canvas?: HTMLCanvasElement }, ...args: unknown[]) {
        // Suppressed draws are not issued and not counted: the baseline frame
        // must be the arena WITHOUT the field, and a tally that moved while it
        // was hidden would be measuring the wrong thing.
        if (isInstanced && probe.__hideInstanced) return;
        const canvas = this.canvas;
        if (canvas) {
          const stats = statsFor(canvas);
          stats.total++;
          if (isInstanced) stats.instanced++;
        }
        return original.apply(this, args);
      };
    }
  });
}

const drawsFor = (canvas: Locator) =>
  canvas.evaluate((el) =>
    (window as unknown as DrawCounterWindow).__drawsFor(el as HTMLCanvasElement),
  );

const statsFor = (canvas: Locator) =>
  canvas.evaluate((el) =>
    (window as unknown as DrawCounterWindow).__statsFor(el as HTMLCanvasElement),
  );

const framesSoFar = (page: Page) =>
  page.evaluate(() => (window as unknown as DrawCounterWindow).__frames);

const launcher = (page: Page) => page.getByRole('button', { name: /Run the demo/ });
const dialog = (page: Page) => page.getByRole('dialog');

/** The backdrop is rendered before `<main>`; the dialog portals to the end of body. */
const backdropCanvas = (page: Page) => page.locator('canvas').first();
const demoCanvas = (page: Page) => page.locator('[data-testid="projectiles-stage"] canvas');
const demoStage = (page: Page) => page.locator('[data-testid="projectiles-stage"]');

/** The telemetry line under the arena: `N instances · 1 draw call`. */
const readout = (page: Page) => page.getByText(/instances \u00b7 1 draw call/);

/** The number the visitor is actually shown, parsed back out of the DOM. */
async function instancesShown(page: Page) {
  const text = (await readout(page).textContent()) ?? '';
  const match = /^\s*(\d+)\s+instances/.exec(text);
  return match ? Number(match[1]) : Number.NaN;
}

async function openWorkSection(page: Page) {
  await page.goto('/');
  await expect(page.locator('#hero')).toBeVisible();
  await page.locator('#work').scrollIntoViewIfNeeded();
  await expect(launcher(page)).toBeVisible();
}

const focusIsInsideDialog = (page: Page) =>
  page.evaluate(() => {
    const panel = document.querySelector('[role="dialog"]');
    return !!panel && !!document.activeElement && panel.contains(document.activeElement);
  });

test.describe('The r3f-projectiles demo launcher', () => {
  test('is a button, not a link, and only the one card has it', async ({ page }) => {
    await openWorkSection(page);

    // A link would be openable in a new tab and would offer an href to copy.
    // This opens an overlay on this page, so it is a button.
    await expect(launcher(page)).toHaveCount(1);
    await expect(launcher(page)).toHaveJSProperty('tagName', 'BUTTON');
    await expect(launcher(page)).toHaveAttribute('type', 'button');

    // 44px minimum tap target.
    const box = await launcher(page).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('leaves the card\'s existing links working', async ({ page }) => {
    await openWorkSection(page);

    const card = page.locator('li', { has: launcher(page) });
    await expect(card.getByRole('link', { name: /Source/ })).toHaveAttribute(
      'href',
      'https://github.com/Kaleb-kougl/r3f-projectiles',
    );
    await expect(card.getByRole('link', { name: /npm/ })).toHaveAttribute(
      'href',
      'https://www.npmjs.com/package/@k9kbdev/r3f-projectiles',
    );
  });

  test('ships nothing of the demo until it is clicked', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(request.url());
    });

    await openWorkSection(page);
    await page.waitForTimeout(500);

    const isDemoChunk = (url: string) => /projectile|demos/i.test(url);
    expect(
      scripts.filter(isDemoChunk),
      'the demo chunk was fetched before anybody asked for it',
    ).toEqual([]);
    // ...and there is exactly one canvas on the page: the backdrop.
    await expect(page.locator('canvas')).toHaveCount(1);

    await launcher(page).click();
    await expect(dialog(page)).toBeVisible();

    expect(scripts.filter(isDemoChunk).length).toBeGreaterThan(0);
  });
});

test.describe('The demo dialog', () => {
  test('opens with the right semantics and moves focus into itself', async ({ page }) => {
    await openWorkSection(page);
    await launcher(page).click();

    const panel = dialog(page);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('aria-modal', 'true');
    // Labelled by its own heading, not by a hand-written aria-label.
    const labelledBy = await panel.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    // An attribute selector, because `useId()` produces ids full of characters
    // a bare `#id` selector would choke on, and `CSS.escape` is a browser API
    // that does not exist in the test runner's Node context.
    await expect(page.locator(`[id="${labelledBy}"]`)).toHaveText('r3f-projectiles');

    await expect(panel).toBeFocused();
    expect(await focusIsInsideDialog(page)).toBe(true);
  });

  test('renders its own canvas, and its controls', async ({ page }) => {
    await openWorkSection(page);
    await launcher(page).click();
    await expect(dialog(page)).toBeVisible();

    await expect(demoCanvas(page)).toHaveCount(1);
    await expect(page.locator('canvas')).toHaveCount(2);

    const panel = dialog(page);
    await expect(panel.getByLabel('Pattern')).toBeVisible();
    await expect(panel.getByLabel(/Bursts \/ sec/)).toBeVisible();
    await expect(panel.getByRole('button', { name: /^(Pause|Start)$/ })).toBeVisible();

    // All six recovered patterns are offered.
    const options = await panel.getByLabel('Pattern').locator('option').allTextContents();
    expect(options).toEqual([
      'Fibonacci Sphere',
      'Torus Knot',
      'Galaxy',
      'Helix',
      'Rose 3D',
      'Ring',
    ]);
  });

  test('has a visible close button of at least 44px', async ({ page }) => {
    await openWorkSection(page);
    await launcher(page).click();

    const close = dialog(page).getByRole('button', { name: 'Close' });
    await expect(close).toBeVisible();
    const box = await close.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('Escape closes it and returns focus to the launching button', async ({ page }) => {
    await openWorkSection(page);
    await launcher(page).click();
    await expect(dialog(page)).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(dialog(page)).toHaveCount(0);
    await expect(launcher(page)).toBeFocused();
  });

  test('the close button closes it and returns focus to the launching button', async ({
    page,
  }) => {
    await openWorkSection(page);
    await launcher(page).click();

    await dialog(page).getByRole('button', { name: 'Close' }).click();

    await expect(dialog(page)).toHaveCount(0);
    await expect(launcher(page)).toBeFocused();
  });

  test('traps Tab inside itself, in both directions', async ({ page }) => {
    await openWorkSection(page);
    await launcher(page).click();
    await expect(dialog(page)).toBeFocused();

    // Pause the simulation first. Focus trapping has nothing to do with
    // whether projectiles are moving, but this test drives 20 keypresses each
    // followed by an `evaluate` round trip — and against a live canvas under
    // the headless software renderer that is slow enough to blow the 30s test
    // budget on the mobile project. Pausing drops the demo's frameloop to
    // "demand", so the 20 round trips are measuring focus rather than fill
    // rate. Focus stays on the Pause button, which is itself inside the
    // dialog, so the trap is still entered from a real focus position.
    await dialog(page).getByRole('button', { name: 'Pause' }).click();

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      expect(await focusIsInsideDialog(page), `focus escaped forward on Tab #${i + 1}`).toBe(
        true,
      );
    }

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(
        await focusIsInsideDialog(page),
        `focus escaped backward on Shift+Tab #${i + 1}`,
      ).toBe(true);
    }
  });

  test('locks the page behind it, and unlocks on close', async ({ page }) => {
    await openWorkSection(page);

    await launcher(page).click();
    await expect(dialog(page)).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow))
      .toBe('hidden');

    // Measured AFTER opening: Playwright's own actionability check scrolls the
    // button into view before it clicks, so a reading taken before the click is
    // not the position the lock is supposed to hold.
    const locked = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => window.scrollY),
      'the page behind the dialog scrolled',
    ).toBe(locked);

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow))
      .not.toBe('hidden');

    // ...and the page scrolls again once it is gone.
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(locked);
  });
});

test.describe('The background canvas pauses while the demo is open', () => {
  // This used to skip itself on the touch/phone layout: the backdrop was gated
  // on `(max-width: 767px)`, so below that it was already `frameloop="demand"`
  // and there was no "before" to compare against. It animates on phones now, so
  // the two-contexts-on-one-GPU problem this test is about is REAL on the phone
  // project — that is where a second context hurts most — and the test finally
  // has something to measure there. It runs everywhere.

  test('stops dead while open, and starts again on close', async ({ page }) => {
    await countWebGLDraws(page);
    await openWorkSection(page);

    const backdrop = backdropCanvas(page);
    await expect(backdrop).toHaveCount(1);

    // --- Control: the backdrop is demonstrably running -------------------
    const beforeOpen = await drawsFor(backdrop);
    await page.waitForTimeout(SAMPLE_MS);
    const whileClosed = (await drawsFor(backdrop)) - beforeOpen;
    expect(
      whileClosed,
      'the backdrop was not animating to begin with, so this test proves nothing',
    ).toBeGreaterThan(LIVE_FRAME_FLOOR);

    // --- Open: it must stop ----------------------------------------------
    await launcher(page).click();
    await expect(dialog(page)).toBeVisible();
    // Let the frameloop flip and any open/resize frame flush.
    await page.waitForTimeout(500);

    const mark = await drawsFor(backdrop);
    await page.waitForTimeout(SAMPLE_MS);
    expect(
      (await drawsFor(backdrop)) - mark,
      'the backdrop kept drawing behind the open dialog',
    ).toBe(0);

    // ...while the demo's own canvas is doing the work.
    expect(await drawsFor(demoCanvas(page))).toBeGreaterThan(0);

    // --- Close: it must resume -------------------------------------------
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await page.waitForTimeout(500);

    const resumeMark = await drawsFor(backdrop);
    await page.waitForTimeout(SAMPLE_MS);
    expect(
      (await drawsFor(backdrop)) - resumeMark,
      'the backdrop never came back after the dialog closed',
    ).toBeGreaterThan(LIVE_FRAME_FLOOR);
  });
});

test.describe('The demo under reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('does not auto-run, and offers an explicit Start', async ({ page }) => {
    await countWebGLDraws(page);
    await openWorkSection(page);
    await launcher(page).click();
    await expect(dialog(page)).toBeVisible();

    const toggle = dialog(page).getByRole('button', { name: 'Start' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(dialog(page)).toContainText('reduced motion');

    // One frozen arrangement is drawn, and then nothing.
    await page.waitForTimeout(1_000);
    const canvas = demoCanvas(page);
    const still = await drawsFor(canvas);
    expect(still).toBeGreaterThan(0);
    await page.waitForTimeout(SAMPLE_MS);
    expect(
      (await drawsFor(canvas)) - still,
      'the demo animated itself despite prefers-reduced-motion',
    ).toBeLessThanOrEqual(4);

    // The visitor can still ask for it.
    await toggle.click();
    await expect(dialog(page).getByRole('button', { name: 'Pause' })).toBeVisible();
    const running = await drawsFor(canvas);
    await page.waitForTimeout(SAMPLE_MS);
    expect((await drawsFor(canvas)) - running).toBeGreaterThan(LIVE_FRAME_FLOOR);
  });
});

// ---------------------------------------------------------------------------
// The telemetry readout
// ---------------------------------------------------------------------------

/**
 * Compares two element screenshots INSIDE the page, using the browser's own
 * PNG decoder, so this needs no image dependency in the repo.
 *
 * Returns three numbers about the pair:
 *   - `flattest`  the share of the baseline taken by its single most common
 *                 colour. A blank frame is ~1.0.
 *   - `colours`   distinct colours in the baseline, quantised to 4 bits per
 *                 channel. A blank frame is 1.
 *   - `changed`   the share of pixels the second frame moved. This is the
 *                 projectiles, and nothing else: the two frames are the same
 *                 canvas milliseconds apart, with only the field's draw call
 *                 taken away.
 */
async function comparePngs(page: Page, baseline: Buffer, live: Buffer) {
  const toUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;

  return page.evaluate(
    async ({ baselineUrl, liveUrl }) => {
      const pixels = async (url: string) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const surface = document.createElement('canvas');
        surface.width = img.width;
        surface.height = img.height;
        const ctx = surface.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };

      const a = await pixels(baselineUrl);
      const b = await pixels(liveUrl);
      if (a.length !== b.length) throw new Error('the two frames are different sizes');

      // 4 bits per channel: enough to tell the lit floor from the grid lines
      // from a projectile, coarse enough that antialiasing is not a "colour".
      const histogram = new Map<number, number>();
      for (let i = 0; i < a.length; i += 4) {
        const key = ((a[i] >> 4) << 8) | ((a[i + 1] >> 4) << 4) | (a[i + 2] >> 4);
        histogram.set(key, (histogram.get(key) ?? 0) + 1);
      }
      let modal = 0;
      for (const count of histogram.values()) if (count > modal) modal = count;

      let changed = 0;
      for (let i = 0; i < a.length; i += 4) {
        const delta =
          Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        if (delta > 24) changed++;
      }

      const total = a.length / 4;
      return { flattest: modal / total, colours: histogram.size, changed: changed / total };
    },
    { baselineUrl: toUrl(baseline), liveUrl: toUrl(live) },
  );
}

test.describe('The instance readout is a measurement, not a caption', () => {
  /**
   * `<span>N</span> instances · 1 draw call`, under the arena.
   *
   * Neither half was checked by anything, and the second is a string literal
   * that would go on reading "1 draw call" if the field regressed to one call
   * per projectile. The counting this file already does cannot close that on
   * its own, for a reason worth stating plainly:
   *
   *   `mesh.count` is the POOL size — 4000 — not the live count. A dead
   *   instance is parked at y=-999 and scaled to zero rather than removed, so
   *   the field issues its one instanced draw every frame whether four
   *   thousand projectiles are in flight or none are, and the existing
   *   `drawsFor(demoCanvas) > 0` is satisfied by the floor plane by itself.
   *
   * A draw call is therefore evidence that the renderer ran, and no evidence
   * at all that anything is on screen. So the badge is checked in the three
   * places its three claims actually live: the count in the DOM, the call at
   * the WebGL entry point, and the projectiles in the pixels.
   */

  test('the count is above zero and the whole field is one draw call', async ({ page }) => {
    await countWebGLDraws(page);
    await openWorkSection(page);
    await launcher(page).click();
    await expect(dialog(page)).toBeVisible();

    // --- instances > 0 ----------------------------------------------------
    // The readout writes on a 200ms interval, and the first burst waits on the
    // fire-rate timer, so this is polled rather than read once.
    await expect
      .poll(() => instancesShown(page), {
        message: 'the readout never left 0 — the arena is empty and says so',
        timeout: 10_000,
      })
      .toBeGreaterThan(0);

    // A number larger than the pool would mean the counter, not the field, is
    // what is broken.
    expect(await instancesShown(page)).toBeLessThanOrEqual(INSTANCE_POOL);

    // --- draw calls -------------------------------------------------------
    const canvas = demoCanvas(page);
    const before = await statsFor(canvas);
    const framesBefore = await framesSoFar(page);
    await page.waitForTimeout(SAMPLE_MS);
    const after = await statsFor(canvas);
    const frames = (await framesSoFar(page)) - framesBefore;

    expect(frames, 'the page produced no animation frames, so nothing was measured').toBeGreaterThan(
      SAMPLE_FRAME_FLOOR,
    );

    // More than one per frame: the arena's floor and grid AND the field. It
    // measures exactly 3.00 — two static meshes plus one instanced draw — so
    // anything at or below 1 means a piece of the scene stopped being drawn.
    const perFrame = (after.total - before.total) / frames;
    expect(perFrame, 'the demo canvas is drawing less than the arena plus the field').toBeGreaterThan(
      1,
    );

    // The badge's own claim, measured. Every projectile on screen is one
    // instance of one mesh, so the field is exactly one instanced draw per
    // frame however many are in flight — not one per burst, and not one each.
    const fieldPerFrame = (after.instanced - before.instanced) / frames;
    expect(fieldPerFrame, 'the projectile field is not one draw call per frame').toBeGreaterThan(0.8);
    expect(fieldPerFrame, 'the projectile field costs more than one draw call').toBeLessThan(1.2);
  });

  test('the projectiles are on screen, not only in the counter', async ({ page }) => {
    await countWebGLDraws(page);
    await openWorkSection(page);
    await launcher(page).click();
    await expect(dialog(page)).toBeVisible();

    await expect.poll(() => instancesShown(page), { timeout: 10_000 }).toBeGreaterThan(0);

    const stage = demoStage(page);

    // The baseline: the same canvas, the same instant, with the field's one
    // draw call suppressed. Not a committed PNG — a still of a live WebGL
    // scene is at the mercy of the driver and would have to be pinned per
    // platform, and `visual-regression.spec.ts` already pays that price and
    // skips itself in CI for it. This baseline is generated a frame earlier by
    // the same GPU, so the only difference between the two images is the thing
    // under test.
    await page.evaluate(() => {
      (window as unknown as DrawCounterWindow).__hideInstanced = true;
    });
    await page.waitForTimeout(300);
    const arena = await stage.screenshot();

    await page.evaluate(() => {
      (window as unknown as DrawCounterWindow).__hideInstanced = false;
    });
    await page.waitForTimeout(300);
    const withProjectiles = await stage.screenshot();

    const diff = await comparePngs(page, arena, withProjectiles);

    // A diff is worth nothing against a blank baseline: two empty frames
    // differ by 0%, and so do two broken ones. Prove the arena is there first.
    //
    // Measured: 35 colours and a 0.44 modal share on desktop, 41 and 0.42 on
    // the phone viewport, stable to the digit across runs. The floors below
    // are set far under that on purpose — they exist to exclude a flat fill,
    // and a threshold fitted to today's render would only ever prove the
    // render has not changed.
    expect(
      diff.colours,
      'the baseline is a flat fill — the arena did not render, so the diff below proves nothing',
    ).toBeGreaterThan(8);
    expect(
      1 - diff.flattest,
      'almost every pixel of the baseline is one colour — nothing but background rendered',
    ).toBeGreaterThan(0.05);

    // ...and then the projectiles, as pixels. This is the only assertion in
    // the file that a full pool of scale-zero instances cannot satisfy, and it
    // measures 0.20-0.31 of the frame — two orders of magnitude over the floor.
    expect(
      diff.changed,
      'the running arena is pixel-identical to one with the projectile field removed',
    ).toBeGreaterThan(0.005);
  });
});
