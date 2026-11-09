import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentRoute, isPlainLeftClick } from './site.ts';

test('a nav link is current on its page and below it, never for a hash or a lookalike path', () => {
  const cases = [
    ['/thesis', '/thesis', true],
    ['/writing', '/writing', true],
    ['/writing/001-hyperliquid-data-feed-latency', '/writing', true],
    ['/', '/', true],
    ['/thesis', '/', false],
    ['/writing-archive', '/writing', false],
    ['/thesis', '/thesis#thesis', false],
    ['/', '/#investors', false],
    ['/writing', '/', false],
  ];
  for (const [pathname, href, current] of cases) {
    assert.equal(isCurrentRoute(pathname, href), current, `${href} on ${pathname}`);
  }
});

test('only a plain left click counts as taking over a link', () => {
  const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  assert.equal(isPlainLeftClick(plain), true);
  for (const change of [{ button: 1 }, { button: 2 }, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }]) {
    assert.equal(isPlainLeftClick({ ...plain, ...change }), false, JSON.stringify(change));
  }
});
