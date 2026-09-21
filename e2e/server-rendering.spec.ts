import { test, expect } from '@playwright/test';

import { CONTACT_INFO, SUMMARY } from '../src/data/resumeData';

/**
 * Server-rendered content.
 *
 * The retired IDE shell was loaded with `dynamic(..., { ssr: false })`, so a
 * client that never ran JavaScript — an ATS scraper, a plain-text crawler, an
 * enterprise link scanner — received an empty document. Server-rendering the
 * real copy is the point of the scroll rebuild, so these tests run with
 * scripting disabled and assert on what the server alone produced.
 *
 * KNOWN BREAKAGE, deliberately left red — see the last test in this file.
 * `src/app/loading.tsx` (leftover from the IDE: "Compiling workspace...") puts
 * an implicit Suspense boundary around the whole route, so the server emits the
 * fallback and streams the page into `<div hidden id="S:0">`. The markup is all
 * there — hence the assertions below pass — but React never un-hides it without
 * JavaScript, so a scripting-off *renderer* sees only the spinner. Confirmed in
 * the production prerender too (`.next/server/app/index.html`), so it is not a
 * dev-server artifact.
 *
 * Because of that, these tests assert on DOM CONTENT (`toHaveText`,
 * `toHaveCount`, `toHaveAttribute`) rather than `toBeVisible()`: visibility is
 * what the last test measures, on purpose.
 */

const HERO_HEADING = 'I build the platform other frontend teams ship on.';

/**
 * `career`'s heading is derived from resumeData (career start year, role
 * count), so it is matched by shape rather than pinned to today's résumé; the
 * rest are literal copy in the components.
 */
const SECTION_HEADINGS: ReadonlyArray<{ id: string; heading: string | RegExp }> = [
  { id: 'work', heading: 'Things I’ve shipped.' },
  { id: 'career', heading: /since \d{4}, .+ steps up\./i },
  { id: 'process', heading: 'The background is a Blender file.' },
  { id: 'contact', heading: 'Let’s build the next platform.' },
];

test.describe('Server-rendered HTML (JavaScript disabled)', () => {
  test.use({ javaScriptEnabled: false });

  test('the hero h1 is in the server HTML', async ({ page }) => {
    await page.goto('/');

    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText(HERO_HEADING);
  });

  test('all five sections and their headings are in the server HTML', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.locator('#hero')).toHaveCount(1);

    for (const { id, heading } of SECTION_HEADINGS) {
      const section = page.locator(`section#${id}`);
      await expect(section).toHaveCount(1);
      await expect(section.locator('h2').first()).toHaveText(heading);
    }

    // Exactly the five the page promises: one h1 and four h2s.
    await expect(page.locator('main h2')).toHaveCount(4);
  });

  test('the contact email and the resume link are in the server HTML', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(
      page.locator(`a[href="mailto:${CONTACT_INFO.email}"]`).first(),
    ).toContainText(CONTACT_INFO.email);

    const resume = page.locator('a[href="/KalebK_Resume.pdf"]').first();
    await expect(resume).toHaveCount(1);
    await expect(resume).toHaveAttribute('download', '');
  });

  test('exposes a valid Person JSON-LD block', async ({ page }) => {
    await page.goto('/');

    const raw = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    expect(raw).toBeTruthy();

    const data = JSON.parse(raw!) as Record<string, unknown>;
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('Person');
    expect(data.name).toBe(CONTACT_INFO.name);
    expect(data.jobTitle).toBe(CONTACT_INFO.title);
    expect(data.description).toBe(SUMMARY);
    expect(data.email).toBe(`mailto:${CONTACT_INFO.email}`);
    expect(data.sameAs).toContain(CONTACT_INFO.github);
    expect(Array.isArray(data.knowsAbout)).toBe(true);
    expect(Array.isArray(data.alumniOf)).toBe(true);
    expect((data.alumniOf as unknown[]).length).toBeGreaterThan(0);
  });

  test('the 3D backdrop contributes nothing to the no-JS document', async ({
    page,
  }) => {
    await page.goto('/');

    // `MorphScene` defers its WebGL chunk with `ssr: false` and a null loading
    // state, so scripting-off clients get the sections and no placeholder.
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('the no-JS document actually renders the page, not a spinner', async ({
    page,
  }) => {
    await page.goto('/');

    // REGRESSION GUARD. A route-level `src/app/loading.tsx` used to make the
    // whole route a Suspense boundary, so the page was streamed into
    // `<div hidden id="S:0">` and only moved into place by React's inline `$RC`
    // script. With scripting off that never runs: `<main>` stayed inside a
    // `display: none` ancestor, laid out at 0x0, and the visitor saw only the
    // IDE-era "Compiling workspace..." fallback — the copy was in the HTML but
    // invisible to anything honouring CSS.
    //
    // That file was deleted. Re-adding a route-level loading.tsx (or any
    // boundary that wraps the whole page without something real to suspend on)
    // brings the bug straight back, and this test is what catches it.
    await expect(page.getByText('Compiling workspace...')).toHaveCount(0);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HERO_HEADING);
    await expect(page.locator('#hero')).toBeVisible();
  });
});

test.describe('Hydrated page', () => {
  test('keeps the server copy and mounts the 3D backdrop', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HERO_HEADING);
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByText('Compiling workspace...')).toHaveCount(0);
  });
});
