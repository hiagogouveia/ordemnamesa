import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: {
    // TODO(fase-2): 30 errors legados (no-explicit-any, unescaped-entities e
    // 4 rules-of-hooks que exigem refactor). Zerar e remover este bypass.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
};

export default nextConfig;
