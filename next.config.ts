import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['three'],
  images: {
    formats: ['image/webp', 'image/avif'],
  },
  experimental: {
    optimizePackageImports: ['gsap', 'three'],
  },
};

export default nextConfig;
