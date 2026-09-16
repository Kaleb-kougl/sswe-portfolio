#!/usr/bin/env node
/**
 * Re-derives the roblox-css coverage figure the portfolio publishes.
 *
 * The portfolio's Work card states an assertion count for @k9kbdev/roblox-css.
 * That package lives in its own repo, so the claim is only checkable when a
 * clone is present alongside this one (see .gitignore: "standalone packages").
 *
 * WHY THIS EXISTS: the number previously on the site — "1,419 assertions across
 * 24 spec files" — came from the package's own README and CHANGELOG and did not
 * match its source. This script makes the published figure re-derivable instead
 * of trusted.
 *
 * DEDUPLICATION IS THE POINT. At v0.1.1 eight spec files are byte-identical
 * duplicates between src/tests/ and src/tests/<subdir>/. Both copies compile and
 * both run, so a naive count reports ~1,926 assertions across 17 files while only
 * 1,298 across 9 are distinct. We publish the distinct figure, so this script
 * dedupes by file content hash rather than by path.
 *
 * Exit codes: 0 pass or skipped (no clone), 1 mismatch.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PKG = join(ROOT, 'roblox-css');
const CLAIM_FILE = join(ROOT, 'src/data/workProjects.ts');
const REPO = 'https://github.com/Kaleb-kougl/roblox-css.git';

if (!existsSync(PKG)) {
  console.log('roblox-css coverage -- SKIPPED');
  console.log(`  No clone at ./roblox-css, so the claim cannot be re-derived here.`);
  console.log(`  This is expected in CI: the package has its own repo and is gitignored.`);
  console.log(`  To check locally:  git clone ${REPO} roblox-css`);
  process.exit(0);
}

/** Spec sources only: skip compiled Luau output, vendored runtime, deps. */
const SKIP = new Set(['out', 'include', 'node_modules', '.git', 'plugin', 'docs']);
function specFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) specFiles(full, found);
    else if (entry.endsWith('.spec.ts')) found.push(full);
  }
  return found;
}

const files = specFiles(PKG).sort();
if (files.length === 0) {
  console.error('roblox-css coverage -- FAIL: found no *.spec.ts sources; has the layout changed?');
  process.exit(1);
}

// Dedupe by content, keeping the shortest path as the canonical copy.
const byHash = new Map();
for (const file of files) {
  const body = readFileSync(file, 'utf8');
  const hash = createHash('sha256').update(body).digest('hex');
  const prev = byHash.get(hash);
  if (!prev || file.length < prev.file.length) byHash.set(hash, { file, body });
}

const countAssertions = (body) => (body.match(/\bexpect\(/g) ?? []).length;
const unique = [...byHash.values()];
const uniqueAssertions = unique.reduce((n, u) => n + countAssertions(u.body), 0);
const rawAssertions = files.reduce((n, f) => n + countAssertions(readFileSync(f, 'utf8')), 0);
const duplicates = files.length - unique.length;

const claimSrc = readFileSync(CLAIM_FILE, 'utf8');
const claimed = {
  assertions: Number(/assertions:\s*(\d+)/.exec(claimSrc)?.[1]),
  specFiles: Number(/specFiles:\s*(\d+)/.exec(claimSrc)?.[1]),
};

const version = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version;

console.log(`roblox-css coverage -- ./roblox-css @ v${version}`);
console.log(`  spec sources     ${files.length} on disk, ${unique.length} distinct (${duplicates} duplicate${duplicates === 1 ? '' : 's'})`);
console.log(`  assertions       ${rawAssertions} counted, ${uniqueAssertions} distinct`);
console.log(`  portfolio claims ${claimed.assertions} across ${claimed.specFiles} spec files`);
if (duplicates > 0) {
  console.log('');
  console.log('  note: duplicate spec sources are byte-identical copies that both');
  console.log('        compile and run, so a raw count double-counts them:');
  for (const f of files) {
    const body = readFileSync(f, 'utf8');
    const hash = createHash('sha256').update(body).digest('hex');
    if (byHash.get(hash).file !== f) console.log(`          ${relative(PKG, f)}`);
  }
}
console.log('');

const ok =
  claimed.assertions === uniqueAssertions && claimed.specFiles === unique.length;
if (!ok) {
  console.error('FAIL: the published figure no longer matches the source.');
  console.error(`  measured ${uniqueAssertions} across ${unique.length}; ${CLAIM_FILE.replace(ROOT, '')} claims ${claimed.assertions} across ${claimed.specFiles}.`);
  console.error('  Update ROBLOX_CSS_COVERAGE in that file, or find out why the count moved.');
  process.exit(1);
}

console.log('roblox-css coverage OK');
