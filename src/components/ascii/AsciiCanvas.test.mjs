import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('./AsciiCanvas.tsx', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  fileName: file.pathname,
}).outputText;
const flush = () => new Promise((resolve) => setImmediate(resolve));

function canvasHarness({ reduced = false, image = false, warmup = () => Promise.resolve({}) } = {}) {
  const hooks = [];
  let cursor = 0;
  let effects = [];
  let ready = 0;
  const frames = [];
  const timers = [];
  let builds = 0;
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: {
      useRef(initial) { const i = cursor++; hooks[i] ??= { current: initial }; return hooks[i]; },
      useState(initial) {
        const i = cursor++; hooks[i] ??= { value: initial };
        return [hooks[i].value, (value) => { hooks[i].value = value; }];
      },
      useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect: (setup) => effects.push(setup),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/hooks/useReducedMotion': { useReducedMotion: () => reduced },
    '@/hooks/useDevicePixelRatio': { useDevicePixelRatio: () => 1 },
    '@/lib/videoPool': { warmup },
    '@/lib/assetWarmup': { warmedAssetSource: (url) => url },
    './pixelScale': { outputPixelRatio: () => 1, toDevicePixels: (options) => options },
    '@/lib/ascmosaic': { AscMosaic: class { constructor() { builds++; throw new Error('WebGL unavailable'); } } },
  };
  const exports = {};
  new vm.Script(code, { filename: file.pathname }).runInContext(vm.createContext({
    exports,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
    requestAnimationFrame: (fn) => frames.push(fn),
    setTimeout: (fn, delay) => timers.push({ fn, delay }),
    clearTimeout() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    IntersectionObserver: class { observe() {} disconnect() {} },
    console: { warn() {} },
  }));
  const props = { textureUrl: image ? '/mark.png' : '/mark.mp4', eager: true, onReady: () => ready++ };
  const render = () => {
    cursor = 0; effects = [];
    const tree = exports.AsciiCanvas(props);
    tree.props.ref.current = { querySelectorAll: () => [] };
    return tree;
  };
  let tree = render();
  const cleanups = effects.map((setup) => setup());
  return {
    get ready() { return ready; },
    get builds() { return builds; },
    timers,
    rerun() { cursor = 0; effects = []; exports.AsciiCanvas(props); effects.forEach((setup) => setup()); },
    rerender: () => { tree = render(); return tree; },
    cleanup: () => cleanups.forEach((cleanup) => cleanup?.()),
    get media() { return tree.props.children; },
  };
}

test('ASCII fallback: WebGL failure waits for a decoded, settled video frame before reporting ready', async (t) => {
  const canvas = canvasHarness(); t.after(() => canvas.cleanup());
  await flush(); await flush();
  assert.equal(canvas.ready, 0, 'creating the fallback is not media readiness');
  canvas.rerender();
  const video = canvas.media;
  assert.equal(video.type, 'video');
  video.props.onLoadedData({ currentTarget: { readyState: 1, seeking: false } });
  video.props.onLoadedData({ currentTarget: { readyState: 2, seeking: true } });
  assert.equal(canvas.ready, 0);
  video.props.onSeeked({ currentTarget: { readyState: 2, seeking: false } });
  assert.equal(canvas.ready, 1);
});

test('video source failure: retries, never builds a mosaic without a video, then falls back', async (t) => {
  let warmups = 0;
  const canvas = canvasHarness({ warmup: () => { warmups++; return Promise.reject(new Error('load error')); } });
  t.after(() => canvas.cleanup());
  await flush(); await flush();
  assert.equal(warmups, 1);
  assert.equal(canvas.builds, 0, 'no source, no mosaic: an empty texture would tile one glyph');
  const retries = canvas.timers.filter((timer) => timer.delay === 1000 || timer.delay === 3000);
  assert.deepEqual(retries.map((timer) => timer.delay), [1000]);
  assert.equal(canvas.rerender().props['data-ascii-still'], undefined, 'still retrying');
});

test('ASCII fallback: reduced motion reports its still video only after decoded data arrives', (t) => {
  const canvas = canvasHarness({ reduced: true }); t.after(() => canvas.cleanup());
  assert.equal(canvas.ready, 0);
  canvas.media.props.onLoadedData({ currentTarget: { readyState: 3, seeking: false } });
  assert.equal(canvas.ready, 1);
});

test('ASCII fallback: an image reports readiness from its load event', async (t) => {
  const canvas = canvasHarness({ image: true }); t.after(() => canvas.cleanup());
  await flush(); await flush(); canvas.rerender();
  assert.equal(canvas.media.type, 'img');
  assert.equal(canvas.ready, 0);
  canvas.media.props.onLoad(); assert.equal(canvas.ready, 1);
});
