#!/usr/bin/env node
/**
 * Checks that every `source.href` in the corpus still resolves.
 *
 * Evidence is only as good as the link behind it: an agent told "see npm" and
 * handed a 404 has been told nothing. This runs as its own CI job because it
 * depends on the network, and a flaky third-party host should not fail the
 * unit tests.
 *
 * Each unique href gets a HEAD, falling back to GET when HEAD fails (some
 * hosts, Roblox among them, 404 a HEAD for a page that GETs fine). Two retries
 * with backoff, 10 s timeout per attempt.
 *
 * SOME HOSTS ARE PROBED BY PROXY. npmjs.com and pubs.acs.org (where doi.org
 * redirects) put a bot challenge in front of every page and answer 403 to any
 * non-browser, so checking them directly can only ever fail. Instead:
 *   - npmjs.com/package/<name> → registry.npmjs.org/<name>, the same package
 *     record the page renders.
 *   - doi.org/<doi> → doi.org's handle API, which says whether the DOI is
 *     registered and where it points, without following it into ACS.
 * A proxy proves the thing exists, which is the claim the link makes.
 *
 * Links with a fragment (the site's own #career / #work anchors) are fetched
 * with GET and the page must contain that id, so a renamed section fails.
 *
 * Exit codes: 0 all links resolve, 1 any failure.
 */
import { loadCorpus } from './lib/load-corpus.mjs';

const RETRIES = 2;
const TIMEOUT_MS = 10_000;
const HEADERS = { 'user-agent': 'sswe-portfolio corpus link check (+https://github.com/Kaleb-kougl)' };

/** What to actually request for an href, and how to judge the response. */
function probeFor(href) {
  const url = new URL(href);
  if (url.hostname === 'www.npmjs.com' && url.pathname.startsWith('/package/')) {
    return { url: `https://registry.npmjs.org/${url.pathname.slice('/package/'.length)}`, via: 'npm registry' };
  }
  if (url.hostname === 'doi.org') {
    return {
      url: `https://doi.org/api/handles${url.pathname}`,
      via: 'doi handle API',
      method: 'GET',
      // The API answers 200 for unknown handles too; responseCode 1 means found.
      accept: async (res) => (await res.json()).responseCode === 1 || 'DOI not registered',
    };
  }
  if (url.hash) {
    const id = decodeURIComponent(url.hash.slice(1));
    return {
      url: href,
      via: `GET, #${id}`,
      method: 'GET',
      accept: async (res) => (await res.text()).includes(`id="${id}"`) || `no element with id="${id}"`,
    };
  }
  return { url: href, via: 'direct' };
}

async function request(url, method) {
  return fetch(url, { method, headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** One attempt: HEAD then GET, unless the probe needs a body. */
async function attempt(probe) {
  const methods = probe.method ? [probe.method] : ['HEAD', 'GET'];
  let last;
  for (const method of methods) {
    try {
      const res = await request(probe.url, method);
      if (!res.ok) {
        last = `${method} ${res.status}`;
        continue;
      }
      const verdict = probe.accept ? await probe.accept(res) : true;
      if (verdict === true) return { ok: true, detail: `${method} ${res.status}` };
      last = `${method} ${res.status}: ${verdict}`;
    } catch (error) {
      last = `${method} ${error.name === 'TimeoutError' ? 'timeout' : error.message}`;
    }
  }
  return { ok: false, detail: last };
}

async function check(href) {
  const probe = probeFor(href);
  let result;
  for (let i = 0; i <= RETRIES; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** (i - 1)));
    result = await attempt(probe);
    if (result.ok) break;
  }
  return { href, via: probe.via, ...result };
}

const corpus = await loadCorpus();
const hrefs = [...new Set(corpus.evidence.map((e) => e.source.href))].sort();
const results = await Promise.all(hrefs.map(check));

const rows = results.map((r) => [r.ok ? 'ok' : 'FAIL', r.detail, r.via, r.href]);
const widths = [0, 1, 2].map((i) => Math.max(...rows.map((row) => row[i].length)));
for (const row of rows) {
  console.log(row.map((cell, i) => (i < 3 ? cell.padEnd(widths[i]) : cell)).join('  '));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${hrefs.length - failed.length}/${hrefs.length} links resolve`);
if (failed.length) process.exit(1);
