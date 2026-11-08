import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentRoute } from './site.ts';

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
