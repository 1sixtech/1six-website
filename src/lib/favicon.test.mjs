import assert from 'node:assert/strict';
import test from 'node:test';
import { ADAPTIVE_FAVICON, faviconHref } from './favicon.ts';
import { ICON_VERSION } from './site.ts';

const ADAPTIVE = `/favicon.svg?v=${ICON_VERSION}`;
const LIGHT = `/favicon-light.svg?v=${ICON_VERSION}`;
const DARK = `/favicon-dark.svg?v=${ICON_VERSION}`;

test('favicon: in the scheme the page loaded in, favicon.svg stays', () => {
  assert.equal(ADAPTIVE_FAVICON, ADAPTIVE, 'the layout renders favicon.svg');
  assert.equal(faviconHref('light', 'light', ADAPTIVE), ADAPTIVE);
  assert.equal(faviconHref('dark', 'dark', ADAPTIVE), ADAPTIVE);
});

test('favicon: a scheme change points the tab at that scheme\'s fixed copy', () => {
  assert.equal(faviconHref('light', 'dark', ADAPTIVE), DARK);
  assert.equal(faviconHref('dark', 'light', ADAPTIVE), LIGHT);
});

test('favicon: flipping back to the load scheme selects its fixed copy, not favicon.svg', () => {
  // Loaded light, went dark, came back.
  assert.equal(faviconHref('light', 'light', DARK), LIGHT);
  // Loaded dark, went light, came back.
  assert.equal(faviconHref('dark', 'dark', LIGHT), DARK);
});

test('favicon: syncing again with nothing changed leaves the href as it is', () => {
  for (const loadScheme of ['light', 'dark']) {
    for (const scheme of ['light', 'dark']) {
      for (const href of [ADAPTIVE, LIGHT, DARK]) {
        const next = faviconHref(loadScheme, scheme, href);
        assert.equal(faviconHref(loadScheme, scheme, next), next, `loaded ${loadScheme}, now ${scheme}, from ${href}`);
      }
    }
  }
});
