/**
 * CSS-pixel mosaic options mapped to the device pixels a canvas draws at.
 *
 * AsciiCanvas can draw its output at the device pixel ratio (up to a cap)
 * instead of a 1x canvas the screen stretches 2-3x. Every option measured in
 * pixels scales by the same ratio, so the grid, the radii and the cursor push
 * keep their CSS size; the scene target stays at CSS pixels, since the mosaic
 * reads it only once per cell.
 */

/** The ratio the output is drawn at: the device's, within [1, cap]. */
export function outputPixelRatio(devicePixelRatio: number, cap: number): number {
  return Math.max(1, Math.min(devicePixelRatio || 1, cap));
}

export interface CssPixelOptions {
  mosaicSize: number;
  offsetRowRadius?: number;
  avoidRadius?: number;
  avoidStrength?: number;
}

export interface DevicePixelOptions {
  mosaicSize: number;
  offsetRowRadius: number | undefined;
  avoidRadius: number | undefined;
  avoidStrength: number | undefined;
  /** The scene target's size relative to the output (see AsciiMosaicFilterOptions.targetScale). */
  targetScale: number;
}

export function toDevicePixels(css: CssPixelOptions, pixelRatio: number): DevicePixelOptions {
  const scale = (value: number | undefined) => (value === undefined ? undefined : value * pixelRatio);
  return {
    mosaicSize: css.mosaicSize * pixelRatio,
    offsetRowRadius: scale(css.offsetRowRadius),
    avoidRadius: scale(css.avoidRadius),
    avoidStrength: scale(css.avoidStrength),
    targetScale: 1 / pixelRatio,
  };
}
