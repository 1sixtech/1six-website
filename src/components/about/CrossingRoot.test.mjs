import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { crossingProgress } from './crossingProgress.ts';

// Exercise the actual effect with controlled browser signals, without a DOM
// package. This verifies preference handling, not native CSS media emulation.
const file = new URL('./CrossingRoot.tsx', import.meta.url);
const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
  fileName: file.pathname,
});

function eventSource() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    emit(type) { listeners.get(type)?.(); },
  };
}

function crossingHarness({ reducedMotion = false } = {}) {
  let effect;
  const observers = [];
  let frameId = 0;
  const frames = new Map();
  const cancelled = [];
  const counts = [{ textContent: '16%' }, { textContent: '16%' }];
  const fills = [new Map(), new Map()];
  const fillTargets = fills.map((properties) => ({
    style: { setProperty: (name, value) => properties.set(name, value) },
  }));
  const motion = { ...eventSource(), matches: reducedMotion };
  const window = {
    ...eventSource(),
    scrollY: 500,
    innerHeight: 800,
    matchMedia: () => motion,
  };
  // Contact's document position makes the scrolling span exactly 1000px:
  // 1736 - 800 (viewport) + 64 (contact inset).
  const end = { getBoundingClientRect: () => ({ bottom: 1736 - window.scrollY }) };
  const root = {
    dataset: {},
    getBoundingClientRect: () => ({ top: -window.scrollY }),
    querySelector: (selector) => selector === '[data-crossing-end]' ? end : null,
    querySelectorAll: (selector) => ({
      '[data-crossing-count]': counts,
      '.crossing-mark, .crossing-meter__fill': fillTargets,
      '[data-crossing-band]': [],
    })[selector] ?? [],
  };
  const dependencies = {
    react: {
      useEffect: (setup) => { effect = setup; },
      useRef: (value) => ({ current: value }),
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    './crossingProgress': { crossingProgress },
  };
  const exports = {};
  const context = vm.createContext({
    exports,
    require(specifier) {
      assert.ok(Object.hasOwn(dependencies, specifier), `unmocked dependency: ${specifier}`);
      return dependencies[specifier];
    },
    window,
    getComputedStyle: () => ({ getPropertyValue: () => '0px' }),
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        observers.push(this);
      }
      observe(element) { this.element = element; }
      disconnect() { this.disconnected = true; }
    },
    requestAnimationFrame(callback) {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame(id) {
      cancelled.push(id);
      frames.delete(id);
    },
  });
  new vm.Script(outputText, { filename: file.pathname }).runInContext(context);
  const rendered = exports.CrossingRoot({ children: null });
  rendered.props.ref.current = root;
  const cleanup = effect();

  return {
    root, counts, fills, motion, window, frames, cancelled, observer: observers[0], cleanup,
    paint() {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback();
      }
    },
  };
}

test('crossing: reduced motion completes both meters and preference changes restore scroll progress', () => {
  const crossing = crossingHarness({ reducedMotion: true });
  try {
    const states = [
      [true, '100%', '100.000', 'true'],
      [false, '58%', '58.000', 'false'],
      [true, '100%', '100.000', 'true'],
    ];
    for (const [index, [reducedMotion, expectedCount, expectedFill, complete]] of states.entries()) {
      if (index > 0) {
        crossing.motion.matches = reducedMotion;
        crossing.motion.emit('change');
      }
      crossing.paint();
      assert.deepEqual(crossing.counts.map((element) => element.textContent), [expectedCount, expectedCount]);
      assert.deepEqual(crossing.fills.map((properties) => properties.get('--crossing-fill')), [expectedFill, expectedFill]);
      assert.equal(crossing.root.dataset.complete, complete);
    }
  } finally {
    crossing.cleanup();
  }
});

test('crossing: cleanup cancels pending paint and removes scroll, resize and preference observers', () => {
  const crossing = crossingHarness();
  crossing.paint();
  assert.deepEqual([...crossing.window.listeners.keys()].sort(), ['resize', 'scroll']);
  assert.deepEqual([...crossing.motion.listeners.keys()], ['change']);
  assert.equal(crossing.observer.element, crossing.root);

  crossing.window.scrollY = 1000;
  crossing.window.emit('scroll');
  crossing.window.emit('scroll');
  assert.equal(crossing.frames.size, 1, 'scroll events share one pending paint');
  const pending = [...crossing.frames.keys()][0];
  crossing.cleanup();
  assert.ok(crossing.cancelled.includes(pending));
  assert.equal(crossing.observer.disconnected, true);
  assert.equal(crossing.window.listeners.size, 0);
  assert.equal(crossing.motion.listeners.size, 0);

  crossing.window.emit('scroll');
  crossing.window.emit('resize');
  crossing.motion.emit('change');
  crossing.paint();
  assert.equal(crossing.frames.size, 0);
  assert.deepEqual(crossing.counts.map((element) => element.textContent), ['58%', '58%']);
});
