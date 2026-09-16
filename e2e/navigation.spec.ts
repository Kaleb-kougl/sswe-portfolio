import { test, expect } from '@playwright/test';

/**
 * Desktop navigation: the fixed `SiteNav`.
 *
 * The link row is `hidden` below 900px (it collapses behind the menu toggle —
 * see `mobile-nav.spec.ts`), so these tests are skipped at phone widths rather
 * than asserted against markup that is deliberately not rendered.
 */

const DESKTOP_MIN_WIDTH = 900;

const SECTION_LINKS = [
  { label: 'Work', id: 'work' },
  { label: 'Experience', id: 'career' },
  { label: 'Process', id: 'process' },
  { label: 'Contact', id: 'contact' },
] as const;

/** Top of the section, once the anchor scroll and `scroll-margin-top` settle. */
async function sectionTop(page: import('@playwright/test').Page, id: string) {
  return page.locator(`#${id}`).evaluate((el) => el.getBoundingClientRect().top);
}

test.describe('Site navigation (desktop)', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < DESKTOP_MIN_WIDTH,
    'The desktop link row is collapsed below 900px',
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // `src/app/loading.tsx` wraps the route in a Suspense boundary, so wait for
    // React to reveal the real page before driving it.
    await expect(page.locator('#hero')).toBeVisible();
  });

  for (const { label, id } of SECTION_LINKS) {
    test(`"${label}" scrolls to #${id} and becomes the current link`, async ({
      page,
    }) => {
      const nav = page.getByRole('navigation', { name: 'Sections' });
      await nav.getByRole('link', { name: label, exact: true }).click();

      await expect(page).toHaveURL(new RegExp(`#${id}$`));

      // The section lands just under the fixed nav (`scroll-margin-top`).
      await expect
        .poll(() => sectionTop(page, id), { timeout: 5_000 })
        .toBeLessThan(200);
      expect(await sectionTop(page, id)).toBeGreaterThan(-2);

      // Scrollspy: exactly one link is current, and it is this one.
      const current = nav.locator('a[aria-current="true"]');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveText(label);
    });
  }

  test('scrollspy follows a plain scroll, with no link clicked', async ({
    page,
  }) => {
    const nav = page.getByRole('navigation', { name: 'Sections' });

    // Nothing is current at the top of the page — `hero` is observed but has
    // no link.
    await expect(nav.locator('a[aria-current="true"]')).toHaveCount(0);

    await page.evaluate(() => {
      const target = document.getElementById('process');
      window.scrollTo({ top: (target?.offsetTop ?? 0) + 10, behavior: 'instant' });
    });

    await expect(nav.locator('a[aria-current="true"]')).toHaveText('Process');
  });

  test('the resume link downloads the PDF rather than navigating', async ({
    page,
  }) => {
    const resume = page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Résumé', exact: true });

    await expect(resume).toHaveAttribute('href', '/KalebK_Resume.pdf');
    await expect(resume).toHaveAttribute('download', '');
  });

  test('"Get in touch" reaches the contact section', async ({ page }) => {
    await page.getByRole('link', { name: 'Get in touch' }).click();

    await expect(page).toHaveURL(/#contact$/);
    await expect(
      page.locator('#contact').getByRole('heading', { level: 2 }),
    ).toBeInViewport();
  });
});
