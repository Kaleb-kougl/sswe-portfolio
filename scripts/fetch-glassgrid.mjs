#!/usr/bin/env node
/**
 * Puts the pinned Glassgrid web demo into public/glassgrid/, where Next.js
 * serves it at /glassgrid/. Runs as `prebuild` (so `npm run build`, which is
 * what Vercel runs, always has it) and as `predev` with --optional.
 * No dependencies: node: builtins only, Node 20 or later.
 *
 * THE LOCK FILE, glassgrid.lock.json (JSON, so its schema lives here)
 *   {
 *     "version": "0.1.0",          X.Y.Z or X.Y.Z-pre; the release tag is web-v<version>
 *     "url": "https://github.com/Kaleb-kougl/glassgrid/releases/download/web-v0.1.0/glassgrid-web-0.1.0.tar.gz",
 *     "sha256": "<64 lower-case hex digits of the tarball>"
 *   }
 *   The url must be that release asset for that version. Bumped by
 *   .github/workflows/bump-glassgrid.yml, or by hand from the release's
 *   .sha256 file.
 *
 * WHAT IT DOES
 *   1. Reads and checks the lock.
 *   2. If public/glassgrid/glassgrid.lock.json (the stamp: a copy of the
 *      lock it was installed from) already names the same version and
 *      sha256, stops: a second run is a no-op. Not a dotfile, because
 *      Next's static server answers dotfiles with a 500.
 *   3. Takes the tarball from GLASSGRID_TARBALL, or from .glassgrid-cache/,
 *      or downloads it there (CI caches that folder).
 *   4. Checks its sha256 against the lock. A mismatch is always fatal.
 *   5. Unpacks it into a staging folder (regular files and folders only, no
 *      path outside the folder), checks glassgrid-hosting.json names
 *      glassgrid-web, base /glassgrid/ and the locked version, writes the
 *      stamp, then swaps the folder into public/glassgrid/ with two renames.
 *      A failed run leaves the previous public/glassgrid/ as it was.
 *   next.config.ts validates the manifest's rules in full when it loads.
 *
 * ENVIRONMENT
 *   GLASSGRID_SKIP=1                   do nothing; the site builds without the demo
 *   GLASSGRID_TARBALL=/path/to.tar.gz  use this file instead of downloading (still sha-checked)
 *
 * Usage:
 *   node scripts/fetch-glassgrid.mjs              (npm run glassgrid:fetch)
 *   node scripts/fetch-glassgrid.mjs --optional   a download that fails is a warning, not an error
 *   node scripts/fetch-glassgrid.mjs --force      reinstall even if the stamp matches
 */

import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { createGunzip } from 'node:zlib';

export const LOCK_FILE = 'glassgrid.lock.json';
export const TARGET_DIR = path.join('public', 'glassgrid');
export const CACHE_DIR = '.glassgrid-cache';
export const STAMP_FILE = 'glassgrid.lock.json';
export const MANIFEST_FILE = 'glassgrid-hosting.json';
export const BASE = '/glassgrid/';
export const RELEASE_PREFIX = 'https://github.com/Kaleb-kougl/glassgrid/releases/download/';

const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

const HOW_TO_BUILD_WITHOUT_IT = [
  'To build anyway:',
  '  GLASSGRID_TARBALL=/path/to/glassgrid-web-<version>.tar.gz npm run build   (a local copy of the pinned release)',
  '  GLASSGRID_SKIP=1 npm run build                                             (no demo: /glassgrid is a 404)',
  'See docs/glassgrid-hosting.md.',
].join('\n');

export class GlassgridError extends Error {
  /** @param {string} message @param {{ soft?: boolean }} [options] soft: a download problem --optional may ignore */
  constructor(message, options = {}) {
    super(message);
    this.name = 'GlassgridError';
    this.soft = options.soft ?? false;
  }
}

// --- Lock ------------------------------------------------------------------

/** The release asset URL for a version. */
export function releaseUrl(version) {
  return `${RELEASE_PREFIX}web-v${version}/glassgrid-web-${version}.tar.gz`;
}

/**
 * Checks a parsed lock and returns it as { version, url, sha256 }.
 * @param {unknown} lock
 */
export function validateLock(lock, file = LOCK_FILE) {
  const problems = [];
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) {
    throw new GlassgridError(`${file}: expected an object with version, url and sha256`);
  }
  const { version, url, sha256 } = /** @type {Record<string, unknown>} */ (lock);
  const extra = Object.keys(lock).filter((key) => !['version', 'url', 'sha256'].includes(key));
  if (typeof version !== 'string' || !VERSION.test(version)) problems.push(`version must be X.Y.Z or X.Y.Z-pre (got ${JSON.stringify(version)})`);
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) problems.push(`sha256 must be 64 lower-case hex digits (got ${JSON.stringify(sha256)})`);
  if (typeof url !== 'string') {
    problems.push('url must be a string');
  } else if (typeof version === 'string' && url !== releaseUrl(version)) {
    problems.push(`url must be the release asset for this version: ${releaseUrl(version)} (got ${url})`);
  }
  if (extra.length) problems.push(`unknown field(s): ${extra.join(', ')}`);
  if (problems.length) throw new GlassgridError(`${file} is invalid:\n  ${problems.join('\n  ')}`);
  return { version: /** @type {string} */ (version), url: /** @type {string} */ (url), sha256: /** @type {string} */ (sha256) };
}

export function readLock(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new GlassgridError(`cannot read ${file}: ${error.message}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new GlassgridError(`${file} is not JSON: ${error.message}`);
  }
  return validateLock(json, file);
}

// --- Tarball ---------------------------------------------------------------

export async function sha256File(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

/** Throws unless `file` hashes to `expected`. */
export async function verifySha256(file, expected) {
  const actual = await sha256File(file);
  if (actual !== expected) {
    throw new GlassgridError(
      [
        `sha256 mismatch for ${file}`,
        `  expected ${expected} (${LOCK_FILE})`,
        `  actual   ${actual}`,
        'The file is not the pinned release. Nothing was installed. If you meant to test another build,',
        `change version and sha256 in ${LOCK_FILE} locally (and do not commit it unless it is a released version).`,
      ].join('\n'),
    );
  }
}

/** Downloads `url` to `dest` (via dest.part). Network failures and HTTP errors are soft errors. */
export async function download(url, dest, { fetchImpl = globalThis.fetch, log = console.log } = {}) {
  let response;
  try {
    response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch (error) {
    throw new GlassgridError(`could not download ${url}: ${error.cause?.message ?? error.message}\n${HOW_TO_BUILD_WITHOUT_IT}`, { soft: true });
  }
  if (!response.ok || !response.body) {
    const hint =
      response.status === 404
        ? 'HTTP 404: the release does not exist, or the glassgrid repository is not public yet (release assets of a private repository are not downloadable without a token).'
        : `HTTP ${response.status} ${response.statusText}`;
    throw new GlassgridError(`could not download ${url}\n${hint}\n${HOW_TO_BUILD_WITHOUT_IT}`, { soft: true });
  }
  const length = Number(response.headers.get('content-length')) || 0;
  log(`[glassgrid] downloading ${url}${length ? ` (${(length / 1e6).toFixed(1)} MB)` : ''}`);
  const part = `${dest}.part`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(part));
  } catch (error) {
    rmSync(part, { force: true });
    throw new GlassgridError(`download of ${url} failed: ${error.message}\n${HOW_TO_BUILD_WITHOUT_IT}`, { soft: true });
  }
  renameSync(part, dest);
}

// --- Extraction --------------------------------------------------------------

const BLOCK = 512;

function cString(buffer, start, length) {
  const field = buffer.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString('utf8');
}

function octal(buffer, start, length, what) {
  if (buffer[start] & 0x80) throw new GlassgridError(`tar: base-256 ${what} is not supported`);
  const text = cString(buffer, start, length).trim();
  if (text === '') return 0;
  if (!/^[0-7]+$/.test(text)) throw new GlassgridError(`tar: bad ${what} field ${JSON.stringify(text)}`);
  return parseInt(text, 8);
}

/** A tar entry name as a safe relative path, or a thrown error. */
export function safeEntryPath(name) {
  const trimmed = name.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '.') return '';
  if (trimmed.includes('\0') || trimmed.includes('\\')) throw new GlassgridError(`tar: refusing entry name ${JSON.stringify(name)}`);
  if (trimmed.startsWith('/') || /^[A-Za-z]:/.test(trimmed)) throw new GlassgridError(`tar: refusing absolute path ${JSON.stringify(name)}`);
  const parts = trimmed.split('/');
  if (parts.some((part) => part === '..' || part === '')) throw new GlassgridError(`tar: refusing path ${JSON.stringify(name)}`);
  return parts.filter((part) => part !== '.').join('/');
}

function paxPath(data) {
  // Records: "<length> <key>=<value>\n".
  let at = 0;
  let found = null;
  while (at < data.length) {
    const space = data.indexOf(0x20, at);
    if (space === -1) break;
    const length = parseInt(data.subarray(at, space).toString('utf8'), 10);
    if (!Number.isFinite(length) || length <= 0) throw new GlassgridError('tar: bad pax header');
    const record = data.subarray(space + 1, at + length - 1).toString('utf8');
    const equals = record.indexOf('=');
    if (equals !== -1 && record.slice(0, equals) === 'path') found = record.slice(equals + 1);
    at += length;
  }
  return found;
}

/**
 * Unpacks a .tar.gz into `dest` (created if missing). Streams: memory stays
 * at one gzip chunk. Accepts regular files and folders (plus the pax and GNU
 * long-name records that describe them); a symlink, hard link, device or any
 * path that would land outside `dest` is an error. Returns the file count.
 */
export async function extractTarGz(file, dest) {
  mkdirSync(dest, { recursive: true });
  const root = path.resolve(dest);
  let pending = Buffer.alloc(0);
  /** @type {null | { kind: 'file' | 'meta' | 'skip', remaining: number, padding: number, fd?: number, chunks?: Buffer[], type?: string }} */
  let entry = null;
  let nextName = null;
  let ended = false;
  let files = 0;

  const target = (name) => {
    const relative = safeEntryPath(name);
    const resolved = path.resolve(root, relative);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new GlassgridError(`tar: refusing path ${JSON.stringify(name)}`);
    return { relative, resolved };
  };

  const finish = () => {
    if (entry.kind === 'file') closeSync(entry.fd);
    if (entry.kind === 'meta') {
      const data = Buffer.concat(entry.chunks);
      nextName = entry.type === 'L' ? cString(data, 0, data.length) : (paxPath(data) ?? nextName);
    }
    entry = null;
  };

  const header = (block) => {
    let sum = 0;
    for (let i = 0; i < BLOCK; i += 1) sum += i >= 148 && i < 156 ? 0x20 : block[i];
    let expected = -1;
    try {
      expected = octal(block, 148, 8, 'checksum');
    } catch {
      // not a number: reported as a bad checksum below
    }
    if (sum !== expected) throw new GlassgridError(`tar: bad header checksum in ${file} (not a tar.gz, or truncated)`);
    const size = octal(block, 124, 12, 'size');
    const type = String.fromCharCode(block[156] || 0x30);
    const ustar = cString(block, 257, 6).startsWith('ustar');
    const prefix = ustar ? cString(block, 345, 155) : '';
    let name = cString(block, 0, 100);
    if (prefix) name = `${prefix}/${name}`;
    if (nextName !== null && type !== 'x' && type !== 'L' && type !== 'g') {
      name = nextName;
      nextName = null;
    }
    const padding = (BLOCK - (size % BLOCK)) % BLOCK;
    if (type === 'x' || type === 'L') return { kind: 'meta', remaining: size, padding, chunks: [], type };
    if (type === 'g') return { kind: 'skip', remaining: size, padding };
    if (type === '5') {
      const { resolved } = target(name);
      mkdirSync(resolved, { recursive: true });
      return size ? { kind: 'skip', remaining: size, padding } : null;
    }
    if (type === '0' || type === '7') {
      const { relative, resolved } = target(name);
      if (relative === '') throw new GlassgridError('tar: a file entry with an empty name');
      mkdirSync(path.dirname(resolved), { recursive: true });
      files += 1;
      return { kind: 'file', remaining: size, padding, fd: openSync(resolved, 'wx', 0o644) };
    }
    const kinds = { 1: 'hard link', 2: 'symbolic link', 3: 'character device', 4: 'block device', 6: 'FIFO' };
    throw new GlassgridError(`tar: refusing ${kinds[type] ?? `entry type ${JSON.stringify(type)}`} ${JSON.stringify(name)}`);
  };

  try {
    for await (const chunk of createReadStream(file).pipe(createGunzip())) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      for (;;) {
        if (entry) {
          if (entry.remaining > 0) {
            if (pending.length === 0) break;
            const take = Math.min(entry.remaining, pending.length);
            const piece = pending.subarray(0, take);
            if (entry.kind === 'file') writeSync(entry.fd, piece);
            else if (entry.kind === 'meta') entry.chunks.push(Buffer.from(piece));
            entry.remaining -= take;
            pending = pending.subarray(take);
            if (entry.remaining > 0) break;
          }
          if (pending.length < entry.padding) break;
          pending = pending.subarray(entry.padding);
          finish();
          continue;
        }
        if (ended) {
          pending = Buffer.alloc(0);
          break;
        }
        if (pending.length < BLOCK) break;
        const block = pending.subarray(0, BLOCK);
        pending = pending.subarray(BLOCK);
        if (block.every((byte) => byte === 0)) {
          ended = true;
          continue;
        }
        entry = header(block);
      }
    }
  } catch (error) {
    if (entry?.kind === 'file') closeSync(entry.fd);
    if (error instanceof GlassgridError) throw error;
    throw new GlassgridError(`cannot unpack ${file}: ${error.message}`);
  }
  if (entry || !ended) throw new GlassgridError(`cannot unpack ${file}: the archive is truncated`);
  return files;
}

// --- Manifest ----------------------------------------------------------------

/** Checks the unpacked folder is the locked release built for /glassgrid/. */
export function checkUnpacked(dir, lock) {
  for (const required of ['index.html', MANIFEST_FILE]) {
    if (!existsSync(path.join(dir, required))) throw new GlassgridError(`the tarball has no ${required} at its root`);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path.join(dir, MANIFEST_FILE), 'utf8'));
  } catch (error) {
    throw new GlassgridError(`${MANIFEST_FILE} in the tarball is not JSON: ${error.message}`);
  }
  const problems = [];
  if (manifest?.name !== 'glassgrid-web') problems.push(`name is ${JSON.stringify(manifest?.name)}, expected "glassgrid-web"`);
  if (manifest?.base !== BASE) problems.push(`base is ${JSON.stringify(manifest?.base)}, expected "${BASE}" (a build for another base path)`);
  if (manifest?.version !== lock.version) problems.push(`version is ${JSON.stringify(manifest?.version)}, but ${LOCK_FILE} pins "${lock.version}"`);
  if (!Array.isArray(manifest?.headers) || !Array.isArray(manifest?.rewrites)) problems.push('headers and rewrites must be arrays');
  if (problems.length) throw new GlassgridError(`${MANIFEST_FILE} in the tarball does not match the lock:\n  ${problems.join('\n  ')}`);
  return manifest;
}

// --- Install -----------------------------------------------------------------

function readStamp(targetDir) {
  try {
    return JSON.parse(readFileSync(path.join(targetDir, STAMP_FILE), 'utf8'));
  } catch {
    return null;
  }
}

/** True when targetDir holds exactly this lock's release. */
export function isInstalled(targetDir, lock) {
  const stamp = readStamp(targetDir);
  return Boolean(stamp && stamp.version === lock.version && stamp.sha256 === lock.sha256 && existsSync(path.join(targetDir, MANIFEST_FILE)));
}

function removeLeftovers(workDir) {
  if (!existsSync(workDir)) return;
  for (const name of readdirSync(workDir)) {
    if (name.startsWith('staging-') || name.startsWith('previous-') || name.endsWith('.part')) {
      rmSync(path.join(workDir, name), { recursive: true, force: true });
    }
  }
}

/**
 * Installs the locked release into `<root>/public/glassgrid`.
 * @param {{ root: string, tarball?: string, force?: boolean, fetchImpl?: typeof fetch, log?: (line: string) => void }} options
 * @returns {Promise<'installed' | 'up-to-date'>}
 */
export async function install({ root, tarball, force = false, fetchImpl, log = console.log }) {
  const lock = readLock(path.join(root, LOCK_FILE));
  const targetDir = path.join(root, TARGET_DIR);
  if (!force && isInstalled(targetDir, lock)) {
    log(`[glassgrid] ${TARGET_DIR} is already ${lock.version} (${lock.sha256.slice(0, 12)}…)`);
    return 'up-to-date';
  }

  const workDir = path.join(root, CACHE_DIR);
  mkdirSync(workDir, { recursive: true });
  removeLeftovers(workDir);

  let source;
  if (tarball) {
    source = path.resolve(root, tarball);
    if (!existsSync(source) || !statSync(source).isFile()) throw new GlassgridError(`GLASSGRID_TARBALL: no such file ${source}`);
    log(`[glassgrid] using GLASSGRID_TARBALL=${source}`);
    await verifySha256(source, lock.sha256);
  } else {
    source = path.join(workDir, path.basename(new URL(lock.url).pathname));
    if (existsSync(source)) {
      if ((await sha256File(source)) === lock.sha256) {
        log(`[glassgrid] using cached ${path.relative(root, source)}`);
      } else {
        log(`[glassgrid] cached ${path.relative(root, source)} does not match the lock; downloading again`);
        rmSync(source, { force: true });
      }
    }
    if (!existsSync(source)) {
      await download(lock.url, source, { fetchImpl, log });
      try {
        await verifySha256(source, lock.sha256);
      } catch (error) {
        rmSync(source, { force: true });
        throw error;
      }
    }
  }

  const id = `${process.pid}-${randomBytes(4).toString('hex')}`;
  const staging = path.join(workDir, `staging-${id}`);
  const previous = path.join(workDir, `previous-${id}`);
  try {
    const files = await extractTarGz(source, staging);
    checkUnpacked(staging, lock);
    writeFileSync(path.join(staging, STAMP_FILE), `${JSON.stringify({ version: lock.version, sha256: lock.sha256 }, null, 2)}\n`);
    mkdirSync(path.dirname(targetDir), { recursive: true });
    const hadPrevious = existsSync(targetDir);
    if (hadPrevious) renameSync(targetDir, previous);
    try {
      renameSync(staging, targetDir);
    } catch (error) {
      if (hadPrevious) renameSync(previous, targetDir);
      throw error;
    }
    log(`[glassgrid] installed ${lock.version} into ${TARGET_DIR} (${files} files)`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(previous, { recursive: true, force: true });
  }
  return 'installed';
}

// --- CLI ---------------------------------------------------------------------

async function main() {
  const args = new Set(process.argv.slice(2));
  const optional = args.has('--optional');
  const root = process.cwd();

  if (process.env.GLASSGRID_SKIP === '1') {
    const targetDir = path.join(root, TARGET_DIR);
    let note = `${TARGET_DIR} is absent: the site builds without the demo`;
    if (existsSync(targetDir)) {
      const stamp = readStamp(targetDir);
      note = `the existing ${TARGET_DIR} (${stamp?.version ?? 'unknown version'}) is left as it is and will be served`;
    }
    console.warn(`[glassgrid] GLASSGRID_SKIP=1: not fetching; ${note}.`);
    return;
  }

  try {
    await install({ root, tarball: process.env.GLASSGRID_TARBALL || undefined, force: args.has('--force') });
  } catch (error) {
    if (!(error instanceof GlassgridError)) throw error;
    if (optional && error.soft) {
      console.warn(`[glassgrid] warning: ${error.message}\n[glassgrid] continuing without the demo (--optional).`);
      return;
    }
    console.error(`[glassgrid] error: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
