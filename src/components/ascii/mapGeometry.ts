// Keep this in sync with AscMosaic's orthographic camera half-height.
export const MAP_CAMERA_HALF_HEIGHT = 5;
export const MAP_PLANE_WIDTH = 6;
export const MAP_PLANE_HEIGHT = 4;
export const MAP_ASPECT = MAP_PLANE_WIDTH / MAP_PLANE_HEIGHT;

export function getContainedMapScale(containerAspect = MAP_ASPECT): number {
  const cameraHeight = 2 * MAP_CAMERA_HALF_HEIGHT;
  const cameraWidth = cameraHeight * containerAspect;

  return Math.min(
    cameraWidth / MAP_PLANE_WIDTH,
    cameraHeight / MAP_PLANE_HEIGHT,
  );
}

/**
 * Glyph pitch in CSS px. The phone follows its design (Figma 834:2920). On
 * desktop the 9px of the design read as a coarse grid of large glyphs; 6px
 * gives the map 168 glyphs across instead of 112, about 1.5x the detail, and
 * costs the same to draw: the fill is set by the canvas's pixels, not by how
 * many cells cut it up.
 */
export const MAP_MOBILE_CELL = 5;
export const MAP_DESKTOP_CELL = 6;

/**
 * Glyph weight (AsciiMosaicFilterOptions.cellGain). The strokes are about 6%
 * of a cell wide, so a 6px cell on a 1x screen draws them at a third of a
 * pixel: they need more lift there to read than at 12 device pixels on a 2x
 * screen. Between 1x and 2x the gain follows the pixel ratio. Tuned by eye
 * and by ink: at 1.9 the 1x strokes read as dark rings while the map stays
 * within a third of the 2x tone (2.2 made it half again as dark).
 */
export const MAP_MOBILE_GAIN = 1.3;
export const MAP_DESKTOP_GAIN_1X = 1.9;
export const MAP_DESKTOP_GAIN_2X = 1.6;

/** The map's glyph pitch and weight for a layout and a device pixel ratio. */
export function getMapGlyphs(isMobile: boolean, devicePixelRatio: number): { cell: number; gain: number } {
  if (isMobile) return { cell: MAP_MOBILE_CELL, gain: MAP_MOBILE_GAIN };
  const density = Math.min(1, Math.max(0, (devicePixelRatio || 1) - 1));
  return {
    cell: MAP_DESKTOP_CELL,
    gain: MAP_DESKTOP_GAIN_1X + (MAP_DESKTOP_GAIN_2X - MAP_DESKTOP_GAIN_1X) * density,
  };
}
