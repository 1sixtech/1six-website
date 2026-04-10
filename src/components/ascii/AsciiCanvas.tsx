'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * AsciiCanvas — React wrapper for the AscMosaic Three.js/WebGL library
 *
 * PERFORMANCE STRATEGY:
 * - Lazy-loads ascmosaic only on client side (Three.js requires window/document)
 * - Uses IntersectionObserver to only animate when visible
 * - Destroys WebGL context when scrolled off-screen (max 2 active at once)
 * - Captures last frame as static fallback before disposing
 * - Respects prefers-reduced-motion
 */

interface AsciiCanvasProps {
  /** URL to the source image/video texture (relative to public/) */
  textureUrl: string;
  /** Texture type: 'image' for jpg/png, 'video' for mp4. Default: auto-detect from extension */
  textureType?: 'image' | 'video';
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Mosaic cell size (smaller = more detail, heavier). Default: 8 */
  mosaicSize?: number;
  /** Mosaic cell atlas URL. Default: /resource/mosaic_cell.png */
  mosaicCellUrl?: string;
  /** 3D shape to render. Default: 'plane' */
  shape?: 'plane' | 'sphere' | 'cube';
  /** Enable mouse interaction (avoid/tilt). Default: false */
  mouseInteraction?: boolean;
  /** Additional class names */
  className?: string;
  /** Set selection mode. Default: 'first' */
  setSelectionMode?: 'first' | 'random' | 'cycle' | 'offsetRow';
  /** Use orthographic camera (flat, no perspective). Default: true for planes */
  orthographic?: boolean;
  /** Min brightness 0-100. Default: 0 */
  minBrightness?: number;
  /** Max brightness 0-100. Default: 100 */
  maxBrightness?: number;
  /** Noise intensity 0-1. Default: 0 */
  noiseIntensity?: number;
  /** Number of mosaic cell sets. Default: 1 */
  setCount?: number;
  /** Mouse avoid radius in pixels. Default: 29 */
  avoidRadius?: number;
  /** Mouse avoid strength. Default: 9 */
  avoidStrength?: number;
  /** Plane width (3D units). Default: 5.9 */
  planeWidth?: number;
  /** Plane height (3D units). Default: 4.1 */
  planeHeight?: number;
  /** Model scale (3D units). Default: 1 */
  scale?: number;
  /** Mosaic noise update rate (FPS). Only used when noise is active or paired with randomness */
  noiseFPS?: number;
  /** Fraction of cells that get a random FPS tick each frame (0–1) */
  noiseFPSRandom?: number;
  /** Enable model auto-rotation. Default: false for planes */
  autoRotate?: boolean;
  /** Number of cells per row in the atlas texture. Default: 10 */
  cellCount?: number;
  /** Mouse offset row radius in pixels (for setSelectionMode='offsetRow'). Default: 80 */
  offsetRowRadius?: number;
  /** CSS background color for the canvas container. Shows through discarded mosaic cells. */
  backgroundColor?: string;
  /** Horizontal camera offset in 3D units (positive = show more of the right side). */
  cameraOffsetX?: number;
  /** Internal WebGL render width (higher = denser mosaic). CSS size stays at width. */
  renderWidth?: number;
  /** Internal WebGL render height (higher = denser mosaic). CSS size stays at height. */
  renderHeight?: number;
  /** Render at container_size × renderScale for denser mosaic grids. Survives resize. Default: 1 */
  renderScale?: number;
  /** Skip IntersectionObserver and initialize immediately on mount. Default: false */
  eager?: boolean;
  /** Called once when the mosaic finishes initializing and starts animating */
  onReady?: () => void;
}

// Global WebGL context counter to enforce budget
let activeContextCount = 0;
const MAX_ACTIVE_CONTEXTS = 10;

// Global initialization queue — prevents multiple WebGL contexts from
// initializing simultaneously on page mount/back-navigation, which causes
// main-thread jank from concurrent shader compilation + texture loads.
const initQueue: Array<() => Promise<void>> = [];
let isProcessingQueue = false;

async function enqueueInit(fn: () => Promise<void>) {
  initQueue.push(fn);
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  while (initQueue.length > 0) {
    const next = initQueue.shift()!;
    await next();
    // Yield to main thread between initializations to prevent frame drops
    await new Promise(r => requestAnimationFrame(r));
  }
  isProcessingQueue = false;
}

export function AsciiCanvas({
  textureUrl,
  textureType,
  width,
  height,
  mosaicSize = 8,
  mosaicCellUrl = '/resource/Monotone Cell F_1-1.png',
  shape = 'plane',
  mouseInteraction = false,
  className = '',
  setSelectionMode = 'first',
  orthographic = true,
  minBrightness = 0,
  maxBrightness = 100,
  noiseIntensity = 0,
  setCount = 1,
  avoidRadius = 29,
  avoidStrength = 9,
  planeWidth = 5.9,
  planeHeight = 4.1,
  scale = 1,
  noiseFPS,
  noiseFPSRandom,
  autoRotate,
  cellCount = 10,
  offsetRowRadius,
  backgroundColor,
  renderWidth,
  renderHeight,
  renderScale = 1,
  cameraOffsetX = 0,
  eager = false,
  onReady,
}: AsciiCanvasProps) {
  // Default: no auto-rotation for planes
  const resolvedAutoRotate = autoRotate ?? (shape !== 'plane');
  // Auto-detect texture type from file extension
  const resolvedTextureType = textureType || (textureUrl.endsWith('.mp4') ? 'video' : 'image');
  const containerRef = useRef<HTMLDivElement>(null);
  const mosaicRef = useRef<any>(null); // AscMosaic instance
  const mountedRef = useRef(true);
  const [isVisible, setIsVisible] = useState(eager);
  const [isInitialized, setIsInitialized] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Track visibility via IntersectionObserver (skip if eager)
  useEffect(() => {
    if (eager) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: '200px' } // Pre-load slightly before visible
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [eager]);

  // Initialize/destroy AscMosaic based on visibility
  const initMosaic = useCallback(async () => {
    const container = containerRef.current;
    if (!container || mosaicRef.current || prefersReducedMotion) return;
    if (!mountedRef.current) return; // Component unmounted while queued

    // Check WebGL context budget
    if (activeContextCount >= MAX_ACTIVE_CONTEXTS) {
      return; // Skip, too many active contexts
    }

    try {
      // Remove any leftover canvases from previous instances
      container.querySelectorAll('canvas').forEach(c => c.remove());

      // Dynamic import to avoid SSR issues with Three.js
      const { AscMosaic } = await import('@/lib/ascmosaic');

      const mosaic = new AscMosaic(container, {
        orthographic,
        autoRotate: resolvedAutoRotate,
      });
      mosaicRef.current = mosaic;
      activeContextCount++;

      // If renderWidth/renderHeight specified, set higher internal resolution
      // Canvas CSS size stays at container size, but WebGL renders at higher res
      if (renderWidth && renderHeight) {
        mosaic.setCanvasSize(renderWidth, renderHeight);
        const canvas = mosaic.getRenderer().domElement;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
      }

      // If renderScale specified, render at container_size × scale.
      // This survives window resize events (handled in ascmosaic).
      if (renderScale > 1) {
        mosaic.setRenderScale(renderScale);
      }

      // Add model with texture (supports both image and video)
      await mosaic.addModel({
        shape,
        textureUrl,
        textureType: resolvedTextureType,
        width: planeWidth,
        height: planeHeight,
        scale,
      });

      // Bail if the component unmounted OR if destroyMosaic raced us while
      // addModel was awaiting. mountedRef alone is not enough: destroyMosaic
      // only clears mosaicRef.current (it never touches mountedRef), so a
      // rapid Hero <-> Thesis toggle can leave mountedRef === true while our
      // local `mosaic` has already been disposed by destroyMosaic. Trusting
      // mountedRef in that state would send enableAsciiMosaicFilter to a
      // disposed AscMosaic, whose internal filter reference is already null,
      // making the ready-state poll time out after 5s.
      if (!mountedRef.current || mosaicRef.current !== mosaic) {
        mosaic.stopAnimate();
        mosaic.dispose();
        if (mosaicRef.current === mosaic) {
          activeContextCount = Math.max(0, activeContextCount - 1);
          mosaicRef.current = null;
        }
        return;
      }

      // Enable ASCII mosaic filter with all options at once
      await mosaic.enableAsciiMosaicFilter({
        mosaicSize,
        mosaicCellTextureUrl: mosaicCellUrl,
        cellCount,
        setSelectionMode,
        setCount,
        minBrightness,
        maxBrightness,
        noiseIntensity,
        noiseFPS,
        noiseFPSRandom,
        offsetRowRadius,
        avoid: mouseInteraction,
        avoidRadius: mouseInteraction ? avoidRadius : undefined,
        avoidStrength: mouseInteraction ? avoidStrength : undefined,
      });

      // Second race check: enableAsciiMosaicFilter internally polls for up
      // to 5 seconds, and destroyMosaic can run at any point during that
      // window. If we raced, discard this now-orphaned instance instead of
      // calling animate() on a disposed renderer.
      if (!mountedRef.current || mosaicRef.current !== mosaic) {
        mosaic.stopAnimate();
        mosaic.dispose();
        if (mosaicRef.current === mosaic) {
          activeContextCount = Math.max(0, activeContextCount - 1);
          mosaicRef.current = null;
        }
        return;
      }

      // Offset camera horizontally (e.g. to show right side of graph on mobile)
      if (cameraOffsetX !== 0) {
        const cam = mosaic.getCamera();
        cam.position.x += cameraOffsetX;
      }

      // Start animation
      mosaic.animate();
      setIsInitialized(true);
      onReady?.();
    } catch (err) {
      console.warn('AsciiCanvas: Failed to initialize AscMosaic:', err);
    }
  }, [textureUrl, resolvedTextureType, mosaicSize, mosaicCellUrl, shape, mouseInteraction, setSelectionMode, orthographic, minBrightness, maxBrightness, noiseIntensity, setCount, avoidRadius, avoidStrength, planeWidth, planeHeight, scale, noiseFPS, noiseFPSRandom, prefersReducedMotion, resolvedAutoRotate, cellCount, offsetRowRadius, renderWidth, renderHeight, renderScale, cameraOffsetX]);

  const destroyMosaic = useCallback(() => {
    const mosaic = mosaicRef.current;
    if (!mosaic) return;

    try {
      mosaic.stopAnimate();
      mosaic.dispose();
      activeContextCount = Math.max(0, activeContextCount - 1);
    } catch (err) {
      console.warn('AsciiCanvas: Error during disposal:', err);
    }
    mosaicRef.current = null;
    setIsInitialized(false);
  }, []);

  // Lifecycle: init when visible, destroy when not
  // Also reinit when initMosaic changes (e.g. theme-driven cell atlas swap)
  // Uses global queue to stagger WebGL initialization and prevent jank.
  useEffect(() => {
    if (isVisible) {
      if (mosaicRef.current) {
        destroyMosaic();
      }
      enqueueInit(initMosaic);
    } else if (!isVisible && mosaicRef.current) {
      destroyMosaic();
    }
  }, [isVisible, initMosaic, destroyMosaic]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      destroyMosaic();
    };
  }, [destroyMosaic]);

  // Set canvas size when dimensions change
  useEffect(() => {
    if (mosaicRef.current && width && height) {
      mosaicRef.current.setCanvasSize(width, height);
    }
  }, [width, height]);

  // Reduced motion fallback: show source media directly (supports both image and video)
  if (prefersReducedMotion) {
    const isVideo = resolvedTextureType === 'video';
    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden ${className}`}
        style={{ width, height, backgroundColor }}
      >
        {isVideo ? (
          <video
            src={textureUrl}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover opacity-30 grayscale"
          />
        ) : (
          <img
            src={textureUrl}
            alt=""
            className="h-full w-full object-cover opacity-30 grayscale"
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ width, height, backgroundColor }}
    >
      {/* Loading skeleton while initializing */}
      {!isInitialized && (
        <div className="absolute inset-0 animate-pulse"
          style={{ backgroundColor: 'var(--color-card)' }} />
      )}

      {/* AscMosaic will inject its canvas into this container */}
    </div>
  );
}
