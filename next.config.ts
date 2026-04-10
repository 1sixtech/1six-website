import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Explicitly pin the workspace root to THIS directory. Without this, Next.js
// walks upward looking for a lockfile and can land on an unrelated
// package-lock.json in a parent directory (e.g. $HOME), which triggers the
// "Next.js inferred your workspace root" build warning.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
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
