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

function crossingHarness({ reducedMotion = false, withMeter = false, noBands = false } = {}) {
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
  const meter = { dataset: {}, getBoundingClientRect: () => ({ height: 54, bottom: 54 }) };
  const label = { textContent: 'about' };
  // The last section sits 1000px down, the whole span of the crossing.
  const bands = [
    { dataset: { crossingLabel: 'about' }, getBoundingClientRect: () => ({ top: -window.scrollY }) },
    { dataset: { crossingLabel: 'products' }, getBoundingClientRect: () => ({ top: 600 - window.scrollY }) },
    { dataset: { crossingLabel: 'contact' }, getBoundingClientRect: () => ({ top: 1000 - window.scrollY }) },
  ];
  const root = {
    dataset: {},
    getBoundingClientRect: () => ({ top: -window.scrollY }),
    querySelector: (selector) => withMeter && selector === '.crossing-meter' ? meter
      : withMeter && selector === '[data-crossing-label-target]' ? label : null,
    querySelectorAll: (selector) => ({
      '[data-crossing-count]': counts,
      '.crossing-mark, .crossing-meter__fill': fillTargets,
      '[data-crossing-band]': noBands ? [] : bands,
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
    getComputedStyle: () => ({ getPropertyValue: (name) => !withMeter ? '0px' : name === '--crossing-meter-h' ? '24px' : '54px' }),
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
    root, label, counts, fills, motion, window, frames, cancelled, bands, observer: observers[0], cleanup,
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
      [false, '58%', '58.042', 'false'],
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


test('crossing: the fill reaches 100% exactly as the last section arrives, in equal steps', () => {
  const crossing = crossingHarness();
  try {
    for (const [scrollY, count] of [[0, '16%'], [250, '37%'], [500, '58%'], [750, '79%'], [1000, '100%'], [1300, '100%']]) {
      crossing.window.scrollY = scrollY;
      crossing.window.emit('scroll');
      crossing.paint();
      assert.equal(crossing.counts[0].textContent, count, `at ${scrollY}px`);
    }
    assert.equal(crossing.root.dataset.complete, 'true');
  } finally { crossing.cleanup(); }
});

test('crossing: settling a hair short of the last section at a fractional display scale still completes', () => {
  const crossing = crossingHarness();
  try {
    crossing.bands.at(-1).getBoundingClientRect = () => ({ top: 1000.40015 - crossing.window.scrollY });
    crossing.window.emit('resize');
    crossing.window.scrollY = 1000.3999;
    crossing.window.emit('scroll');
    crossing.paint();
    assert.equal(crossing.counts[0].textContent, '100%');
    assert.equal(crossing.root.dataset.complete, 'true');
  } finally { crossing.cleanup(); }
});

test('crossing: a resize or reflow re-measures where the last section lands; with no sections the mark reads complete', () => {
  const crossing = crossingHarness();
  try {
    crossing.paint();
    assert.equal(crossing.counts[0].textContent, '58%');
    crossing.bands.at(-1).getBoundingClientRect = () => ({ top: 2000 - crossing.window.scrollY });
    crossing.window.emit('resize');
    crossing.paint();
    assert.equal(crossing.counts[0].textContent, '37%', 'a taller page spreads the same fill further');
    crossing.bands.at(-1).getBoundingClientRect = () => ({ top: 1000 - crossing.window.scrollY });
    crossing.observer.callback();
    crossing.paint();
    assert.equal(crossing.counts[0].textContent, '58%', 'content reflow counts too');
    assert.equal(crossing.root.dataset.complete, 'false');
  } finally { crossing.cleanup(); }

  const empty = crossingHarness({ noBands: true });
  try {
    empty.paint();
    assert.equal(empty.counts[0].textContent, '100%');
    assert.equal(empty.root.dataset.complete, 'true');
  } finally { empty.cleanup(); }
});

test('crossing: the compact mobile meter keeps a section cue at the reading edge', () => {
  const crossing = crossingHarness({ withMeter: true });
  try {
    crossing.window.scrollY = 0; crossing.paint();
    assert.equal(crossing.label.textContent, 'about');
    crossing.window.scrollY = 530; crossing.window.emit('scroll'); crossing.paint();
    assert.equal(crossing.label.textContent, 'products');
    crossing.window.scrollY = 200; crossing.window.emit('scroll'); crossing.paint();
    assert.equal(crossing.label.textContent, 'about');
  } finally { crossing.cleanup(); }
});
