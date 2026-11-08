import assert from 'node:assert/strict';
import test from 'node:test';
import { crossingProgress } from './crossingProgress.ts';

test('the crossing starts at 16%, follows scroll continuously, and ends at 100%', () => {
  assert.equal(crossingProgress(-100, 0, 1000), 16);
  assert.equal(crossingProgress(0, 0, 1000), 16);
  assert.equal(crossingProgress(250, 0, 1000), 37);
  assert.equal(crossingProgress(500, 0, 1000), 58);
  assert.ok(Math.abs(crossingProgress(501, 0, 1000) - 58.084) < 0.00001);
  assert.equal(crossingProgress(1000, 0, 1000), 100);
  assert.equal(crossingProgress(1200, 0, 1000), 100);
});

test('a fully visible story is complete; a page offset does not change its progress', () => {
  assert.equal(crossingProgress(0, 0, 0), 100);
  assert.equal(crossingProgress(0, 0, -10), 100);
  assert.equal(crossingProgress(700, 200, 1200), 58);
});
