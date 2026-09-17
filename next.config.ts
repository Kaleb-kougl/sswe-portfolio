import path from "node:path";
import type { NextConfig } from "next";

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
};

export default nextConfig;
