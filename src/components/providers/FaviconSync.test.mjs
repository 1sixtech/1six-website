import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as favicon from '../../lib/favicon.ts';
import { ICON_VERSION } from '../../lib/site.ts';

const file = new URL('./FaviconSync.tsx', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  fileName: file.pathname,
}).outputText;

const ADAPTIVE = `/favicon.svg?v=${ICON_VERSION}`;
const LIGHT = `/favicon-light.svg?v=${ICON_VERSION}`;
const DARK = `/favicon-dark.svg?v=${ICON_VERSION}`;

/** FaviconSync mounted against a stand-in icon link, OS color scheme, and timer. */
function mount({ dark = false, icon = true } = {}) {
  const attributes = { href: ADAPTIVE };
  const writes = [];
  const link = {
    getAttribute: (name) => attributes[name] ?? null,
    setAttribute: (name, value) => {
      attributes[name] = value;
      writes.push(value);
    },
  };
  const query = Object.assign(new EventTarget(), { matches: dark });
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    head: { querySelector: (selector) => (icon && selector === 'link[rel="icon"][type="image/svg+xml"]' ? link : null) },
  });
  let timer = null;
  const window = {
    matchMedia: (media) => {
      assert.equal(media, '(prefers-color-scheme: dark)');
      return query;
    },
    setInterval: (sync, ms) => {
      timer = { sync, ms };
      return 1;
    },
    clearInterval: (id) => {
      if (id === 1) timer = null;
    },
  };
  const effects = [];
  const dependencies = { react: { useEffect: (setup) => effects.push(setup) }, '@/lib/favicon': favicon };
  const exports = {};
  new vm.Script(code, { filename: file.pathname }).runInContext(vm.createContext({
    exports, document, window,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
  }));
  assert.equal(exports.FaviconSync(), null, 'renders nothing');
  const cleanups = effects.map((setup) => setup());
  return {
    writes,
    get href() { return attributes.href; },
    get timer() { return timer; },
    osScheme(scheme) { query.matches = scheme === 'dark'; },
    change() { query.dispatchEvent(new Event('change')); },
    visibility(hidden) {
      document.hidden = hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    },
    tick() { timer.sync(); },
    unmount() { cleanups.forEach((cleanup) => cleanup?.()); },
  };
}

test('FaviconSync: points the tab at the current scheme\'s fixed copy at once, then follows each change event', () => {
  // favicon.svg may come from Chrome's favicon store drawn in the other scheme.
  const tab = mount({ dark: false });
  assert.deepEqual(tab.writes, [LIGHT], 'the fixed copy replaces favicon.svg on mount');
  tab.tick();
  tab.change();
  assert.deepEqual(tab.writes, [LIGHT], 'a repeated sync writes nothing');

  tab.osScheme('dark');
  tab.change();
  assert.equal(tab.href, DARK);
  tab.osScheme('light');
  tab.change();
  assert.deepEqual(tab.writes, [LIGHT, DARK, LIGHT]);
  tab.unmount();
});

test('FaviconSync: a page that missed the change event catches up on the next tick, or when shown', () => {
  const tab = mount({ dark: true });
  assert.equal(tab.href, DARK);
  assert.equal(tab.timer.ms, 1000);

  tab.osScheme('light'); // flipped while the window rendered no frame: no change event
  tab.tick();
  assert.equal(tab.href, LIGHT);

  tab.osScheme('dark');
  tab.visibility(true);
  assert.equal(tab.href, LIGHT, 'hidden: left to the timer');
  tab.visibility(false);
  assert.equal(tab.href, DARK);
  tab.unmount();
});

test('FaviconSync: unmounting removes its listeners and its timer', () => {
  const tab = mount({ dark: false });
  tab.unmount();
  assert.equal(tab.timer, null);
  tab.osScheme('dark');
  tab.change();
  tab.visibility(false);
  assert.deepEqual(tab.writes, [LIGHT], 'only the write on mount');
});

// Value: protects=FaviconSync on a page with no SVG icon link does nothing and
// throws nothing; fails_when=the missing-link guard is removed or moved after
// the listeners; why_new=the other cases always mount with the link; seam=none;
// no_claim=real DOM and matchMedia (stand-ins; unit only)
test('FaviconSync: with no SVG icon link it adds no listener and no timer', () => {
  const tab = mount({ icon: false });
  assert.equal(tab.timer, null);
  tab.osScheme('dark');
  tab.change();
  assert.deepEqual(tab.writes, []);
  tab.unmount();
});
