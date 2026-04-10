import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['10.96.231.6', '192.168.0.108'],
  transpilePackages: ['three'],
  images: {
    formats: ['image/webp', 'image/avif'],
  },
  experimental: {
    optimizePackageImports: ['gsap', 'three'],
  },
  redirects: async () => [
    {
      source: '/team',
      destination: '/about',
      permanent: true,
    },
  ],
  headers: async () => [
    {
      source: '/resource/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
  ],
};

export default nextConfig;
