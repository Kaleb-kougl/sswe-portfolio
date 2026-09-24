import { test, expect, type BrowserContext, type Page } from '@playwright/test';

import { FIXTURE_NOW, FIXTURES, idealDecisions } from '../__tests__/fit/fixtures';
import { CORPUS } from '../src/data/corpus';
import { SITE_URL } from '../src/data/site';
import { analyzeWithDecisions } from '../src/lib/fit/analyze';
import { JD_MAX_CHARS, type FitReport } from '../src/lib/fit/contract';
import { segmentJd } from '../src/lib/fit/segment';

/**
 * /fit, the fit checker (plan v4, Phase 2e).
 *
 * THE SCAN PATH runs for real: `analyzeWithoutModel` is pure code in the page.
 *
 * THE MODEL PATH uses a fake `Worker`, installed with `addInitScript` before
 * any page script runs. It speaks the real protocol (`src/lib/fit/local/
 * protocol.ts`), so the real `client.ts`, gate, consent dialog, progress and
 * streaming UI all run; only the thing on the other side of `postMessage` is
 * scripted. Chosen over an in-app seam (a `window.__fitSessionFactory` read
 * behind a build flag) because it needs no production code at all: there is
 * nothing to strip from the bundle and nothing a visitor could trigger.
 * Headless Chromium has no usable WebGPU adapter, so without the fake the
 * probe says "unsupported" and the Private-mode box stays hidden, which is
 * itself one of the tests below.
 */

const FRONTEND = FIXTURES.find((f) => f.name === 'frontend-senior')!;
const FULLSTACK = FIXTURES.find((f) => f.name === 'fullstack-senior')!;

/**
 * The model report the fake worker streams: the fixture's hand-labelled
 * ("perfect model") decisions through the real merge and judging code.
 */
const MODEL_REPORT: FitReport = analyzeWithDecisions(
  FRONTEND.jd,
  idealDecisions(FRONTEND, segmentJd(FRONTEND.jd)),
  FIXTURE_NOW,
);

const EVIDENCE_HREF = new Map(CORPUS.evidence.map((e) => [e.id, e.source.href]));

/** What the page renders for a corpus href: this site's own anchors go relative. */
const renderedHref = (href: string) => (href.startsWith(`${SITE_URL}/`) ? href.slice(SITE_URL.length) : href);

async function openFit(page: Page) {
  await page.goto('/fit');
  await expect(page.getByRole('heading', { level: 1, name: 'Check your role against my work' })).toBeVisible();
}

async function runScan(page: Page, jd: string) {
  await page.getByLabel('Job description').fill(jd);
  await page.getByRole('button', { name: 'Check fit' }).click();
  await expect(page.getByTestId('fit-report-scan')).toBeVisible();
}

/**
 * The key that moves focus to the next control. WebKit on macOS follows the
 * platform default ("Press Tab to highlight each item" off): Tab reaches only
 * text fields, and Option+Tab reaches buttons and links too. That is Safari's
 * behaviour for every site, not something a page can change, so the tests use
 * the key a Safari keyboard user would press. Only on macOS: WebKit's Linux
 * ports (CI) tab to every control, like the other engines.
 */
const nextKey = (browserName: string) => (browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');

/**
 * `layout-shift` and `longtask` entries are Chromium-only; WebKit and Firefox
 * ignore the observer, so assertions on them are empty there. The tests still
 * run (the geometry and streaming checks hold everywhere); this says so in the report.
 */
function noteChromiumOnlyObserver(browserName: string, what: string) {
  if (browserName !== 'chromium')
    test.info().annotations.push({ type: 'note', description: `${what} is Chromium-only; that assertion is vacuous in ${browserName}` });
}

// --------------------------------------------------------------- fake worker

interface FakeWorkerOptions {
  /** `probe_result` supported? */
  supported: boolean;
  /** Delay before the probe answers, to exercise "Checking…". */
  probeDelayMs: number;
  report: FitReport | null;
  rowDelayMs: number;
  estimatedFirstRowMs: number;
}

/** Runs in the page, before its scripts. Replaces `Worker` with a scripted fake. */
function installFakeWorker(opts: FakeWorkerOptions) {
  const w = window as unknown as Record<string, unknown>;
  const created: string[] = [];
  w.__fakeWorkers = created;

  class FakeWorker extends EventTarget {
    private timers: number[] = [];
    private runId: number | null = null;
    constructor(_url: string | URL, options?: { name?: string }) {
      super();
      created.push(options?.name ?? '');
    }
    private send(data: unknown, delay: number) {
      this.timers.push(window.setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data })), delay));
    }
    postMessage(msg: { type: string; id: number }) {
      switch (msg.type) {
        case 'probe':
          this.send(
            { type: 'probe_result', id: msg.id, result: opts.supported ? { supported: true } : { supported: false, reason: 'no-adapter' } },
            opts.probeDelayMs,
          );
          return;
        case 'bench':
          this.send(
            {
              type: 'bench_result',
              id: msg.id,
              result: { gflops: 900, gbps: 120, elapsedMs: 200, estimatedFirstRowMs: opts.estimatedFirstRowMs },
            },
            50,
          );
          return;
        case 'load': {
          const total = 695_242_752;
          [0.2, 0.6, 1].forEach((fraction, i) =>
            this.send(
              {
                type: 'progress',
                id: msg.id,
                progress: { phase: 'download', fraction, loadedBytes: Math.round(fraction * total), totalBytes: total, text: '' },
              },
              60 * (i + 1),
            ),
          );
          this.send({ type: 'loaded', id: msg.id, fromCache: false, elapsedMs: 250 }, 250);
          return;
        }
        case 'run': {
          const report = opts.report!;
          this.runId = msg.id;
          report.requirements.forEach((row, index) =>
            this.send({ type: 'row', id: msg.id, index, row }, opts.rowDelayMs * (index + 1)),
          );
          this.send(
            {
              type: 'done',
              id: msg.id,
              report,
              stats: { firstRowMs: opts.rowDelayMs, totalMs: 1, tokensPerSecond: null, promptTokens: null, completionTokens: null },
            },
            opts.rowDelayMs * (report.requirements.length + 1),
          );
          return;
        }
        case 'cancel':
          this.timers.forEach((t) => window.clearTimeout(t));
          this.timers = [];
          if (this.runId !== null) this.send({ type: 'cancelled', id: this.runId }, 0);
          return;
      }
    }
    terminate() {
      this.timers.forEach((t) => window.clearTimeout(t));
    }
  }

  w.Worker = FakeWorker;
}

async function withFakeWorker(page: Page, opts: Partial<FakeWorkerOptions>) {
  await page.addInitScript(installFakeWorker, {
    supported: true,
    probeDelayMs: 0,
    report: MODEL_REPORT,
    rowDelayMs: 250,
    estimatedFirstRowMs: 1_500,
    ...opts,
  });
}

// --------------------------------------------------------------- scan path

test.describe('/fit scan path', () => {
  test('renders requirement rows, gaps and evidence that resolve to the corpus', async ({ page }) => {
    await openFit(page);
    await runScan(page, FULLSTACK.jd);

    const report = page.getByTestId('fit-report-scan');
    // Focus lands on the report heading, so keyboard users start at the result.
    await expect(page.locator('#fit-report-heading')).toBeFocused();

    const rows = report.locator('li[data-verdict]');
    expect(await rows.count()).toBeGreaterThan(3);

    // Gap rows say so plainly.
    const gaps = report.locator('li[data-verdict="gap"]');
    expect(await gaps.count()).toBeGreaterThan(0);
    await expect(gaps.first()).toContainText('Not in my work yet');

    // Verdicts are text, not just color.
    await expect(rows.first().locator('span').first()).toHaveText(/Strong|Partial|Gap|Not assessed/);

    // Every evidence chip points at its corpus record's source.
    const chips = report.locator('a[data-evidence-id]');
    const n = await chips.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const chip = chips.nth(i);
      const id = (await chip.getAttribute('data-evidence-id'))!;
      const source = EVIDENCE_HREF.get(id);
      expect(source, `unknown evidence id ${id}`).toBeTruthy();
      await expect(chip).toHaveAttribute('href', renderedHref(source!));
      if (/^https?:/.test(renderedHref(source!))) {
        await expect(chip).toHaveAttribute('target', '_blank');
        await expect(chip).toHaveAttribute('rel', /noopener/);
        await expect(chip).toContainText('(opens in a new tab)');
      }
    }
  });

  test('requirement text is rendered as text, never as HTML', async ({ page }) => {
    await openFit(page);
    await runScan(page, 'Requirements:\n- <img src=x onerror="window.__xss=1"> React and TypeScript experience');
    await expect(page.getByTestId('fit-report-scan')).toContainText('<img src=x');
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(await page.getByTestId('fit-report-scan').locator('img').count()).toBe(0);
  });

  test('validation errors are shown inline and tied to the field', async ({ page }) => {
    await openFit(page);
    const field = page.getByLabel('Job description');

    await page.getByRole('button', { name: 'Check fit' }).click();
    // (Next's route announcer is also role=alert; this is the form's own.)
    const error = page.locator('form [role="alert"]');
    await expect(error).toHaveText('Paste a job description first.');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    const errorId = await error.getAttribute('id');
    expect(await field.getAttribute('aria-describedby')).toContain(errorId!);
    await expect(field).toBeFocused();

    await field.fill('https://a.example/1 https://a.example/2 https://a.example/3 jobs');
    await page.getByRole('button', { name: 'Check fit' }).click();
    await expect(page.locator('form [role="alert"]')).toContainText('mostly links');
    await expect(page.getByTestId('fit-report-scan')).toHaveCount(0);

    // The page restates the limit (to keep zod out of first-load JS); hold it to the contract.
    await expect(field).toHaveAttribute('maxlength', String(JD_MAX_CHARS));
  });

  test('copies the report as Markdown', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openFit(page);
    await runScan(page, FULLSTACK.jd);
    await page.getByTestId('copy-markdown').click();
    await expect(page.getByTestId('copy-markdown')).toHaveText('Copied');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toMatch(/^# Fit report: /);
    expect(text).toContain('Not in my work yet');
  });

  test('"Email me about this role" opens the contact form with the reason chosen and no JD in the URL', async ({
    page,
  }) => {
    await openFit(page);
    await runScan(page, FULLSTACK.jd);
    const link = page.getByRole('link', { name: 'Email me about this role' });
    await expect(link).toHaveAttribute('href', '/?reason=role#contact');
    await link.click();
    await page.waitForURL('**/?reason=role#contact');
    await expect(page.getByRole('button', { name: 'Full-time role' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Message')).toHaveValue(/fit checker/);
  });
});

// --------------------------------------------------------------- privacy

/** Every request and WebSocket frame this context sends, workers included. */
function recordTraffic(context: BrowserContext, page: Page) {
  const seen: string[] = [];
  const record = (req: { url(): string; postDataBuffer(): Buffer | null }) => {
    seen.push(req.url());
    const body = req.postDataBuffer();
    if (body) seen.push(body.toString('utf8'));
  };
  context.on('request', record);
  page.on('worker', (worker) => seen.push(`worker:${worker.url()}`));
  page.on('websocket', (ws) => {
    seen.push(ws.url());
    ws.on('framesent', (frame) => seen.push(String(frame.payload)));
  });
  return seen;
}

test.describe('/fit privacy', () => {
  test('no request URL, body or socket frame carries the job description', async ({ page, context }) => {
    const TOKEN = 'ZQXJOBTOKEN7781';
    const seen = recordTraffic(context, page);
    await withFakeWorker(page, {});
    await openFit(page);

    const jd = `${FULLSTACK.jd}\n- Experience with the ${TOKEN} platform`;
    await runScan(page, jd);
    await expect(page.getByTestId('fit-report-scan')).toContainText(TOKEN);

    // Through Private mode too (the fake worker receives the JD by postMessage,
    // which is in-process, not the network).
    await page.getByTestId('private-mode-button').click();
    await page.getByRole('dialog').getByRole('button', { name: /Download .* and run/ }).click();
    await expect(page.getByTestId('fit-report-model')).toBeVisible();
    await expect(page.getByTestId('private-mode')).toContainText('replaced the keyword scan');

    await page.getByRole('button', { name: 'Copy as Markdown' }).click();

    expect(seen.length).toBeGreaterThan(0);
    const leaks = seen.filter((s) => s.includes(TOKEN) || s.includes(encodeURIComponent(TOKEN)));
    expect(leaks).toEqual([]);
  });
});

// --------------------------------------------------------------- Private mode

test.describe('/fit Private mode', () => {
  test('no WebGPU: the box is hidden, and nothing shifts when it goes', async ({ page, browserName }) => {
    // This one runs the REAL probe, premised on headless Chromium having no
    // usable adapter. WebKit and Firefox ship WebGPU on some platforms, so
    // whether the box hides there depends on the machine, not on this page.
    test.skip(browserName !== 'chromium', 'relies on headless Chromium having no WebGPU adapter');
    await page.addInitScript(() => {
      const w = window as unknown as { __shifts: number[] };
      w.__shifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) w.__shifts.push(entry.value);
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await openFit(page);
    await runScan(page, FULLSTACK.jd);
    // Page-load shifts (font swap, the dev overlay) aren't this test's business.
    await page.evaluate(() => ((window as unknown as { __shifts: number[] }).__shifts = []));

    // The real probe runs (headless Chromium: no usable adapter) and settles hidden.
    await expect(page.getByTestId('private-mode')).toHaveAttribute('data-offer', 'hidden', { timeout: 15_000 });
    await expect(page.getByTestId('private-mode-button')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __shifts: number[] }).__shifts)).toEqual([]);
  });

  test('a slow probe reserves the box while "Checking…", then hides without a layout shift', async ({ page, browserName }) => {
    noteChromiumOnlyObserver(browserName, 'the layout-shift observer');
    await withFakeWorker(page, { supported: false, probeDelayMs: 2_500 });
    await openFit(page);
    await runScan(page, FULLSTACK.jd);
    const box = page.getByTestId('private-mode');
    await expect(box).toHaveAttribute('data-offer', 'checking');
    await expect(box).toContainText('Checking whether this device can run it');

    // Anything above the box must not move when it goes: measure the report
    // in document coordinates. (If the visitor is scrolled to the very bottom,
    // the page getting shorter clamps the scroll position; that's a scroll,
    // not a layout shift, and CLS doesn't count it either.)
    const docBox = () =>
      page.getByTestId('fit-report-scan').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
      });
    const before = await docBox();
    await page.evaluate(() => {
      const w = window as unknown as { __shifts: number[] };
      w.__shifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) w.__shifts.push(entry.value);
        }
      }).observe({ type: 'layout-shift' });
    });
    await expect(box).toHaveAttribute('data-offer', 'hidden', { timeout: 10_000 });
    expect(await docBox()).toEqual(before);
    expect(await page.evaluate(() => (window as unknown as { __shifts: number[] }).__shifts)).toEqual([]);
  });

  test('streams model rows into the report, announces progress per row, keeps the scan', async ({ page, browserName }) => {
    noteChromiumOnlyObserver(browserName, 'the longtask observer');
    await page.addInitScript(() => {
      const w = window as unknown as { __longTasks: { start: number; duration: number }[]; __status: string[] };
      w.__longTasks = [];
      w.__status = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks.push({ start: e.startTime, duration: e.duration });
      }).observe({ type: 'longtask' });
    });
    await withFakeWorker(page, { rowDelayMs: 300 });
    await openFit(page);
    await runScan(page, FRONTEND.jd);

    const button = page.getByTestId('private-mode-button');
    await expect(button).toHaveText('Try Private mode');

    // Record every text the live region takes, to prove per-row announcements.
    await page.evaluate(() => {
      const w = window as unknown as { __status: string[] };
      const node = document.querySelector('[data-testid="fit-status"]')!;
      new MutationObserver(() => w.__status.push(node.textContent ?? '')).observe(node, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });

    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Run Private mode on this device?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('695 MB');
    await expect(dialog).toContainText('Hugging Face');
    await expect(dialog).toContainText('cached in this browser');

    const runStart = await page.evaluate(() => performance.now());
    await dialog.getByRole('button', { name: /Download .* and run/ }).click();
    await expect(dialog).toBeHidden();

    // Rows arrive one by one: the model report grows past 1 row before it's done.
    const model = page.getByTestId('fit-report-model');
    await expect(model.locator('li[data-verdict]')).toHaveCount(1, { timeout: 10_000 });
    await expect(model.locator('li[data-verdict]')).toHaveCount(2);
    await expect(page.getByTestId('private-mode-button')).toHaveText('Cancel');
    await expect(page.getByTestId('private-mode')).toContainText(/of ~\d+ requirements checked/);

    const total = MODEL_REPORT.requirements.length;
    await expect(model.locator('li[data-verdict]')).toHaveCount(total, { timeout: 10_000 });
    await expect(page.getByTestId('private-mode')).toContainText('replaced the keyword scan');
    const runEnd = await page.evaluate(() => performance.now());

    // The model report: priorities, coverage and the "Show keyword scan" disclosure.
    await expect(model.getByRole('heading', { name: /^Must-have/ })).toBeVisible();
    await expect(model.getByTestId('fit-coverage')).toContainText(/of \d+ must-haves covered/);
    const disclosure = page.getByTestId('scan-disclosure');
    await disclosure.getByText('Show keyword scan').click();
    await expect(disclosure.getByTestId('fit-report-scan')).toBeVisible();

    const status = await page.evaluate(() => (window as unknown as { __status: string[] }).__status);
    const perRow = status.filter((s) => /^\d+ of ~\d+ requirements checked$/.test(s));
    expect(new Set(perRow).size).toBeGreaterThanOrEqual(total - 1);
    expect(status.at(-1)).toMatch(/^Private-mode report ready/);

    // No main-thread long task over 50 ms while the rows streamed in.
    const longTasks = await page.evaluate(
      ([from, to]) =>
        (window as unknown as { __longTasks: { start: number; duration: number }[] }).__longTasks.filter(
          (t) => t.start >= from && t.start <= to,
        ),
      [runStart, runEnd],
    );
    expect(longTasks).toEqual([]);

    // Only the runtime worker was created on press (no second probe).
    expect(await page.evaluate(() => (window as unknown as { __fakeWorkers: string[] }).__fakeWorkers)).toEqual([
      'fit-probe',
      'fit-private-mode',
    ]);
  });

  test('a slow bench asks first; the dialog is keyboard operable and Escape returns focus', async ({ page, browserName }) => {
    await withFakeWorker(page, { estimatedFirstRowMs: 42_000 });
    await openFit(page);
    await runScan(page, FRONTEND.jd);

    const button = page.getByTestId('private-mode-button');
    await button.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // showModal focuses the first control: Cancel, the choice that downloads nothing.
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveText('Try Private mode');

    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.press(nextKey(browserName));
    await expect(dialog.getByRole('button', { name: /Download .* and run/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('private-mode')).toContainText('would take about 42 s');
    await expect(button).toHaveText('Download anyway');
    await expect(page.getByTestId('fit-report-model')).toHaveCount(0);

    await page.getByRole('button', { name: 'Keep the keyword scan' }).click();
    await expect(button).toHaveText('Try Private mode');
    await expect(page.getByTestId('fit-report-scan')).toBeVisible();
  });

  test('cancelling mid-run keeps the keyword scan', async ({ page }) => {
    await withFakeWorker(page, { rowDelayMs: 600 });
    await openFit(page);
    await runScan(page, FRONTEND.jd);
    await page.getByTestId('private-mode-button').click();
    await page.getByRole('dialog').getByRole('button', { name: /Download .* and run/ }).click();
    await expect(page.getByTestId('fit-report-model').locator('li[data-verdict]')).toHaveCount(1, { timeout: 10_000 });
    await page.getByTestId('private-mode-button').click(); // "Cancel"
    await expect(page.getByTestId('private-mode-problem')).toHaveText(/cancelled.*keyword scan above still stands/i);
    await expect(page.getByTestId('fit-report-scan')).toBeVisible();
    await expect(page.getByTestId('fit-report-model')).toHaveCount(0);
  });
});
