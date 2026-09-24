#!/usr/bin/env node
/**
 * Guards the BEM + Tailwind styling contract (see src/styles/blocks/index.css).
 *
 * WHY THIS EXISTS: a class that generates no CSS fails silently. The retired
 * neo-brutalist palette left `border-border`, `bg-bg-panel`, `text-text-primary`
 * and friends in the error pages long after their tokens were deleted — the
 * build passed, the pages just quietly lost their borders. Tailwind cannot
 * catch this (an unknown candidate is simply not emitted) and neither can
 * TypeScript, so this script asks Tailwind's own design system which class
 * names mean something.
 *
 * CHECKS
 *   1. Unknown classes. Every class used in src/ must either generate CSS in
 *      Tailwind (theme tokens included) or be defined as a selector in a
 *      stylesheet under src/. Catches retired tokens, typos, and BEM classes
 *      whose rule was renamed away. A BEM base class with no rule of its own
 *      is fine when one of its modifiers is defined (`x__mark x__mark--pass`).
 *   2. Unused blocks. Every class defined in src/styles/blocks/ must be used
 *      somewhere in src/. A rename that misses the stylesheet leaves dead CSS.
 *   3. Imports. Every src/styles/blocks/*.css file is imported by index.css
 *      (an unimported block compiles to nothing, silently), and every import
 *      there exists.
 *   4. BEM naming. Class selectors in src/styles/blocks/ are
 *      `block`, `block__element`, `block--modifier`, `block__element--modifier`
 *      (lower-case, hyphenated words) or an `is-*` state class.
 *   5. Tokens only. No raw hex colours in src/styles/blocks/ outside comments,
 *      except the entries in RAW_HEX_ALLOWED — each one a decision, not an
 *      oversight.
 *
 * WHAT COUNTS AS "USED IN src/". Only UI code is read (src/app, src/components);
 * src/lib and src/data hold prose and word lists. Class names live in `className="…"`, in
 * `className={…}` expressions, and in string constants those expressions
 * reference (`const BUTTON = '…'`, `{ modifier: 'badge--gap' }`). Rather than
 * follow references, every string literal in src/**\/*.{ts,tsx} is read, and a
 * string is treated as a class list when:
 *   - it is the literal value of `className="…"`; or
 *   - every word in it is class-shaped AND at least one word is a known class
 *     (so "noopener noreferrer" or "polite" are left alone); or
 *   - a word is BEM-shaped (`__` / `--`), which nothing else in this codebase is.
 * Template literals contribute their static parts; a word glued to `${…}` is a
 * fragment (`fit-report__title--h${level}`) and is skipped for check 1 and
 * matched by prefix for check 2.
 *
 * Usage: npm run css:check      (exit 1 on any finding)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
// Ships with @tailwindcss/postcss (same version); this is the design-system
// loader editor tooling uses to resolve a class name to its CSS.
import { __unstable__loadDesignSystem } from '@tailwindcss/node';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const GLOBALS = join(SRC, 'app', 'globals.css');
const BLOCKS = join(SRC, 'styles', 'blocks');
const BLOCKS_INDEX = join(BLOCKS, 'index.css');

/** Raw hex allowed in a block file, by file name. Keep each one justified there. */
const RAW_HEX_ALLOWED = {
  // Paper-toned text on the ink panel; deliberately not a theme token.
  'pipeline-checks.css': ['#EDE8DA'],
};

/** Classes defined for markup we don't write (third-party injected). */
const EXTERNAL_CLASSES = new Set(['grecaptcha-badge']);

const BEM = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const BEM_SHAPED = /^[a-z][a-z0-9-]*(?:__|--)[a-z0-9-]+$/;
const STATE = /^is-[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Loose on purpose: variants, arbitrary values and opacity suffixes all pass.
const CLASS_SHAPED = /^!?-?[a-z0-9@[][^\s"'`]*$/;

// --- files -----------------------------------------------------------------

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, exts, out);
    else if (exts.some((ext) => name.endsWith(ext))) out.push(path);
  }
  return out;
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const rel = (path) => relative(ROOT, path);

// --- CSS: defined classes --------------------------------------------------

/** Class names that appear in selectors (not inside @apply / declarations). */
function selectorClasses(css) {
  const found = [];
  const clean = stripComments(css);
  // Selector text is whatever precedes a `{`, back to the previous `;`, `{` or `}`.
  const re = /(^|[;{}])([^;{}]*)\{/g;
  let m;
  while ((m = re.exec(clean))) {
    const selector = m[2];
    if (selector.trim().startsWith('@')) continue;
    for (const c of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      found.push({ name: c[1], index: m.index + m[1].length + c.index });
    }
  }
  return found;
}

const cssFiles = walk(SRC, ['.css']);
const defined = new Set(EXTERNAL_CLASSES);
const blockDefs = []; // { name, file, line }
for (const file of cssFiles) {
  const css = readFileSync(file, 'utf8');
  for (const { name, index } of selectorClasses(css)) {
    defined.add(name);
    if (file.startsWith(BLOCKS) && file !== BLOCKS_INDEX) {
      blockDefs.push({ name, file, line: lineOf(css, index) });
    }
  }
}

// --- TS/TSX: used classes --------------------------------------------------

/** Every string literal's static text, with template holes marked. */
function stringLiterals(code) {
  const out = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === '/' && next === '/') { i = code.indexOf('\n', i); if (i < 0) break; continue; }
    if (ch === '/' && next === '*') { i = code.indexOf('*/', i + 2); if (i < 0) break; i += 2; continue; }
    if (ch === '"' || ch === "'") {
      let j = i + 1; let s = '';
      while (j < code.length && code[j] !== ch && code[j] !== '\n') { if (code[j] === '\\') j++; s += code[j]; j++; }
      const before = code.slice(Math.max(0, i - 11), i);
      out.push({ parts: [s], index: i, jsxClassName: /className=$/.test(before) });
      i = j + 1; continue;
    }
    if (ch === '`') {
      let j = i + 1; const parts = ['']; let depth = 0; let holeStart = 0;
      while (j < code.length) {
        const c = code[j];
        if (depth === 0 && c === '`') break;
        if (depth === 0 && c === '\\') { parts[parts.length - 1] += code[j + 1]; j += 2; continue; }
        if (depth === 0 && c === '$' && code[j + 1] === '{') { depth = 1; holeStart = j + 2; parts.push('\u0000'); parts.push(''); j += 2; continue; }
        if (depth > 0) {
          if (c === '{') depth++;
          else if (c === '}' && --depth === 0) {
            // Strings inside the hole (`${open ? ' x--open' : ''}`) are literals too.
            for (const inner of stringLiterals(code.slice(holeStart, j))) out.push({ ...inner, index: holeStart + inner.index });
          }
          j++; continue;
        }
        parts[parts.length - 1] += c; j++;
      }
      out.push({ parts, index: i, jsxClassName: false });
      i = j + 1; continue;
    }
    i++;
  }
  return out;
}

/** Split a literal into whole words and fragments glued to a `${…}` hole. */
function words(parts) {
  const whole = []; const fragments = [];
  parts.forEach((part, k) => {
    if (part === '\u0000') return;
    const tokens = part.split(/\s+/);
    tokens.forEach((token, t) => {
      if (!token) return;
      const gluedLeft = t === 0 && parts[k - 1] === '\u0000' && !/^\s/.test(part);
      const gluedRight = t === tokens.length - 1 && parts[k + 1] === '\u0000' && !/\s$/.test(part);
      (gluedLeft || gluedRight ? fragments : whole).push(token);
    });
  });
  return { whole, fragments };
}

// UI code only: src/lib and src/data hold prose and word lists, not markup.
const UI_DIRS = [join(SRC, 'app'), join(SRC, 'components')];
const codeFiles = UI_DIRS.flatMap((dir) => walk(dir, ['.ts', '.tsx'])).filter((f) => !f.endsWith('.d.ts'));
const sources = codeFiles.map((file) => ({ file, code: readFileSync(file, 'utf8') }));

// Rules in inline <style> strings (global-error.tsx renders without globals.css).
for (const { code } of sources) {
  for (const literal of stringLiterals(code)) {
    const text = literal.parts.join(' ');
    if (text.includes('{') && text.includes('}')) selectorClasses(text).forEach(({ name }) => defined.add(name));
  }
}

const designSystem = await __unstable__loadDesignSystem(readFileSync(GLOBALS, 'utf8'), { base: join(SRC, 'app') });
const tailwindCache = new Map();
function isTailwind(token) {
  if (!tailwindCache.has(token)) tailwindCache.set(token, designSystem.candidatesToCss([token])[0] !== null);
  return tailwindCache.get(token);
}
const definedModifierBases = new Set([...defined].filter((n) => n.includes('--')).map((n) => n.slice(0, n.lastIndexOf('--'))));
const isKnown = (token) => defined.has(token) || definedModifierBases.has(token) || isTailwind(token);

const findings = [];
const usedWords = new Set();
const usedFragments = new Set();

for (const { file, code } of sources) {
  for (const literal of stringLiterals(code)) {
    const { whole, fragments } = words(literal.parts);
    whole.forEach((w) => usedWords.add(w));
    fragments.forEach((f) => usedFragments.add(f));
    if (whole.length === 0) continue;

    const isClassList =
      literal.jsxClassName ||
      whole.some((w) => BEM_SHAPED.test(w)) ||
      (whole.every((w) => CLASS_SHAPED.test(w)) && whole.some(isKnown));
    if (!isClassList) continue;

    for (const w of whole) {
      if (!isKnown(w)) {
        findings.push(`${rel(file)}:${lineOf(code, literal.index)}  unknown class "${w}" (no Tailwind utility or token, and no CSS rule defines it)`);
      }
    }
  }
}

// --- check 2: unused block classes ------------------------------------------

for (const { name, file, line } of blockDefs) {
  if (usedWords.has(name)) continue;
  // A modifier built from a template, e.g. `fit-report__title--h${level}`.
  if ([...usedFragments].some((f) => f.length > 2 && name.startsWith(f))) continue;
  findings.push(`${rel(file)}:${line}  ".${name}" is defined but never used in src/`);
}

// --- check 3: imports -------------------------------------------------------

const indexCss = stripComments(readFileSync(BLOCKS_INDEX, 'utf8'));
const imported = new Set([...indexCss.matchAll(/@import\s+["']\.\/([^"']+)["']/g)].map((m) => m[1]));
const blockFiles = readdirSync(BLOCKS).filter((n) => n.endsWith('.css') && n !== 'index.css');
for (const name of blockFiles) {
  if (!imported.has(name)) findings.push(`${rel(join(BLOCKS, name))}  not imported by src/styles/blocks/index.css, so none of it ships`);
}
for (const name of imported) {
  if (!blockFiles.includes(name)) findings.push(`${rel(BLOCKS_INDEX)}  imports "./${name}", which does not exist`);
}

// --- checks 4 & 5: naming and raw hex in blocks ------------------------------

for (const { name, file, line } of blockDefs) {
  if (!BEM.test(name) && !STATE.test(name)) {
    findings.push(`${rel(file)}:${line}  ".${name}" is not BEM (block__element--modifier) or an is-* state`);
  }
}
for (const name of blockFiles) {
  const file = join(BLOCKS, name);
  const css = stripComments(readFileSync(file, 'utf8'));
  const allowed = (RAW_HEX_ALLOWED[name] ?? []).map((h) => h.toLowerCase());
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    if (!allowed.includes(m[0].toLowerCase())) {
      findings.push(`${rel(file)}:${lineOf(css, m.index)}  raw hex ${m[0]}; use a theme token (e.g. var(--color-ink))`);
    }
  }
}

// --- report -----------------------------------------------------------------

if (findings.length > 0) {
  console.error(`css:check found ${findings.length} problem${findings.length === 1 ? '' : 's'}:\n`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`css:check ok — ${sources.length} source files, ${blockFiles.length} block files, ${blockDefs.length} block selectors.`);
