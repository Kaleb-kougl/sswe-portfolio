// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CACHE_DIR,
  GlassgridError,
  LOCK_FILE,
  STAMP_FILE,
  TARGET_DIR,
  extractTarGz,
  install,
  readLock,
  releaseUrl,
  safeEntryPath,
  validateLock,
} from '../scripts/fetch-glassgrid.mjs';

/**
 * scripts/fetch-glassgrid.mjs: the lock, the sha256 check, the tar reader and
 * the install. Fixture tarballs are built here, byte by byte (ustar), so the
 * hostile ones (a symlink, a `..` path) need no tar binary to make.
 */

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'fetch-glassgrid.mjs');
const REPO = path.resolve(__dirname, '..');
const SHA_A = 'a'.repeat(64);

// --- Fixtures ----------------------------------------------------------------

type Entry = { name: string; data?: string | Buffer; type?: string; linkname?: string };

function header(name: string, size: number, type: string, linkname = ''): Buffer {
  const block = Buffer.alloc(512);
  const put = (text: string, at: number, length: number) => block.write(text.slice(0, length), at, length, 'utf8');
  const octal = (value: number, at: number, length: number) => put(`${value.toString(8).padStart(length - 1, '0')}\0`, at, length);
  put(name, 0, 100);
  octal(0o644, 100, 8);
  octal(0, 108, 8);
  octal(0, 116, 8);
  octal(size, 124, 12);
  octal(0, 136, 12);
  block.fill(0x20, 148, 156);
  put(type, 156, 1);
  put(linkname, 157, 100);
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  let sum = 0;
  for (const byte of block) sum += byte;
  put(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  return block;
}

function tarGz(entries: Entry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? '');
    blocks.push(header(entry.name, data.length, entry.type ?? '0', entry.linkname));
    blocks.push(data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const manifest = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ name: 'glassgrid-web', version: '1.2.3', base: '/glassgrid/', headers: [], rewrites: [], ...overrides });

const releaseEntries = (overrides: Record<string, unknown> = {}): Entry[] => [
  { name: 'assets/', type: '5' },
  { name: 'assets/app.js', data: 'console.log("glassgrid")' },
  { name: 'samples/tiny.parquet', data: Buffer.from('PAR1....PAR1') },
  { name: 'index.html', data: '<!doctype html><script src="/glassgrid/assets/app.js"></script>' },
  { name: 'glassgrid-hosting.json', data: manifest(overrides) },
];

const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

const temps: string[] = [];
function temp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A project root with a lock for `tarball` (or for `sha`), plus the tarball on disk. */
function project(tarball: Buffer, { version = '1.2.3', sha = sha256(tarball) } = {}) {
  const root = temp('glassgrid-root-');
  writeFileSync(path.join(root, LOCK_FILE), JSON.stringify({ version, url: releaseUrl(version), sha256: sha }));
  const file = path.join(temp('glassgrid-tarball-'), `glassgrid-web-${version}.tar.gz`);
  writeFileSync(file, tarball);
  return { root, file, target: path.join(root, TARGET_DIR) };
}

const quiet = () => {};

// --- Lock --------------------------------------------------------------------

describe('the lock', () => {
  const lock = { version: '0.1.0', url: releaseUrl('0.1.0'), sha256: SHA_A };

  it('accepts a release pin, including a pre-release', () => {
    expect(validateLock(lock)).toEqual(lock);
    expect(validateLock({ version: '0.2.0-rc.1', url: releaseUrl('0.2.0-rc.1'), sha256: SHA_A }).version).toBe('0.2.0-rc.1');
  });

  it('rejects a malformed version, a bad sha256, a foreign URL or an extra field', () => {
    expect(() => validateLock({ ...lock, version: 'v0.1.0' })).toThrow(/version must be X\.Y\.Z/);
    expect(() => validateLock({ ...lock, sha256: SHA_A.toUpperCase() })).toThrow(/sha256 must be 64 lower-case hex/);
    expect(() => validateLock({ ...lock, sha256: 'abc' })).toThrow(/sha256/);
    expect(() => validateLock({ ...lock, url: 'https://example.com/glassgrid-web-0.1.0.tar.gz' })).toThrow(/url must be the release asset/);
    expect(() => validateLock({ ...lock, url: releaseUrl('0.0.9') })).toThrow(/url must be the release asset/);
    expect(() => validateLock({ ...lock, note: 'hi' })).toThrow(/unknown field\(s\): note/);
    expect(() => validateLock([])).toThrow(GlassgridError);
  });

  it('the committed glassgrid.lock.json is valid', () => {
    const committed = readLock(path.join(REPO, LOCK_FILE));
    expect(committed.url).toBe(releaseUrl(committed.version));
  });
});

// --- Tar ---------------------------------------------------------------------

describe('extractTarGz', () => {
  const extract = async (entries: Entry[]) => {
    const file = path.join(temp('glassgrid-tar-'), 'x.tar.gz');
    writeFileSync(file, tarGz(entries));
    const dest = path.join(temp('glassgrid-out-'), 'out');
    return { files: await extractTarGz(file, dest), dest };
  };

  it('unpacks files and folders', async () => {
    const { files, dest } = await extract(releaseEntries());
    expect(files).toBe(4);
    expect(readFileSync(path.join(dest, 'samples/tiny.parquet'), 'utf8')).toBe('PAR1....PAR1');
    expect(readdirSync(dest).sort()).toEqual(['assets', 'glassgrid-hosting.json', 'index.html', 'samples']);
  });

  it('handles a file larger than one block, an empty file and a ./ prefix', async () => {
    const big = Buffer.alloc(70_000, 7);
    const { dest } = await extract([
      { name: './big.bin', data: big },
      { name: './empty.txt', data: '' },
    ]);
    expect(readFileSync(path.join(dest, 'big.bin')).equals(big)).toBe(true);
    expect(readFileSync(path.join(dest, 'empty.txt'), 'utf8')).toBe('');
  });

  it('refuses symlinks, hard links and paths outside the folder', async () => {
    await expect(extract([{ name: 'link', type: '2', linkname: '/etc/passwd' }])).rejects.toThrow(/refusing symbolic link/);
    await expect(extract([{ name: 'hard', type: '1', linkname: 'index.html' }])).rejects.toThrow(/refusing hard link/);
    await expect(extract([{ name: '../escape.txt', data: 'x' }])).rejects.toThrow(/refusing path/);
    await expect(extract([{ name: 'assets/../../escape.txt', data: 'x' }])).rejects.toThrow(/refusing path/);
    await expect(extract([{ name: '/etc/cron.d/x', data: 'x' }])).rejects.toThrow(/refusing absolute path/);
  });

  it('rejects a file that is not a tar.gz, and a truncated one', async () => {
    const dir = temp('glassgrid-bad-');
    writeFileSync(path.join(dir, 'plain.tar.gz'), gzipSync(Buffer.alloc(512, 1)));
    await expect(extractTarGz(path.join(dir, 'plain.tar.gz'), path.join(dir, 'a'))).rejects.toThrow(/bad header checksum/);
    const whole = tarGz(releaseEntries());
    const raw = gunzipSync(whole);
    writeFileSync(path.join(dir, 'cut.tar.gz'), gzipSync(raw.subarray(0, 1024)));
    await expect(extractTarGz(path.join(dir, 'cut.tar.gz'), path.join(dir, 'b'))).rejects.toThrow(/truncated/);
  });

  it('reads what the system tar writes (pax long names), when there is one', async (context) => {
    if (spawnSync('tar', ['--version']).status !== 0) context.skip();
    const src = temp('glassgrid-systar-');
    const long = `${'d'.repeat(60)}/${'f'.repeat(80)}.wasm`;
    mkdirSync(path.join(src, path.dirname(long)), { recursive: true });
    writeFileSync(path.join(src, long), 'long name');
    writeFileSync(path.join(src, 'index.html'), 'hi');
    const file = path.join(temp('glassgrid-systar-out-'), 'sys.tar.gz');
    const gnu = String(execFileSync('tar', ['--version'])).includes('GNU tar');
    execFileSync('tar', [...(gnu ? ['--format=pax'] : []), '-czf', file, '-C', src, 'index.html', long.split('/')[0]]);
    const dest = path.join(path.dirname(file), 'out');
    await extractTarGz(file, dest);
    expect(readFileSync(path.join(dest, long), 'utf8')).toBe('long name');
  });

  it('safeEntryPath normalises the harmless and refuses the rest', () => {
    expect(safeEntryPath('./assets/x.js')).toBe('assets/x.js');
    expect(safeEntryPath('assets/')).toBe('assets');
    expect(safeEntryPath('./')).toBe('');
    expect(() => safeEntryPath('a//b')).toThrow(GlassgridError);
    expect(() => safeEntryPath('a\\b')).toThrow(GlassgridError);
    expect(() => safeEntryPath('C:/x')).toThrow(GlassgridError);
  });
});

// --- Install -----------------------------------------------------------------

describe('install', () => {
  it('installs from GLASSGRID_TARBALL, stamps the folder, and is a no-op the second time', async () => {
    const { root, file, target } = project(tarGz(releaseEntries()));
    expect(await install({ root, tarball: file, log: quiet })).toBe('installed');
    expect(readFileSync(path.join(target, 'index.html'), 'utf8')).toContain('/glassgrid/assets/app.js');
    const stamp = JSON.parse(readFileSync(path.join(target, STAMP_FILE), 'utf8'));
    expect(stamp).toEqual({ version: '1.2.3', sha256: readLock(path.join(root, LOCK_FILE)).sha256 });
    expect(await install({ root, tarball: file, log: quiet })).toBe('up-to-date');
    // No staging folder left behind.
    expect(readdirSync(path.join(root, CACHE_DIR))).toEqual([]);
  });

  it('fails hard on a sha256 mismatch, and leaves the installed version alone', async () => {
    const good = tarGz(releaseEntries());
    const { root, file, target } = project(good);
    await install({ root, tarball: file, log: quiet });

    const tampered = tarGz([...releaseEntries(), { name: 'evil.js', data: 'alert(1)' }]);
    writeFileSync(path.join(root, LOCK_FILE), JSON.stringify({ version: '1.2.3', url: releaseUrl('1.2.3'), sha256: SHA_A }));
    writeFileSync(file, tampered);
    const error = await install({ root, tarball: file, log: quiet }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GlassgridError);
    expect((error as GlassgridError).message).toMatch(/sha256 mismatch/);
    expect((error as GlassgridError).message).toContain(`actual   ${sha256(tampered)}`);
    expect((error as GlassgridError).soft).toBe(false);
    expect(existsSync(path.join(target, 'evil.js'))).toBe(false);
    expect(existsSync(path.join(target, 'index.html'))).toBe(true);
  });

  it('refuses a tarball whose manifest is for another version or base', async () => {
    for (const [overrides, message] of [
      [{ version: '9.9.9' }, /version is "9\.9\.9", but glassgrid\.lock\.json pins "1\.2\.3"/],
      [{ base: '/' }, /base is "\/", expected "\/glassgrid\/"/],
    ] as const) {
      const { root, file, target } = project(tarGz(releaseEntries(overrides)));
      await expect(install({ root, tarball: file, log: quiet })).rejects.toThrow(message);
      expect(existsSync(target)).toBe(false);
    }
  });

  it('refuses a tarball without index.html or the manifest at its root', async () => {
    const { root, file } = project(tarGz([{ name: 'glassgrid/index.html', data: 'nested' }]));
    await expect(install({ root, tarball: file, log: quiet })).rejects.toThrow(/no index\.html at its root/);
  });

  it('downloads into the cache, then reuses the cached copy', async () => {
    const tarball = tarGz(releaseEntries());
    const { root, target } = project(tarball);
    const requested: string[] = [];
    const fetchImpl = (async (url: string) => {
      requested.push(url);
      return new Response(new Uint8Array(tarball), { headers: { 'content-length': String(tarball.length) } });
    }) as unknown as typeof fetch;
    expect(await install({ root, fetchImpl, log: quiet })).toBe('installed');
    expect(requested).toEqual([releaseUrl('1.2.3')]);
    expect(existsSync(path.join(root, CACHE_DIR, 'glassgrid-web-1.2.3.tar.gz'))).toBe(true);

    rmSync(target, { recursive: true });
    expect(await install({ root, fetchImpl, log: quiet })).toBe('installed');
    expect(requested).toHaveLength(1);
  });

  it('a download that 404s says how to build without it, as a soft error', async () => {
    const { root, target } = project(tarGz(releaseEntries()));
    const fetchImpl = (async () => new Response('Not Found', { status: 404, statusText: 'Not Found' })) as unknown as typeof fetch;
    const error = (await install({ root, fetchImpl, log: quiet }).catch((e: unknown) => e)) as GlassgridError;
    expect(error).toBeInstanceOf(GlassgridError);
    expect(error.soft).toBe(true);
    expect(error.message).toMatch(/HTTP 404: .*not public yet/);
    expect(error.message).toContain('GLASSGRID_TARBALL=');
    expect(error.message).toContain('GLASSGRID_SKIP=1');
    expect(existsSync(target)).toBe(false);
  });

  it('a downloaded file that does not match the lock is deleted, not cached', async () => {
    const { root } = project(tarGz(releaseEntries()), { sha: SHA_A });
    const fetchImpl = (async () => new Response(new Uint8Array(tarGz(releaseEntries())))) as unknown as typeof fetch;
    await expect(install({ root, fetchImpl, log: quiet })).rejects.toThrow(/sha256 mismatch/);
    expect(readdirSync(path.join(root, CACHE_DIR))).toEqual([]);
  });
});

// --- CLI ---------------------------------------------------------------------

describe('the command', () => {
  const run = (cwd: string, env: Record<string, string>, args: string[] = []) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env: { ...process.env, GLASSGRID_SKIP: '', GLASSGRID_TARBALL: '', ...env }, encoding: 'utf8' });

  it('GLASSGRID_SKIP=1 does nothing and succeeds', () => {
    const { root, target } = project(tarGz(releaseEntries()));
    const result = run(root, { GLASSGRID_SKIP: '1' });
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/GLASSGRID_SKIP=1: not fetching; public\/glassgrid is absent/);
    expect(existsSync(target)).toBe(false);
  });

  it('installs from GLASSGRID_TARBALL, and exits 1 with the reason on a mismatch', () => {
    const { root, file } = project(tarGz(releaseEntries()));
    const ok = run(root, { GLASSGRID_TARBALL: file });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/installed 1\.2\.3 into public\/glassgrid \(4 files\)/);

    const { root: other, file: wrong } = project(tarGz(releaseEntries()), { sha: SHA_A });
    const bad = run(other, { GLASSGRID_TARBALL: wrong }, ['--optional']);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/\[glassgrid\] error: sha256 mismatch/);
  });
});
