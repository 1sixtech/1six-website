import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { entryVisualTarget, HERO_VIDEO, THESIS_VIDEOS, THESIS_SLIDE_VIDEOS } from '../../lib/siteAssets.ts';

const file = new URL('./PageEntry.tsx', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  fileName: file.pathname,
}).outputText;

function entryHarness({ seen = false, reduced = false, warmed = false, saveData = false, hash = '', expired = false } = {}) {
  let pathname;
  let layouts = [];
  let effects = [];
  let cleanups = [];
  let rendered;
  let cursor = 0;
  let cancelled = 0;
  const refs = [];
  const classes = new Set();
  const html = { dataset: expired ? { introExpired: 'true' } : {}, classList: {
    add: (n) => classes.add(n), remove: (...names) => names.forEach((n) => classes.delete(n)),
  } };
  const main = { style: { removeProperty: (key) => { delete main.style[key]; } } };
  const document = new EventTarget();
  document.documentElement = html;
  document.hidden = false;
  document.getElementById = (id) => id === 'main-content' ? main : null;
  const decoderWarmups = [], sharedWarmups = [], routes = [];
  const router = { prefetch: (path) => routes.push(path) };
  let teardowns = 0;
  const dependencies = {
    react: {
      useLayoutEffect: (setup) => layouts.push(setup), useEffect: (setup) => effects.push(setup),
      useCallback: (fn) => fn,
      useRef: (value) => { const i = cursor++; refs[i] ??= { current: value }; return refs[i]; },
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/navigation': { usePathname: () => pathname, useRouter: () => router },
    './IntroOverlay': { IntroOverlay: Symbol('overlay') },
    './IntroOrchestrator': { IntroOrchestrator: Symbol('orchestrator') },
    '@/lib/introState': { hasSeenIntro: () => seen || expired, isRouteVisualReady: () => false, needsVisualReadiness: (target) => target === '/' || target.startsWith('/thesis') },
    '@/lib/siteAssets': { entryVisualTarget, HERO_VIDEO, THESIS_VIDEOS, THESIS_SLIDE_VIDEOS },
    '@/lib/assetWarmup': {
      cancelAssetWarmup: () => cancelled++, hasWarmedEntry: () => warmed,
      warmSharedAssets: (path, theme) => { sharedWarmups.push({ path, theme }); return Promise.resolve(); },
    },
    '@/lib/videoPool': {
      warmupAll: (urls) => { decoderWarmups.push([...urls]); return Promise.resolve([]); },
      teardownVideoPool: () => teardowns++,
    },
  };
  const exports = {};
  new vm.Script(code, { filename: file.pathname }).runInContext(vm.createContext({
    exports, document, navigator: { connection: { saveData } },
    require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
    window: { matchMedia: () => ({ matches: reduced }), location: { hash } },
  }));
  function find(node) {
    if (Array.isArray(node)) return node.map(find).find(Boolean);
    if (!node || typeof node !== 'object') return undefined;
    return node.props?.onWarmup ? node : find(node.props?.children);
  }
  return {
    html, main, document, decoderWarmups, sharedWarmups, routes,
    get locked() { return classes.has('intro-lock'); },
    get textLocked() { return classes.has('thesis-entry-lock'); },
    get teardowns() { return teardowns; },
    get cancelled() { return cancelled; },
    enter(path) {
      cleanups.forEach((cleanup) => cleanup?.());
      pathname = path; layouts = []; effects = []; cursor = 0;
      rendered = exports.PageEntry();
      cleanups = [...layouts, ...effects].map((setup) => setup());
      return rendered;
    },
    signalReady() { find(rendered).props.onWarmup(); },
    visibility(hidden) { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); },
    cleanup() { cleanups.forEach((cleanup) => cleanup?.()); },
  };
}

test('page entry: Writing has no lock; its first usable screen can warm other routes without decoders', (t) => {
  const entry = entryHarness(); t.after(() => entry.cleanup()); entry.enter('/writing/article');
  assert.equal(entry.locked, false);
  assert.equal(entry.textLocked, false);
  assert.equal(entry.html.dataset.introSkip, 'true');
  assert.deepEqual(entry.sharedWarmups, []);
  entry.signalReady();
  assert.deepEqual(entry.decoderWarmups, []);
  assert.deepEqual(entry.routes, ['/', '/thesis', '/writing']);
});

test('page entry: About prepares the logo and warms Thesis only after foreground readiness', (t) => {
  const entry = entryHarness(); t.after(() => entry.cleanup()); entry.enter('/');
  assert.equal(entry.html.dataset.introActive, 'true');
  assert.equal(entry.locked, true);
  assert.deepEqual(entry.sharedWarmups, []);
  entry.signalReady();
  assert.deepEqual(entry.sharedWarmups, [{ path: '/', theme: 'light' }]);
  assert.deepEqual(entry.decoderWarmups, []);
  assert.deepEqual(entry.routes, ['/thesis', '/writing']);
});

test('page entry: seen or already-warmed visual entries skip the logo; reduced motion also skips text lock', (t) => {
  for (const options of [{ seen: true }, { warmed: true }, { reduced: true }]) {
    const entry = entryHarness(options); t.after(() => entry.cleanup()); entry.enter('/thesis');
    assert.equal(entry.locked, false);
    assert.equal(entry.html.dataset.introSkip, 'true');
    assert.equal(entry.textLocked, !options.reduced);
    entry.signalReady();
    assert.equal(entry.decoderWarmups.length, options.reduced ? 0 : 1);
  }
});

test('page entry: moving during a reveal clears its mask and gives the new route a different owner', (t) => {
  const entry = entryHarness(); t.after(() => entry.cleanup()); entry.enter('/');
  const previousId = entry.html.dataset.entryId;
  entry.main.style['clip-path'] = 'circle(25%)'; entry.main.style['-webkit-clip-path'] = 'circle(25%)';
  entry.enter('/thesis');
  assert.notEqual(entry.html.dataset.entryId, previousId);
  assert.equal(entry.main.style['clip-path'], undefined);
  assert.equal(entry.main.style['-webkit-clip-path'], undefined);
  assert.equal(entry.locked, true);
  assert.equal(entry.textLocked, true);
  assert.equal(entry.decoderWarmups.length, 0);
  entry.signalReady();
  assert.equal(entry.decoderWarmups[0].length, 7);
  assert.equal(entry.decoderWarmups[0].includes(HERO_VIDEO), false);
  entry.enter('/writing');
  assert.equal(entry.locked, false); assert.equal(entry.textLocked, false);
  assert.equal(entry.teardowns, 1);
});

test('page entry: hidden tabs resume unfinished warmup only after their foreground readiness gate', (t) => {
  const entry = entryHarness(); t.after(() => entry.cleanup()); entry.enter('/');
  entry.visibility(true); entry.visibility(false);
  assert.equal(entry.sharedWarmups.length, 0);
  entry.visibility(true); entry.signalReady();
  assert.equal(entry.sharedWarmups.length, 0);
  entry.visibility(false); assert.equal(entry.sharedWarmups.length, 1);
  const before = entry.cancelled; entry.visibility(true);
  assert.equal(entry.cancelled, before + 1);
  entry.visibility(false); assert.equal(entry.sharedWarmups.length, 2);
  entry.enter('/writing'); entry.visibility(true); entry.visibility(false);
  assert.equal(entry.sharedWarmups.length, 2, 'the new page must signal readiness independently');
});

test('page entry: Save-Data suppresses optional downloads and decoder warmup', (t) => {
  const entry = entryHarness({ saveData: true }); t.after(() => entry.cleanup()); entry.enter('/thesis');
  entry.signalReady();
  assert.deepEqual(entry.decoderWarmups, []);
  assert.deepEqual(entry.sharedWarmups, []);
  assert.deepEqual(entry.routes, []);
});


test('page entry: recognized Thesis anchors omit the offscreen hero lock and preserve their target', (t) => {
  for (const hash of ['#thesis', '#products']) {
    const entry = entryHarness({ hash }); t.after(() => entry.cleanup()); entry.enter('/thesis');
    assert.equal(entry.html.dataset.entryTarget, '/thesis' + hash);
    assert.equal(entry.textLocked, false);
    assert.equal(entry.locked, true);
  }
});

test('page entry: late hydration after the watchdog does not relock the screen', (t) => {
  const entry = entryHarness({ expired: true }); t.after(() => entry.cleanup()); entry.enter('/thesis');
  assert.equal(entry.locked, false);
  assert.equal(entry.textLocked, false);
});
