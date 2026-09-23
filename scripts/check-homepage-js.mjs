#!/usr/bin/env node
/**
 * JavaScript budget check for the homepage `/`.
 *
 * Reads the prerendered HTML that `next build` writes for `/`, collects every
 * `<script src>` it references, and sums those files' sizes -- gzipped (what a
 * visitor downloads) and raw (what the browser parses). The gzip total is
 * compared to the committed baseline in budgets/homepage-js.json and fails at
 * more than `toleranceBytes` over it. No runtime dependencies: node: builtins
 * only, like check-hero-budget.mjs.
 *
 * WHY THE HTML AND NOT A MANIFEST
 *   Next 16 dropped the "First Load JS" column from `next build` because, in
 *   its own words (docs/01-app/02-guides/upgrading/version-16.md), Turbopack
 *   and Webpack "disagreed on how to account for Client Components payload".
 *   The manifests that remain each hold a PART of the answer:
 *   build-manifest.json has the shared runtime (`rootMainFiles`), and
 *   server/app/page_client-reference-manifest.js has the page's client
 *   chunks (`entryJSFiles`) -- but not the error / not-found boundaries the
 *   layout also ships, and their shape is internal and has already changed
 *   once. The HTML is the contract: whatever a browser is told to fetch on
 *   first load is in it, and whatever it is not told to fetch is not.
 *
 * WHAT THIS COUNTS
 *   - every `<script src>` in .next/server/app/index.html, deduplicated
 *
 * WHAT THIS DOES *NOT* COUNT
 *   - `noModule` scripts (the legacy polyfill): every browser that runs
 *     modules skips them, so they are not what a visitor downloads
 *   - chunks behind `dynamic()` / `import()` -- the 3D scene (three.js) and
 *     the projectile demo -- because they are not in the initial HTML. That is
 *     the point: this gate is how "it is lazily loaded" stays true
 *   - inline scripts (the RSC payload in `self.__next_f.push`): that is page
 *     data inside the document, so it is reported as the HTML's size, not
 *     gated here
 *   - CSS, fonts, images, and the size of the HTML document itself
 *   - the exact on-the-wire bytes: this compresses at gzip level 9, and a
 *     CDN may serve brotli or pick another level. The figure is a stable,
 *     reproducible proxy for download size, which is what a regression gate
 *     needs; it is not a promise about any one request
 *
 * Usage:
 *   node scripts/check-homepage-js.mjs            check against the baseline
 *   node scripts/check-homepage-js.mjs --update   rewrite the baseline
 * Run `npm run build` first.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { gzipSync } from "node:zlib";

// --- Inputs ----------------------------------------------------------------

const ROOT = process.cwd();
const NEXT_DIR = path.join(ROOT, ".next");
const HTML_FILE = path.join(NEXT_DIR, "server", "app", "index.html");
const BUDGET_FILE = path.join(ROOT, "budgets", "homepage-js.json");
const DEFAULT_TOLERANCE = 1024; // bytes of gzip growth allowed before failing
const GZIP_LEVEL = 9;

const rel = (p) => path.relative(ROOT, p);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

// --- HTML ------------------------------------------------------------------

/**
 * Every external, module-capable script the page loads, in document order.
 * Attribute order and quoting are left to React, so match loosely.
 */
function scriptSources(html) {
  const sources = [];
  const skipped = [];
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = tag.match(/\ssrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src) continue; // inline script
    if (/\snomodule\b/i.test(tag)) {
      skipped.push(src);
      continue;
    }
    if (!sources.includes(src)) sources.push(src);
  }
  return { sources, skipped };
}

/**
 * `/_next/static/chunks/x.js` -> `.next/static/chunks/x.js`. Anything before
 * `/_next/` (an assetPrefix or basePath) is dropped; a script from anywhere
 * else is a third party this build does not contain, and is reported as such.
 */
function resolveChunk(src) {
  const url = src.replace(/[?#].*$/, "");
  const at = url.indexOf("/_next/");
  if (at === -1) return null;
  return path.join(NEXT_DIR, url.slice(at + "/_next/".length));
}

// --- Report ----------------------------------------------------------------

function main() {
  const update = process.argv.includes("--update");

  if (!existsSync(HTML_FILE)) {
    console.error(`homepage JS budget: cannot read ${rel(HTML_FILE)}`);
    console.error(
      "Run `npm run build` first. If it has run, `/` is no longer prerendered",
    );
    console.error(
      "(it shows as ƒ, not ○, in the build output) and this check needs a new source.",
    );
    process.exit(1);
  }

  const html = readFileSync(HTML_FILE);
  const { sources, skipped } = scriptSources(html.toString("utf8"));
  if (sources.length === 0) {
    console.error(
      `homepage JS budget FAILED: ${rel(HTML_FILE)} references no <script src>.`,
    );
    console.error("  The HTML format has changed; this parser needs updating.");
    process.exit(1);
  }

  const chunks = [];
  const unresolved = [];
  for (const src of sources) {
    const file = resolveChunk(src);
    if (!file || !existsSync(file)) {
      unresolved.push(src);
      continue;
    }
    const raw = readFileSync(file);
    chunks.push({
      name: path.basename(file),
      raw: raw.length,
      gzip: gzipSync(raw, { level: GZIP_LEVEL }).length,
    });
  }

  const total = chunks.reduce(
    (sum, c) => ({ raw: sum.raw + c.raw, gzip: sum.gzip + c.gzip }),
    { raw: 0, gzip: 0 },
  );
  const htmlGzip = gzipSync(html, { level: GZIP_LEVEL }).length;

  console.log(`homepage JS budget -- ${rel(HTML_FILE)}`);
  console.log("");
  console.log("  gzip      raw       chunk");
  for (const c of [...chunks].sort((a, b) => b.gzip - a.gzip)) {
    console.log(
      `  ${String(c.gzip).padStart(7)}   ${String(c.raw).padStart(7)}   ${c.name}`,
    );
  }
  console.log(
    `  ${String(total.gzip).padStart(7)}   ${String(total.raw).padStart(7)}   TOTAL (${chunks.length} scripts)`,
  );
  console.log("");
  console.log(
    `  first-load JS    ${total.gzip} B gzip (${kb(total.gzip)}), ${total.raw} B raw (${kb(total.raw)})`,
  );
  console.log(
    `  not counted      ${skipped.length} noModule script(s); HTML document itself ${htmlGzip} B gzip (includes the inline RSC payload)`,
  );

  if (unresolved.length) {
    // A script the HTML loads but the build does not contain is a script
    // this check cannot size. Silently skipping it would under-count, and an
    // under-counting budget is one that passes when it should not.
    console.log("");
    console.error(
      `homepage JS budget FAILED: ${unresolved.length} script(s) are not in .next/:`,
    );
    for (const src of unresolved) console.error(`  ${src}`);
    process.exit(1);
  }

  if (update) {
    const previous = existsSync(BUDGET_FILE)
      ? JSON.parse(readFileSync(BUDGET_FILE, "utf8"))
      : {};
    const baseline = {
      $comment:
        "First-load JS of `/`, from scripts/check-homepage-js.mjs. Regenerate with `node scripts/check-homepage-js.mjs --update` after `npm run build`, and say why in the PR.",
      gzipBytes: total.gzip,
      rawBytes: total.raw,
      scripts: chunks.length,
      toleranceBytes: previous.toleranceBytes ?? DEFAULT_TOLERANCE,
    };
    writeFileSync(BUDGET_FILE, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log("");
    console.log(`baseline written to ${rel(BUDGET_FILE)}`);
    return;
  }

  let baseline;
  try {
    baseline = JSON.parse(readFileSync(BUDGET_FILE, "utf8"));
  } catch {
    console.error(`homepage JS budget: cannot read ${rel(BUDGET_FILE)}`);
    console.error("Create it with `node scripts/check-homepage-js.mjs --update`.");
    process.exit(1);
  }
  const tolerance = baseline.toleranceBytes ?? DEFAULT_TOLERANCE;
  const limit = baseline.gzipBytes + tolerance;
  const delta = total.gzip - baseline.gzipBytes;
  const sign = delta >= 0 ? "+" : "";

  console.log(
    `  baseline         ${baseline.gzipBytes} B gzip, ${baseline.rawBytes} B raw, ${baseline.scripts} scripts (${rel(BUDGET_FILE)})`,
  );
  console.log("");
  console.log("checks");
  const ok = total.gzip <= limit;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  gzip <= baseline + ${tolerance} B -- ${total.gzip} B vs limit ${limit} B (${sign}${delta} B)`,
  );

  if (!ok) {
    console.log("");
    console.error(
      `homepage JS budget FAILED: first-load JS grew ${delta} B gzip, past the ${tolerance} B tolerance.`,
    );
    console.error(
      "  Move the new code behind dynamic() or onto its own route. If the growth is",
    );
    console.error(
      "  intended, run `node scripts/check-homepage-js.mjs --update` and justify it in the PR.",
    );
    process.exit(1);
  }
  if (delta < -tolerance) {
    // Not a failure, but a baseline that is far above reality lets the
    // next regression through unnoticed, up to the size of the slack.
    console.log("");
    console.log(
      `  note: ${-delta} B under baseline. Run with --update to bank the saving.`,
    );
  }
  console.log("");
  console.log("homepage JS budget OK");
}

main();
