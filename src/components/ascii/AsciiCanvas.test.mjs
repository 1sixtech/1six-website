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

function canvasHarness({ reduced = false, image = false } = {}) {
  const hooks = [];
  let cursor = 0;
  let effects = [];
  let ready = 0;
  const frames = [];
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
    '@/lib/videoPool': { get: () => undefined, getWarmup: () => undefined },
    '@/lib/assetWarmup': { warmedAssetSource: (url) => url },
    './pixelScale': { outputPixelRatio: () => 1, toDevicePixels: (options) => options },
    '@/lib/ascmosaic': { AscMosaic: class { constructor() { throw new Error('WebGL unavailable'); } } },
  };
  const exports = {};
  new vm.Script(code, { filename: file.pathname }).runInContext(vm.createContext({
    exports,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
    requestAnimationFrame: (fn) => frames.push(fn),
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
