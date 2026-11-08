import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('./HeroSection.tsx', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  fileName: file.pathname,
}).outputText;
function heroHarness({ done = false, reduced = false } = {}) {
  const effects = [], layouts = [], timers = [];
  const classes = new Set(['intro-lock', 'thesis-entry-lock']);
  const readiness = [];
  const window = new EventTarget();
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: {
      useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}],
      useCallback: (fn) => fn, useEffect: (fn) => effects.push(fn), useLayoutEffect: (fn) => layouts.push(fn),
      useSyncExternalStore: (_subscribe, read) => read(),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/hooks/useReducedMotion': { useReducedMotion: () => reduced },
    '@/lib/introState': { isIntroDone: () => done, subscribeIntroDone() {}, setRouteVisualReady: (path, ready) => readiness.push({ path, ready }) },
    '@/components/ascii/AsciiHero': { AsciiHero: Symbol('hero-canvas') },
  };
  const exports = {};
  new vm.Script(code, { filename: file.pathname }).runInContext(vm.createContext({
    exports, window,
    document: { documentElement: { classList: { remove: (n) => classes.delete(n), contains: (n) => classes.has(n) } } },
    require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearTimeout() {},
  }));
  const tree = exports.HeroSection();
  const cleanups = [...layouts, ...effects].map((fn) => fn());
  const find = (node, predicate) => {
    if (Array.isArray(node)) return node.map((n) => find(n, predicate)).find(Boolean);
    if (!node || typeof node !== 'object') return undefined;
    return predicate(node) ? node : find(node.props?.children, predicate);
  };
  return {
    classes, timers, readiness,
    scramble: find(tree, (n) => Object.hasOwn(n.props ?? {}, 'start')),
    canvas: find(tree, (n) => n.type === dependencies['@/components/ascii/AsciiHero'].AsciiHero),
    cleanup: () => cleanups.forEach((fn) => fn?.()),
  };
}

test('Thesis hero: text waits for the site logo while its canvas can prepare behind it', (t) => {
  const hero = heroHarness(); t.after(hero.cleanup);
  assert.equal(hero.scramble.props.start, false);
  assert.deepEqual(hero.timers, [], 'no early text safety timer can unlock behind the logo');
  hero.canvas.props.onReady();
  assert.deepEqual(hero.readiness.at(-1), { path: '/thesis', ready: true });
  assert.ok(hero.classes.has('intro-lock'));
});

test('Thesis hero: text completion and safety timer release only the local entrance lock', (t) => {
  const hero = heroHarness({ done: true }); t.after(hero.cleanup);
  assert.equal(hero.scramble.props.start, true);
  assert.equal(hero.timers[0].delay, 2500);
  hero.scramble.props.onComplete();
  assert.equal(hero.classes.has('thesis-entry-lock'), false);
  assert.equal(hero.classes.has('intro-lock'), true);
  hero.timers[0].callback();
  assert.equal(hero.classes.has('intro-lock'), true);
});

test('Thesis hero: reduced motion renders the settled text and stale canvas callbacks cannot ready a new entry', () => {
  const hero = heroHarness({ done: true, reduced: true });
  assert.equal(hero.scramble, undefined);
  assert.equal(hero.classes.has('thesis-entry-lock'), false);
  hero.cleanup(); const count = hero.readiness.length;
  hero.canvas.props.onReady(); assert.equal(hero.readiness.length, count);
});
