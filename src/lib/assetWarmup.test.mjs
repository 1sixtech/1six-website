import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as siteAssets from './siteAssets.ts';

function compiledModule(name) {
  const file = new URL(name, import.meta.url);
  return ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file.pathname,
  }).outputText;
}

const warmupCode = compiledModule('./assetWarmup.ts');
const introCode = compiledModule('./introState.ts');
const flush = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// The real fetch headers and body have independent lifetimes. In particular,
// these responses may arrive after abort, as an already-resolved browser task can.
function warmupHarness({ coarsePointer = false } = {}) {
  const calls = [];
  const blobs = [];
  const timers = new Map();
  const events = [];
  const window = new EventTarget();
  window.matchMedia = () => ({ matches: coarsePointer });
  window.addEventListener('entry:ready', (event) => events.push(event));
  let timerId = 0;
  let active = 0;
  let peakActive = 0;
  const context = vm.createContext({
    AbortController,
    CustomEvent,
    window,
    document: {
      documentElement: { dataset: {} },
      createElement() { assert.fail('background warmup must not create media or canvases'); },
    },
    sessionStorage: { getItem: () => null },
    URL: {
      createObjectURL(blob) {
        const source = `blob:warmed-${blobs.length + 1}`;
        blobs.push({ source, blob });
        return source;
      },
    },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    fetch(url, options) {
      const headers = deferred();
      const body = deferred();
      const call = {
        url, options, timer: timerId, bodyReads: 0, settled: false,
        respond(ok = true) { headers.resolve({ ok }); if (!ok) this.settled = true; },
        finish(content = url) {
          this.settled = true;
          headers.resolve({ ok: true });
          body.resolve(new Blob([content]));
        },
        fail() { this.settled = true; headers.reject(new Error('Network unavailable')); },
        failBody() {
          this.settled = true;
          headers.resolve({ ok: true });
          body.reject(new Error('Body stream interrupted'));
        },
      };
      calls.push(call);
      peakActive = Math.max(peakActive, ++active);
      return headers.promise.then(({ ok }) => {
        if (!ok) active--;
        return {
          ok,
          blob() {
            call.bodyReads++;
            return body.promise.finally(() => active--);
          },
        };
      }, (error) => { active--; throw error; });
    },
  });
  function load(code, dependencies = {}) {
    const exports = {};
    const run = new vm.Script(`(function(exports, require) {\n${code}\n})`).runInContext(context);
    run(exports, (specifier) => {
      assert.ok(Object.hasOwn(dependencies, specifier), `unmocked dependency: ${specifier}`);
      return dependencies[specifier];
    });
    return exports;
  }
  const api = load(warmupCode, { './siteAssets': siteAssets });
  const intro = load(introCode);
  return {
    ...api, intro, calls, blobs, timers, events,
    get peakActive() { return peakActive; },
    expire(call) {
      const timer = timers.get(call.timer);
      assert.equal(timer.delay, 8000);
      timers.delete(call.timer);
      timer.callback();
    },
    async drain() {
      while (calls.some((call) => !call.settled)) {
        calls.filter((call) => !call.settled).forEach((call) => call.finish());
        await flush();
      }
    },
  };
}

test('shared assets contain exactly the 17 live visual resources, with no fonts or retired media', () => {
  const expected = [
    '/resource/Source_Team symbol.mp4', '/resource/Source_Desert.mp4',
    ...Array.from({ length: 6 }, (_, index) => `/resource/Source_About 0${index + 1}.mp4`),
    '/resource/Source_Graph.mp4', '/resource/Source_World map.webp',
    ...['1-1', '2-1', '4-1 9px', '5-2 9px', '1-2', '2-2', '5-1 9px'].map((suffix) =>
      `/resource/Monotone Cell F_${suffix}.png`),
  ];
  assert.equal(siteAssets.SHARED_VISUAL_ASSETS.length, 17);
  assert.deepEqual([...siteAssets.SHARED_VISUAL_ASSETS].sort(), expected.sort());
});

test('asset warmup uses at most two low-priority requests, including time spent consuming bodies', async () => {
  const warmup = warmupHarness();
  const run = warmup.warmSharedAssets('/writing', 'light');
  assert.equal(warmup.calls.length, 2);
  warmup.calls.forEach((call) => call.respond());
  await flush();
  assert.equal(warmup.calls.length, 2, 'response headers do not free a worker');
  assert.deepEqual(warmup.calls.map((call) => call.bodyReads), [1, 1]);
  assert.equal(warmup.blobs.length, 0, 'an incomplete body cannot become a reusable source');
  warmup.calls[0].finish();
  await flush();
  assert.equal(warmup.calls.length, 3);
  await warmup.drain();
  await run;
  assert.equal(warmup.peakActive, 2);
  assert.equal(warmup.calls.length, 17);
  assert.equal(warmup.blobs.length, 8, 'only images are retained as Blob URLs');
  assert.equal(warmup.timers.size, 0);
  for (const call of warmup.calls) {
    assert.equal(call.options.priority, 'low');
    assert.equal(call.options.signal.aborted, false);
    assert.equal(call.bodyReads, 1);
    const source = warmup.warmedAssetSource(call.url);
    if (call.url.endsWith('.mp4')) {
      assert.equal(source, call.url, 'video never takes a Blob source');
      continue;
    }
    const retained = warmup.blobs.find((entry) => entry.source === source);
    assert.ok(retained, `${call.url} resolves to its retained body`);
    assert.equal(await retained.blob.text(), call.url);
  }
  assert.equal(warmup.warmedAssetSource('/resource/not-allowlisted.mp4'), '/resource/not-allowlisted.mp4');
});

test('asset warmup excludes the current route and theme while About downloads the later Thesis visuals', async () => {
  for (const theme of ['light', 'dark']) {
    for (const pathname of ['/', '/thesis']) {
      const warmup = warmupHarness();
      const current = pathname === '/'
        ? [siteAssets.TEAM_VIDEO, siteAssets.ATLASES[theme].team]
        : [...siteAssets.THESIS_VIDEOS, siteAssets.MAP_IMAGE,
          siteAssets.ATLASES[theme].hero, siteAssets.ATLASES[theme].graph, siteAssets.ATLASES[theme].thesis];
      assert.deepEqual(siteAssets.routeVisualAssets(pathname, theme), current);
      const run = warmup.warmSharedAssets(pathname, theme);
      await warmup.drain();
      await run;
      assert.deepEqual(warmup.calls.map((call) => call.url),
        siteAssets.SHARED_VISUAL_ASSETS.filter((url) => !current.includes(url)));
      for (const url of current) assert.equal(warmup.warmedAssetSource(url), url);
      if (pathname === '/') {
        assert.ok(siteAssets.THESIS_VIDEOS.every((url) => warmup.warmedAssetSource(url) === url));
        assert.ok(warmup.warmedAssetSource(siteAssets.ATLASES[theme].hero).startsWith('blob:'));
      }
    }
  }
});

test('a phone does not spend data warming video its media stack would download again', async () => {
  const warmup = warmupHarness({ coarsePointer: true });
  const run = warmup.warmSharedAssets('/', 'dark');
  await warmup.drain();
  await run;
  assert.ok(warmup.calls.length > 0);
  assert.ok(warmup.calls.every((call) => !call.url.endsWith('.mp4')));
  assert.ok(warmup.calls.some((call) => call.url === siteAssets.ATLASES.dark.hero));
});

test('failed HTTP, network, and body reads are retried next time, while successful Blob sources are reused', async () => {
  const warmup = warmupHarness();
  const first = warmup.warmSharedAssets('/writing', 'light');
  warmup.calls[0].respond(false);
  warmup.calls[1].fail();
  await flush();
  warmup.calls[2].failBody();
  await flush();
  await warmup.drain();
  await first;
  const failed = warmup.calls.slice(0, 3).map((call) => call.url);
  assert.equal(warmup.blobs.length, 8);
  assert.equal(warmup.calls[0].bodyReads, 0, 'an HTTP error body is not cached');
  for (const url of failed) assert.equal(warmup.warmedAssetSource(url), url);
  const successful = new Map(warmup.calls.slice(3).map((call) => [call.url, warmup.warmedAssetSource(call.url)]));
  const retry = warmup.warmSharedAssets('/writing', 'dark');
  await warmup.drain();
  await retry;
  assert.deepEqual(warmup.calls.slice(17).map((call) => call.url), failed);
  assert.equal(warmup.blobs.length, 8);
  for (const [url, source] of successful) assert.equal(warmup.warmedAssetSource(url), source);
  await warmup.warmSharedAssets('/writing', 'light');
  assert.equal(warmup.calls.length, 20, 'a fully warmed document performs no additional fetches');
});

test('cancelling a warmup aborts both requests and rejects late headers and bodies', async () => {
  const warmup = warmupHarness();
  const run = warmup.warmSharedAssets('/writing', 'light');
  warmup.calls[0].respond();
  await flush();
  warmup.cancelAssetWarmup();
  assert.ok(warmup.calls.every((call) => call.options.signal.aborted));
  warmup.calls.forEach((call) => call.finish());
  await run;
  assert.equal(warmup.calls.length, 2, 'cancellation does not start queued requests');
  assert.equal(warmup.blobs.length, 0);
  assert.equal(warmup.timers.size, 0);
  for (const call of warmup.calls) assert.equal(warmup.warmedAssetSource(call.url), call.url);
});

test('a new route supersedes the old warmup and stale responses cannot populate its excluded assets', async () => {
  const warmup = warmupHarness();
  const oldRun = warmup.warmSharedAssets('/writing', 'light');
  const obsolete = warmup.calls.slice();
  obsolete.forEach((call) => call.respond());
  await flush();
  const currentRun = warmup.warmSharedAssets('/thesis', 'light');
  assert.ok(obsolete.every((call) => call.options.signal.aborted));
  obsolete.forEach((call) => call.finish('stale document bytes'));
  await oldRun;
  assert.equal(warmup.blobs.length, 0);
  assert.equal(warmup.warmedAssetSource(siteAssets.HERO_VIDEO), siteAssets.HERO_VIDEO);
  await warmup.drain();
  await currentRun;
  assert.equal(warmup.warmedAssetSource(siteAssets.HERO_VIDEO), siteAssets.HERO_VIDEO);
  const teamSource = warmup.warmedAssetSource(siteAssets.ATLASES.light.team);
  assert.equal(await warmup.blobs.find((entry) => entry.source === teamSource).blob.text(), siteAssets.ATLASES.light.team);
  assert.equal(warmup.timers.size, 0);
});

test('an expired request never caches a late successful body and the remaining queue can finish', async () => {
  const warmup = warmupHarness();
  const run = warmup.warmSharedAssets('/writing', 'light');
  const expired = warmup.calls[0];
  expired.respond();
  await flush();
  warmup.expire(expired);
  assert.equal(expired.options.signal.aborted, true);
  assert.equal(warmup.calls[1].options.signal.aborted, false);
  expired.finish();
  await flush();
  await warmup.drain();
  await run;
  assert.equal(warmup.calls.length, 17);
  assert.equal(warmup.blobs.length, 8);
  assert.equal(warmup.warmedAssetSource(expired.url), expired.url);
  assert.equal(warmup.timers.size, 0);
});

test('entry warmth is a byte-cache hint only; it neither marks a visual ready nor gives Writing a media gate', async () => {
  const warmup = warmupHarness();
  const run = warmup.warmSharedAssets('/writing', 'light');
  assert.equal(warmup.hasWarmedEntry('/', 'light'), false);
  assert.equal(warmup.hasWarmedEntry('/thesis', 'light'), false);
  warmup.calls[0].finish();
  await flush();
  assert.equal(warmup.hasWarmedEntry('/', 'light'), false, 'the team video alone is insufficient without its atlas');
  await warmup.drain();
  await run;
  for (const theme of ['light', 'dark']) {
    for (const pathname of ['/', '/thesis']) {
      assert.equal(warmup.hasWarmedEntry(pathname, theme), true);
      assert.equal(warmup.intro.isRouteVisualReady(pathname), false, 'cached bytes have never rendered a frame');
    }
  }
  for (const pathname of ['/writing', '/writing/article', '/writing/authors/author', '/missing']) {
    assert.equal(warmup.hasWarmedEntry(pathname, 'light'), false);
    assert.equal(warmup.intro.isRouteVisualReady(pathname), true);
  }
  assert.deepEqual(warmup.events, [], 'background bytes cannot dispatch visual readiness');
});
