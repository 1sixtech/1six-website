import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getContainedMapScale,
  getMapGlyphs,
  MAP_CAMERA_HALF_HEIGHT,
  MAP_DESKTOP_CELL,
  MAP_DESKTOP_GAIN_1X,
  MAP_DESKTOP_GAIN_2X,
  MAP_MOBILE_CELL,
  MAP_MOBILE_GAIN,
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

test('map glyphs: the phone keeps its designed pitch and weight at any ratio', () => {
  for (const ratio of [1, 2, 3]) {
    assert.deepEqual(getMapGlyphs(true, ratio), { cell: MAP_MOBILE_CELL, gain: MAP_MOBILE_GAIN });
  }
});

test('map glyphs: desktop is finer than its 9px design, with weight following the pixel ratio', () => {
  assert.ok(MAP_DESKTOP_CELL < 9, 'finer than the design pitch');
  assert.deepEqual(getMapGlyphs(false, 1), { cell: MAP_DESKTOP_CELL, gain: MAP_DESKTOP_GAIN_1X });
  assert.deepEqual(getMapGlyphs(false, 2), { cell: MAP_DESKTOP_CELL, gain: MAP_DESKTOP_GAIN_2X });
  // Between 1x and 2x the gain moves linearly; outside it is held.
  const half = getMapGlyphs(false, 1.5).gain;
  assert.ok(Math.abs(half - (MAP_DESKTOP_GAIN_1X + MAP_DESKTOP_GAIN_2X) / 2) < 1e-9);
  assert.equal(getMapGlyphs(false, 3).gain, MAP_DESKTOP_GAIN_2X);
  assert.equal(getMapGlyphs(false, 0.8).gain, MAP_DESKTOP_GAIN_1X);
  assert.equal(getMapGlyphs(false, 0).gain, MAP_DESKTOP_GAIN_1X, 'an unknown ratio counts as 1x');
  // Thinner strokes at 1x need the stronger lift.
  assert.ok(MAP_DESKTOP_GAIN_1X > MAP_DESKTOP_GAIN_2X);
});
