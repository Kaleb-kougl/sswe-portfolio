import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
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
