import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real effect. GSAP completions and canvas readiness are controlled
// independently, so an elapsed timer cannot masquerade as a rendered mark.
const file = new URL('./IntroOrchestrator.tsx', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: file.pathname,
}).outputText;
const flush = () => new Promise((resolve) => setImmediate(resolve));

function introHarness({ active = true, ready = false } = {}) {
  let effect;
  let now = 0;
  let timerId = 0;
  let seen = 0;
  const timers = new Map();
  const reveals = [];
  const tweens = [];
  const classes = new Set(active ? ['intro-lock'] : []);
  const html = {
    dataset: active ? { introActive: 'true' } : { introSkip: 'true' },
    classList: { remove: (name) => classes.delete(name) },
  };
  const main = { style: { removeProperty: (key) => { delete main.style[key]; } } };
  const overlay = { style: {} };
  const window = new EventTarget();
  const tween = (target, vars) => {
    const result = { target, vars, killed: false, kill() { this.killed = true; } };
    tweens.push(result);
    return result;
  };
  const dependencies = {
    react: { useEffect: (setup) => { effect = setup; } },
    gsap: {
      to: tween,
      fromTo: (target, from, to) => {
        target.style['clip-path'] = from.clipPath;
        target.style['-webkit-clip-path'] = from.WebkitClipPath;
        const result = tween(target, to);
        reveals.push(result);
        return result;
      },
    },
    '@/lib/introState': { isAboutMarkReady: () => ready },
  };
  const exports = {};
  const context = vm.createContext({
    exports,
    require(specifier) {
      assert.ok(Object.hasOwn(dependencies, specifier), `unmocked dependency: ${specifier}`);
      return dependencies[specifier];
    },
    document: { documentElement: html }, window, queueMicrotask,
    sessionStorage: { setItem(key, value) {
      assert.equal(key, 'aboutIntroSeen'); assert.equal(value, '1'); seen++;
    } },
    setTimeout(callback, delay) { timers.set(++timerId, { at: now + delay, callback }); return timerId; },
    clearTimeout: (id) => timers.delete(id),
  });
  new vm.Script(code, { filename: file.pathname }).runInContext(context);
  exports.IntroOrchestrator({
    fillRectRef: { current: { setAttribute() {} } },
    overlayRef: { current: overlay }, mainContentRef: { current: main },
  });
  return {
    html, main, overlay, reveals, tweens, timers,
    setup: () => effect(),
    get locked() { return classes.has('intro-lock'); },
    get seen() { return seen; },
    markReady() { ready = true; window.dispatchEvent(new Event('about-mark:ready')); },
    key(key) {
      const event = new Event('keydown', { cancelable: true }); event.key = key;
      window.dispatchEvent(event); return event.defaultPrevented;
    },
    finishReveal() {
      reveals.at(-1).vars.onComplete();
      tweens.at(-1).vars.onComplete();
    },
    async advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        const [id, timer] = next; timers.delete(id); now = timer.at; timer.callback(); await flush();
      }
      now = end; await flush();
    },
  };
}

test('About intro: a ready mark still waits for the logo fill, and unlocks only after reveal finishes', async (t) => {
  const intro = introHarness({ ready: true }); t.after(intro.setup());
  await intro.advance(1199); assert.equal(intro.reveals.length, 0);
  await intro.advance(1); assert.equal(intro.reveals.length, 1);
  assert.equal(intro.locked, true);
  assert.equal(intro.html.dataset.introActive, 'true');
  assert.equal(intro.key('Tab'), true);
  intro.finishReveal();
  assert.equal(intro.locked, false);
  assert.equal(intro.key('ArrowDown'), false);
  assert.equal(intro.main.style['clip-path'], undefined);
  assert.equal(intro.main.style['-webkit-clip-path'], undefined);
  assert.equal(intro.overlay.style.visibility, 'hidden');
  assert.equal(intro.seen, 1);
});

test('About intro: a slow mark holds the page beyond the old 2.5s deadline and reveals when ready', async (t) => {
  const intro = introHarness(); t.after(intro.setup());
  await intro.advance(3200);
  assert.equal(intro.reveals.length, 0, 'a filled logo is not canvas readiness');
  assert.equal(intro.locked, true);
  intro.markReady();
  assert.equal(intro.reveals.length, 1);
  intro.markReady();
  await intro.advance(5000);
  assert.equal(intro.reveals.length, 1, 'readiness and deadline cannot both reveal');
});

test('About intro: unavailable assets cannot hold the page indefinitely', async (t) => {
  const intro = introHarness(); t.after(intro.setup());
  await intro.advance(4999); assert.equal(intro.reveals.length, 0);
  await intro.advance(1); assert.equal(intro.reveals.length, 1);
  intro.finishReveal(); assert.equal(intro.locked, false);
});

test('About intro: StrictMode replay cannot revive the old setup', async () => {
  const intro = introHarness(); intro.setup()();
  const cleanup = intro.setup();
  await intro.advance(1200); intro.markReady();
  assert.equal(intro.reveals.length, 1);
  await intro.advance(5000); assert.equal(intro.reveals.length, 1);
  cleanup(); assert.equal(intro.timers.size, 0);
});

test('About intro: repeat and reduced-motion entry skip all animation and interaction delay', async () => {
  const intro = introHarness({ active: false }); intro.setup()();
  const cleanup = intro.setup(); await flush();
  assert.equal(intro.reveals.length, 0);
  assert.equal(intro.tweens.length, 0);
  assert.equal(intro.locked, false);
  assert.equal(intro.seen, 1, 'the cancelled skip microtask must not mark the visit');
  cleanup();
});

test('About intro: leaving before readiness cancels timers and skip microtasks', async () => {
  for (const active of [true, false]) {
    const intro = introHarness({ active }); intro.setup()();
    intro.markReady(); await intro.advance(7000);
    assert.equal(intro.reveals.length, 0);
    assert.equal(intro.seen, 0);
    assert.equal(intro.timers.size, 0);
  }
});

test('About intro: leaving during reveal kills animations and rejects a stale completion', async () => {
  const intro = introHarness({ ready: true }); const cleanup = intro.setup();
  await intro.advance(1200); const reveal = intro.reveals[0]; cleanup();
  const count = intro.tweens.length;
  reveal.vars.onComplete();
  assert.equal(intro.tweens.length, count);
  assert.ok(intro.tweens.every((animation) => animation.killed));
  assert.equal(intro.seen, 0);
});
