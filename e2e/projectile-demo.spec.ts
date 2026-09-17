import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * The r3f-projectiles live demo: its launcher, its dialog, and the promise the
 * dialog makes to the rest of the page.
 *
 * WHAT IS ACTUALLY AT RISK HERE
 * -----------------------------
 * Two things, and they are the two things this spec spends most of its effort
 * on:
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
 * Playwright 1.61 moved `reducedMotion` under `contextOptions`; setting it at
 * the top level of `test.use` is no longer a recognised option.
 */

const SAMPLE_MS = 2_000;
/** ~120 frames of a live 60fps loop; 30 is a floor a stopped loop cannot reach. */
const LIVE_FRAME_FLOOR = 30;

interface DrawCounterWindow {
  __drawsFor: (canvas: HTMLCanvasElement) => number;
}

/**
 * Per-canvas WebGL draw counts. Must be installed before any page script runs,
 * hence `addInitScript`.
 */
async function countWebGLDraws(page: Page) {
  await page.addInitScript(() => {
    const counts = new WeakMap<HTMLCanvasElement, number>();
    (window as unknown as DrawCounterWindow).__drawsFor = (canvas) => counts.get(canvas) ?? 0;

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
      proto[name] = function (this: { canvas?: HTMLCanvasElement }, ...args: unknown[]) {
        const canvas = this.canvas;
        if (canvas) counts.set(canvas, (counts.get(canvas) ?? 0) + 1);
        return original.apply(this, args);
      };
    }
  });
}

const drawsFor = (canvas: Locator) =>
  canvas.evaluate((el) =>
    (window as unknown as DrawCounterWindow).__drawsFor(el as HTMLCanvasElement),
  );

const launcher = (page: Page) => page.getByRole('button', { name: /Run the demo/ });
const dialog = (page: Page) => page.getByRole('dialog');

/** The backdrop is rendered before `<main>`; the dialog portals to the end of body. */
const backdropCanvas = (page: Page) => page.locator('canvas').first();
const demoCanvas = (page: Page) => page.locator('[data-testid="projectiles-stage"] canvas');

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
