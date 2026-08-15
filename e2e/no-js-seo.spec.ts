import { test, expect } from '@playwright/test';

import { CONTACT_INFO, SUMMARY } from '../src/data/resumeData';

/**
 * Guards the server-rendered content that reaches clients which never run JS —
 * ATS scrapers, plain-text crawlers, enterprise link scanners.
 *
 * The IDE bundle is loaded via `dynamic(..., { ssr: false })`, so its `loading`
 * fallback IS the entire no-JS page. Regressing that fallback back to a bare
 * spinner would silently make the site invisible to those clients, which is
 * exactly the failure these tests exist to catch.
 */
test.describe('No-JS / crawler content', () => {
  test.use({ javaScriptEnabled: false });

  test('server HTML carries name, title, summary and contact details', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: CONTACT_INFO.name, level: 1 })
    ).toBeVisible();
    await expect(page.getByText(CONTACT_INFO.title, { exact: true })).toBeVisible();
    await expect(page.getByText(SUMMARY)).toBeVisible();
    await expect(page.getByText(CONTACT_INFO.location)).toBeVisible();
    await expect(
      page.locator(`a[href="mailto:${CONTACT_INFO.email}"]`)
    ).toBeVisible();
    await expect(
      page.locator('a[href="/KalebK_Resume.pdf"]')
    ).toBeVisible();
  });

  test('exposes a valid Person JSON-LD block', async ({ page }) => {
    await page.goto('/');

    const raw = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    expect(raw).toBeTruthy();

    const data = JSON.parse(raw!);
    expect(data['@type']).toBe('Person');
    expect(data.name).toBe(CONTACT_INFO.name);
    expect(data.jobTitle).toBe(CONTACT_INFO.title);
    expect(data.description).toBe(SUMMARY);
    expect(data.sameAs).toContain(CONTACT_INFO.github);
    expect(Array.isArray(data.alumniOf)).toBe(true);
    expect(data.alumniOf.length).toBeGreaterThan(0);
  });
});

test.describe('Hydrated app still takes over', () => {
  // Pinned to desktop: the mobile layout swaps the panel tree for a drawer,
  // so 'Project hierarchy' only exists at this viewport.
  test.use({ viewport: { width: 1280, height: 720 } });

  test('static hero is replaced by the IDE layout once JS runs', async ({
    page,
  }) => {
    await page.goto('/');

    await page.waitForSelector('[aria-label="Project hierarchy"]', {
      timeout: 15_000,
    });

    // The fallback's spinner copy must be gone once the real layout mounts.
    await expect(page.getByText('Initializing workspace...')).toHaveCount(0);
  });
});
