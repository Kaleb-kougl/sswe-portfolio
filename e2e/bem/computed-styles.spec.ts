import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type CDPSession, type Page } from '@playwright/test';

import { freezeAnimations, isMobileProject, isolateNetwork, settle, skipIfNotFor, skipUnlessBemConfig, STATES } from './states';

/**
 * Computed-style baseline for every state in ./states.ts.
 *
 * WHAT IS RECORDED
 *   For every element in the document (html, body and all of body's element
 *   descendants, SVG included), `getComputedStyle` for EVERY standard property
 *   the browser enumerates (~350 longhands), plus ::before/::after (when they
 *   have content), ::marker (list items, <summary>), ::placeholder (fields with
 *   a placeholder) and ::backdrop (open modal <dialog>).
 *
 *   Then, per element, the style DELTA each of these states causes, for the
 *   element, its ancestors and its descendants (so `group-hover`-style effects
 *   and ::after underlines count):
 *     hover          CSS.forcePseudoState(:hover) on the element and all its
 *                    ancestors (a real pointer hovers the whole chain)
 *     active         likewise with :active
 *     focus-visible  :focus + :focus-visible on the element, :focus-within on
 *                    its ancestors (what keyboard focus does)
 *     disabled       the `disabled` attribute set and removed again, for
 *                    button/input/select/textarea/fieldset that are not already
 *                    disabled (already-disabled ones are in the base walk)
 *   Targets: every a, button, input, textarea, select, summary, label,
 *   [role=button], [tabindex], PLUS every element matched by a stylesheet
 *   rule for that pseudo-class (with the pseudo-class stripped), so a :hover
 *   rule on a non-interactive element is exercised too. Only non-empty deltas
 *   are stored, so the target set itself never produces a diff.
 *
 * KEYS are structural (`html:nth-of-type(1)>body:nth-of-type(1)>div:nth-of-type(2)…`),
 * never class names, because the refactor renames every class. A refactor
 * that changes DOM structure will show up as elements added/removed.
 *
 * STORAGE: e2e/bem/__baseline__/computed/<project>/<state>.json. Element
 * styles are stored as a diff against the browser's default style for that
 * tag (recorded in the same file), pseudo-elements as a diff against their
 * element. Both are lossless: the comparison reconstructs full values.
 *
 * EXCLUSIONS (and why)
 *   - Custom properties (`--*`): Tailwind's `--tw-*` plumbing is exactly what
 *     the refactor is allowed to change; every visible effect of them lands in
 *     a standard property, which is compared.
 *   - <canvas> elements, and the descendants of an aria-hidden element that
 *     hosts a canvas (the homepage's 3D backdrop): react-three-fiber writes
 *     their inline sizes from a ResizeObserver and the frame watchdog can swap
 *     the canvas for a static fallback depending on frame timing. The host
 *     element itself is still compared.
 *   - script/style/link/meta/noscript/template/title/head: not rendered.
 *   - Shadow roots (next-route-announcer's): Next internals, not our CSS.
 *
 * MOTION: this spec runs with reducedMotion 'no-preference' (unlike the
 * screenshots) so transition-duration/animation-* are the authored values, not
 * the `0.01ms !important` of the reduced-motion block in globals.css. Every
 * transition is finished and infinite animations cancelled before reading.
 *
 * `BEM_UPDATE=1` writes the baseline; otherwise this compares and fails with
 * a list of (project, state, path, property, before, after).
 */

test.use({ contextOptions: { reducedMotion: 'no-preference' } });

const UPDATE = process.env.BEM_UPDATE === '1';
const BASELINE_DIR = path.join(__dirname, '__baseline__', 'computed');

type Props = Record<string, string>;
type Kind = 'hover' | 'active' | 'focus-visible' | 'disabled';

interface Capture {
  url: string;
  defaults: Record<string, Props>;
  tags: Record<string, string>;
  elements: Record<string, Props>;
  pseudos: Record<string, Props>;
  interactions: Record<Kind, Record<string, Record<string, Props>>>;
}

// ---------------------------------------------------------------- in-page library

/** Installed with page.evaluate; everything it needs is defined inside. */
function installLib() {
  const SKIP = new Set(['script', 'style', 'link', 'meta', 'noscript', 'template', 'title', 'head', 'base']);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const read = (cs: CSSStyleDeclaration): Record<string, string> => {
    const o: Record<string, string> = {};
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i];
      if (p.startsWith('--')) continue;
      o[p] = cs.getPropertyValue(p);
    }
    return o;
  };
  const tagKey = (el: Element) => `${el.namespaceURI === SVG_NS ? 'svg' : 'html'}:${el.localName}`;
  const segment = (el: Element) => {
    let n = 1;
    for (let s = el.previousElementSibling; s; s = s.previousElementSibling) if (s.localName === el.localName) n++;
    return `${el.localName}:nth-of-type(${n})`;
  };
  const hostsCanvas = (el: Element) => el.getAttribute('aria-hidden') === 'true' && !!el.querySelector('canvas');

  const pseudos = (el: Element, cs: CSSStyleDeclaration) => {
    const out: Record<string, Record<string, string>> = {};
    for (const p of ['::before', '::after']) {
      const pcs = getComputedStyle(el, p);
      const c = pcs.getPropertyValue('content');
      if (c !== 'none' && c !== 'normal') out[p] = read(pcs);
    }
    if (cs.display.includes('list-item')) out['::marker'] = read(getComputedStyle(el, '::marker'));
    if ((el.localName === 'input' || el.localName === 'textarea') && el.hasAttribute('placeholder'))
      out['::placeholder'] = read(getComputedStyle(el, '::placeholder'));
    if (el.localName === 'dialog' && el.matches(':modal')) out['::backdrop'] = read(getComputedStyle(el, '::backdrop'));
    return out;
  };

  const els: Element[] = [];
  const paths: string[] = [];
  const index = new Map<Element, number>();
  const visit = (el: Element, prefix: string) => {
    const p = prefix ? `${prefix}>${segment(el)}` : segment(el);
    if (SKIP.has(el.localName) || el.localName === 'canvas') return;
    index.set(el, els.length);
    els.push(el);
    paths.push(p);
    if (hostsCanvas(el)) return;
    for (const c of Array.from(el.children)) visit(c, p);
  };
  visit(document.documentElement, '');

  const flush = () => {
    void document.body.offsetHeight;
    for (const el of els) void getComputedStyle(el).color;
    for (const a of document.getAnimations()) {
      const t = a.effect?.getComputedTiming();
      if (t && t.endTime === Infinity) a.cancel();
      else a.finish();
    }
  };

  /** Full styles (element + pseudos) of the given element indices. */
  const readMany = (ids: number[]) => {
    const out: Record<string, Record<string, string>> = {};
    for (const i of ids) {
      const cs = getComputedStyle(els[i]);
      out[paths[i]] = read(cs);
      for (const [p, v] of Object.entries(pseudos(els[i], cs))) out[paths[i] + p] = v;
      // A pseudo that has content only in the forced state must still diff
      // against something: record before/after as `content: none` placeholders.
      for (const p of ['::before', '::after']) if (!out[paths[i] + p]) out[paths[i] + p] = { content: 'none' };
    }
    return out;
  };
  const diff = (a: Record<string, string>, b: Record<string, string>) => {
    const d: Record<string, string> = {};
    for (const k of Object.keys(b)) if (a[k] !== b[k]) d[k] = b[k];
    for (const k of Object.keys(a)) if (!(k in b)) d[k] = '<absent>';
    return d;
  };

  /** Element + its ancestors + its descendants, as indices into `els`. */
  const scope = (t: number) => {
    const ids = new Set<number>([t]);
    for (let a = els[t].parentElement; a; a = a.parentElement) {
      const i = index.get(a);
      if (i !== undefined) ids.add(i);
    }
    for (const d of Array.from(els[t].querySelectorAll('*'))) {
      const i = index.get(d);
      if (i !== undefined) ids.add(i);
    }
    return [...ids];
  };

  let pending: { t: number; base: Record<string, Record<string, string>> } | null = null;

  const STRIP: Record<string, RegExp> = {
    hover: /:hover/g,
    active: /:active/g,
    'focus-visible': /:focus-visible|:focus-within|:focus(?![\w-])/g,
    disabled: /:disabled|:enabled/g,
  };
  const PSEUDO_ELEMENT = /::?(before|after|placeholder|marker|backdrop|selection|file-selector-button|-webkit-[\w-]+|-moz-[\w-]+)(\([^)]*\))?/g;
  const ruleTargets = (kind: string) => {
    const found = new Set<number>();
    const visitRules = (rules: CSSRuleList) => {
      for (const r of Array.from(rules)) {
        const sel = (r as CSSStyleRule).selectorText;
        if (sel && STRIP[kind].test(sel) && !sel.includes('&')) {
          STRIP[kind].lastIndex = 0;
          const stripped = sel.replace(STRIP[kind], '').replace(PSEUDO_ELEMENT, '');
          try {
            for (const el of Array.from(document.querySelectorAll(stripped))) {
              const i = index.get(el);
              if (i !== undefined) found.add(i);
            }
          } catch {
            /* a selector that is not queryable once stripped */
          }
        }
        STRIP[kind].lastIndex = 0;
        const inner = (r as CSSGroupingRule).cssRules;
        if (inner) visitRules(inner);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        visitRules(sheet.cssRules);
      } catch {
        /* cross-origin sheet */
      }
    }
    return found;
  };

  const INTERACTIVE = 'a, button, input, textarea, select, summary, label, [role="button"], [tabindex]';
  const DISABLEABLE = new Set(['button', 'input', 'select', 'textarea', 'fieldset']);

  // `lib()` is also defined in the page, so the page.evaluate callbacks below
  // (serialised and run there) can call it.
  (window as unknown as { lib: () => unknown }).lib = () => (window as unknown as { __bem: unknown }).__bem;
  (window as unknown as { __bem: unknown }).__bem = {
    count: els.length,
    tagKeys: () => [...new Set(els.map(tagKey))],
    snapshot(defaults: Record<string, Record<string, string>>) {
      flush();
      const tags: Record<string, string> = {};
      const elements: Record<string, Record<string, string>> = {};
      const ps: Record<string, Record<string, string>> = {};
      els.forEach((el, i) => {
        const cs = getComputedStyle(el);
        const full = read(cs);
        const def = defaults[tagKey(el)] ?? {};
        const d: Record<string, string> = {};
        for (const [k, v] of Object.entries(full)) if (def[k] !== v) d[k] = v;
        tags[paths[i]] = tagKey(el);
        elements[paths[i]] = d;
        for (const [p, pv] of Object.entries(pseudos(el, cs))) {
          const pd: Record<string, string> = {};
          for (const [k, v] of Object.entries(pv)) if (full[k] !== v) pd[k] = v;
          ps[paths[i] + p] = pd;
        }
      });
      return { tags, elements, pseudos: ps };
    },
    targets() {
      const interactive = new Set<number>();
      for (const el of Array.from(document.querySelectorAll(INTERACTIVE))) {
        const i = index.get(el);
        if (i !== undefined) interactive.add(i);
      }
      const out: Record<string, number[]> = {};
      for (const kind of ['hover', 'active', 'focus-visible']) {
        out[kind] = [...new Set([...interactive, ...ruleTargets(kind)])].sort((a, b) => a - b);
      }
      out.disabled = [...new Set([...interactive, ...ruleTargets('disabled')])]
        .filter((i) => DISABLEABLE.has(els[i].localName) && !(els[i] as HTMLButtonElement).disabled && els[i] !== document.activeElement)
        .sort((a, b) => a - b);
      return out;
    },
    /** Every element in document order, for mapping to CDP node ids; -1 for ones outside the walk. */
    allIndex: () => Array.from(document.querySelectorAll('*')).map((el) => index.get(el) ?? -1),
    path: (i: number) => paths[i],
    chain(t: number) {
      const out: number[] = [];
      for (let a: Element | null = els[t]; a; a = a.parentElement) {
        const i = index.get(a);
        if (i !== undefined) out.push(i);
      }
      return out;
    },
    begin(t: number) {
      flush();
      pending = { t, base: readMany(scope(t)) };
    },
    end() {
      flush();
      const { t, base } = pending!;
      pending = null;
      const now = readMany(scope(t));
      const out: Record<string, Record<string, string>> = {};
      for (const [k, v] of Object.entries(now)) {
        const d = diff(base[k] ?? {}, v);
        if (Object.keys(d).length) out[k] = d;
      }
      return out;
    },
    flush,
    disabled(t: number) {
      const el = els[t];
      (window as unknown as { __bem: { begin(t: number): void } }).__bem.begin(t);
      el.setAttribute('disabled', '');
      const out = (window as unknown as { __bem: { end(): unknown } }).__bem.end();
      el.removeAttribute('disabled');
      flush();
      return out;
    },
  };
}

interface Lib {
  count: number;
  tagKeys(): string[];
  snapshot(defaults: Record<string, Props>): Pick<Capture, 'tags' | 'elements' | 'pseudos'>;
  targets(): Record<Kind, number[]>;
  allIndex(): number[];
  path(i: number): string;
  chain(t: number): number[];
  begin(t: number): void;
  end(): Record<string, Props>;
  flush(): void;
  disabled(t: number): Record<string, Props>;
}
/** Only ever called inside page.evaluate callbacks, where it is the page's own global. */
const lib = () => (window as unknown as { __bem: Lib }).__bem;

/** The browser's default style per tag, read from a blank page in the same context. */
async function defaultStyles(page: Page, tagKeys: string[]) {
  const blank = await page.context().newPage();
  try {
    await blank.goto('about:blank');
    return await blank.evaluate((keys) => {
      const SVG_NS = 'http://www.w3.org/2000/svg';
      const out: Record<string, Record<string, string>> = {};
      const svgRoot = document.createElementNS(SVG_NS, 'svg');
      document.body.append(svgRoot);
      for (const key of keys) {
        const [ns, name] = key.split(':');
        const el = ns === 'svg' ? document.createElementNS(SVG_NS, name) : document.createElement(name);
        (ns === 'svg' && name !== 'svg' ? svgRoot : document.body).append(el);
        const cs = getComputedStyle(el);
        const o: Record<string, string> = {};
        for (let i = 0; i < cs.length; i++) if (!cs[i].startsWith('--')) o[cs[i]] = cs.getPropertyValue(cs[i]);
        out[key] = o;
        el.remove();
      }
      return out;
    }, tagKeys);
  } finally {
    await blank.close();
  }
}

const FORCED: Record<Exclude<Kind, 'disabled'>, { self: string[]; ancestors: string[] }> = {
  hover: { self: ['hover'], ancestors: ['hover'] },
  active: { self: ['active'], ancestors: ['active'] },
  'focus-visible': { self: ['focus', 'focus-visible'], ancestors: ['focus-within'] },
};

async function capture(page: Page): Promise<Capture> {
  await page.evaluate(installLib);
  const tagKeys = await page.evaluate(() => lib().tagKeys());
  const defaults = await defaultStyles(page, tagKeys);
  const base = await page.evaluate((d) => lib().snapshot(d), defaults);

  // Map walk indices to CDP node ids (same document order as querySelectorAll('*')).
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '*' });
  const allIndex = await page.evaluate(() => lib().allIndex());
  expect(nodeIds.length, 'CDP and the page disagree about the DOM (did it change mid-capture?)').toBe(allIndex.length);
  const nodeOf = new Map<number, number>();
  allIndex.forEach((walk, i) => walk >= 0 && nodeOf.set(walk, nodeIds[i]));

  const targets = await page.evaluate(() => lib().targets());
  const interactions = { hover: {}, active: {}, 'focus-visible': {}, disabled: {} } as Capture['interactions'];
  const force = (ids: number[], classes: (i: number) => string[]) =>
    Promise.all(ids.map((i) => cdp.send('CSS.forcePseudoState', { nodeId: nodeOf.get(i)!, forcedPseudoClasses: classes(i) })));

  for (const kind of ['hover', 'active', 'focus-visible'] as const) {
    for (const t of targets[kind]) {
      const chain = await page.evaluate((i) => lib().chain(i), t);
      await page.evaluate((i) => lib().begin(i), t);
      await force(chain, (i) => (i === t ? FORCED[kind].self : FORCED[kind].ancestors));
      const delta = await page.evaluate(() => lib().end());
      await force(chain, () => []);
      await page.evaluate(() => lib().flush());
      if (Object.keys(delta).length) interactions[kind][await page.evaluate((i) => lib().path(i), t)] = delta;
    }
  }
  for (const t of targets.disabled) {
    const delta = await page.evaluate((i) => lib().disabled(i), t);
    if (Object.keys(delta).length) interactions.disabled[await page.evaluate((i) => lib().path(i), t)] = delta;
  }
  await cdp.detach();

  return { url: new URL(page.url()).pathname, defaults, ...base, interactions };
}

// ---------------------------------------------------------------- comparison

interface Diff {
  state: string;
  path: string;
  property: string;
  before: string;
  after: string;
}

const ABSENT = '<not present>';

function resolveElement(c: Capture, p: string): Props | null {
  if (!(p in c.elements)) return null;
  return { ...(c.defaults[c.tags[p]] ?? {}), ...c.elements[p] };
}

function resolvePseudo(c: Capture, key: string): Props | null {
  if (!(key in c.pseudos)) return null;
  const owner = key.slice(0, key.search(/::[a-z-]+$/));
  return { ...(resolveElement(c, owner) ?? {}), ...c.pseudos[key] };
}

function compareMaps(state: string, before: Record<string, Props | null>, after: Record<string, Props | null>, out: Diff[]) {
  for (const p of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const a = before[p];
    const b = after[p];
    if (!a || !b) {
      out.push({ state, path: p, property: '(element)', before: a ? 'present' : ABSENT, after: b ? 'present' : ABSENT });
      continue;
    }
    for (const prop of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      if (a[prop] !== b[prop]) out.push({ state, path: p, property: prop, before: a[prop] ?? ABSENT, after: b[prop] ?? ABSENT });
    }
  }
}

function compare(state: string, before: Capture, after: Capture): Diff[] {
  const out: Diff[] = [];
  const all = (c: Capture, resolve: (c: Capture, k: string) => Props | null, keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, resolve(c, k)]));
  compareMaps(state, all(before, resolveElement, Object.keys(before.elements)), all(after, resolveElement, Object.keys(after.elements)), out);
  compareMaps(state, all(before, resolvePseudo, Object.keys(before.pseudos)), all(after, resolvePseudo, Object.keys(after.pseudos)), out);

  // Interactions: compare the forced value of each property either side
  // changes; where one side left it alone, its value is that side's base.
  const baseValue = (c: Capture, key: string, prop: string) => {
    const r = /::[a-z-]+$/.test(key) ? resolvePseudo(c, key) : resolveElement(c, key);
    return r?.[prop] ?? '<same as base>';
  };
  for (const kind of ['hover', 'active', 'focus-visible', 'disabled'] as Kind[]) {
    const bk = before.interactions[kind];
    const ak = after.interactions[kind];
    for (const target of [...new Set([...Object.keys(bk), ...Object.keys(ak)])].sort()) {
      const bt = bk[target] ?? {};
      const at = ak[target] ?? {};
      for (const key of [...new Set([...Object.keys(bt), ...Object.keys(at)])].sort()) {
        const bp = bt[key] ?? {};
        const ap = at[key] ?? {};
        for (const prop of [...new Set([...Object.keys(bp), ...Object.keys(ap)])].sort()) {
          const bv = bp[prop] ?? baseValue(before, key, prop);
          const av = ap[prop] ?? baseValue(after, key, prop);
          if (bv !== av) out.push({ state: `${state} [${kind} ${target}]`, path: key, property: prop, before: bv, after: av });
        }
      }
    }
  }
  return out;
}

/** Stable key order, so a re-recorded baseline diffs cleanly in git. */
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]));
  return v;
}

// ---------------------------------------------------------------- tests

for (const state of STATES) {
  test(`computed styles: ${state.name}`, async ({ page, context, baseURL }, testInfo) => {
    skipUnlessBemConfig(testInfo);
    skipIfNotFor(state, testInfo);
    test.setTimeout(300_000);
    await isolateNetwork(context, baseURL!);

    await state.run(page, { mobile: isMobileProject(testInfo) });
    await settle(page);
    await freezeAnimations(page);
    // Stop the WebGL render loops (backdrop, projectile demo) before walking:
    // with motion on they redraw every frame in software GL, which starves the
    // main thread (the demo-dialog capture took minutes). Only canvases draw
    // from rAF here, and canvases are excluded from the capture anyway.
    await page.evaluate(() => {
      window.requestAnimationFrame = () => 0;
    });

    const now = await capture(page);
    const file = path.join(BASELINE_DIR, testInfo.project.name, `${state.name}.json`);

    if (UPDATE) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(sortDeep(now), null, 1) + '\n');
      testInfo.annotations.push({ type: 'baseline', description: `wrote ${path.relative(process.cwd(), file)}` });
      return;
    }

    expect(fs.existsSync(file), `no baseline at ${file}; record one with BEM_UPDATE=1`).toBe(true);
    const before = JSON.parse(fs.readFileSync(file, 'utf8')) as Capture;
    const diffs = compare(state.name, before, now);
    if (diffs.length) {
      await testInfo.attach('computed-style-diffs.json', { body: JSON.stringify(diffs, null, 2), contentType: 'application/json' });
      const LIMIT = 200;
      const lines = diffs
        .slice(0, LIMIT)
        .map((d) => `  [${testInfo.project.name}] ${d.state} | ${d.path} | ${d.property}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}`);
      if (diffs.length > LIMIT) lines.push(`  … and ${diffs.length - LIMIT} more (see the computed-style-diffs.json attachment)`);
      expect.soft(diffs.length, `computed styles changed for ${state.name}:\n${lines.join('\n')}`).toBe(0);
    }
  });
}
