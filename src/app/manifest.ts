import type { MetadataRoute } from 'next';
import { ICON_VERSION } from '@/lib/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '1SIX Technologies',
    short_name: '1SIX',
    description: 'The next wave of global finance — built on behavior, not hope.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#FF3700',
    icons: [
      {
        src: `/favicon.png?v=${ICON_VERSION}`,
        sizes: '192x192',
        type: 'image/png',
      },
    ],
  };
}
