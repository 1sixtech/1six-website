import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('./videoPool.ts', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: file.pathname,
}).outputText;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const VIDEO_URL = '/resource/Source_Desert.mp4';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Decoder readiness and play() completion are deliberately separate. Safari can
// dispatch canplay while the priming play promise is still waiting to settle.
function poolHarness({ frameCallbacks = false } = {}) {
  const exports = {};
  const videos = [];
  const timers = new Map();
  let timerId = 0;
  const context = vm.createContext({
    exports,
    setTimeout(callback, delay) {
      timers.set(++timerId, { callback, delay });
      videos.at(-1).timer = timerId;
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    document: {
      createElement(tag) {
        assert.equal(tag, 'video');
        const listeners = new Map();
        const callbacks = new Map();
        const video = {
          src: '', paused: true, error: null, loadCalls: 0, pauseCalls: 0,
          attributes: new Map(), plays: [], listeners, callbacks,
          setAttribute(name, value) { this.attributes.set(name, value); },
          removeAttribute(name) {
            this.attributes.delete(name);
            if (name === 'src') this.src = '';
          },
          addEventListener(type, callback, options) {
            if (!listeners.has(type)) listeners.set(type, new Map());
            listeners.get(type).set(callback, options);
            if (!callbacks.has(type)) callbacks.set(type, []);
            callbacks.get(type).push(callback);
          },
          removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
          fire(type) {
            for (const [callback, options] of [...(listeners.get(type) ?? [])]) {
              if (options?.once) listeners.get(type).delete(callback);
              callback(new Event(type));
            }
          },
          load() { this.loadCalls++; },
          play() {
            const attempt = deferred();
            this.plays.push(attempt);
            this.paused = false;
            return attempt.promise;
          },
          pause() { this.pauseCalls++; this.paused = true; },
        };
        if (frameCallbacks) video.requestVideoFrameCallback = (callback) => { video.frameCallback = callback; };
        videos.push(video);
        return video;
      },
    },
  });
  new vm.Script(code, { filename: file.pathname }).runInContext(context);
  return {
    ...exports, videos, timers,
    expire(video) {
      const timer = timers.get(video.timer);
      assert.equal(timer.delay, 8000);
      timers.delete(video.timer);
      timer.callback();
    },
  };
}

function assertNoPendingListeners(video) {
  assert.equal(video.listeners.get('canplay')?.size ?? 0, 0);
  assert.equal(video.listeners.get('loadeddata')?.size ?? 0, 0);
  assert.equal(video.listeners.get('error')?.size ?? 0, 0);
}

test('video pool loads the network URL once and asks to play before a frame exists', async () => {
  const pool = poolHarness();
  const first = pool.load(VIDEO_URL);
  assert.equal(pool.load(VIDEO_URL), first);
  assert.equal(pool.videos.length, 1);
  const video = pool.videos[0];
  assert.equal(video.src, `${VIDEO_URL}#t=0.001`, 'iOS is unreliable with blob-backed video; only the real URL is used');
  assert.equal(video.preload, 'auto');
  assert.equal(video.muted, true);
  assert.equal(video.playsInline, true);
  assert.equal(video.attributes.get('playsinline'), '');
  assert.equal(video.loop, true);
  assert.equal(video.loadCalls, 1);
  assert.equal(video.plays.length, 1, 'iOS can hold canplay until playback is requested');
  assert.equal(pool.isPooled(video), false, 'an unready decoder is not pooled');
  video.fire('canplay');
  assert.equal(await first, video, 'a decoded first frame does not wait for autoplay permission');
  assert.equal(pool.isPooled(video), true);
  assert.equal(pool.load(VIDEO_URL), first);
  assert.equal(video.plays.length, 1);
  assertNoPendingListeners(video);
  assert.equal(pool.timers.size, 0);
  video.plays[0].resolve();
  await flush();
  assert.equal(video.pauseCalls, 1, 'unused primed media pauses to release decoder work');
});

for (const signal of ['loadeddata', 'a frame callback']) {
  test(`a frame reported by ${signal} is enough when canplay never fires`, async () => {
    const pool = poolHarness({ frameCallbacks: true });
    const ready = pool.load(VIDEO_URL);
    const video = pool.videos[0];
    if (signal === 'loadeddata') video.fire('loadeddata');
    else video.frameCallback();
    assert.equal(await ready, video);
    assert.equal(pool.isPooled(video), true);
    assert.equal(pool.timers.size, 0);
    assertNoPendingListeners(video);
  });
}

test('the last release destroys the element so a paused video cannot keep its decoder', async () => {
  const pool = poolHarness();
  const ready = pool.load(VIDEO_URL);
  const video = pool.videos[0];
  video.fire('canplay');
  await ready;
  pool.acquire(video);
  pool.release(video);
  assert.equal(video.src, '');
  assert.equal(video.loadCalls, 2);
  const next = pool.load(VIDEO_URL);
  assert.notEqual(next, ready, 'a later canvas gets a fresh element');
  assert.equal(pool.videos.length, 2);
});

test('route teardown rejects every pending load, clears sources, and ignores late canplay and error callbacks', async () => {
  const pool = poolHarness();
  const urls = [VIDEO_URL, '/resource/Source_Graph.mp4'];
  const pending = urls.map((url) => pool.load(url));
  const rejected = pending.map((promise) => assert.rejects(promise, /cancelled load/));
  const obsolete = pool.videos.slice();
  pool.teardownVideoPool();
  await Promise.all(rejected);
  assert.equal(pool.timers.size, 0);
  obsolete.forEach((video) => {
    assert.equal(video.src, '');
    assert.equal(video.loadCalls, 2, 'clearing the source is followed by load() to release the request');
    assertNoPendingListeners(video);
    video.callbacks.get('canplay')[0]();
    video.callbacks.get('error')[0]();
    assert.equal(video.plays.length, 1, 'an obsolete callback never starts another play');
    assert.equal(pool.isPooled(video), false);
  });

  const retry = pool.load(VIDEO_URL);
  assert.notEqual(retry, pending[0]);
  const current = pool.videos.at(-1);
  obsolete[0].callbacks.get('canplay')[0]();
  obsolete[0].callbacks.get('error')[0]();
  assert.equal(pool.load(VIDEO_URL), retry, 'old callbacks cannot remove the current promise');
  assert.equal(pool.isPooled(current), false);
  current.fire('canplay');
  assert.equal(await retry, current);
  assert.equal(pool.isPooled(current), true);
  assert.notEqual(current, obsolete[0]);
});

test('a timed-out decoder is evicted and a later load gets a fresh request', async () => {
  const pool = poolHarness();
  const first = pool.load(VIDEO_URL);
  const expired = pool.videos[0];
  const rejected = assert.rejects(first, /load timeout/);
  pool.expire(expired);
  await rejected;
  assert.equal(expired.src, '');
  assert.equal(expired.loadCalls, 2);
  assert.equal(pool.isPooled(expired), false);
  assertNoPendingListeners(expired);
  assert.equal(pool.timers.size, 0);

  const retry = pool.load(VIDEO_URL);
  assert.notEqual(retry, first);
  expired.callbacks.get('canplay')[0]();
  expired.callbacks.get('error')[0]();
  assert.equal(pool.load(VIDEO_URL), retry);
  assert.equal(pool.isPooled(expired), false);
  assert.equal(expired.plays.length, 1);
  const current = pool.videos.at(-1);
  current.fire('canplay');
  assert.equal(await retry, current);
  assert.equal(pool.isPooled(current), true);
});

test('a media load error evicts its cached rejection so retry can decode successfully', async () => {
  const pool = poolHarness();
  const first = pool.load(VIDEO_URL);
  const failed = pool.videos[0];
  failed.error = { code: 3 };
  const rejected = assert.rejects(first, /load error.*\(code 3\)/);
  failed.fire('error');
  await rejected;
  assert.equal(pool.isPooled(failed), false);
  assert.equal(pool.timers.size, 0);
  assertNoPendingListeners(failed);

  const retry = pool.load(VIDEO_URL);
  assert.notEqual(retry, first);
  failed.callbacks.get('error')[0]();
  failed.callbacks.get('canplay')[0]();
  assert.equal(pool.load(VIDEO_URL), retry);
  assert.equal(pool.isPooled(failed), false);
  const current = pool.videos.at(-1);
  current.fire('canplay');
  assert.equal(await retry, current);
  assert.equal(pool.isPooled(current), true);
});

test('late priming play completion never pauses a video already acquired by a renderer', async () => {
  const pool = poolHarness();
  const ready = pool.load(VIDEO_URL);
  const video = pool.videos[0];
  video.fire('canplay');
  await ready;
  pool.acquire(video);
  pool.acquire(video);
  assert.equal(video.plays.length, 3);
  assert.equal(video.paused, false);
  video.plays[0].resolve();
  await flush();
  assert.equal(video.pauseCalls, 0, 'the priming promise must respect the current owners');
  pool.release(video);
  assert.equal(video.pauseCalls, 0, 'one remaining owner still needs playback');
  pool.release(video);
  assert.equal(video.pauseCalls, 1);
  assert.equal(video.paused, true);
  assert.equal(video.src, '', 'the last owner frees the decoder');
  video.plays.slice(1).forEach((attempt) => attempt.resolve());
  await flush();
  assert.equal(video.pauseCalls, 1);
});

test('autoplay rejection preserves a decoded first frame and does not poison later acquisition', async () => {
  const pool = poolHarness();
  const ready = pool.load(VIDEO_URL);
  const video = pool.videos[0];
  video.fire('canplay');
  video.plays[0].reject(new Error('NotAllowedError: Low Power Mode'));
  assert.equal(await ready, video);
  await flush();
  assert.equal(pool.isPooled(video), true);
  pool.acquire(video);
  video.plays[1].reject(new Error('NotAllowedError: autoplay blocked'));
  await flush();
  assert.equal(pool.load(VIDEO_URL), ready);
  pool.release(video);
  assert.equal(video.pauseCalls, 1);
});

test('a priming play that settles before any frame does not decide the load (Low Power Mode refuses it)', async () => {
  for (const [settle, pauses] of [
    [(attempt) => attempt.reject(new Error('NotAllowedError: Low Power Mode')), 0],
    [(attempt) => attempt.resolve(), 1],
  ]) {
    const pool = poolHarness();
    const ready = pool.load(VIDEO_URL);
    const video = pool.videos[0];
    settle(video.plays[0]);
    await flush();
    assert.equal(pool.isPooled(video), false, 'a play result is not a frame');
    assert.equal(pool.timers.size, 1, 'the load still has its deadline');
    assert.equal(video.pauseCalls, pauses);
    video.fire('loadeddata');
    assert.equal(await ready, video);
    assert.equal(pool.isPooled(video), true);
    assert.equal(video.src, `${VIDEO_URL}#t=0.001`, 'the #t frame stays for a still mosaic');
    assert.equal(pool.timers.size, 0);
  }
});

test('release is safe on anything: a foreign element, a repeat, a throwing pause, and it spares what replaced it', async () => {
  const pool = poolHarness();
  const touched = [];
  const foreign = {
    play() { touched.push('play'); return Promise.resolve(); },
    pause() { touched.push('pause'); },
    removeAttribute() { touched.push('removeAttribute'); },
    load() { touched.push('load'); },
  };
  pool.acquire(foreign);
  pool.release(foreign);
  assert.deepEqual(touched, [], 'an element the pool did not create is not its to play or destroy');
  assert.equal(pool.isPooled(foreign), false);

  const firstReady = pool.load(VIDEO_URL);
  const first = pool.videos[0];
  first.fire('canplay');
  await firstReady;
  pool.acquire(first);
  pool.release(first);

  const secondReady = pool.load(VIDEO_URL);
  const second = pool.videos[1];
  second.fire('canplay');
  await secondReady;
  pool.acquire(second);
  pool.release(first); // a stale release: the canvas that held `first` disposing late
  assert.equal(second.src, `${VIDEO_URL}#t=0.001`, 'the element that replaced it keeps its source');
  assert.equal(second.pauseCalls, 0);
  assert.equal(pool.load(VIDEO_URL), secondReady, 'and stays in the pool');

  second.pause = () => { throw new Error('InvalidStateError'); };
  assert.doesNotThrow(() => pool.release(second));
  assert.notEqual(pool.load(VIDEO_URL), secondReady, 'a failed cleanup still leaves the pool');
});

test('teardown clears acquired videos and is idempotent even when priming play settles later', async () => {
  const pool = poolHarness();
  const ready = pool.load(VIDEO_URL);
  const video = pool.videos[0];
  video.fire('canplay');
  await ready;
  pool.acquire(video);
  pool.teardownVideoPool();
  assert.equal(video.src, '');
  assert.equal(video.paused, true);
  assert.equal(video.pauseCalls, 1);
  assert.equal(video.loadCalls, 2);
  video.plays.forEach((attempt) => attempt.resolve());
  await flush();
  pool.teardownVideoPool();
  assert.equal(video.pauseCalls, 1);
  assert.equal(video.loadCalls, 2);
  assert.equal(pool.timers.size, 0);
});

test('a media load error frees the element, as a timeout does', async () => {
  const pool = poolHarness();
  const first = pool.load(VIDEO_URL);
  const failed = pool.videos[0];
  failed.error = { code: 3 };
  const rejected = assert.rejects(first, /code 3/);
  failed.fire('error');
  await rejected;
  assert.equal(failed.src, '');
  assert.equal(failed.loadCalls, 2);
});

test('a canvas that leaves before taking its video stops the load or frees the element', async () => {
  const pool = poolHarness();
  const pending = pool.load(VIDEO_URL);
  const loading = pool.videos[0];
  const cancelled = assert.rejects(pending, /cancelled load/);
  pool.abandon(VIDEO_URL);
  await cancelled;
  assert.equal(loading.src, '', 'a load nobody wants stops downloading');

  const landedLoad = pool.load(VIDEO_URL);
  assert.notEqual(landedLoad, pending, 'coming back starts afresh');
  const landed = pool.videos.at(-1);
  landed.fire('canplay');
  await landedLoad;
  pool.abandon(VIDEO_URL);
  assert.equal(landed.src, '', 'a landed video nobody took does not keep its decoder');

  const takenLoad = pool.load(VIDEO_URL);
  assert.notEqual(takenLoad, landedLoad);
  const taken = pool.videos.at(-1);
  taken.fire('canplay');
  await takenLoad;
  pool.acquire(taken);
  pool.abandon(VIDEO_URL);
  assert.notEqual(taken.src, '', 'a video in use stays');
  assert.equal(pool.load(VIDEO_URL), takenLoad);
});
