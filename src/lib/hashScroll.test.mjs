import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real helpers. Only the browser and GSAP boundaries are fake. The whole
// scroll request is recorded: the Header and FooterLink tests only see its target.
const file = new URL('./hashScroll.ts', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: file.pathname,
}).outputText;

function loadHashScroll({ url = '/thesis', scrollY = 0, targetTop = 844 } = {}) {
  const trace = [];
  const frames = [];
  let current = url;
  const window = new EventTarget();
  window.scrollY = scrollY;
  Object.defineProperty(window, 'location', { get: () => new URL(current, 'https://example.test') });
  window.scrollTo = (options) => trace.push({ type: 'scroll', ...options });
  const dependencies = {
    gsap: { registerPlugin() {} },
    'gsap/ScrollTrigger': { ScrollTrigger: { refresh: () => trace.push({ type: 'refresh' }) } },
  };
  const exports = {};
  new vm.Script(code, { filename: file.pathname }).runInContext(vm.createContext({
    window,
    CustomEvent,
    document: {
      getElementById: (id) => id === 'thesis' ? {
        getBoundingClientRect: () => ({ top: targetTop - window.scrollY }),
      } : null,
    },
    history: {
      replaceState(_state, _title, next) {
        current = next;
        trace.push({ type: 'history', url: next });
      },
    },
    requestAnimationFrame: (callback) => frames.push(callback),
    exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `unmocked dependency: ${name}`);
      return dependencies[name];
    },
  }));
  window.addEventListener(exports.HASH_SCROLL_REQUEST_EVENT, (event) => {
    trace.push({ type: 'request', hash: event.detail.hash });
  });
  return { ...exports, trace, flush: () => frames.splice(0).forEach((frame) => frame()) };
}

test('page top: capture is told first, then the page jumps instead of animating back through Thesis', () => {
  const { trace, scrollToPageTop } = loadHashScroll();
  scrollToPageTop();
  assert.deepEqual(trace, [
    { type: 'request', hash: 'top' },
    { type: 'history', url: '/thesis' },
    { type: 'scroll', top: 0, behavior: 'auto' },
  ]);
});

test('page top: the hash goes and the query stays', () => {
  const { trace, scrollToPageTop } = loadHashScroll({ url: '/thesis?utm_source=x#products' });
  scrollToPageTop();
  assert.deepEqual(trace.filter((entry) => entry.type === 'history'), [
    { type: 'history', url: '/thesis?utm_source=x' },
  ]);
});

test('section target: refreshed first, then measured in document coordinates', () => {
  const helper = loadHashScroll({ scrollY: 100 });
  assert.equal(helper.scrollToHashTarget('#thesis'), true);
  assert.deepEqual(helper.trace, [{ type: 'refresh' }]);
  helper.flush();
  assert.deepEqual(helper.trace.at(-1), { type: 'scroll', top: 844, behavior: 'auto' });
});

test('section target: a missing target neither refreshes nor scrolls', () => {
  const helper = loadHashScroll();
  assert.equal(helper.scrollToHashTarget('missing'), false);
  helper.flush();
  assert.deepEqual(helper.trace, []);
});
