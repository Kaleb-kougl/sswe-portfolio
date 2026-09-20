import { test, expect, type Page, type TestInfo } from '@playwright/test';

/**
 * The mid-range phone, measured instead of assumed.
 *
 * The CHECKS panel in `process-section.tsx` carried a `✗ mid-range phone —
 * not yet tested` row for as long as this was a guess. This file is what
 * retires it.
 *
 * Every other spec in this directory runs under `playwright.config.ts`,
 * against `next dev` on :3000. This one does not, and must not: a Core Web
 * Vitals number taken off a dev server measures the dev server. It runs from
 * `playwright.vitals.config.ts` — `npm run test:vitals` — against a
 * production build on :3100.
 *
 * WHAT "MID-RANGE PHONE" MEANS HERE
 * --------------------------------
 * It is an emulation, and the row that reports it says so. There is no
 * physical handset in this pipeline and no claim that there is. What there is
 * is the industry's standard stand-in for one: Lighthouse's mobile preset —
 * a 4x CPU slowdown plus 1.6 Mbps / 150ms RTT — which is calibrated against a
 * mid-tier Android (Moto G class) on a slow connection. The viewport comes
 * from Playwright's Pixel 5 descriptor.
 *
 * That is a weaker claim than a rack of real devices and a stronger one than
 * the empty row it replaces. Three honest gaps, none of them hidden:
 *
 *   - Emulation scales main-thread work. It does not reproduce a phone's GPU,
 *     its thermal throttling, or its memory pressure. A number from here is a
 *     floor on what a real phone would have to beat, not a substitute.
 *   - The document request is not throttled — measured TTFB is ~5ms, because
 *     the server is on this machine. Subresources are (~1.3s for the largest
 *     chunk, against ~25ms unthrottled), so what is under test is the cost of
 *     what the site ships, with the hosting held at zero. Real-world LCP is
 *     this plus whatever the edge takes to answer.
 *   - The frame counts below are not a phone's frame rate. A headless browser
 *     is not vsync-locked to 60Hz, so the figure reads far above what any
 *     handset would display. It is used as a liveness signal — frames
 *     happening at all versus a flat zero — and never quoted as fps.
 *
 * WHY THE THRESHOLDS ARE THE PUBLIC ONES
 * -------------------------------------
 * 2500ms LCP and 0.1 CLS are the "good" boundaries Google publishes, not
 * numbers reverse-engineered from what this page happens to score. A budget
 * fitted to the current build tells you only that the build has not changed.
 * The measured values are recorded as annotations on each test so the actual
 * figures — not just the pass — land in the HTML report.
 */

/**
 * Lighthouse's mobile throttling preset, applied through CDP.
 *
 * `cpuSlowdownMultiplier: 4`, `rttMs: 150`, `throughputKbps: 1638.4` are
 * Lighthouse's own mobile defaults. CDP wants throughput in bytes per second,
 * hence the division. Upload is Lighthouse's 675 Kbps.
 */
const CPU_SLOWDOWN = 4;
const NETWORK = {
  offline: false,
  latency: 150,
  downloadThroughput: (1_638.4 * 1_000) / 8,
  uploadThroughput: (675 * 1_000) / 8,
};

/** Long enough for the loop to prove itself; ~120 frames at 60fps. */
const SAMPLE_MS = 2_000;

/** Google's "good" boundaries. Not tuned to this build — see the note above. */
const LCP_BUDGET_MS = 2_500;
const CLS_BUDGET = 0.1;

/**
 * A live loop under a 4x handicap still clears this easily; a downgraded
 * backdrop produces exactly 0. The floor only has to separate those two.
 */
const LIVE_FRAME_FLOOR = 30;

type Probe = {
  __draws: number;
  __lcp: number;
  /** Tag name of whatever element is currently the LCP candidate. */
  __lcpElement: string;
  __cls: number;
};

/**
 * Installs the whole measurement rig before any page script runs.
 *
 * Draws are counted the way `reduced-motion.spec.ts` established: the backdrop
 * is one draw call per frame, so the counter is a frame counter. LCP and CLS
 * come from the same `PerformanceObserver` entries the field data is built
 * from, with `buffered: true` so entries emitted before the observer attached
 * are not lost.
 */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const probe = window as unknown as Probe;
    probe.__draws = 0;
    probe.__lcp = 0;
    probe.__lcpElement = 'none';
    probe.__cls = 0;

    const observe = (type: string, handle: (entry: PerformanceEntry) => void) => {
      try {
        new PerformanceObserver((list) => list.getEntries().forEach(handle)).observe({
          type,
          buffered: true,
        });
      } catch {
        // An unsupported entry type must not take the page down; the
        // assertion below fails loudly on a zero instead.
      }
    };

    // Each LCP entry supersedes the last, so the newest one wins. The element
    // is read here rather than afterwards because `getEntriesByType` does not
    // retain LCP entries — they reach a buffered observer and nowhere else.
    observe('largest-contentful-paint', (entry) => {
      const candidate = entry as PerformanceEntry & { element?: Element };
      probe.__lcp = candidate.startTime;
      probe.__lcpElement = candidate.element?.tagName ?? 'none';
    });

    // CLS is the sum of shifts not attributed to user input. Shifts that
    // follow an interaction are excluded by the spec's own definition, which
    // is why `hadRecentInput` is honoured rather than summed over everything.
    observe('layout-shift', (entry) => {
      const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
      if (!shift.hadRecentInput) probe.__cls += shift.value;
    });

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
      proto[name] = function (this: unknown, ...args: unknown[]) {
        probe.__draws++;
        return original.apply(this, args);
      };
    }
  });
}

const read = <K extends keyof Probe>(page: Page, key: K) =>
  page.evaluate((k) => (window as unknown as Probe)[k as K], key);

/**
 * Applies the handicap, then loads the page under it.
 *
 * Throttling is installed before `goto`, so the load itself is throttled
 * rather than only the idle time afterwards — the load is most of what this
 * file is measuring.
 */
async function openThrottled(page: Page) {
  await instrument(page);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', NETWORK);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });

  await page.goto('/');
  // The route is behind a Suspense boundary (`src/app/loading.tsx`).
  await expect(page.locator('#hero')).toBeVisible();
}

/** Puts a measured figure in the HTML report, so the run states its numbers. */
const record = (testInfo: TestInfo, description: string) =>
  testInfo.annotations.push({ type: 'measured', description });

test.describe('A mid-range phone, emulated', () => {
  // Every step here is 4x slower than the machine it runs on, and the load is
  // on a simulated 1.6 Mbps link.
  test.setTimeout(120_000);

  test('paints its largest element inside the LCP budget', async ({ page }, testInfo) => {
    await openThrottled(page);

    // LCP is not final until the page stops producing candidates, and it is
    // frozen by the first real interaction — so this waits, and does not
    // scroll, before reading it.
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(SAMPLE_MS);

    const lcp = await read(page, '__lcp');

    // Recorded alongside it because the split is what a failure needs: a
    // regression in the bytes is a different bug from a regression in the
    // work done on them, and the two land on the same number.
    const { ttfb, fcp } = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      const paint = performance
        .getEntriesByType('paint')
        .find((entry) => entry.name === 'first-contentful-paint');
      return { ttfb: nav?.responseStart ?? 0, fcp: paint?.startTime ?? 0 };
    });
    const element = await read(page, '__lcpElement');

    record(testInfo, `LCP ${(lcp / 1000).toFixed(2)}s (budget ${LCP_BUDGET_MS / 1000}s)`);
    record(
      testInfo,
      `TTFB ${Math.round(ttfb)}ms · FCP ${Math.round(fcp)}ms · LCP element <${element.toLowerCase()}>`,
    );

    // A zero means no entry was ever recorded, which is a broken probe rather
    // than a fast page, and would otherwise pass the budget silently.
    expect(lcp, 'no largest-contentful-paint entry — the probe did not attach').toBeGreaterThan(0);
    expect(lcp).toBeLessThanOrEqual(LCP_BUDGET_MS);
  });

  test('settles without shifting its layout', async ({ page }, testInfo) => {
    await openThrottled(page);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(SAMPLE_MS);

    // The hero is the part that can shift: a font swap, or the canvas
    // arriving late behind the copy. Both would show up by now.
    const loadCls = await read(page, '__cls');
    record(testInfo, `CLS ${loadCls.toFixed(4)} at load (budget ${CLS_BUDGET})`);
    expect(loadCls).toBeLessThanOrEqual(CLS_BUDGET);

    // Then the rest of the page, section by section, since a shift below the
    // fold is still a shift the reader sees.
    for (const id of ['work', 'career', 'process', 'contact']) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }

    const scrolledCls = await read(page, '__cls');
    record(testInfo, `CLS ${scrolledCls.toFixed(4)} after scrolling the page`);
    expect(scrolledCls).toBeLessThanOrEqual(CLS_BUDGET);
  });

  test('keeps the animated backdrop rather than downgrading to the still', async ({
    page,
  }, testInfo) => {
    await openThrottled(page);
    await expect(page.locator('canvas')).toHaveCount(1);

    // Past the warm-up and the ~3.7s the watchdog needs to make up its mind:
    // 1s warm-up, 20 frames of window, 2s of sustained badness.
    await page.waitForTimeout(10_000);

    const mark = await read(page, '__draws');
    await page.waitForTimeout(SAMPLE_MS);
    const idleDraws = (await read(page, '__draws')) - mark;
    record(testInfo, `${idleDraws} backdrop frames drawn while idle, over ${SAMPLE_MS}ms`);

    expect(
      idleDraws,
      'the watchdog downgraded a mid-range phone — the backdrop is off for exactly the audience this row is about',
    ).toBeGreaterThan(LIVE_FRAME_FLOOR);

    // And it survives the scroll it exists for, which is the expensive half:
    // every frame writes 112 instances into two buffers.
    const beforeScroll = await read(page, '__draws');
    await page.locator('#process').scrollIntoViewIfNeeded();
    await page.waitForTimeout(SAMPLE_MS);
    const scrollDraws = (await read(page, '__draws')) - beforeScroll;
    record(testInfo, `${scrollDraws} backdrop frames drawn mid-scroll, over ${SAMPLE_MS}ms`);

    expect(scrollDraws).toBeGreaterThan(LIVE_FRAME_FLOOR);
  });
});
