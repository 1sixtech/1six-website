'use client';

import { useRef, useEffect, useState, useCallback, useMemo, type SyntheticEvent } from 'react';
import { useDevicePixelRatio } from '@/hooks/useDevicePixelRatio';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import * as videoPool from '@/lib/videoPool';
import { warmedAssetSource } from '@/lib/assetWarmup';
import { outputPixelRatio, toDevicePixels } from './pixelScale';
// Type only: the class itself is imported dynamically (Three.js stays out of SSR).
import type { AscMosaic } from '@/lib/ascmosaic';

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
  /**
   * Draw the output at the device pixel ratio, up to this cap, so glyphs are
   * crisp on high-density screens instead of a 1x canvas stretched 2-3x.
   * Every pixel-sized option (mosaicSize, radii) scales with it, so the grid
   * keeps its CSS size; the scene target stays at CSS pixels. Follows the
   * ratio when it changes (a window moved to another screen). Default: 1 (off).
   */
  pixelRatioCap?: number;
  /** Glyphs drawn at their exact pixel coverage (see AsciiMosaicFilterOptions.smoothCells). Default: false */
  smoothCells?: boolean;
  /** Glyph coverage multiplier with smoothCells (see AsciiMosaicFilterOptions.cellGain). Default: 1 */
  cellGain?: number;
  /**
   * Still image sources only: draw just the frames that can change (the noise
   * ticks) instead of every display frame. See AscMosaic.setRenderOnDemand.
   * Default: false
   */
  renderOnDemand?: boolean;
  /**
   * The moment (seconds) a video source holds when the mosaic is replaced by
   * the source itself (reduced motion, or WebGL unavailable). Default: 0.1
   */
  fallbackFrameTime?: number;
  /** Skip IntersectionObserver and initialize immediately on mount. Default: false */
  eager?: boolean;
  /** Called when a drawable mosaic or fallback media frame is ready. */
  onReady?: () => void;
}

// Global WebGL context counter to enforce budget.
// 14 is chosen as a safety margin below WebKit's empirical 16-context limit
// while accommodating the homepage's 11 homepage-target pre-warm + headroom
// for context-loss recovery. See design spec §6.2.
let activeContextCount = 0;
const MAX_ACTIVE_CONTEXTS = 14;

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
  pixelRatioCap = 1,
  smoothCells = false,
  cellGain = 1,
  renderOnDemand = false,
  fallbackFrameTime = 0.1,
  cameraOffsetX = 0,
  eager = false,
  onReady,
}: AsciiCanvasProps) {
  const fallbackSource = useMemo(() => warmedAssetSource(textureUrl), [textureUrl]);

  // Default: no auto-rotation for planes
  const resolvedAutoRotate = autoRotate ?? (shape !== 'plane');
  // Auto-detect texture type from file extension
  const resolvedTextureType = textureType || (textureUrl.endsWith('.mp4') ? 'video' : 'image');
  const containerRef = useRef<HTMLDivElement>(null);
  const mosaicRef = useRef<AscMosaic | null>(null);
  const mountedRef = useRef(true);
  const [isVisible, setIsVisible] = useState(eager);
  const [isInitialized, setIsInitialized] = useState(false);
  // Eager canvases skip the init/destroy observer below and therefore never
  // tear down off-screen. Track on-screen state separately so we can pause
  // the video decoder + render loop while scrolled away — see the comment on
  // AscMosaic.setVideoPlaying for why leaving every homepage video decoding
  // at once breaks ASCII rendering on memory-constrained iOS devices.
  const [isOnScreen, setIsOnScreen] = useState(true);
  // WebGL could not start (no context, a failed init): show the source still,
  // for the rest of this mount. The ref keeps later inits (a theme or pixel
  // ratio change) from building a canvas inside the fallback.
  const [failed, setFailed] = useState(false);
  const failedRef = useRef(false);
  // The latest init request. A queued init that a newer one superseded (a
  // prop change while it waited its turn) skips, so the newest props build.
  const initTokenRef = useRef(0);
  const prefersReducedMotion = useReducedMotion();
  // Output density (pixelRatioCap > 1): a change, such as the window moving to
  // a screen of another density, re-runs the init below at the new ratio.
  const devicePixelRatio = useDevicePixelRatio();
  const pixelRatio = outputPixelRatio(devicePixelRatio, pixelRatioCap);

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

  // Eager canvases never tear down off-screen (the observer above is skipped),
  // so without this they keep decoding video forever. This separate observer
  // pauses the decoder + render loop while off-screen and resumes on return.
  // Gated to eager: non-eager canvases already release the whole context
  // off-screen via the init/destroy effect below.
  useEffect(() => {
    if (!eager) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsOnScreen(entry.isIntersecting),
      { rootMargin: '200px' } // resume slightly before visible to avoid a blank frame
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [eager]);

  // Apply on-screen state to the live mosaic: pause the video decoder and
  // stop the render loop when off-screen, resume when back on-screen. Guarded
  // on isInitialized so it only acts once the mosaic exists. The init path
  // marks the canvas ready before this can pause it, so the intro is unaffected.
  useEffect(() => {
    const mosaic = mosaicRef.current;
    if (!mosaic || !isInitialized) return;
    if (isOnScreen) {
      mosaic.animate();
      mosaic.setVideoPlaying(true);
    } else {
      mosaic.stopAnimate();
      mosaic.setVideoPlaying(false);
    }
  }, [isOnScreen, isInitialized]);

  // Initialize/destroy AscMosaic based on visibility
  const initMosaic = useCallback(async (token: number) => {
    // Superseded while it waited in the queue: the newer request builds.
    if (token !== initTokenRef.current || failedRef.current) return;
    const container = containerRef.current;
    if (!container || mosaicRef.current || prefersReducedMotion) return;
    if (!mountedRef.current) return; // Component unmounted while queued

    // Check WebGL context budget
    if (activeContextCount >= MAX_ACTIVE_CONTEXTS) {
      return; // Skip, too many active contexts
    }

    // Hoisted so the catch block can clean up the partially-constructed
    // mosaic. Originally declared inside the try, which made the catch
    // block blind to a failed instance and leaked activeContextCount +
    // mosaicRef (Codex review C3).
    let mosaic: AscMosaic | null = null;

    try {
      const pendingVideo = resolvedTextureType === 'video' ? videoPool.getWarmup(textureUrl) : undefined;
      const existingVideo = pendingVideo ? await pendingVideo.catch(() => undefined) : undefined;
      if (!mountedRef.current || token !== initTokenRef.current) return;

      // Remove any leftover canvases from previous instances
      container.querySelectorAll('canvas').forEach(c => c.remove());

      // Dynamic import to avoid SSR issues with Three.js
      const { AscMosaic } = await import('@/lib/ascmosaic');
      if (!mountedRef.current || token !== initTokenRef.current) return;

      mosaic = new AscMosaic(container, {
        orthographic,
        autoRotate: resolvedAutoRotate,
        // The mosaic draws axis-aligned cells on the pixel grid and the scene
        // renders to its own target, so multisampling changes no pixel; it
        // only multiplies the drawing buffer's memory (4x at 2x output).
        antialias: false,
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

      // Output at the device pixel ratio when asked (pixelRatioCap > 1): the
      // pixel-sized options below scale by the same factor, so cells keep
      // their CSS size and only get sharper.
      const outputScale = renderScale * pixelRatio;
      const device = toDevicePixels({
        mosaicSize,
        offsetRowRadius,
        avoidRadius: mouseInteraction ? avoidRadius : undefined,
        avoidStrength: mouseInteraction ? avoidStrength : undefined,
      }, pixelRatio);

      // If renderScale specified, render at container_size × scale.
      // This survives window resize events (handled in ascmosaic).
      if (outputScale > 1) {
        mosaic.setRenderScale(outputScale);
      }

      // Add model with texture (supports both image and video).
      // For video textures, try the videoPool first — if a warmed element
      // exists, AscMosaic reuses it and skips the network fetch path.
      await mosaic.addModel({
        shape,
        textureUrl: warmedAssetSource(textureUrl),
        textureType: resolvedTextureType,
        width: planeWidth,
        height: planeHeight,
        scale,
        existingVideo,
      });

      // Bail if the component unmounted OR if destroyMosaic raced us while
      // addModel was awaiting. mountedRef alone is not enough: destroyMosaic
      // only clears mosaicRef.current (it never touches mountedRef), so a
      // rapid Hero <-> Thesis toggle can leave mountedRef === true while our
      // local `mosaic` has already been disposed by destroyMosaic. Trusting
      // mountedRef in that state would send enableAsciiMosaicFilter to a
      // disposed AscMosaic, whose internal filter reference is already null,
      // making the ready-state poll time out after 5s.
      if (!mountedRef.current || mosaicRef.current !== mosaic || token !== initTokenRef.current) {
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
        mosaicSize: device.mosaicSize,
        mosaicCellTextureUrl: warmedAssetSource(mosaicCellUrl),
        cellCount,
        setSelectionMode,
        setCount,
        minBrightness,
        maxBrightness,
        noiseIntensity,
        noiseFPS,
        noiseFPSRandom,
        offsetRowRadius: device.offsetRowRadius,
        avoid: mouseInteraction,
        avoidRadius: device.avoidRadius,
        avoidStrength: device.avoidStrength,
        smoothCells,
        cellGain,
        // The scene is read once per cell: keep its target at CSS pixels.
        targetScale: device.targetScale,
      });

      await mosaic.waitForSceneTextures();

      // Second race check: enableAsciiMosaicFilter internally polls for up
      // to 5 seconds, and destroyMosaic can run at any point during that
      // window. If we raced, discard this now-orphaned instance instead of
      // calling animate() on a disposed renderer.
      if (!mountedRef.current || mosaicRef.current !== mosaic || token !== initTokenRef.current) {
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

      // A still image only changes when the mosaic's own clock ticks.
      if (renderOnDemand && resolvedTextureType === 'image') {
        mosaic.setRenderOnDemand(true);
      }

      // Start animation
      mosaic.animate();
      setIsInitialized(true);
      onReady?.();
    } catch (err) {
      // A newer request or a teardown that overtook this init (its filter
      // was replaced or disposed while it got ready) is not a failure.
      const superseded = !mountedRef.current
        || token !== initTokenRef.current
        || (mosaic !== null && mosaicRef.current !== mosaic);
      if (!superseded) console.warn('AsciiCanvas: Failed to initialize AscMosaic:', err);
      // Init-failure cleanup (Codex review C3 + C4).
      //
      // C3: if `mosaic` was constructed before the throw (addModel,
      //     enableAsciiMosaicFilter, or a race check failed), we leaked
      //     the WebGL context + activeContextCount + mosaicRef until the
      //     component unmounted. Since the `mosaicRef.current` guard at
      //     the top of initMosaic blocks retries, that leak was
      //     permanent for the canvas's lifetime and would eventually
      //     exhaust MAX_ACTIVE_CONTEXTS across failures. Dispose the
      //     instance, clear the ref, and decrement the counter.
      //
      if (mosaic) {
        try {
          mosaic.stopAnimate();
          mosaic.dispose();
        } catch {
          // Best-effort cleanup — disposing a partially-constructed
          // mosaic may hit null references internally. Ignore.
        }
        if (mosaicRef.current === mosaic) {
          activeContextCount = Math.max(0, activeContextCount - 1);
          mosaicRef.current = null;
        }
      }
      if (!superseded) {
        // WebGL could not start here. Mount the source still; its load/seek
        // event reports readiness only once a frame can actually be shown.
        failedRef.current = true;
        setFailed(true);
      }
    }
  }, [textureUrl, resolvedTextureType, mosaicSize, mosaicCellUrl, shape, mouseInteraction, setSelectionMode, orthographic, minBrightness, maxBrightness, noiseIntensity, setCount, avoidRadius, avoidStrength, planeWidth, planeHeight, scale, noiseFPS, noiseFPSRandom, prefersReducedMotion, resolvedAutoRotate, cellCount, offsetRowRadius, renderWidth, renderHeight, renderScale, pixelRatio, smoothCells, cellGain, renderOnDemand, cameraOffsetX]);

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
    // Every request supersedes the ones before it, queued or in flight.
    const token = ++initTokenRef.current;
    if (isVisible) {
      if (mosaicRef.current) {
        destroyMosaic();
      }
      enqueueInit(() => initMosaic(token));
    } else if (mosaicRef.current) {
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

  const handleStillVideoReady = (event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    if (video.readyState >= 2 && !video.seeking) onReady?.();
  };

  // Reduced motion (or WebGL unavailable): show the source media directly,
  // still. Video sources render a single frame (the #t media fragment makes
  // Safari paint it without playback) instead of an autoplaying loop, which
  // is motion.
  if (prefersReducedMotion || failed) {
    const isVideo = resolvedTextureType === 'video';
    // data-ascii-still lets a page blend the source media into its ground
    // (globals.css, about.css), whichever of the two put it here.
    return (
      <div
        ref={containerRef}
        data-ascii-still=""
        className={`relative overflow-hidden ${className}`}
        style={{ width, height, backgroundColor }}
      >
        {isVideo ? (
          <video
            src={`${fallbackSource}#t=${fallbackFrameTime}`}
            muted
            playsInline
            preload="metadata"
            onLoadedData={handleStillVideoReady}
            onSeeked={handleStillVideoReady}
            aria-hidden="true"
            tabIndex={-1}
            className="h-full w-full object-cover opacity-30 grayscale"
          />
        ) : (
          <img
            src={fallbackSource}
            alt=""
            onLoad={onReady}
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
