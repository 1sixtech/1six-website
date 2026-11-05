import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { subscribeToPixelRatio } from './useDevicePixelRatio.ts';

/** window.matchMedia stand-in: records each query and its listeners. */
const queries = [];
globalThis.window = {
  devicePixelRatio: 1,
  matchMedia(media) {
    const listeners = new Set();
    const query = {
      media,
      listeners,
      addEventListener: (_, listener) => listeners.add(listener),
      removeEventListener: (_, listener) => listeners.delete(listener),
    };
    queries.push(query);
    return query;
  },
};
after(() => {
  delete globalThis.window;
});

/** Fires the 'change' a browser sends when the ratio leaves a query's value. */
const fire = (query) => [...query.listeners].forEach((listener) => listener());

test('each ratio change notifies once and re-arms the query at the new ratio', () => {
  let notified = 0;
  const unsubscribe = subscribeToPixelRatio(() => {
    notified += 1;
  });
  assert.deepEqual(queries.map((q) => [q.media, q.listeners.size]), [['(resolution: 1dppx)', 1]]);

  window.devicePixelRatio = 2; // the window moved to a Retina screen
  fire(queries[0]);
  window.devicePixelRatio = 1.25; // then zoomed
  fire(queries[1]);

  assert.equal(notified, 2);
  assert.deepEqual(
    queries.map((q) => [q.media, q.listeners.size]),
    [
      ['(resolution: 1dppx)', 0],
      ['(resolution: 2dppx)', 0],
      ['(resolution: 1.25dppx)', 1],
    ],
    'only the query for the current ratio listens',
  );

  unsubscribe();
  assert.equal(queries.at(-1).listeners.size, 0, 'unsubscribing removes the latest listener');
});
