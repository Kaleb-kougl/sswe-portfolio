import { test, expect } from '@playwright/test';
import { WORK_PROJECTS, ROBLOX_CSS_COVERAGE } from '../src/data/workProjects';

/**
 * Content assertions for the Work cards.
 *
 * WHY THIS EXISTS SEPARATELY FROM visual-regression.spec.ts: those snapshots
 * run at `maxDiffPixelRatio: 0.01`, which is the right tolerance for
 * anti-aliasing but means a few changed digits in a sentence pass unnoticed.
 * The published numbers on these cards are claims a reader can check, so they
 * get real assertions rather than a pixel budget.
 *
 * The figures are imported from the data module, not retyped, so this file
 * cannot drift from what the page renders — it guards that the number reaches
 * the DOM, while `npm run roblox-css:check` guards that the number is true.
 * That second check needs a clone of a sibling repo and so cannot run in CI;
 * this one always does.
 */

const card = (page: import('@playwright/test').Page, name: string) =>
  page.locator('#work li').filter({ has: page.getByRole('heading', { name, exact: true }) });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#work')).toBeVisible();
});

test('every card renders, one per project in the data', async ({ page }) => {
  await expect(page.locator('#work li')).toHaveCount(WORK_PROJECTS.length);
});

test('roblox-css states its coverage, matching the single source', async ({ page }) => {
  const expected = `${ROBLOX_CSS_COVERAGE.assertions.toLocaleString('en-US')} assertions across ${ROBLOX_CSS_COVERAGE.specFiles} spec files`;
  await expect(card(page, 'roblox-css')).toContainText(expected);

  // The figure this replaced came from the package's own README and matched
  // neither the raw nor the deduplicated count. It must not come back.
  await expect(page.locator('#work')).not.toContainText('1,419');
  await expect(page.locator('#work')).not.toContainText('24 spec files');
});

test('r3f-projectiles states the counts its source actually supports', async ({ page }) => {
  const c = card(page, 'r3f-projectiles');
  await expect(c).toContainText('Seven pattern generators');
  await expect(c).toContainText('six modifiers');

  // The mockup this design came from claimed 15 and 9. Both were roughly
  // double the truth in r3f-projectiles/src/patterns.ts.
  await expect(page.locator('#work')).not.toContainText('15 pattern generators');
  await expect(page.locator('#work')).not.toContainText('9 modifiers');
});

test('BonkBall links to the live game', async ({ page }) => {
  const link = card(page, 'BonkBall').getByRole('link', { name: /play on roblox/i });
  await expect(link).toHaveAttribute(
    'href',
    'https://www.roblox.com/games/125331448291741/BonkBall',
  );
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);

  // It used to say this, when no public URL was known.
  await expect(card(page, 'BonkBall')).not.toContainText('No public link yet');
});

test('a card with no public artifact says so rather than linking nowhere', async ({ page }) => {
  const c = card(page, 'Indeed Analytics Extension');
  await expect(c).toContainText('Internal to Indeed');
  await expect(c.getByRole('link')).toHaveCount(0);
});

test('every card link is a real destination and a 44px target', async ({ page }) => {
  const links = page.locator('#work a');
  const count = await links.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const link = links.nth(i);
    const href = await link.getAttribute('href');
    // No placeholders, no in-page anchors standing in for pages that
    // do not exist (the mockup had "Case study ->" pointing at #work).
    expect(href).toMatch(/^https:\/\//);
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
