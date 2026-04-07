import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['three'],
  images: {
    formats: ['image/webp', 'image/avif'],
  },
  experimental: {
    optimizePackageImports: ['gsap', 'three'],
  },
  headers: async () => [
    {
      source: '/resource/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    {
      source: '/logos/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
  ],
};

export default nextConfig;
