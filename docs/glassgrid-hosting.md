# Glassgrid demo hosting

The Glassgrid card's **Live demo** link goes to `/glassgrid/?sample=taxi` on this site. There is no separate Glassgrid deployment: the demo is a static build, released as a tarball by the [glassgrid](https://github.com/Kaleb-kougl/glassgrid) repository, and this site pins one release, unpacks it into `public/glassgrid/` when it builds, and serves it next to everything else.

Glassgrid owns what the demo needs from its host (a CSP with `'wasm-unsafe-eval'`, cache rules, content types for `.wasm` and `.parquet`, and the routes that serve `index.html`) and ships it in the tarball as `glassgrid-hosting.json`. This site checks that file and hands it to Next.js. Nothing about the demo is written by hand here except the pin.

## How the demo gets here

```
glassgrid repository                         GitHub Release web-vX.Y.Z                  this repository (Next.js on Vercel)
────────────────────                         ─────────────────────────                  ───────────────────────────────────
tag web-vX.Y.Z
  └─ release-web.yml                         glassgrid-web-X.Y.Z.tar.gz                 glassgrid.lock.json  (version, url, sha256)
       build with base /glassgrid/   ──────▶ glassgrid-web-X.Y.Z.tar.gz.sha256
       E2E under /glassgrid/                                                            npm run build
       repository_dispatch ─────────────────────────────────────────────────────────▶    └─ prebuild: scripts/fetch-glassgrid.mjs
         glassgrid-release                                                                    download (or GLASSGRID_TARBALL)
         {version, url, sha256}                                                               sha256 must match the lock
            │                                                                                 unpack into public/glassgrid/
            ▼                                                                               next build
       bump-glassgrid.yml (here) ── verifies, edits the lock, opens a PR ──▶ CI ──▶ merge     └─ next.config.ts: headers() and rewrites()
                                                                                                 from public/glassgrid/glassgrid-hosting.json
```

The tarball's root holds `index.html`, `assets/`, `samples/`, `duckdb-extensions/` and `glassgrid-hosting.json`: about 59 MB compressed and 118 MB on disk. Two DuckDB `.wasm` builds (34 and 39 MB) and three sample Parquet files (8 to 21 MB) are most of it.

## The lock file

`glassgrid.lock.json` at the repository root is the only Glassgrid state committed here:

```json
{
  "version": "0.1.0",
  "url": "https://github.com/Kaleb-kougl/glassgrid/releases/download/web-v0.1.0/glassgrid-web-0.1.0.tar.gz",
  "sha256": "b719266450ba32f40110dd129a4465a862249806f168a1fecf093a33942e83c0"
}
```

| Field | Rule |
|---|---|
| `version` | `X.Y.Z` or `X.Y.Z-pre`. The release tag is `web-v<version>`. |
| `url` | Exactly the release asset for that version. Anything else is rejected, so a lock cannot point at another host. |
| `sha256` | 64 lower-case hex digits, from the release's `.sha256` file. |

JSON has no comments, so the schema is also written out in the header of `scripts/fetch-glassgrid.mjs`. Never edit `sha256` to make a build pass: a mismatch means the file is not the release that was pinned.

## What the build does

`npm run build` runs `prebuild` first, which is `node scripts/fetch-glassgrid.mjs`. Vercel runs `npm run build`, so it gets the same step. The script uses `node:` builtins only:

1. Checks the lock.
2. Stops if `public/glassgrid/glassgrid.lock.json` (a stamp: a copy of the lock it was installed from) already names the same version and sha256. A second build costs nothing.
3. Takes the tarball from `GLASSGRID_TARBALL`, or from `.glassgrid-cache/`, or downloads it there.
4. Checks its sha256 against the lock. A mismatch always fails, cached file or not, and nothing is installed.
5. Unpacks it into a staging folder with a small streaming tar reader that accepts regular files and folders only. A symlink, a hard link, an absolute path or a `..` path is an error. It needs no `tar` binary.
6. Checks `glassgrid-hosting.json`: name `glassgrid-web`, base `/glassgrid/`, and the version the lock pins.
7. Swaps the staging folder into `public/glassgrid/` with two renames. A failed run leaves the previous `public/glassgrid/` exactly as it was.

Then `next build` loads `next.config.ts`, which reads the manifest through `src/lib/glassgrid-hosting.ts`. That validates it with zod before anything is applied:

- every header and rewrite `source` is `/glassgrid` or starts with `/glassgrid/`, so a rule from the other repository cannot change headers anywhere else on the site;
- every rewrite `destination` is a path under `/glassgrid/`, so it cannot turn this site into a proxy;
- rules carry only `source` plus `headers` or `destination`. No `has`, `missing`, `basePath` or `locale`: a new field should be read before it is applied;
- header names are tokens, and values contain no line breaks.

A manifest that fails any of these fails the build. Without the demo folder at all, the config adds no Glassgrid rules and logs a warning.

**Headers** are appended after any site-wide rules (there are none today). When two rules set the same header on a path, the later one wins (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md`, "Header Overriding Behavior"), and the manifest itself goes from general to specific: `max-age=0` for everything under `/glassgrid`, then `immutable` for `assets/`, `duckdb-extensions/` and `.parquet`.

**Rewrites** go in `afterFiles` (`rewrites.md`): public files are checked first, so every real file under `public/glassgrid/` is served as itself, and only `/glassgrid` and `/glassgrid/gallery`, which are not files, fall through to `index.html`. Next.js serves a public file only at its own path, never as a folder's index.

**`trailingSlash` stays `false`.** `/glassgrid/` gets a 308 to `/glassgrid` (the query string is kept), and the header sources are written for that.

There is no `proxy.ts` (formerly middleware) in this project. Do not add one that sets a CSP or other security headers on `/glassgrid` paths: it would run after `headers()` and fight the demo's.

### Cache-Control and Content-Type on public files

The Next 16 docs say two things that sound like they might get in the way:

- `public-folder.md`: "Next.js cannot safely cache assets in the `public` folder because they may change. The default caching headers applied are: `Cache-Control: public, max-age=0`."
- `headers.md`, "Cache-Control": `public, max-age=31536000, immutable` on truly immutable assets "cannot be overridden".

Neither stops the manifest. The second is about hashed `/_next/static` files only: `node_modules/next/dist/server/lib/router-server.js` forces `immutable` on the `nextStaticFolder` output type and nothing else, and only when no `Cache-Control` is set yet. The first is a default: public files go through the bundled `send` (`node_modules/next/dist/compiled/send/index.js`), which sets `Cache-Control` only `if (!res.getHeader("Cache-Control"))` and `Content-Type` only if none is set. `headers()` runs before the filesystem ("Headers are checked before the filesystem which includes pages and `/public` files"), so its values are already on the response.

Measured with `next start` on the 0.1.0 release:

| Request | Status | Content-Type | Cache-Control | Other |
|---|---|---|---|---|
| `/` | 200 | `text/html` | `s-maxage=31536000` | no CSP, no COOP |
| `/glassgrid` | 200 | `text/html` | `public, max-age=0, must-revalidate` | demo CSP, `nosniff`, COOP, CORP, `no-referrer` |
| `/glassgrid/` | 308 → `/glassgrid` | | | |
| `/glassgrid/?sample=taxi` | 308 → `/glassgrid?sample=taxi` | | | |
| `/glassgrid/gallery` | 200 | `text/html` | `public, max-age=0, must-revalidate` | demo CSP; same body as `/glassgrid` |
| `/glassgrid/assets/index-*.js` | 200 | `application/javascript` | `public, max-age=31536000, immutable` | demo CSP |
| `/glassgrid/assets/duckdb-eh-*.wasm` | 200 | `application/wasm` | `public, max-age=31536000, immutable` | `gzip` from `next start` |
| `/glassgrid/samples/taxi-trips-2025h1.parquet` | 200 | `application/vnd.apache.parquet` | `public, max-age=31536000, immutable` | |
| the same, `Range: bytes=0-3` | 206 | `application/vnd.apache.parquet` | `public, max-age=31536000, immutable` | `Content-Range: bytes 0-3/20760220`, body `PAR1` |
| `/glassgrid/samples/taxi.glassgrid` | 200 | `application/vnd.glassgrid.workspace+json; charset=utf-8` | `public, max-age=0, must-revalidate` | |

So there is **no `vercel.json`**. On Vercel, `next.config` headers and rewrites are compiled into the deployment's routing and also apply to static files; that is the one thing a local run cannot prove, and the first preview checks it (below). If a preview ever shows `Content-Type: application/octet-stream` on `.parquet`, or `max-age=0` on `assets/`, the fallback is a `vercel.json` `headers` block generated from the same manifest at `prebuild`. Do not write one by hand: it would drift from the release.

## Local development

`npm run dev` runs `predev`, which is the same script with `--optional`: if the download fails (offline, or the release does not exist yet) it warns and the dev server starts without the demo. A sha256 mismatch is still an error.

| | |
|---|---|
| `npm run glassgrid:fetch` | Fetch and unpack the pinned release now. `-- --force` reinstalls even when the stamp matches. |
| `GLASSGRID_TARBALL=/path/to/glassgrid-web-0.1.0.tar.gz npm run build` | Use a local copy of the pinned release instead of downloading it, for example one built with `pnpm package:web 0.1.0` in the glassgrid repository (`apps/web/release/`). It is still checked against the lock's sha256. |
| `GLASSGRID_SKIP=1 npm run build` | Do not fetch. Without `public/glassgrid/` the site builds and runs as before, `/glassgrid` is a 404, and `e2e/glassgrid-hosting.spec.ts` skips itself. An existing `public/glassgrid/` is left in place and still served, with its headers. |

To try an unreleased glassgrid build, change `version` and `sha256` in `glassgrid.lock.json` locally to match the tarball (the URL must name that version too), use `GLASSGRID_TARBALL`, and do not commit the lock.

`public/glassgrid/` and `.glassgrid-cache/` are gitignored and excluded from ESLint. Tailwind's source detection skips gitignored files, so the demo's JavaScript adds nothing to this site's CSS, and the homepage JS budget (`scripts/check-homepage-js.mjs`) only counts scripts the homepage HTML loads: both are byte-identical with and without the demo.

## Bumping the version

**Automatically.** glassgrid's `release-web.yml` sends a `repository_dispatch` (`glassgrid-release`, with `{version, url, sha256}`) after it publishes a release, if its `PORTFOLIO_DISPATCH_TOKEN` secret is set. `.github/workflows/bump-glassgrid.yml` here then:

1. checks the inputs: `X.Y.Z[-pre]`, the exact `https://github.com/Kaleb-kougl/glassgrid/releases/download/` asset for that version, 64 hex digits;
2. downloads the tarball, checks its sha256, and checks it against the release's own `.sha256`;
3. writes `glassgrid.lock.json` and runs `scripts/fetch-glassgrid.mjs` on the verified file, so the pin is known to install;
4. pushes `glassgrid/v<version>` and opens (or updates) a PR to `main`.

CI runs on that PR like any other, and Vercel builds a preview of it. Merge once both look right.

GitHub delivers `repository_dispatch` only to workflows on the repository's **default branch**, so `bump-glassgrid.yml` has to be there before the first release is sent. The PR it opens always targets `main`, because `ci.yml` runs on pull requests to `main`.

**By hand, from Actions.** Actions → Bump Glassgrid → Run workflow, with the version and the sha256 from the release's `.sha256` file. The URL can stay empty.

**By hand, locally.** Edit the three fields of `glassgrid.lock.json`, run `npm run glassgrid:fetch` (or `npm run build`), and open a PR.

## Secrets

| Repository | Secret | What it is for |
|---|---|---|
| sswe-portfolio (here) | `GLASSGRID_BUMP_TOKEN` | Checkout, push and `gh pr create` in `bump-glassgrid.yml`. Optional, but see below. |
| glassgrid | `PORTFOLIO_DISPATCH_TOKEN` | Sends the `repository_dispatch` to this repository. Fine-grained PAT on `sswe-portfolio` only, **Contents: Read and write**. Setup is in glassgrid's `docs/deploy.md`, step 6. |

**Why `GLASSGRID_BUMP_TOKEN` exists.** A pull request opened with the workflow's own `GITHUB_TOKEN` does not trigger `pull_request` workflows, so `ci.yml` would never run on the bump PR. Without the secret the workflow still opens the PR with `GITHUB_TOKEN`, warns in the run, and says in the PR body that CI has to be started by closing and reopening the PR. That fallback also needs Settings → Actions → General → **Allow GitHub Actions to create and approve pull requests**.

To create it:

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → **Generate new token**.
2. **Resource owner** `Kaleb-kougl`; **Repository access** → Only select repositories → `sswe-portfolio`.
3. **Repository permissions**: **Contents** and **Pull requests**, both **Read and write**. Nothing else. Note the expiry date: the bump falls back to `GITHUB_TOKEN` once it lapses.
4. In this repository: Settings → Secrets and variables → Actions → **New repository secret**, name `GLASSGRID_BUMP_TOKEN`.

## Before merging this for the first time

The pinned URL is a 404 until the glassgrid repository is public and `web-v0.1.0` is released. Until then the `prebuild` step fails `npm run build`, which means CI's build-and-test job **and every Vercel build**. Either publish the release first, or set `GLASSGRID_SKIP=1` in the Vercel project's environment variables for as long as it takes (and remove it afterwards: with it set, production quietly serves no demo).

## Checking a deployment

After the first Vercel preview (and after every bump), from the glassgrid repository:

```sh
scripts/check-deploy.sh https://<preview>.vercel.app/glassgrid/
# a preview behind Deployment Protection:
VERCEL_PROTECTION_BYPASS=<secret> scripts/check-deploy.sh https://<preview>.vercel.app/glassgrid/
```

It passes locally against `next start` with every check (compression included, since `next start` gzips). What only a real deployment can show:

- **`.wasm` is compressed.** `duckdb-eh-*.wasm` should come back with `content-encoding: br` or `gzip`, about 8 MB on the wire instead of 34 MB. Vercel's CDN compresses by content type and `application/wasm` is expected to be on its list; this has not been seen on a live deployment yet. The demo still works if it is not, just slowly on a first visit.
- **The headers reach static files.** `Content-Type: application/wasm` and `application/vnd.apache.parquet`, `Cache-Control: public, max-age=31536000, immutable` on `assets/`, `duckdb-extensions/` and `.parquet`, `max-age=0, must-revalidate` on `index.html` and `.glassgrid`, and the CSP on `/glassgrid`, `/glassgrid?sample=taxi` and `/glassgrid/gallery`. If any is missing, see the fallback under [Cache-Control and Content-Type](#cache-control-and-content-type-on-public-files).
- **Range requests.** `Range: bytes=0-3` on a sample Parquet file returns 206 and `PAR1`; DuckDB-WASM reads Parquet by range.
- **Build output size.** The deployment grows by about 118 MB of static files per version. The build log prints the fetch (`installed 0.1.0 into public/glassgrid (81 files)`), and CI's "Check the Glassgrid demo is unpacked" step prints the size of `public/glassgrid` and `.next`. The largest single file is `duckdb-mvp-*.wasm` at 39 MB.

Then open `/glassgrid/?sample=taxi` in Chrome, Firefox and Safari and use glassgrid's manual checklist (`docs/m4-web-demo.md`).

## One origin, shared with the portfolio

The demo's headers apply only under `/glassgrid`, but storage is per origin, not per path. The portfolio's pages and the demo can see each other's:

- **OPFS**: the demo's Parquet cache, in the folder `glassgrid/parquet`;
- **localStorage**: the demo's theme override, `glassgrid.theme`.

Both names are prefixed, and nothing on the portfolio uses OPFS or a `glassgrid.` key, so they do not collide. Keep it that way: a portfolio feature that clears origin storage would clear the demo's cache too.

The demo's `Cross-Origin-Opener-Policy: same-origin` is set on `/glassgrid` responses only. A link from the homepage opens it in the same tab, so this changes nothing for the portfolio; a `window.open` from the portfolio into `/glassgrid` would get no handle back.
