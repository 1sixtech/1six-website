import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Explicitly pin the workspace root to THIS directory. Without this, Next.js
// walks upward looking for a lockfile and can land on an unrelated
// package-lock.json in a parent directory (e.g. $HOME), which triggers the
// "Next.js inferred your workspace root" build warning.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';
const cspHeader = [
  "default-src 'self'",
  // Static App Router output still includes Next.js inline runtime scripts.
  // Keep the official baseline CSP here unless the site is moved to nonce-based
  // dynamic rendering.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

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
    //
    // Do not enable experimental.sri here. On the current Next 16 +
    // Turbopack production path, the emitted integrity attribute for at
    // least the core turbopack runtime chunk does not match the served
    // asset on Vercel, which causes browsers to block the script and
    // leaves the client unhydrated behind the intro overlay.
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
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: cspHeader },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        {
          key: 'Permissions-Policy',
          value: 'accelerometer=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()',
        },
      ],
    },
    {
      source: '/resource/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
  ],
};

export default nextConfig;
