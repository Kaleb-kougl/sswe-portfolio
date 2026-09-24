import { test, expect, type Locator, type Page } from '@playwright/test';

import { FIXTURES } from '../__tests__/fit/fixtures';

/**
 * /fit keyboard, focus, live-region and motion checks that axe can't make
 * (axe.spec.ts covers the static WCAG rules):
 *
 *   - every interactive element is reached by the keyboard, in DOM order
 *   - each one paints a visible focus indicator under :focus-visible
 *   - a chat reply updates exactly one polite live region, once
 *   - with reduced motion, the chat and the report neither smooth-scroll
 *     nor transition
 *   - the accessibility tree of the chat thread (evidence and gap replies)
 *     is attached to the report for review
 *
 * Runs in every project. WebKit on macOS tabs to text fields only unless
 * "Press Tab to highlight each item" is on; Option+Tab is how a Safari user
 * reaches buttons and links, so that is the key pressed there.
 */

const FULLSTACK = FIXTURES.find((f) => f.name === 'fullstack-senior')!;

// Only on macOS: WebKit's Linux ports (CI) tab to every control, like the other engines.
const nextKey = (browserName: string) => (browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');

async function openFit(page: Page) {
  await page.goto('/fit');
  await expect(page.getByRole('heading', { level: 2, name: 'Ask about my work' })).toBeVisible();
  // Hydrated, so the chips and buttons are live before the keyboard walk.
  await page.waitForLoadState('load');
}

/** Expands a reply's extra records: the "Show N more" button (or the older "More records" disclosure). */
async function expandMore(turn: Locator) {
  const more = turn.getByRole('button', { name: /^Show \d+ more$/ }).or(turn.getByText('More records', { exact: true }));
  if (await more.count()) await more.first().click();
}

async function ask(page: Page, question: string) {
  const turns = page.getByTestId('ask-turn');
  const before = await turns.count();
  await page.getByLabel('Your question').fill(question);
  await page.getByTestId('ask-panel').getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(turns).toHaveCount(before + 1);
  return turns.last();
}

async function runScan(page: Page) {
  await page.getByLabel('Job description').fill(FULLSTACK.jd);
  await page.getByRole('button', { name: 'Check fit' }).click();
  await expect(page.getByTestId('fit-report-scan')).toBeVisible();
  await expect(page.getByTestId('private-mode')).not.toHaveAttribute('data-offer', 'checking', { timeout: 15_000 });
}

/**
 * Numbers every tabbable element in DOM order (`data-a11y-tab`) and returns
 * the count. Tabbable: the native interactive elements and positive/zero
 * tabindex, not disabled, rendered (so the contents of a closed <details> are
 * out), and not inside `inert` or `aria-hidden` subtrees.
 */
function numberTabbables(page: Page) {
  return page.evaluate(() => {
    const selector =
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
    let n = 0;
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      el.removeAttribute('data-a11y-tab');
      if (el.matches(':disabled') || el.tabIndex < 0) continue;
      if (el.closest('[inert], [aria-hidden="true"], nextjs-portal')) continue;
      if (!el.checkVisibility({ checkVisibilityCSS: true } as CheckVisibilityOptions)) continue;
      // The summary of a nested details inside a closed one isn't rendered either.
      if (el.tagName === 'SUMMARY' && el.parentElement?.tagName !== 'DETAILS') continue;
      el.setAttribute('data-a11y-tab', String(n++));
    }
    return n;
  });
}

interface Stop {
  index: number | null;
  name: string;
  focusVisible: boolean;
  ring: string;
}

/** Tabs from the top of the page to past the last tabbable, recording each stop and its focus indicator. */
async function walk(page: Page, browserName: string, total: number): Promise<Stop[]> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  // Focus a point before the first element: the document itself.
  await page.locator('body').evaluate((b) => {
    b.setAttribute('tabindex', '-1');
    b.focus();
    b.removeAttribute('tabindex');
  });
  const stops: Stop[] = [];
  for (let i = 0; i < total + 6 && stops.filter((s) => s.index !== null).length < total; i++) {
    await page.keyboard.press(nextKey(browserName));
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      if (el.tagName === 'NEXTJS-PORTAL') return null; // dev-tools only, see accessibility.spec.ts
      const cs = getComputedStyle(el);
      // The site's ring is an outline (globals.css `:focus-visible`); a
      // transparent or sub-2px outline doesn't count as visible.
      const outline =
        cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.outlineColor)
          ? `outline ${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`
          : '';
      return {
        index: el.hasAttribute('data-a11y-tab') ? Number(el.getAttribute('data-a11y-tab')) : null,
        name: `${el.tagName}:${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 50)}`,
        focusVisible: el.matches(':focus-visible'),
        ring: outline,
      };
    });
    if (stop) stops.push(stop);
  }
  return stops;
}

function expectInOrder(stops: Stop[], total: number) {
  const unexpected = stops.filter((s) => s.index === null).map((s) => s.name);
  expect(unexpected, 'focus landed on something not counted as tabbable').toEqual([]);
  expect(stops.map((s) => s.index)).toEqual(Array.from({ length: total }, (_, i) => i));
  const noRing = stops.filter((s) => !s.focusVisible || !s.ring).map((s) => s.name);
  expect(noRing, 'keyboard focus without a visible indicator').toEqual([]);
}

test.describe('/fit keyboard reach and focus indicator', () => {
  test('empty page: every control, in order, each with a visible ring', async ({ page, browserName }) => {
    await openFit(page);
    const total = await numberTabbables(page);
    expect(total).toBeGreaterThan(5);
    expectInOrder(await walk(page, browserName, total), total);
  });

  test('after a scan and chat replies: every link, chip and disclosure, in order, each with a visible ring', async ({
    page,
    browserName,
  }) => {
    // ~50 key presses, each followed by a page round trip: triple the budget
    // so a loaded machine running five projects at once doesn't time it out.
    test.slow();
    await openFit(page);
    await runScan(page);
    await ask(page, 'Has he used React?');
    await ask(page, 'Has he used Kubernetes?');
    await ask(page, 'How can I contact him?');
    const total = await numberTabbables(page);
    expect(total).toBeGreaterThan(20);
    expectInOrder(await walk(page, browserName, total), total);
  });
});

// --------------------------------------------------------------- live regions

/** Records every text each live region takes, keyed by its test id (or its index). */
async function watchLiveRegions(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __live: { region: string; text: string }[] };
    w.__live = [];
    const LIVE = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], [role="marquee"], [role="timer"]';
    const name = (el: Element, i: number) => el.getAttribute('data-testid') ?? `${el.tagName.toLowerCase()}#${i}`;
    const seen = new WeakSet<Element>();
    const attach = () =>
      document.querySelectorAll(LIVE).forEach((el, i) => {
        if (seen.has(el)) return;
        seen.add(el);
        if (el.closest('nextjs-portal')) return;
        // A region that mounts with text is announced by some screen readers too.
        if ((el.textContent ?? '').trim()) w.__live.push({ region: name(el, i), text: (el.textContent ?? '').trim() });
        new MutationObserver(() => {
          const text = (el.textContent ?? '').trim();
          if (text) w.__live.push({ region: name(el, i), text });
        }).observe(el, { childList: true, characterData: true, subtree: true });
      });
    attach();
    new MutationObserver(attach).observe(document.body, { childList: true, subtree: true });
  });
}

const liveLog = (page: Page) => page.evaluate(() => (window as unknown as { __live: { region: string; text: string }[] }).__live);

test.describe('/fit live regions', () => {
  test('each chat reply is announced once, by one polite region', async ({ page }) => {
    await openFit(page);
    await watchLiveRegions(page);

    for (const q of ['Has he used React?', 'Has he used Kubernetes?', 'How can I contact him?', FULLSTACK.jd]) {
      const before = (await liveLog(page)).length;
      await ask(page, q);
      await expect.poll(async () => (await liveLog(page)).length).toBeGreaterThan(before);
      await page.waitForTimeout(300); // anything else that would update, has
      const updates = (await liveLog(page)).slice(before);
      expect(updates.map((u) => u.region), `regions updated for "${q.slice(0, 30)}"`).toEqual(['ask-status']);
    }

    // The status region is polite, and the thread itself is not a live region
    // (otherwise the whole reply would be read on top of the summary).
    await expect(page.getByTestId('ask-status')).toHaveAttribute('aria-live', 'polite');
    expect(
      await page.getByTestId('ask-turn').first().evaluate((el) => !!el.closest('[aria-live]:not([aria-live="off"]), [role="log"], [role="status"]')),
    ).toBe(false);
  });

  // ask-panel.tsx clears the status region, then sets it on the next frame,
  // so the same reply twice is announced twice.
  test('asking the same question twice announces both replies', async ({ page }) => {
    await openFit(page);
    await watchLiveRegions(page);
    await ask(page, 'Has he used Kubernetes?');
    await ask(page, 'Has he used Kubernetes?');
    await expect.poll(async () => (await liveLog(page)).filter((u) => u.region === 'ask-status').length).toBe(2);
  });

  test('a scan moves focus to the report instead of announcing it', async ({ page }) => {
    await openFit(page);
    await watchLiveRegions(page);
    await runScan(page);
    await expect(page.locator('#fit-report-heading')).toBeFocused();
    await page.waitForTimeout(300);
    expect(await liveLog(page)).toEqual([]);
  });
});

// --------------------------------------------------------------- reduced motion

/** Records the `behavior` of every scrollIntoView / scrollTo / scrollBy call. Runs before page scripts. */
function spyOnScrolls() {
  const w = window as unknown as { __scrolls: string[] };
  w.__scrolls = [];
  const behaviorOf = (arg: unknown) =>
    arg && typeof arg === 'object' && 'behavior' in arg ? String((arg as { behavior?: string }).behavior ?? 'auto') : 'auto';
  const wrap = (proto: object, name: string) => {
    const target = proto as Record<string, (...args: unknown[]) => unknown>;
    const original = target[name];
    target[name] = function (this: unknown, ...args: unknown[]) {
      w.__scrolls.push(`${name}:${behaviorOf(args[0])}`);
      return original.apply(this, args);
    };
  };
  wrap(Element.prototype, 'scrollIntoView');
  wrap(Element.prototype, 'scrollTo');
  wrap(Element.prototype, 'scrollBy');
  wrap(window, 'scrollTo');
  wrap(window, 'scrollBy');
}

/** The longest transition or animation duration on anything inside `root`, in ms, plus the document's scroll-behavior. */
function motionUnder(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const ms = (v: string) => Math.max(...v.split(',').map((s) => (s.trim().endsWith('ms') ? parseFloat(s) : parseFloat(s) * 1000)));
    let transition = 0;
    let animation = 0;
    let smooth = 0;
    for (const root of document.querySelectorAll(sel))
      for (const el of [root, ...root.querySelectorAll('*')]) {
        const cs = getComputedStyle(el);
        transition = Math.max(transition, ms(cs.transitionDuration));
        if (cs.animationName !== 'none') animation = Math.max(animation, ms(cs.animationDuration));
        if (cs.scrollBehavior === 'smooth') smooth++;
      }
    return { transition, animation, smooth, html: getComputedStyle(document.documentElement).scrollBehavior };
  }, selector);
}

test.describe('/fit with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the chat and the report neither smooth-scroll nor transition', async ({ page }) => {
    await page.addInitScript(spyOnScrolls);
    await openFit(page);
    await runScan(page);
    await ask(page, 'Has he used React?');
    await ask(page, 'Has he used Kubernetes?');
    await ask(page, FULLSTACK.jd);

    const scrolls = await page.evaluate(() => (window as unknown as { __scrolls: string[] }).__scrolls);
    expect(scrolls.length, 'the chat scrolls each new turn into view').toBeGreaterThan(0);
    expect(scrolls.filter((s) => s.endsWith(':smooth'))).toEqual([]);

    const motion = await motionUnder(page, '[data-testid="ask-panel"], #fit-results');
    expect(motion.html).toBe('auto');
    expect(motion.smooth).toBe(0);
    expect(motion.transition).toBeLessThanOrEqual(0.01);
    expect(motion.animation).toBeLessThanOrEqual(0.01);
  });
});

test.describe('/fit without reduced motion (control)', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('the same page does smooth-scroll and transition, so the check above can fail', async ({ page }) => {
    await page.addInitScript(spyOnScrolls);
    await openFit(page);
    await ask(page, 'Has he used React?');
    const scrolls = await page.evaluate(() => (window as unknown as { __scrolls: string[] }).__scrolls);
    expect(scrolls).toContain('scrollIntoView:smooth');
    const motion = await motionUnder(page, '[data-testid="ask-panel"]');
    expect(motion.html).toBe('smooth');
    expect(motion.transition).toBeGreaterThan(1);
  });
});

// --------------------------------------------------------------- the accessibility tree

test.describe('/fit chat accessibility tree', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a review dump');

  test('evidence and gap replies read sensibly', async ({ page }) => {
    await openFit(page);
    const evidence = await ask(page, 'Has he used React?');
    await expandMore(evidence);
    const gap = await ask(page, 'Has he used Kubernetes?');

    const thread = page.getByRole('region', { name: 'Answers' });
    const tree = await thread.ariaSnapshot();
    await test.info().attach('chat-thread.aria.yml', { body: tree, contentType: 'text/yaml' });

    // Each turn is an article named "Question N"; its bubble reads the question once, as asked.
    await expect(thread.getByRole('article', { name: 'Question 1' })).toContainText('You asked: Has he used React?');
    await expect(thread.getByRole('article', { name: 'Question 2' })).toContainText('You asked: Has he used Kubernetes?');

    // External source links say they open a new tab; internal ones don't.
    for (const link of await thread.getByRole('link').all()) {
      const name = (await link.getAttribute('aria-label')) ?? (await link.innerText());
      const accessible = await link.evaluate((a) => a.getAttribute('aria-label') ?? a.textContent ?? '');
      if ((await link.getAttribute('target')) === '_blank') expect(accessible, name).toContain('(opens in a new tab)');
      else expect(accessible, name).not.toContain('(opens in a new tab)');
    }

    // Evidence cards are list items; each asked skill, found or not, is a heading.
    expect(await evidence.getByRole('listitem').count()).toBeGreaterThan(1);
    // (`ask` returns the LAST turn lazily, so the turns are found by name here.)
    await expect(thread.getByRole('article', { name: 'Question 1' }).getByRole('heading', { level: 3 })).toHaveText([/React$/]);
    await expect(thread.getByRole('article', { name: 'Question 2' }).getByRole('heading', { level: 3 })).toHaveText([/Kubernetes$/]);
    await expect(gap.getByTestId('no-evidence')).toHaveText('No evidence of Kubernetes in my work.');
    // No doubled words or stray spaces in a source link's name.
    for (const link of await thread.locator('a[data-evidence-id]').all()) {
      expect(await link.getAttribute('aria-label')).not.toMatch(/ :|Work card: Work:|GitHub: .* on GitHub/);
    }
  });

  // Each turn's <article> is named "Question N" (ask-results.tsx), and a
  // pasted JD's bubble reads as its role, so the posting never becomes a name.
  test('a pasted job description does not become the article name', async ({ page }) => {
    await openFit(page);
    await ask(page, FULLSTACK.jd);
    const name = await page.getByTestId('ask-turn').last().getByRole('article').evaluate((a) => {
      const id = a.getAttribute('aria-labelledby');
      return (id ? document.getElementById(id)?.textContent : a.getAttribute('aria-label')) ?? '';
    });
    expect(name.length).toBeLessThan(200);
  });
});
