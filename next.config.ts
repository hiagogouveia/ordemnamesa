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
  async headers() {
    // Headers de segurança aplicados a todas as respostas. Sem CSP estrita por ora
    // (Tailwind v4 + estilos inline + JSON-LD exigiriam ajuste fino) — o foco aqui é
    // fechar clickjacking, MIME sniffing, downgrade de TLS e vazamento de referrer.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
