import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual component's effect with controlled dependencies. Transpiling
// to CommonJS lets the harness replace React/GSAP without a DOM or new packages.
const file = new URL('./IntroOrchestrator.tsx', import.meta.url);
const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: file.pathname,
});

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

function introHarness({ active = true } = {}) {
  let effect;
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const ready = new Set();
  const reveals = [];
  const tweens = [];
  const events = [];
  const window = new EventTarget();
  for (const name of ['intro:revealed', 'intro:done']) {
    window.addEventListener(name, () => events.push(name));
  }
  const tween = () => {
    const result = { killed: false, kill() { this.killed = true; } };
    tweens.push(result);
    return result;
  };
  const dependencies = {
    react: {
      useEffect: (setup) => { effect = setup; },
      // Preserve ref identity when replaying an effect, as StrictMode does.
      useRef: (value) => ({ current: value }),
    },
    gsap: {
      to: tween,
      fromTo: (target, from, to) => {
        const result = tween();
        reveals.push(result);
        to.onStart?.();
        return result;
      },
    },
    '@/lib/videoPool': {
      warmupAll: async (urls) => urls.map(() => ({ status: 'fulfilled' })),
    },
    '@/lib/introState': {
      HOMEPAGE_ASCII_TARGETS: [{ key: 'hero', textureUrl: '/hero.mp4', assetType: 'video' }],
      computeExpectedReadyKeys: () => ['hero'],
      getReadyKeys: () => ready,
    },
  };
  const exports = {};
  const context = vm.createContext({
    exports,
    require(specifier) {
      assert.ok(Object.hasOwn(dependencies, specifier), `unmocked dependency: ${specifier}`);
      return dependencies[specifier];
    },
    document: { documentElement: { dataset: active ? { introActive: 'true' } : {} } },
    window,
    CustomEvent,
    sessionStorage: { setItem() {} },
    console: { warn() {} },
    queueMicrotask,
    setTimeout(callback, delay) {
      timers.set(++timerId, { at: now + delay, callback });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  new vm.Script(outputText, { filename: file.pathname }).runInContext(context);
  exports.IntroOrchestrator({
    fillRectRef: { current: { setAttribute() {} } },
    overlayRef: { current: { style: {} } },
    mainContentRef: { current: {} },
  });

  return {
    setup: () => effect(),
    reveals,
    tweens,
    events,
    markReady() {
      ready.add('hero');
      window.dispatchEvent(new CustomEvent('ascii:ready'));
    },
    async advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        const [id, timer] = next;
        timers.delete(id);
        now = timer.at;
        timer.callback();
        await flushMicrotasks();
      }
      now = end;
      await flushMicrotasks();
    },
  };
}

test('intro: StrictMode replay cannot revive the first setup when its hardcap expires', async () => {
  const intro = introHarness();
  intro.setup()();
  const cleanup = intro.setup();
  await intro.advance(1200);
  assert.equal(intro.reveals.length, 0, 'the current setup still waits for its canvas');
  intro.markReady();
  await flushMicrotasks();
  assert.equal(intro.reveals.length, 1, 'the current setup reveals once');
  await intro.advance(1300);
  assert.equal(intro.reveals.length, 1, 'the disposed setup must not restart the reveal');
  assert.deepEqual(intro.events, ['intro:revealed']);
  cleanup();
});

test('intro: StrictMode replay publishes skip-mode events only from the live setup', async () => {
  const intro = introHarness({ active: false });
  intro.setup()();
  const cleanup = intro.setup();
  await flushMicrotasks();
  assert.deepEqual(intro.events, ['intro:revealed', 'intro:done']);
  assert.equal(intro.reveals.length, 0);
  cleanup();
});

test('intro: leaving before readiness cancels pending timers and skip-mode microtasks', async () => {
  for (const active of [true, false]) {
    const intro = introHarness({ active });
    intro.setup()();
    intro.markReady();
    await intro.advance(3000);
    assert.equal(intro.reveals.length, 0, `active=${active}: no reveal after route cleanup`);
    assert.deepEqual(intro.events, [], `active=${active}: no lifecycle events after route cleanup`);
  }
});

test('intro: leaving during the reveal kills the active animations', async () => {
  const intro = introHarness();
  const cleanup = intro.setup();
  intro.markReady();
  await intro.advance(1200);
  assert.equal(intro.reveals.length, 1);
  cleanup();
  assert.ok(intro.tweens.every((animation) => animation.killed));
  await intro.advance(1300);
  assert.equal(intro.reveals.length, 1, 'the hardcap cannot start another animation after cleanup');
});
