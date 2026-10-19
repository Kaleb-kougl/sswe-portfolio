import path from "node:path";
import type { NextConfig } from "next";

import {
  glassgridHeaders,
  glassgridRewrites,
  loadGlassgridHosting,
} from "./src/lib/glassgrid-hosting";

// The Glassgrid demo, served from public/glassgrid/ at /glassgrid/. Its
// release ships the headers (CSP with 'wasm-unsafe-eval', COOP, cache and
// content types) and rewrites it needs; scripts/fetch-glassgrid.mjs unpacks
// it before `next build` and src/lib/glassgrid-hosting.ts validates the
// manifest. Absent (GLASSGRID_SKIP=1), this is null and adds nothing. See
// docs/glassgrid-hosting.md.
const glassgrid = loadGlassgridHosting(__dirname);

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Ship browser source maps. Next disables them in production by default to
  // avoid leaking source — but this repo is public
  // (github.com/Kaleb-kougl/sswe-portfolio), so there is nothing to leak, and
  // a portfolio whose argument is its implementation is better off readable.
  // It also lets Lighthouse map its findings back to real files.
  //
  // Costs, per `node_modules/next/dist/docs/01-app/03-api-reference/05-config/
  // 01-next-config-js/productionBrowserSourceMaps.md`: longer builds and more
  // memory during `next build`. Under Turbopack this is the right lever —
  // `turbopackSourceMaps` defaults to this flag for builds (08-turbopack.md).
  productionBrowserSourceMaps: true,
  // Pin Turbopack's root to this folder. Without it, Next infers the root from
  // the nearest lockfile, which can resolve to a parent directory (e.g.
  // ~/Documents) and crash HMR with "needs to be on project filesystem".
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    optimizePackageImports: ['three', 'lucide-react'],
  },
  // `trailingSlash` stays at its default (false): Glassgrid's header sources
  // are written for `/glassgrid/` being answered with a 308 to `/glassgrid`.
  async headers() {
    // Site-wide rules, if any are ever added, go BEFORE the demo's: the later
    // rule wins for the same header key, and the demo's CSP must win under
    // /glassgrid.
    return [...glassgridHeaders(glassgrid)];
  },
  async rewrites() {
    // afterFiles, not beforeFiles: public files are checked first, so every
    // real file under public/glassgrid/ is served as itself and only the
    // app's routes fall through to its index.html (rewrites.md).
    return { beforeFiles: [], afterFiles: glassgridRewrites(glassgrid), fallback: [] };
  },
};

export default nextConfig;
