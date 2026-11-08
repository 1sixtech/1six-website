import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('./PageEntry.tsx', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  fileName: file.pathname,
}).outputText;

function entryHarness({ seen = false, reduced = false, storageBlocked = false } = {}) {
  let pathname;
  let layouts = [];
  let effects = [];
  let cleanups = [];
  const classes = new Set();
  const html = { dataset: {}, classList: { add: (n) => classes.add(n), remove: (n) => classes.delete(n) } };
  const main = { style: { removeProperty: (key) => { delete main.style[key]; } } };
  const warmups = [];
  let teardowns = 0;
  const dependencies = {
    react: {
      useLayoutEffect: (setup) => layouts.push(setup),
      useEffect: (setup) => effects.push(setup),
      useRef: (value) => ({ current: value }),
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/navigation': { usePathname: () => pathname },
    './IntroOverlay': { IntroOverlay: Symbol('overlay') },
    './IntroOrchestrator': { IntroOrchestrator: Symbol('orchestrator') },
    '@/lib/videoPool': {
      warmupAll: (urls) => { warmups.push([...urls]); return Promise.resolve([]); },
      teardownVideoPool: () => teardowns++,
    },
  };
  const exports = {};
  const context = vm.createContext({
    exports,
    require(specifier) { assert.ok(Object.hasOwn(dependencies, specifier)); return dependencies[specifier]; },
    window: { matchMedia: () => ({ matches: reduced }) },
    document: { documentElement: html, getElementById: (id) => id === 'main-content' ? main : null },
    sessionStorage: { getItem: (key) => {
      if (storageBlocked) throw new Error('Storage blocked');
      assert.equal(key, 'aboutIntroSeen'); return seen ? '1' : null;
    } },
  });
  new vm.Script(code, { filename: file.pathname }).runInContext(context);
  return {
    html, main, warmups,
    get locked() { return classes.has('intro-lock'); },
    get teardowns() { return teardowns; },
    enter(path) {
      cleanups.forEach((cleanup) => cleanup?.());
      pathname = path; layouts = []; effects = [];
      const rendered = exports.PageEntry();
      cleanups = [...layouts, ...effects].map((setup) => setup());
      return rendered;
    },
    cleanup() { cleanups.forEach((cleanup) => cleanup?.()); },
  };
}

test('page entry: a first About visit prepares its loader on client navigation without warming Thesis', (t) => {
  const entry = entryHarness(); t.after(() => entry.cleanup());
  assert.equal(entry.enter('/writing'), null);
  assert.ok(entry.enter('/'));
  assert.equal(entry.html.dataset.introActive, 'true');
  assert.equal(entry.locked, true);
  assert.deepEqual(entry.warmups, []);
});

test('page entry: repeat and reduced-motion About visits never acquire the loader lock', (t) => {
  for (const options of [{ seen: true }, { reduced: true }, { reduced: true, storageBlocked: true }]) {
    const entry = entryHarness(options); t.after(() => entry.cleanup());
    entry.enter('/');
    assert.equal(entry.locked, false);
    assert.equal(entry.html.dataset.introSkip, 'true');
    assert.equal(entry.html.dataset.introActive, undefined);
  }
});

test('page entry: leaving a partial About reveal clears its mask before Thesis starts its own scramble', (t) => {
  const entry = entryHarness(); t.after(() => entry.cleanup());
  entry.enter('/');
  entry.main.style['clip-path'] = 'circle(25%)';
  entry.main.style['-webkit-clip-path'] = 'circle(25%)';
  assert.equal(entry.enter('/thesis'), null, 'no company-logo overlay on Thesis');
  assert.deepEqual(entry.html.dataset, {});
  assert.equal(entry.main.style['clip-path'], undefined);
  assert.equal(entry.main.style['-webkit-clip-path'], undefined);
  assert.equal(entry.locked, true, 'Hero retains the pre-existing scramble lock');
  assert.equal(entry.warmups.length, 1);
  assert.equal(entry.warmups[0].length, 8);
  assert.ok(entry.warmups[0].includes('/resource/Source_About 06.mp4'));
  entry.enter('/writing');
  assert.equal(entry.locked, false);
  assert.equal(entry.teardowns, 1);
});

test('page entry: Thesis first does not consume the About intro, and storage failures remain usable', (t) => {
  const entry = entryHarness({ storageBlocked: true }); t.after(() => entry.cleanup());
  entry.enter('/thesis'); entry.enter('/');
  assert.equal(entry.html.dataset.introActive, 'true');
  assert.equal(entry.teardowns, 1);
  entry.enter('/writing'); assert.equal(entry.locked, false);
});
