'use client';

import { useEffect } from 'react';

/**
 * Prefetches all site assets during browser idle time.
 *
 * Strategy:
 * 1. Critical below-fold assets (About videos, product videos) — prefetch first
 * 2. Images and textures (mosaic cells, map, earth) — prefetch second
 * 3. Team page assets (team symbol video, investor logos) — prefetch last
 *
 * Uses requestIdleCallback to avoid competing with initial page rendering,
 * and <link rel="prefetch"> for low-priority background fetching.
 */
export function AssetPrefetcher() {
  useEffect(() => {
    // Skip prefetching on slow connections
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || conn?.effectiveType === '2g') return;

    const prefetched = new Set<string>();

    function prefetch(href: string) {
      if (prefetched.has(href)) return;
      prefetched.add(href);
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      // Help the browser know what type of resource to expect
      // Note: omit `as` for videos — `prefetch` + `as="video"` has inconsistent browser support
      if (href.endsWith('.webp') || href.endsWith('.jpg') || href.endsWith('.png')) link.as = 'image';
      else if (href.endsWith('.svg')) link.as = 'image';
      document.head.appendChild(link);
    }

    function prefetchBatch(urls: string[], onDone?: () => void) {
      let i = 0;
      function next() {
        if (i >= urls.length) {
          onDone?.();
          return;
        }
        prefetch(urls[i++]);
        // Use requestIdleCallback for each item to stay non-blocking
        if ('requestIdleCallback' in window) {
          requestIdleCallback(next);
        } else {
          setTimeout(next, 50);
        }
      }
      next();
    }

    // --- Batch 1: Below-fold videos on the home page (highest value) ---
    const homepageVideos = [
      '/resource/Source_About 01.mp4',
      '/resource/Source_About 02.mp4',
      '/resource/Source_About 03.mp4',
      '/resource/Source_About 04.mp4',
      '/resource/Source_About 05.mp4',
      '/resource/Source_About 06.mp4',
      '/resource/Source_Graph.mp4',
      '/resource/Source_Nevada TV.mp4',
      '/resource/Source_Nevada Trade.mp4',
      '/resource/Source_World map.webp',
    ];

    // --- Batch 2: Mosaic cell images and textures ---
    const images = [
      '/resource/Monotone Cell F_1-1.png',
      '/resource/Monotone Cell F_1-2.png',
      '/resource/Monotone Cell F_2-1.png',
      '/resource/Monotone Cell F_2-2.png',
      '/resource/Monotone Cell F_3-1.png',
      '/resource/Monotone Cell F_3-2.png',
      '/resource/Monotone Cell F_4-1.png',
      '/resource/Monotone Cell F_5-1.png',
      '/resource/Monotone Cell F_5-2.png',
      '/resource/earth.jpg',
      '/resource/mosaic_cell.png',
    ];

    // --- Batch 3: Team page assets (next-page prefetch) ---
    const teamPageAssets = [
      '/resource/Source_Team symbol.mp4',
      '/logos/Harvard.svg',
      '/logos/MIT.svg',
      '/logos/Ethereum.svg',
      '/logos/Tsinghua.svg',
      '/logos/Schwarzman.svg',
      '/logos/_ICPC.svg',
      '/logos/Codeforces.svg',
      '/logos/Ergodic.svg',
      '/logos/Lambda.svg',
      '/logos/Lemniscap.svg',
      '/logos/Needham.svg',
      '/logos/Starknet.svg',
    ];

    // Start prefetching after a short delay to let the page settle
    const timer = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          prefetchBatch(homepageVideos, () => {
            prefetchBatch(images, () => {
              prefetchBatch(teamPageAssets);
            });
          });
        });
      } else {
        // Fallback: start after 2s
        prefetchBatch(homepageVideos, () => {
          prefetchBatch(images, () => {
            prefetchBatch(teamPageAssets);
          });
        });
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Prefetch the team page route via dynamic link injection (same as other assets)
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = '/team';
    document.head.appendChild(link);
  }, []);

  return null;
}
