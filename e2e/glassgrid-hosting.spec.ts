import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

import { SITE_URL } from '../src/data/site';
import { WORK_PROJECTS } from '../src/data/workProjects';

/**
 * The Glassgrid demo as this site serves it, from public/glassgrid/ with the
 * headers and rewrites next.config.ts takes from its hosting manifest (see
 * docs/glassgrid-hosting.md).
 *
 * Skipped when public/glassgrid/ is absent (GLASSGRID_SKIP=1, or a checkout
 * that never fetched it): the rest of the suite does not need the demo.
 * Desktop Chromium only: the demo's own CI covers it across browsers, and
 * what is under test here is the hosting, which does not change with the
 * viewport.
 *
 * "The charts draw" is the same signal Glassgrid's own E2E
 * (apps/web/e2e/samples.spec.ts) waits for: every chart card reports
 * `data-status="ready"` and a non-zero row count.
 */

const DEMO_DIR = path.join(__dirname, '..', 'public', 'glassgrid');
const PRESENT = existsSync(path.join(DEMO_DIR, 'glassgrid-hosting.json'));
const CSP_MARK = "script-src 'self' 'wasm-unsafe-eval'";

test.skip(!PRESENT, 'public/glassgrid/ is absent (GLASSGRID_SKIP=1, or `npm run glassgrid:fetch` never ran)');
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'hosting checks run once, in desktop Chromium');
});

/** The first file in public/glassgrid/<dir> matching `pattern`, as a URL path. */
function demoFile(dir: string, pattern: RegExp): string {
  const name = readdirSync(path.join(DEMO_DIR, dir)).find((file) => pattern.test(file));
  if (!name) throw new Error(`no ${pattern} in public/glassgrid/${dir}`);
  return `/glassgrid/${dir}/${name}`;
}

/** Console errors, page errors and CSP violations reported to the page. */
async function watchProblems(page: Page) {
  const problems: string[] = [];
  const info: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
    if (message.text().startsWith('[glassgrid]')) info.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`CSP violation: ${event.violatedDirective} blocked ${event.blockedURI || '(inline)'}`);
    });
  });
  return { problems, info };
}

test('/glassgrid/?sample=taxi opens the app and its charts draw, with no CSP violation', async ({ page }) => {
  test.setTimeout(180_000);
  const { problems, info } = await watchProblems(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/glassgrid/?sample=taxi');
  // trailingSlash is false: /glassgrid/ is a 308 to /glassgrid, query kept.
  expect(new URL(page.url()).pathname).toBe('/glassgrid');
  expect(new URL(page.url()).searchParams.get('sample')).toBe('taxi');

  await page.waitForFunction(
    () => {
      const cards = [...document.querySelectorAll<HTMLElement>('section.gg-chart-card')];
      const drawn = (card: HTMLElement) =>
        card.dataset['status'] === 'ready' && /^[1-9][\d,]* rows?$/.test(card.querySelector('.gg-chart-card__rows')?.textContent ?? '');
      return cards.length >= 3 && cards.every(drawn);
    },
    undefined,
    { polling: 'raf', timeout: 150_000 },
  );
  // The engine started with the Parquet extension served from /glassgrid/duckdb-extensions/.
  expect(info.find((line) => line.includes('DuckDB-WASM')) ?? '').toMatch(/ready \(parquet: true/);
  expect(problems).toEqual([]);
});

test('the demo CSP is on /glassgrid and nowhere else', async ({ request }) => {
  const demo = await request.get('/glassgrid');
  expect(demo.status()).toBe(200);
  expect(demo.headers()['content-security-policy']).toContain(CSP_MARK);
  expect(demo.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(demo.headers()['cross-origin-opener-policy']).toBe('same-origin');

  const home = await request.get('/');
  expect(home.status()).toBe(200);
  expect(home.headers()['content-security-policy'] ?? '').not.toContain('wasm-unsafe-eval');
  expect(home.headers()['cross-origin-opener-policy']).toBeUndefined();
});

test('DuckDB-WASM is served as application/wasm, cached as immutable', async ({ request }) => {
  const wasm = await request.head(demoFile('assets', /^duckdb-eh-.+\.wasm$/));
  expect(wasm.status()).toBe(200);
  expect(wasm.headers()['content-type']).toBe('application/wasm');
  expect(wasm.headers()['cache-control']).toContain('immutable');
});

test('a sample Parquet file is application/vnd.apache.parquet, immutable, and answers Range', async ({ request }) => {
  const parquet = await request.get(demoFile('samples', /\.parquet$/), { headers: { Range: 'bytes=0-3' } });
  expect(parquet.status()).toBe(206);
  expect((await parquet.body()).toString('latin1')).toBe('PAR1');
  expect(parquet.headers()['content-type']).toBe('application/vnd.apache.parquet');
  expect(parquet.headers()['cache-control']).toContain('immutable');
  expect(parquet.headers()['content-range']).toMatch(/^bytes 0-3\/\d+$/);
});

test('/glassgrid/gallery is rewritten to the app shell', async ({ request }) => {
  const shell = await request.get('/glassgrid');
  const gallery = await request.get('/glassgrid/gallery');
  expect(gallery.status()).toBe(200);
  expect(gallery.headers()['content-type']).toMatch(/^text\/html/);
  expect(gallery.headers()['content-security-policy']).toContain(CSP_MARK);
  expect(await gallery.text()).toBe(await shell.text());
  expect(await gallery.text()).toContain('src="/glassgrid/assets/');
});

test("the home page's Live demo link is this site's /glassgrid/?sample=taxi", async ({ page }) => {
  await page.goto('/');
  const card = page.locator('#work li').filter({ has: page.getByRole('heading', { name: 'Glassgrid', exact: true }) });
  const href = (await card.getByRole('link', { name: /^Live demo/ }).getAttribute('href')) ?? '';
  const url = new URL(href);
  expect(url.origin).toBe(new URL(SITE_URL).origin);
  expect(url.pathname + url.search).toBe('/glassgrid/?sample=taxi');
  expect(href).toBe(WORK_PROJECTS.find((p) => p.id === 'glassgrid')!.links.find((l) => l.label === 'Live demo')!.href);

  // Same path, this server: it reaches the app.
  const response = await page.request.get(url.pathname + url.search);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-security-policy']).toContain(CSP_MARK);
  expect(await response.text()).toContain('<title>Glassgrid</title>');
});
