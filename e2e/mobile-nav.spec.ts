import { test, expect } from '@playwright/test';

/**
 * The collapsed nav, below the 900px breakpoint. Above it the toggle is
 * `hidden` and the link row is always visible, so there is nothing to open.
 */

const DESKTOP_MIN_WIDTH = 900;

test.describe('Collapsed navigation (phone widths)', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) >= DESKTOP_MIN_WIDTH,
    'The menu toggle is hidden at 900px and above',
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // `src/app/loading.tsx` wraps the route in a Suspense boundary, so wait for
    // React to reveal the real page before touching the nav.
    await expect(page.locator('#hero')).toBeVisible();
  });

  const toggle = (page: import('@playwright/test').Page) =>
    page.getByRole('button', { name: /^(Open|Close) menu$/ });

  test('the toggle is wired to the panel it controls', async ({ page }) => {
    const button = toggle(page);
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toHaveAttribute('aria-controls', 'nav-menu');

    // The panel it controls does not exist until it is opened.
    await expect(page.locator('#nav-menu')).toHaveCount(0);
  });

  test('the toggle is a 44px touch target', async ({ page }) => {
    // REGRESSION GUARD. `size-[44px]` alone is not enough here: the button is a
    // flex item in a `flex items-center gap-2` row, and at 375px that row runs
    // out of space, so flexbox shrank it to ~39.7px wide while leaving the
    // height at 44px. `shrink-0` in `site-nav.tsx` is what holds the width.
    // Measure both axes — the height alone would have passed while the target
    // was too small to hit.
    const box = await toggle(page).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  });

  test('opening flips aria-expanded and moves focus into the panel', async ({
    page,
  }) => {
    const button = toggle(page);
    await button.click();

    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(button).toHaveAccessibleName('Close menu');

    const panel = page.locator('#nav-menu');
    await expect(panel).toBeVisible();
    for (const label of ['Work', 'Experience', 'Process', 'Contact', 'Résumé']) {
      await expect(panel.getByRole('link', { name: label, exact: true })).toBeVisible();
    }

    // Focus is handed to the first link so Tab walks the menu.
    await expect(panel.getByRole('link').first()).toBeFocused();
  });

  test('Escape closes the menu and returns focus to the toggle', async ({
    page,
  }) => {
    const button = toggle(page);
    await button.click();
    await expect(page.locator('#nav-menu')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.locator('#nav-menu')).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
  });

  test('choosing a section closes the menu and scrolls there', async ({
    page,
  }) => {
    await toggle(page).click();
    await page
      .locator('#nav-menu')
      .getByRole('link', { name: 'Process', exact: true })
      .click();

    await expect(page.locator('#nav-menu')).toHaveCount(0);
    await expect(page).toHaveURL(/#process$/);
    await expect(
      page.locator('#process').getByRole('heading', { level: 2 }),
    ).toBeInViewport();
  });

  test('the resume link in the panel keeps its download attributes', async ({
    page,
  }) => {
    await toggle(page).click();

    const resume = page
      .locator('#nav-menu')
      .getByRole('link', { name: 'Résumé', exact: true });
    await expect(resume).toHaveAttribute('href', '/KalebK_Resume.pdf');
    await expect(resume).toHaveAttribute('download', '');
  });
});
