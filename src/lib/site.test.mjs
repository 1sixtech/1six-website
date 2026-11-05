import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentRoute } from './site.ts';

test('a nav link is current on its page and below it, never for a hash or a lookalike path', () => {
  const cases = [
    ['/about', '/about', true],
    ['/research', '/research', true],
    ['/research/001-hyperliquid-data-feed-latency', '/research', true],
    ['/', '/', true],
    ['/about', '/', false],
    ['/researchers', '/research', false],
    ['/', '/#thesis', false],
    ['/about', '/about#investors', false],
    ['/research', '/about', false],
  ];
  for (const [pathname, href, current] of cases) {
    assert.equal(isCurrentRoute(pathname, href), current, `${href} on ${pathname}`);
  }
});
