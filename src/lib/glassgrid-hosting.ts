/**
 * The Glassgrid demo's hosting manifest, turned into Next.js `headers()` and
 * `rewrites()` entries for next.config.ts.
 *
 * The demo is a static build unpacked into `public/glassgrid/` by
 * scripts/fetch-glassgrid.mjs (see docs/glassgrid-hosting.md). Its release
 * carries `glassgrid-hosting.json`: the CSP and the other security headers,
 * the cache and content-type rules, and the rewrites that make
 * `/glassgrid` and `/glassgrid/gallery` serve its `index.html`. Glassgrid
 * owns those rules; this file only checks them and hands them to Next.
 *
 * WHAT IS CHECKED, AND WHY
 *   - every header and rewrite `source` is `/glassgrid` or under
 *     `/glassgrid/`: the manifest comes from another repository, and a rule
 *     for `/:path*` would replace the portfolio's own headers;
 *   - every rewrite `destination` is a path under `/glassgrid/`: an absolute
 *     URL there would turn this site into a proxy for someone else's;
 *   - rules carry only `source` and `headers` / `destination`. No `has`,
 *     `missing`, `basePath` or `locale`: the release has never needed them,
 *     and a new field should be read before it is applied;
 *   - header names are tokens and values have no line breaks;
 *   - `base` is `/glassgrid/`: a build for any other base requests its
 *     scripts from paths this site does not serve.
 *
 * WHAT HAPPENS WITHOUT IT
 *   No `public/glassgrid/` (GLASSGRID_SKIP=1, or a checkout that never ran
 *   the fetch): no Glassgrid rules at all, and a warning. The rest of the
 *   site builds and runs as before; /glassgrid is a 404.
 *   A manifest that is present but invalid throws, and fails the build: the
 *   demo's files would otherwise be served without their CSP.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/** Where the demo is served, and where its files are unpacked (relative to the project root). */
export const GLASSGRID_BASE = '/glassgrid/';
export const GLASSGRID_PUBLIC_DIR = path.join('public', 'glassgrid');
export const GLASSGRID_MANIFEST_FILE = 'glassgrid-hosting.json';

const underBase = (value: string) => value === GLASSGRID_BASE.slice(0, -1) || value.startsWith(GLASSGRID_BASE);

const source = z
  .string()
  .refine(underBase, { message: `must be ${GLASSGRID_BASE.slice(0, -1)} or start with ${GLASSGRID_BASE}` });

const headerRule = z.strictObject({
  source,
  headers: z
    .array(
      z.strictObject({
        key: z.string().regex(/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/, 'is not an HTTP header name'),
        value: z.string().regex(/^[^\r\n]*$/, 'contains a line break'),
      }),
    )
    .min(1),
});

const rewriteRule = z.strictObject({
  source,
  destination: z
    .string()
    .refine((value) => value.startsWith(GLASSGRID_BASE) && !value.includes('..'), {
      message: `must be a path under ${GLASSGRID_BASE}`,
    }),
});

export const glassgridHostingSchema = z.object({
  name: z.literal('glassgrid-web'),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, 'is not X.Y.Z or X.Y.Z-pre'),
  base: z.literal(GLASSGRID_BASE),
  headers: z.array(headerRule),
  rewrites: z.array(rewriteRule),
});

export type GlassgridHosting = z.infer<typeof glassgridHostingSchema>;
export type GlassgridHeaderRule = GlassgridHosting['headers'][number];
export type GlassgridRewrite = GlassgridHosting['rewrites'][number];

/** Validates a parsed manifest. Throws one error listing every problem, by path. */
export function parseGlassgridHosting(json: unknown, file = GLASSGRID_MANIFEST_FILE): GlassgridHosting {
  const result = glassgridHostingSchema.safeParse(json);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  throw new Error(`${file} is not a valid Glassgrid hosting manifest:\n${problems.join('\n')}`);
}

interface Logger {
  warn(message: string): void;
}

/**
 * Reads `<root>/public/glassgrid/glassgrid-hosting.json`. Returns null (and
 * warns) when the demo is not unpacked; throws when the file is unreadable
 * or invalid.
 */
export function loadGlassgridHosting(root: string, log: Logger = console): GlassgridHosting | null {
  const file = path.join(root, GLASSGRID_PUBLIC_DIR, GLASSGRID_MANIFEST_FILE);
  const shown = path.relative(root, file);
  if (!existsSync(file)) {
    log.warn(
      `[glassgrid] ${shown} not found: building without the demo (no /glassgrid headers or rewrites). ` +
        'Run `npm run glassgrid:fetch`, or see docs/glassgrid-hosting.md.',
    );
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${shown} is not JSON: ${(error as Error).message}`);
  }
  return parseGlassgridHosting(json, shown);
}

/**
 * The manifest's header rules, in its order (general to specific). Append
 * them AFTER any site-wide rules: when two rules set the same header on a
 * path, the later one wins (headers.md, "Header Overriding Behavior"), so a
 * site rule placed after these would replace the demo's CSP.
 */
export function glassgridHeaders(hosting: GlassgridHosting | null): GlassgridHeaderRule[] {
  return hosting ? hosting.headers.map((rule) => ({ source: rule.source, headers: rule.headers.map((h) => ({ ...h })) })) : [];
}

/**
 * The manifest's rewrites, for `afterFiles`: checked after public files, so
 * a real file under public/glassgrid/ is always served as itself, and only
 * the app's routes (`/glassgrid`, `/glassgrid/gallery`) fall through to
 * `index.html`. `/glassgrid/` never reaches them: with `trailingSlash`
 * false Next answers it with a 308 to `/glassgrid` first.
 */
export function glassgridRewrites(hosting: GlassgridHosting | null): GlassgridRewrite[] {
  return hosting ? hosting.rewrites.map((rule) => ({ ...rule })) : [];
}
