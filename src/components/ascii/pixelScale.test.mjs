import assert from 'node:assert/strict';
import test from 'node:test';
import { outputPixelRatio, toDevicePixels } from './pixelScale.ts';

test('the output ratio is the device ratio, within [1, cap]', () => {
  assert.equal(outputPixelRatio(2, 2), 2);
  assert.equal(outputPixelRatio(3, 2), 2, 'a 3x phone draws at the cap');
  assert.equal(outputPixelRatio(1.5, 2), 1.5, 'fractional ratios pass through');
  assert.equal(outputPixelRatio(2, 1), 1, 'cap 1 (every canvas but the map) never scales');
  assert.equal(outputPixelRatio(0.75, 2), 1, 'zoomed out below 1x still draws at 1x');
  assert.equal(outputPixelRatio(0, 2), 1, 'an unknown ratio counts as 1');
});

test('every pixel-sized option keeps its CSS size at any ratio, and the target stays at CSS pixels', () => {
  const css = { mosaicSize: 9, offsetRowRadius: 20, avoidRadius: 29, avoidStrength: 9 };
  for (const ratio of [1, 1.5, 2]) {
    const device = toDevicePixels(css, ratio);
    for (const key of Object.keys(css)) {
      assert.equal(device[key], css[key] * ratio, `${key} at ${ratio}x`);
    }
    assert.equal(device.targetScale, 1 / ratio, `targetScale at ${ratio}x`);
  }
});

test('options left unset stay unset (the filter keeps its own defaults)', () => {
  assert.deepEqual(toDevicePixels({ mosaicSize: 5 }, 2), {
    mosaicSize: 10,
    offsetRowRadius: undefined,
    avoidRadius: undefined,
    avoidStrength: undefined,
    targetScale: 0.5,
  });
});
