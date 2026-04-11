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
  allowedDevOrigins: ['10.96.231.6', '172.30.1.74'],
  transpilePackages: ['three'],
  images: {
    formats: ['image/webp', 'image/avif'],
  },
  experimental: {
    // NOTE: 'gsap' was removed from optimizePackageImports because Turbopack's
    // barrel-file tree-shaker strips GSAP's internal ticker and plugin
    // registrations, leaving tweens that never tick and plugins (CSSPlugin,
    // AttrPlugin) that never register. Without this, the intro logo fill
    // animation silently never runs. Three is still safe.
    optimizePackageImports: ['three'],
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
