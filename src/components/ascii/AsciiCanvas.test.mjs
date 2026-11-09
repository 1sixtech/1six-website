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

function canvasHarness({ reduced = false, image = false, load = () => Promise.resolve({}) } = {}) {
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
    '@/lib/videoPool': { load, abandon() {} },
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

test('video source failure: the first failure schedules a retry and builds nothing without a video', async (t) => {
  let loads = 0;
  const canvas = canvasHarness({ load: () => { loads++; return Promise.reject(new Error('load error')); } });
  t.after(() => canvas.cleanup());
  await flush(); await flush();
  assert.equal(loads, 1);
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/**
 * Retries, the queue and `paused` play out across renders, so the hooks here
 * behave as React's do: an effect runs when its dependencies change, and a
 * state update renders again. One page holds any number of canvases because
 * they share the init queue. Timers and frames only move when a test says so.
 */
function canvasPage({ load = (url) => Promise.resolve({ url }), webgl = true, idle = false, reduced = false } = {}) {
  const timers = new Map();
  const frames = [];
  const idleCallbacks = [];
  const idleOptions = [];
  const observers = [];
  const mosaics = [];
  const abandoned = [];
  const dirty = new Set();
  const visibility = new Set();
  const controls = { failAt: null };
  let nextTimer = 0;
  let constructed = 0;
  let queuePauses = 0;
  let rendering = null;

  const step = (name) => { controls.before?.(name); if (controls.failAt === name) throw new Error(`${name} failed`); };
  class AscMosaic {
    running = false;
    videoPlaying = null;
    disposed = false;
    constructor() {
      constructed++;
      if (!webgl) throw new Error('WebGL unavailable');
      mosaics.push(this);
    }
    async addModel(options) { this.model = options; step('addModel'); }
    async enableAsciiMosaicFilter(options) { this.filter = options; step('enableAsciiMosaicFilter'); }
    async waitForSceneTextures() { step('waitForSceneTextures'); }
    animate() { this.running = true; }
    stopAnimate() { this.running = false; }
    setVideoPlaying(playing) { this.videoPlaying = playing; }
    setRenderScale() {}
    dispose() { this.disposed = true; }
  }

  const changed = (previous, next) => !previous || next.some((value, index) => !Object.is(value, previous[index]));
  const slot = (create) => {
    rendering.hooks[rendering.cursor] ??= create();
    return rendering.hooks[rendering.cursor++];
  };
  const memo = (create, deps) => {
    const hook = slot(() => ({}));
    if (changed(hook.deps, deps)) Object.assign(hook, { deps, value: create() });
    return hook.value;
  };
  const react = {
    useRef: (current) => slot(() => ({ current })),
    useMemo: memo,
    useCallback: (callback, deps) => memo(() => callback, deps),
    useState(initial) {
      const canvas = rendering;
      const hook = slot(() => ({ value: initial }));
      return [hook.value, (next) => {
        const value = typeof next === 'function' ? next(hook.value) : next;
        if (Object.is(value, hook.value)) return;
        hook.value = value;
        dirty.add(canvas);
      }];
    },
    useEffect(setup, deps) {
      const canvas = rendering;
      const hook = slot(() => ({}));
      if (changed(hook.deps, deps)) {
        hook.deps = deps;
        canvas.effects.push({ hook, setup });
      }
    },
  };

  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/hooks/useReducedMotion': { useReducedMotion: () => reduced },
    '@/hooks/useDevicePixelRatio': { useDevicePixelRatio: () => 1 },
    '@/lib/videoPool': { load, abandon: (url) => abandoned.push(url) },
    '@/lib/assetWarmup': { warmedAssetSource: (url) => url },
    './pixelScale': { outputPixelRatio: () => 1, toDevicePixels: (options) => options },
    '@/lib/ascmosaic': { AscMosaic },
  };
  const document = {
    hidden: false,
    addEventListener(type, listener) { assert.equal(type, 'visibilitychange'); visibility.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, 'visibilitychange'); visibility.delete(listener); },
  };
  const exports = {};
  new vm.Script(code, { filename: file.pathname }).runInContext(vm.createContext({
    exports,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
    requestAnimationFrame: (fn) => frames.push(fn),
    ...(idle ? { requestIdleCallback: (fn, options) => { idleCallbacks.push(fn); idleOptions.push(options); } } : {}),
    setTimeout: (fn, delay) => { timers.set(++nextTimer, { fn, delay }); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
    document,
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(element) { this.element = element; }
      disconnect() {}
    },
    console: { warn() {} },
  }));

  function render(canvas) {
    rendering = canvas;
    canvas.cursor = 0;
    canvas.effects = [];
    canvas.element = exports.AsciiCanvas(canvas.props);
    rendering = null;
    canvas.element.props.ref.current = canvas.container;
    canvas.effects.forEach(({ hook }) => { hook.cleanup?.(); hook.cleanup = undefined; });
    canvas.effects.forEach(({ hook, setup }) => { hook.cleanup = setup(); });
  }
  function flushRenders() {
    let rendered = 0;
    for (const canvas of dirty) {
      dirty.delete(canvas);
      if (canvas.unmounted) continue;
      render(canvas);
      rendered++;
    }
    return rendered;
  }
  const take = (delay) => {
    const due = [...timers].filter(([, timer]) => timer.delay === delay);
    due.forEach(([id]) => timers.delete(id));
    return due.map(([, timer]) => timer.fn);
  };
  /** Runs promises, renders and the pauses between queue turns until nothing is left to do. */
  async function settle() {
    for (let quiet = 0; quiet < 3;) {
      await flush();
      const pauses = take(64);
      queuePauses += pauses.length;
      const work = [...frames.splice(0), ...idleCallbacks.splice(0), ...pauses];
      work.forEach((fn) => fn());
      quiet = flushRenders() + work.length ? 0 : quiet + 1;
    }
  }

  return {
    controls, mosaics, abandoned, idleOptions, settle,
    get constructed() { return constructed; },
    get queuePauses() { return queuePauses; },
    get visibilityListeners() { return visibility.size; },
    /** Pending source retries, as their delays. */
    get retries() { return [...timers.values()].map(({ delay }) => delay).filter((delay) => delay === 1000 || delay === 3000); },
    mount(props = {}) {
      const canvas = { hooks: [], ready: 0, container: { querySelectorAll: () => [] } };
      canvas.props = { textureUrl: '/mark.mp4', eager: true, onReady: () => canvas.ready++, ...props };
      render(canvas);
      return canvas;
    },
    update(canvas, props) { canvas.props = { ...canvas.props, ...props }; render(canvas); },
    unmount(canvas) { canvas.unmounted = true; canvas.hooks.forEach((hook) => hook.cleanup?.()); },
    async elapse(delay) { take(delay).forEach((fn) => fn()); await settle(); },
    async tabHidden(hidden) { document.hidden = hidden; [...visibility].forEach((listener) => listener()); await settle(); },
    async onScreen(canvas, isIntersecting) {
      observers.find(({ element }) => element === canvas.container).callback([{ isIntersecting }]);
      await settle();
    },
  };
}

const showsStill = (canvas) => canvas.element.props['data-ascii-still'] === '';

test('video source: the mosaic wraps the element the pool loaded; an image and reduced motion never ask for one', async () => {
  const video = { url: '/mark.mp4' };
  const page = canvasPage({ load: () => Promise.resolve(video) });
  const canvas = page.mount();
  await page.settle();
  assert.equal(page.mosaics.length, 1);
  assert.equal(page.mosaics[0].model.existingVideo, video, 'addModel must not start a second load');
  assert.equal(page.mosaics[0].running, true);
  assert.equal(canvas.ready, 1);
  assert.deepEqual(page.retries, []);
  assert.equal(showsStill(canvas), false);

  const pictures = canvasPage({ load: () => assert.fail('an image has no video to load') });
  const picture = pictures.mount({ textureUrl: '/mark.png' });
  await pictures.settle();
  assert.equal(pictures.mosaics[0].model.existingVideo, undefined);
  assert.equal(picture.ready, 1);

  const calm = canvasPage({ reduced: true, load: () => assert.fail('a still source starts no decoder') });
  calm.mount();
  await calm.settle();
  assert.equal(calm.constructed, 0);
});

test('video source failure: waits 1s, then 3s, then shows the still source, and never builds without a frame', async () => {
  let attempts = 0;
  const page = canvasPage({ load: () => { attempts++; return Promise.reject(new Error('load error')); } });
  const canvas = page.mount();
  await page.settle();
  assert.equal(attempts, 1);
  assert.deepEqual(page.retries, [1000]);
  assert.equal(showsStill(canvas), false, 'a retry keeps the loading state');

  await page.elapse(1000);
  assert.equal(attempts, 2);
  assert.deepEqual(page.retries, [3000]);
  assert.equal(showsStill(canvas), false);

  await page.elapse(3000);
  assert.equal(attempts, 3);
  assert.deepEqual(page.retries, [], 'the ladder is finished');
  assert.equal(showsStill(canvas), true);
  assert.equal(canvas.element.props.children.props.src, '/mark.mp4#t=0.1');
  assert.equal(page.constructed, 0, 'no source, no mosaic: an empty texture would tile one glyph');
  assert.equal(canvas.ready, 0, 'the still reports ready from its own media events');
});

test('mosaic failure: a source or glyph sheet that never arrives frees the context and retries the same canvas', async () => {
  for (const step of ['addModel', 'enableAsciiMosaicFilter', 'waitForSceneTextures']) {
    const page = canvasPage();
    page.controls.failAt = step;
    const canvas = page.mount();
    await page.settle();
    const [broken] = page.mosaics;
    assert.equal(broken.disposed, true, `${step}: the failed mosaic is disposed`);
    assert.equal(broken.running, false, step);
    assert.deepEqual(page.retries, [1000], `${step}: WebGL worked, so this is worth another try`);
    assert.equal(showsStill(canvas), false, step);
    assert.equal(canvas.ready, 0, step);

    page.controls.failAt = null;
    await page.elapse(1000);
    assert.equal(page.mosaics.length, 2, step);
    assert.equal(page.mosaics[1].running, true, step);
    assert.equal(canvas.ready, 1, step);

    // A later failure (a theme swap, say) starts from the first rung again.
    page.controls.failAt = step;
    page.update(canvas, { mosaicCellUrl: '/other.png' });
    await page.settle();
    assert.equal(page.mosaics[1].disposed, true, step);
    assert.deepEqual(page.retries, [1000], `${step}: a success restores the whole ladder`);
  }
});

test('video source failure: returning to the tab revives a canvas that gave up, but never retries a browser without WebGL', async () => {
  let failing = true;
  let attempts = 0;
  const page = canvasPage({
    load: (url) => { attempts++; return failing ? Promise.reject(new Error('phone busy')) : Promise.resolve({ url }); },
  });
  const canvas = page.mount();
  await page.settle();
  await page.elapse(1000);
  await page.elapse(3000);
  assert.equal(showsStill(canvas), true);
  assert.equal(attempts, 3);

  await page.tabHidden(true);
  assert.equal(attempts, 3, 'a hidden tab starts nothing');
  assert.equal(showsStill(canvas), true);

  await page.tabHidden(false);
  assert.equal(attempts, 4, 'the visitor is back: one fresh attempt');
  assert.equal(showsStill(canvas), false);
  assert.deepEqual(page.retries, [1000], 'with the whole ladder restored');
  assert.equal(page.visibilityListeners, 0, 'and no listener left behind');

  failing = false;
  await page.elapse(1000);
  assert.equal(page.mosaics.length, 1);
  assert.equal(canvas.ready, 1);

  const noWebgl = canvasPage({ webgl: false });
  const flat = noWebgl.mount();
  await noWebgl.settle();
  assert.equal(showsStill(flat), true);
  assert.equal(noWebgl.constructed, 1);
  assert.deepEqual(noWebgl.retries, [], 'a browser without WebGL is not worth a retry');
  await noWebgl.tabHidden(true);
  await noWebgl.tabHidden(false);
  assert.equal(noWebgl.constructed, 1, 'nor a revival');
  assert.equal(showsStill(flat), true);
});

test('init queue: a slow video gives up its turn, builds when it arrives, and retries if it fails after all', async () => {
  const built = (page) => page.mosaics.map(({ model }) => model.textureUrl);
  for (const idle of [false, true]) {
    const slow = deferred();
    const page = canvasPage({ idle, load: (url) => url === '/slow.mp4' ? slow.promise : Promise.resolve({ url }) });
    const first = page.mount({ textureUrl: '/slow.mp4' });
    const second = page.mount({ textureUrl: '/next.mp4' });
    await page.settle();
    assert.deepEqual(built(page), [], 'the canvas behind it waits for its turn');

    await page.elapse(1500);
    assert.deepEqual(built(page), ['/next.mp4'], 'after 1.5s the queue moves on');
    assert.equal(second.ready, 1);
    assert.equal(first.ready, 0);

    slow.resolve({ url: '/slow.mp4' });
    await page.settle();
    assert.deepEqual(built(page), ['/next.mp4', '/slow.mp4']);
    assert.equal(first.ready, 1);

    // Between turns the queue waits for a frame and then idle time, if the browser has it.
    if (idle) {
      assert.ok(page.idleOptions.length >= 2);
      assert.ok(page.idleOptions.every(({ timeout }) => timeout === 250));
      assert.equal(page.queuePauses, 0);
    } else {
      assert.ok(page.queuePauses >= 2, 'without requestIdleCallback a short timer stands in');
    }
  }

  const late = deferred();
  const page = canvasPage({ load: () => late.promise });
  page.mount();
  await page.settle();
  await page.elapse(1500);
  assert.deepEqual(page.retries, []);
  late.reject(new Error('load error'));
  await page.settle();
  assert.deepEqual(page.retries, [1000]);
  assert.equal(page.constructed, 0);
});

test('paused: a canvas in a hidden slide stays built but holds its loop and video, and resumes when shown', async () => {
  const page = canvasPage();
  const canvas = page.mount({ paused: true });
  await page.settle();
  const [mosaic] = page.mosaics;
  assert.equal(canvas.ready, 1, 'a hidden slide still reports ready, so the page never waits on it');
  assert.equal(mosaic.running, false);
  assert.equal(mosaic.videoPlaying, false);

  page.update(canvas, { paused: false });
  assert.equal(mosaic.running, true);
  assert.equal(mosaic.videoPlaying, true);

  await page.onScreen(canvas, false);
  assert.equal(mosaic.running, false, 'scrolled away it holds too');
  assert.equal(mosaic.videoPlaying, false);

  page.update(canvas, { paused: true });
  await page.onScreen(canvas, true);
  assert.equal(mosaic.running, false, 'back on screen, but its slide is still hidden');
  assert.equal(mosaic.videoPlaying, false);

  page.update(canvas, { paused: false });
  assert.equal(mosaic.running, true);
  assert.equal(page.mosaics.length, 1, 'showing or hiding a slide never rebuilds it');
  assert.equal(mosaic.disposed, false);
});

test('teardown: leaving cancels a pending retry, and a load that lost its turn builds nothing', async () => {
  let attempts = 0;
  const failing = canvasPage({ load: () => { attempts++; return Promise.reject(new Error('load error')); } });
  const gone = failing.mount();
  await failing.settle();
  assert.deepEqual(failing.retries, [1000]);
  failing.unmount(gone);
  assert.deepEqual(failing.retries, [], 'the pending retry is cancelled with the page');
  await failing.settle();
  assert.equal(attempts, 1);

  const arriving = deferred();
  const leaving = canvasPage({ load: () => arriving.promise });
  const left = leaving.mount();
  await leaving.settle();
  leaving.unmount(left);
  arriving.resolve({ url: '/mark.mp4' });
  await leaving.settle();
  assert.equal(leaving.constructed, 0, 'a video that lands after the page left builds nothing');

  const cancelled = deferred();
  const abandoned = canvasPage({ load: () => cancelled.promise });
  const closed = abandoned.mount();
  await abandoned.settle();
  abandoned.unmount(closed);
  cancelled.reject(new Error('videoPool: cancelled load'));
  await abandoned.settle();
  assert.deepEqual(abandoned.retries, [], 'a load the route change cancelled is not retried');

  // A theme swap while a doomed load is pending: one retry, for the newest request.
  const doomed = deferred();
  const swapped = canvasPage({ load: () => doomed.promise });
  const swappedCanvas = swapped.mount({ mosaicCellUrl: '/old.png' });
  await swapped.settle();
  swapped.update(swappedCanvas, { mosaicCellUrl: '/new.png' });
  doomed.reject(new Error('load error'));
  await swapped.settle();
  assert.deepEqual(swapped.retries, [1000], 'the superseded request does not spend a rung');

  // A theme swap while the video loads: only the newest request builds.
  const load = deferred();
  const page = canvasPage({ load: () => load.promise });
  const canvas = page.mount({ mosaicCellUrl: '/old.png' });
  await page.settle();
  page.update(canvas, { mosaicCellUrl: '/new.png' });
  load.resolve({ url: '/mark.mp4' });
  await page.settle();
  assert.deepEqual(page.mosaics.map(({ filter }) => filter.mosaicCellTextureUrl), ['/new.png']);
  assert.equal(canvas.ready, 1);
});

test('init queue: a canvas that left before its turn starts no video and cannot hold up the next route', async () => {
  const asked = [];
  const first = deferred();
  const page = canvasPage({
    load: (url) => { asked.push(url); return url === '/first.mp4' ? first.promise : url === '/stale.mp4' ? new Promise(() => {}) : Promise.resolve({ url }); },
  });
  const left = page.mount({ textureUrl: '/first.mp4' });
  const stale = page.mount({ textureUrl: '/stale.mp4' });
  await page.settle();
  page.unmount(left);
  page.unmount(stale);
  first.resolve({ url: '/first.mp4' });
  const next = page.mount({ textureUrl: '/next-route.mp4' });
  await page.settle();
  assert.equal(asked.includes('/stale.mp4'), false, 'it left before its turn: no decoder');
  assert.equal(next.ready, 1, 'the next route builds at once');
});

test('init queue: a request superseded before its turn starts no video', async () => {
  const asked = [];
  const first = deferred();
  const page = canvasPage({ load: (url) => { asked.push(url); return url === '/first.mp4' ? first.promise : Promise.resolve({ url }); } });
  page.mount({ textureUrl: '/first.mp4' });
  const canvas = page.mount({ textureUrl: '/old.mp4' });
  await page.settle();
  page.update(canvas, { textureUrl: '/new.mp4' });
  first.resolve({ url: '/first.mp4' });
  await page.settle();
  assert.deepEqual(asked, ['/first.mp4', '/new.mp4']);
});

test('init queue: a canvas already showing its still starts no video on a theme swap', async () => {
  const asked = [];
  const page = canvasPage({ webgl: false, load: (url) => { asked.push(url); return Promise.resolve({ url }); } });
  const canvas = page.mount({ mosaicCellUrl: '/old.png' });
  await page.settle();
  assert.equal(asked.length, 1);
  page.update(canvas, { mosaicCellUrl: '/new.png' });
  await page.settle();
  assert.equal(asked.length, 1);
});

test('init queue: a superseded slow load that fails spends no rung', async () => {
  const doomed = deferred();
  const page = canvasPage({ load: () => doomed.promise });
  const canvas = page.mount({ mosaicCellUrl: '/old.png' });
  await page.settle();
  await page.elapse(1500);
  page.update(canvas, { mosaicCellUrl: '/new.png' });
  await page.settle();
  doomed.reject(new Error('load error'));
  await page.settle();
  assert.deepEqual(page.retries, [1000], 'only the newest request spends a rung');
});

test('mosaic failure: an init a theme swap overtook is not a failure', async () => {
  const page = canvasPage();
  let canvas;
  let swapped = false;
  page.controls.before = (name) => {
    if (name !== 'waitForSceneTextures' || swapped) return;
    swapped = true;
    page.update(canvas, { mosaicCellUrl: '/new.png' });
    throw new Error('Mosaic disposed before source was ready');
  };
  canvas = page.mount({ mosaicCellUrl: '/old.png' });
  await page.settle();
  assert.deepEqual(page.retries, [], 'no rung spent on the overtaken init');
  assert.equal(page.mosaics.length, 2);
  assert.equal(page.mosaics[1].running, true);
  assert.equal(canvas.ready, 1);
});

test('init queue: a video that lands after losing its turn builds before canvases that have not started', async () => {
  const sources = new Map();
  const source = (url) => { if (!sources.has(url)) sources.set(url, deferred()); return sources.get(url); };
  const page = canvasPage({ load: (url) => source(url).promise });
  for (const textureUrl of ['/hero.mp4', '/one.mp4', '/two.mp4']) page.mount({ textureUrl });
  await page.settle();
  await page.elapse(1500);
  source('/hero.mp4').resolve({ url: '/hero.mp4' });
  await page.settle();
  await page.elapse(1500);
  assert.deepEqual(page.mosaics.map(({ model }) => model.textureUrl), ['/hero.mp4']);
});

test('video source failure: a newer request cancels the pending retry', async () => {
  let failing = true;
  const page = canvasPage({ load: (url) => failing ? Promise.reject(new Error('load error')) : Promise.resolve({ url }) });
  const canvas = page.mount({ mosaicCellUrl: '/old.png' });
  await page.settle();
  assert.deepEqual(page.retries, [1000]);
  failing = false;
  page.update(canvas, { mosaicCellUrl: '/new.png' });
  await page.settle();
  assert.deepEqual(page.retries, []);
  await page.elapse(1000);
  assert.equal(page.mosaics.length, 1, 'the working mosaic is not rebuilt');
  assert.equal(page.mosaics[0].disposed, false);
});

test('a canvas gives up its video when it leaves or changes source; an image has none to give up', async () => {
  const page = canvasPage();
  const canvas = page.mount({ textureUrl: '/first.mp4' });
  await page.settle();
  assert.deepEqual(page.abandoned, []);
  page.update(canvas, { textureUrl: '/second.mp4' });
  assert.deepEqual(page.abandoned, ['/first.mp4']);
  page.unmount(canvas);
  assert.deepEqual(page.abandoned, ['/first.mp4', '/second.mp4']);

  const picture = page.mount({ textureUrl: '/mark.png' });
  await page.settle();
  page.unmount(picture);
  assert.deepEqual(page.abandoned, ['/first.mp4', '/second.mp4'], 'an image has no video');
});
