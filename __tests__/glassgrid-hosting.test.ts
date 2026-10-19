// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import nextConfig from '../next.config';
import {
  GLASSGRID_PUBLIC_DIR,
  glassgridHeaders,
  glassgridRewrites,
  loadGlassgridHosting,
  parseGlassgridHosting,
  type GlassgridHosting,
} from '@/lib/glassgrid-hosting';

/**
 * The Glassgrid hosting manifest -> next.config `headers()` / `rewrites()`.
 * MANIFEST is glassgrid-hosting.json from the 0.1.0 release, verbatim.
 */

const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const IMMUTABLE = { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' };

const MANIFEST = {
  name: 'glassgrid-web',
  version: '0.1.0',
  base: '/glassgrid/',
  headers: [
    {
      source: '/glassgrid/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: CSP },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
      ],
    },
    { source: '/glassgrid/assets/:path*', headers: [IMMUTABLE] },
    { source: '/glassgrid/duckdb-extensions/:path*', headers: [IMMUTABLE] },
    {
      source: '/glassgrid/samples/:file(.*\\.parquet)',
      headers: [IMMUTABLE, { key: 'Content-Type', value: 'application/vnd.apache.parquet' }],
    },
    {
      source: '/glassgrid/samples/:file(.*\\.glassgrid)',
      headers: [{ key: 'Content-Type', value: 'application/vnd.glassgrid.workspace+json; charset=utf-8' }],
    },
    { source: '/glassgrid/:file(.*\\.wasm)', headers: [{ key: 'Content-Type', value: 'application/wasm' }] },
  ],
  rewrites: [
    { source: '/glassgrid', destination: '/glassgrid/index.html' },
    { source: '/glassgrid/', destination: '/glassgrid/index.html' },
    { source: '/glassgrid/gallery', destination: '/glassgrid/index.html' },
    { source: '/glassgrid/gallery/', destination: '/glassgrid/index.html' },
  ],
};

const clone = (): typeof MANIFEST => structuredClone(MANIFEST);
const silent = { warn: () => {} };

const roots: string[] = [];
function tempRoot(manifest?: unknown): string {
  const root = mkdtempSync(path.join(tmpdir(), 'glassgrid-hosting-'));
  roots.push(root);
  if (manifest !== undefined) {
    mkdirSync(path.join(root, GLASSGRID_PUBLIC_DIR), { recursive: true });
    writeFileSync(
      path.join(root, GLASSGRID_PUBLIC_DIR, 'glassgrid-hosting.json'),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
    );
  }
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('manifest -> Next.js rules', () => {
  it('passes the release manifest through unchanged, in its order', () => {
    const hosting = parseGlassgridHosting(clone());
    expect(glassgridHeaders(hosting)).toEqual(MANIFEST.headers);
    expect(glassgridRewrites(hosting)).toEqual(MANIFEST.rewrites);
    // General first, specific last: the immutable and content-type rules must
    // come after the /glassgrid/:path* max-age=0, because the later one wins.
    expect(glassgridHeaders(hosting)[0].source).toBe('/glassgrid/:path*');
  });

  it('returns copies, so Next mutating its rules cannot change the manifest', () => {
    const hosting = parseGlassgridHosting(clone());
    glassgridHeaders(hosting)[0].headers[0].value = 'changed';
    glassgridRewrites(hosting)[0].destination = '/glassgrid/other.html';
    expect(hosting.headers[0].headers[0].value).toBe(CSP);
    expect(hosting.rewrites[0].destination).toBe('/glassgrid/index.html');
  });

  it('adds nothing without a manifest', () => {
    expect(glassgridHeaders(null)).toEqual([]);
    expect(glassgridRewrites(null)).toEqual([]);
  });
});

describe('manifest validation', () => {
  const rejects = (mutate: (m: GlassgridHosting & Record<string, unknown>) => void, message: RegExp) => {
    const manifest = clone() as GlassgridHosting & Record<string, unknown>;
    mutate(manifest);
    expect(() => parseGlassgridHosting(manifest)).toThrow(message);
  };

  it('rejects a header rule outside /glassgrid', () => {
    rejects((m) => (m.headers[0].source = '/:path*'), /headers\.0\.source: must be \/glassgrid or start with \/glassgrid\//);
    rejects((m) => (m.headers[1].source = '/glassgridx/:path*'), /headers\.1\.source/);
  });

  it('rejects a rewrite from outside /glassgrid, or to anywhere but a path under it', () => {
    rejects((m) => (m.rewrites[0].source = '/'), /rewrites\.0\.source/);
    rejects((m) => (m.rewrites[0].destination = 'https://example.com/glassgrid/'), /rewrites\.0\.destination: must be a path under \/glassgrid\//);
    rejects((m) => (m.rewrites[0].destination = '/glassgrid/../api/contact'), /rewrites\.0\.destination/);
    rejects((m) => (m.rewrites[0].destination = '/index.html'), /rewrites\.0\.destination/);
  });

  it('rejects fields it does not apply (has, missing, basePath, locale)', () => {
    rejects((m) => Object.assign(m.headers[0], { has: [{ type: 'host', value: 'x' }] }), /headers\.0/);
    rejects((m) => Object.assign(m.rewrites[0], { basePath: false }), /rewrites\.0/);
  });

  it('rejects header names that are not tokens and values with line breaks', () => {
    rejects((m) => (m.headers[0].headers[0].key = 'Bad Header'), /is not an HTTP header name/);
    rejects((m) => (m.headers[0].headers[0].value = "default-src 'self'\r\nSet-Cookie: x=1"), /contains a line break/);
  });

  it('rejects a build for another base, another name or a malformed version', () => {
    rejects((m) => ((m as Record<string, unknown>).base = '/'), /base/);
    rejects((m) => ((m as Record<string, unknown>).name = 'something-else'), /name/);
    rejects((m) => (m.version = 'v0.1'), /version: is not X\.Y\.Z/);
  });

  it('accepts a pre-release version and ignores unknown top-level fields', () => {
    const manifest = { ...clone(), version: '0.2.0-rc.1', builtAt: '2026-10-19' };
    expect(parseGlassgridHosting(manifest).version).toBe('0.2.0-rc.1');
  });
});

describe('loadGlassgridHosting', () => {
  it('returns null and warns when public/glassgrid is absent', () => {
    const warn = vi.fn();
    expect(loadGlassgridHosting(tempRoot(), { warn })).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/glassgrid-hosting\.json not found: building without the demo/);
  });

  it('reads and validates the unpacked manifest', () => {
    expect(loadGlassgridHosting(tempRoot(clone()), silent)?.headers).toEqual(MANIFEST.headers);
  });

  it('throws on a manifest that is present but not JSON, or not valid', () => {
    expect(() => loadGlassgridHosting(tempRoot('{ nope'), silent)).toThrow(/is not JSON/);
    expect(() => loadGlassgridHosting(tempRoot({ ...clone(), base: '/' }), silent)).toThrow(/not a valid Glassgrid hosting manifest/);
  });
});

describe('next.config.ts', () => {
  it('serves exactly the manifest on disk (or nothing): no site rule after the demo overrides its headers', async () => {
    const onDisk = loadGlassgridHosting(path.resolve(__dirname, '..'), silent);
    const headers = await nextConfig.headers!();
    const rewrites = await nextConfig.rewrites!();
    expect(headers).toEqual(glassgridHeaders(onDisk));
    expect(rewrites).toEqual({ beforeFiles: [], afterFiles: glassgridRewrites(onDisk), fallback: [] });
    expect(nextConfig.trailingSlash ?? false).toBe(false);
  });
});
