import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    optimizePackageImports: ['three', 'lucide-react'],
  },
};

export default nextConfig;
