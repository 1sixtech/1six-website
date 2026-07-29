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
