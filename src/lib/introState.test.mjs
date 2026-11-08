import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('./introState.ts', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: file.pathname,
}).outputText;

function introStateHarness({ storage = new Map(), blocked = false, dataset = {} } = {}) {
  const exports = {};
  const window = new EventTarget();
  const events = [];
  window.addEventListener('entry:ready', (event) => events.push(event));
  const context = vm.createContext({
    exports, window, CustomEvent,
    document: { documentElement: { dataset } },
    sessionStorage: {
      getItem(key) {
        if (blocked) throw new Error('SecurityError: session storage is blocked');
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        if (blocked) throw new Error('SecurityError: session storage is blocked');
        storage.set(key, value);
      },
    },
  });
  new vm.Script(code, { filename: file.pathname }).runInContext(context);
  return { ...exports, window, events, dataset, storage };
}

test('intro frequency persists for the session and stays remembered if storage later loses the key', () => {
  const state = introStateHarness();
  assert.equal(state.hasSeenIntro(), false);
  state.markIntroSeen();
  assert.equal(state.hasSeenIntro(), true);
  assert.equal(state.storage.get('siteIntroSeen'), '1');
  assert.equal(introStateHarness({ storage: state.storage }).hasSeenIntro(), true, 'a new module sees the previous document visit');
  state.storage.clear();
  assert.equal(state.hasSeenIntro(), true, 'the current document also has its own memory');
  assert.deepEqual(state.events, [], 'session frequency never implies visual readiness');
});

test('blocked storage cannot replay the logo within the same document', () => {
  const state = introStateHarness({ blocked: true });
  assert.equal(state.hasSeenIntro(), false);
  assert.doesNotThrow(() => state.markIntroSeen());
  assert.equal(state.hasSeenIntro(), true);
  assert.equal(state.storage.size, 0);
  assert.doesNotThrow(() => state.markIntroSeen());
  assert.equal(state.hasSeenIntro(), true);
});

test('the bootstrap expiry is honored even when storage is blocked', () => {
  const state = introStateHarness({ blocked: true, dataset: { introExpired: 'true' } });
  assert.equal(state.hasSeenIntro(), true);
  assert.equal(state.isRouteVisualReady('/'), false, 'expiry is not proof that the About mark rendered');
  assert.equal(state.isRouteVisualReady('/thesis'), false);
});

test('About and Thesis readiness are separate and notify only when their state changes', () => {
  const state = introStateHarness();
  assert.equal(state.isRouteVisualReady('/'), false);
  assert.equal(state.isRouteVisualReady('/thesis'), false);
  state.setRouteVisualReady('/', false);
  assert.equal(state.events.length, 0);
  state.setRouteVisualReady('/', true);
  assert.equal(state.events.length, 1);
  assert.ok(state.events[0] instanceof CustomEvent);
  assert.equal(state.events[0].type, 'entry:ready');
  assert.equal(state.isRouteVisualReady('/'), true);
  assert.equal(state.isRouteVisualReady('/thesis'), false);
  assert.equal(state.hasSeenIntro(), false);
  state.setRouteVisualReady('/', true);
  assert.equal(state.events.length, 1, 'a duplicate frame callback cannot repeat the readiness event');
  state.setRouteVisualReady('/thesis', true);
  state.setRouteVisualReady('/', false);
  assert.equal(state.events.length, 3);
  assert.equal(state.isRouteVisualReady('/'), false);
  assert.equal(state.isRouteVisualReady('/thesis'), true, 'unmounting About does not reset Thesis');
  state.markIntroSeen();
  assert.equal(state.isRouteVisualReady('/'), false, 'a remembered logo does not make a new visual ready');
});

test('Writing, articles, authors, and error pages start ready without any media event', () => {
  const state = introStateHarness();
  for (const pathname of ['/writing', '/writing/001-article', '/writing/authors/writer', '/not-found']) {
    assert.equal(state.isRouteVisualReady(pathname), true, pathname);
  }
  assert.equal(state.hasSeenIntro(), false, 'reading static content does not consume the visual-page logo');
  assert.deepEqual(state.events, []);
});

test('direct Thesis section targets require their own readiness without borrowing the hero frame', () => {
  const state = introStateHarness();
  for (const target of ['/', '/thesis', '/thesis#thesis', '/thesis#products']) {
    assert.equal(state.needsVisualReadiness(target), true, target);
    assert.equal(state.isRouteVisualReady(target), false, target);
  }
  state.setRouteVisualReady('/thesis', true);
  assert.equal(state.isRouteVisualReady('/thesis#thesis'), false);
  assert.equal(state.isRouteVisualReady('/thesis#products'), false);
  state.setRouteVisualReady('/thesis#thesis', true);
  assert.equal(state.isRouteVisualReady('/thesis#products'), false);
  state.setRouteVisualReady('/thesis#products', true);
  state.setRouteVisualReady('/thesis', false);
  assert.equal(state.isRouteVisualReady('/thesis#thesis'), true);
  assert.equal(state.isRouteVisualReady('/thesis#products'), true);
  for (const target of ['/writing', '/writing/article', '/thesis#missing', '/#contact']) {
    assert.equal(state.needsVisualReadiness(target), false, target);
  }
});

test('intro completion follows the active mask and its subscription cleans up independently of readiness', () => {
  const state = introStateHarness();
  let completed = 0;
  const unsubscribe = state.subscribeIntroDone(() => completed++);
  assert.equal(state.isIntroDone(), true);
  state.dataset.introActive = 'true';
  assert.equal(state.isIntroDone(), false);
  state.setRouteVisualReady('/', true);
  assert.equal(completed, 0, 'a frame-ready event is not intro completion');
  delete state.dataset.introActive;
  state.window.dispatchEvent(new CustomEvent('entry:intro-done'));
  assert.equal(state.isIntroDone(), true);
  assert.equal(completed, 1);
  unsubscribe();
  unsubscribe();
  state.window.dispatchEvent(new CustomEvent('entry:intro-done'));
  assert.equal(completed, 1, 'the previous route no longer receives completion');
});
