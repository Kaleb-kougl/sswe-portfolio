import { test, expect, type Page } from '@playwright/test';

/**
 * Accessibility basics that the whole page depends on: the skip link, a focus
 * ring you can actually see, keyboard reach, and a decorative 3D backdrop that
 * stays out of the way of both assistive tech and the pointer.
 *
 * ABOUT `NEXTJS-PORTAL`
 * --------------------
 * The suite runs against `next dev` (see `playwright.config.ts`), and the Next
 * dev-tools indicator is a `<nextjs-portal>` custom element with focusable
 * shadow content that sometimes claims the first Tab stop. It does not exist in
 * a production build, so the helpers below tab past it rather than counting it
 * as part of the page.
 */

const DESKTOP_MIN_WIDTH = 900;

const focusedDescription = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'body';
    return `${el.tagName}:${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim()}`;
  });

const isDevTools = (description: string) => description.startsWith('NEXTJS-PORTAL');

/**
 * Waits for the hero before driving the keyboard. This used to be load-bearing
 * for a different reason — a route-level `src/app/loading.tsx` wrapped the page
 * in a Suspense boundary, so `<main>` painted inside a hidden container and Tab
 * did nothing until React revealed it. That file is gone (it also hid the whole
 * page from no-JS clients; see `server-rendering.spec.ts`). The wait stays
 * because these tests still need the page interactive before pressing keys.
 */
async function openPage(page: Page) {
  await page.goto('/');
  await expect(page.locator('#hero')).toBeVisible();
}

/** Tab until focus lands on something that belongs to the page. */
async function tabToPageControl(page: Page): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.keyboard.press('Tab');
    const description = await focusedDescription(page);
    if (!isDevTools(description) && description !== 'body') return description;
  }
  throw new Error('Never escaped the Next dev-tools portal while tabbing');
}

test.describe('Skip link', () => {
  test('is the first focusable element and reveals itself on focus', async ({
    page,
  }) => {
    await openPage(page);

    const skip = page.getByRole('link', { name: 'Skip to main content' });

    // Off-screen until focused (`top: -100%` in globals.css).
    const before = await skip.boundingBox();
    expect(before!.y).toBeLessThan(0);

    expect(await tabToPageControl(page)).toBe('A:Skip to main content');
    await expect(skip).toBeFocused();

    const after = await skip.boundingBox();
    expect(after!.y).toBeGreaterThanOrEqual(0);
  });

  test('moves focus to #main-content when activated', async ({ page }) => {
    await openPage(page);

    await tabToPageControl(page);
    await expect(
      page.getByRole('link', { name: 'Skip to main content' }),
    ).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/#main-content$/);
    await expect(page.locator('#main-content')).toBeFocused();
  });
});

test.describe('Keyboard reach and focus ring', () => {
  test('a keyboard-focused control paints the shared 3px focus ring', async ({
    page,
  }) => {
    await openPage(page);

    // Past the skip link, onto the first control in the nav.
    await tabToPageControl(page);
    await tabToPageControl(page);

    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = getComputedStyle(el);
      return {
        tag: el.tagName,
        width: style.outlineWidth,
        style: style.outlineStyle,
        color: style.outlineColor,
      };
    });

    expect(ring.tag).toBe('A');
    expect(ring.style).toBe('solid');
    expect(ring.width).toBe('3px');
    expect(ring.color).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('the nav and hero controls are all reachable by Tab', async ({
    page,
    viewport,
  }) => {
    await openPage(page);

    const reached: string[] = [];
    for (let i = 0; i < 12; i++) {
      reached.push(await tabToPageControl(page));
    }

    expect(reached[0]).toBe('A:Skip to main content');

    const expected =
      (viewport?.width ?? 0) >= DESKTOP_MIN_WIDTH
        ? [
            'Work',
            'Experience',
            'Process',
            'Contact',
            'Résumé',
            'Get in touch',
            'See my work',
          ]
        : ['Open menu', 'Get in touch', 'See my work'];

    for (const label of expected) {
      expect(
        reached.some((entry) => entry.includes(label)),
        `Tab order should reach "${label}" — reached: ${reached.join(' | ')}`,
      ).toBe(true);
    }

    // The honeypot must never be a tab stop.
    expect(reached.some((entry) => entry.includes('Company'))).toBe(false);
  });

  test('the contact form can be driven from the keyboard', async ({ page }) => {
    await openPage(page);
    await page.locator('#contact').scrollIntoViewIfNeeded();

    await page.getByRole('button', { name: 'Full-time role', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Full-time role', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.getByLabel('Name', { exact: true }).focus();
    await page.keyboard.type('Keyboard Only');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Email', { exact: true })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Message', { exact: true })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Send message' })).toBeFocused();
  });
});

test.describe('Decorative 3D backdrop', () => {
  test('is aria-hidden and takes no pointer events', async ({ page }) => {
    await openPage(page);
    await expect(page.locator('canvas')).toHaveCount(1);

    const backdrop = await page.locator('canvas').evaluate((canvas) => {
      const hidden = canvas.closest('[aria-hidden="true"]');
      return {
        insideAriaHidden: !!hidden,
        canvasPointerEvents: getComputedStyle(canvas).pointerEvents,
        hostPointerEvents: hidden
          ? getComputedStyle(hidden as HTMLElement).pointerEvents
          : null,
      };
    });

    expect(backdrop.insideAriaHidden).toBe(true);
    expect(backdrop.canvasPointerEvents).toBe('none');
    expect(backdrop.hostPointerEvents).toBe('none');
  });

  test('never becomes the hit target over the page', async ({ page }) => {
    await openPage(page);
    await expect(page.locator('canvas')).toHaveCount(1);

    const hits = await page.evaluate(() => {
      const points: Array<[number, number]> = [
        [window.innerWidth - 24, Math.round(window.innerHeight * 0.5)],
        [Math.round(window.innerWidth * 0.5), Math.round(window.innerHeight * 0.85)],
      ];
      return points.map(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return {
          tag: el?.tagName ?? 'none',
          inBackdrop: !!el?.closest('[aria-hidden="true"]'),
        };
      });
    });

    for (const hit of hits) {
      expect(hit.tag).not.toBe('CANVAS');
      expect(hit.inBackdrop).toBe(false);
    }
  });

  test('contributes nothing to the accessibility tree', async ({ page }) => {
    await openPage(page);
    await expect(page.locator('canvas')).toHaveCount(1);

    // One h1, four h2s, one main — the backdrop adds no landmark or heading.
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(4);
    await expect(page.getByRole('main')).toHaveCount(1);
  });
});

test.describe('Viewport meta', () => {
  test('does not block pinch-zoom', async ({ page }) => {
    await openPage(page);

    const content = await page
      .locator('meta[name="viewport"]')
      .getAttribute('content');

    expect(content).toBeTruthy();
    expect(content).toContain('width=device-width');

    // WCAG 2.1 SC 1.4.4 (Resize Text). `maximum-scale=1` or
    // `user-scalable=no` stops a low-vision visitor magnifying the page at
    // all. Lighthouse flags either one.
    //
    // The usual reason someone adds a cap is iOS Safari zooming the viewport
    // when a form field is focused — Safari only does that under a 16px font
    // size, so the fix belongs on the inputs. The assertion below guards that
    // too, so a cap cannot be reintroduced to solve a problem that is already
    // solved elsewhere.
    expect(content).not.toContain('maximum-scale');
    expect(content).not.toContain('user-scalable');
  });

  test('form fields are at least 16px, so iOS has no reason to zoom them', async ({
    page,
  }) => {
    await openPage(page);
    await page.locator('#contact').scrollIntoViewIfNeeded();

    const fields = page.locator('#contact input:not([type="hidden"]), #contact textarea');
    const count = await fields.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const field = fields.nth(i);
      // The honeypot is off-screen and never focused by a person.
      if (await field.evaluate((el) => el.closest('[aria-hidden="true"]') !== null)) continue;

      const size = await field.evaluate((el) =>
        Number.parseFloat(getComputedStyle(el).fontSize),
      );
      expect(size).toBeGreaterThanOrEqual(16);
    }
  });
});
