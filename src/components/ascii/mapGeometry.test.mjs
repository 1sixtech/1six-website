import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getContainedMapScale,
  MAP_CAMERA_HALF_HEIGHT,
  MAP_PLANE_HEIGHT,
  MAP_PLANE_WIDTH,
} from './mapGeometry.ts';

test('contained map scale keeps the full plane inside the camera', () => {
  for (const aspect of [375 / 540, 3 / 2, 1010 / 460]) {
    const cameraHeight = 2 * MAP_CAMERA_HALF_HEIGHT;
    const cameraWidth = cameraHeight * aspect;
    const scale = getContainedMapScale(aspect);

    assert.ok(MAP_PLANE_WIDTH * scale <= cameraWidth);
    assert.ok(MAP_PLANE_HEIGHT * scale <= cameraHeight);
  }
});

test('matching 3:2 camera displays the full map without unused space', () => {
  const scale = getContainedMapScale(3 / 2);

  assert.equal(MAP_PLANE_WIDTH * scale, 15);
  assert.equal(MAP_PLANE_HEIGHT * scale, 10);
});
