import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Run the component's actual effects and event handlers. Browser scroll requests
// are recorded without automatically moving the viewport: native scroll events
// can continue after capture, as observed during an iOS 27 momentum scroll.
// This verifies our response to that drift, not WebKit's native cancellation.
const componentFile = new URL('./ThesisSectionMobile.tsx', import.meta.url);
const THESIS_TOP = 714;
const GRAPH_TOP = 1468;
const TOTAL = 7;

function compile(file) {
  return ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: file.pathname,
  }).outputText;
}

const componentCode = compile(componentFile);

function thesisHarness({ scrollY = 0 } = {}) {
  const effects = [];
  const frames = [];
  const timers = new Map();
  const scrollRequests = [];
  const classes = new Set();
  let now = 0;
  let timerId = 0;
  let sectionRectReads = 0;
  const window = new EventTarget();
  window.scrollY = scrollY;
  window.location = { hash: '', search: '' };
  window.visualViewport = new EventTarget();
  window.scrollTo = ({ top, behavior }) => scrollRequests.push({ top, behavior });
  const section = new EventTarget();
  // A non-zero offset parent ensures captures use document coordinates.
  section.offsetTop = 500;
  section.offsetParent = { offsetTop: THESIS_TOP - 500, offsetParent: null };
  section.getBoundingClientRect = () => {
    sectionRectReads++;
    return { top: THESIS_TOP - window.scrollY };
  };
  const document = new EventTarget();
  document.documentElement = {
    dataset: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
  };
  document.getElementById = (id) => id === 'thesis-graph' ? {
    getBoundingClientRect: () => ({ top: GRAPH_TOP - window.scrollY }),
  } : null;
  const swiper = {
    activeIndex: 0,
    allowTouchMove: false,
    slideTo(index) { this.activeIndex = index; },
  };
  const Swiper = Symbol('Swiper');
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: {
      useRef: (value) => ({ current: value }),
      useState: (initial) => [initial, () => {}],
      useCallback: (callback) => callback,
      useEffect: (setup) => effects.push(setup),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: Symbol('Fragment') },
    'swiper/react': { Swiper, SwiperSlide: Symbol('SwiperSlide') },
    'swiper/modules': { EffectFade: Symbol('EffectFade') },
    'swiper/css': {},
    'swiper/css/effect-fade': {},
    '@/lib/hashScroll': { HASH_SCROLL_REQUEST_EVENT: '1six:hash-scroll-request' },
    './thesisData': {
      TOTAL,
      THESIS_STATES: Array.from({ length: TOTAL }, (_, id) => ({ id })),
    },
  };
  const globals = {
    window,
    document,
    CustomEvent,
    Date: { now: () => now },
    requestAnimationFrame: (callback) => frames.push(callback),
    setTimeout(callback, delay) {
      timers.set(++timerId, { at: now + delay, callback });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  function load(code, file) {
    const exports = {};
    const context = vm.createContext({
      ...globals,
      exports,
      require(specifier) {
        if (specifier === './captureSettle') {
          const helperFile = new URL('./captureSettle.ts', componentFile);
          return load(compile(helperFile), helperFile);
        }
        assert.ok(Object.hasOwn(dependencies, specifier), `unmocked dependency: ${specifier}`);
        return dependencies[specifier];
      },
    });
    new vm.Script(code, { filename: file.pathname }).runInContext(context);
    return exports;
  }
  const { ThesisSectionMobile } = load(componentCode, componentFile);
  function mount(node) {
    if (Array.isArray(node)) return node.forEach(mount);
    if (!node || typeof node !== 'object') return;
    if (node.props?.ref) {
      node.props.ref.current = node.props.id === 'thesis' ? section : {};
    }
    if (node.type === Swiper) node.props.onSwiper(swiper);
    mount(node.props?.children);
  }
  mount(ThesisSectionMobile());
  const cleanups = effects.map((setup) => setup());

  return {
    document, swiper, scrollRequests,
    get sectionRectReads() { return sectionRectReads; },
    get captured() {
      return classes.has('thesis-scroll-lock')
        && document.documentElement.dataset.thesisCaptured === '1';
    },
    scroll(top) {
      window.scrollY = top;
      window.dispatchEvent(new Event('scroll'));
    },
    swipe(startY, endY) {
      const start = new Event('touchstart');
      start.touches = [{ clientY: startY }];
      section.dispatchEvent(start);
      const end = new Event('touchend');
      end.changedTouches = [{ clientY: endY }];
      section.dispatchEvent(end);
    },
    pageTouchMove() {
      const event = new Event('touchmove', { cancelable: true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    },
    flushFrames() {
      while (frames.length) frames.splice(0).forEach((callback) => callback());
    },
    advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        const [id, timer] = next;
        timers.delete(id);
        now = timer.at;
        timer.callback();
      }
      now = end;
    },
    cleanup() { cleanups.forEach((cleanup) => cleanup?.()); },
  };
}

test('mobile Thesis: continued momentum after forward capture requests a smooth settle to the cached top', (t) => {
  const thesis = thesisHarness();
  t.after(() => thesis.cleanup());
  assert.equal(thesis.pageTouchMove(), false);

  thesis.scroll(780);
  assert.equal(thesis.captured, true);
  assert.equal(thesis.swiper.allowTouchMove, true);
  assert.equal(thesis.swiper.activeIndex, 0);
  assert.equal(thesis.pageTouchMove(), true);
  assert.deepEqual(thesis.scrollRequests, [{ top: THESIS_TOP, behavior: 'auto' }]);

  thesis.scroll(850);
  assert.deepEqual(thesis.scrollRequests, [
    { top: THESIS_TOP, behavior: 'auto' },
    { top: THESIS_TOP, behavior: 'smooth' },
  ], 'native momentum that survives the instant snap must trigger a separate animated request');
  assert.equal(thesis.captured, true, 'settling must retain capture and the Swiper touch gate');
  assert.equal(thesis.swiper.allowTouchMove, true);
  assert.equal(thesis.swiper.activeIndex, 0);
  assert.equal(thesis.sectionRectReads, 0, 'momentum must never rebuild the target from a viewport rect');

  for (const top of [850, 800, 760, THESIS_TOP, THESIS_TOP]) thesis.scroll(top);
  assert.equal(thesis.scrollRequests.length, 2, 'stationary or converging scroll events must not restart settling');
});

test('mobile Thesis: reverse capture settles upward drift without changing the last slide', (t) => {
  const thesis = thesisHarness({ scrollY: 1000 });
  t.after(() => thesis.cleanup());
  thesis.scroll(650);
  assert.equal(thesis.captured, true);
  assert.equal(thesis.swiper.activeIndex, TOTAL - 1);
  thesis.scroll(600);
  assert.deepEqual(thesis.scrollRequests, [
    { top: THESIS_TOP, behavior: 'auto' },
    { top: THESIS_TOP, behavior: 'smooth' },
  ]);

  for (const top of [650, 700, THESIS_TOP]) thesis.scroll(top);
  assert.equal(thesis.scrollRequests.length, 2);
  assert.equal(thesis.swiper.activeIndex, TOTAL - 1);
  assert.equal(thesis.swiper.allowTouchMove, true);
  assert.equal(thesis.sectionRectReads, 0);
});

test('mobile Thesis: stationary events and subpixel jitter do not start settling', (t) => {
  const thesis = thesisHarness();
  t.after(() => thesis.cleanup());
  thesis.scroll(THESIS_TOP);
  for (const top of [714, 714.5, 714.75, 714.5, 714, 713.5, 713.25, 714]) {
    thesis.scroll(top);
  }
  assert.deepEqual(thesis.scrollRequests, [{ top: THESIS_TOP, behavior: 'auto' }]);
});

test('mobile Thesis: the menu lock ignores synthetic scrolls in idle and captured states', (t) => {
  for (const captured of [false, true]) {
    const thesis = thesisHarness({ scrollY: 1000 });
    t.after(() => thesis.cleanup());
    if (captured) thesis.scroll(THESIS_TOP);
    const beforeMenu = [...thesis.scrollRequests];
    thesis.document.documentElement.dataset.menuOpen = '1';
    thesis.scroll(0);
    thesis.scroll(captured ? THESIS_TOP : 1000);
    delete thesis.document.documentElement.dataset.menuOpen;
    assert.deepEqual(thesis.scrollRequests, beforeMenu, `captured=${captured}: no menu-induced scroll writes`);
    assert.equal(thesis.captured, captured);

    if (captured) {
      thesis.scroll(800);
      assert.deepEqual(thesis.scrollRequests.at(-1), { top: THESIS_TOP, behavior: 'smooth' });
    } else {
      thesis.scroll(900);
      assert.deepEqual(thesis.scrollRequests, [], 'ordinary idle scrolling must remain native');
      thesis.scroll(700);
      assert.equal(thesis.captured, true, 'the real reverse crossing still captures after menu close');
      assert.equal(thesis.swiper.activeIndex, TOTAL - 1);
    }
  }
});

test('mobile Thesis: upward release leaves native scrolling free and allows immediate forward re-entry', (t) => {
  const thesis = thesisHarness();
  t.after(() => thesis.cleanup());
  thesis.scroll(THESIS_TOP);
  thesis.swipe(300, 400);
  thesis.flushFrames();
  assert.equal(thesis.captured, false);
  assert.equal(thesis.swiper.allowTouchMove, false);
  assert.equal(thesis.pageTouchMove(), false);
  for (const top of [600, 300, 0]) thesis.scroll(top);
  assert.deepEqual(thesis.scrollRequests, [
    { top: THESIS_TOP, behavior: 'auto' },
    { top: 0, behavior: 'smooth' },
  ], 'released scrolling must not be pulled back to Thesis');

  thesis.scroll(780);
  assert.equal(thesis.captured, true, 'upward exits must not introduce a re-entry cooldown');
  assert.deepEqual(thesis.scrollRequests.at(-1), { top: THESIS_TOP, behavior: 'auto' });
});

test('mobile Thesis: upward exit during settling does not reverse-capture the last slide', (t) => {
  const thesis = thesisHarness();
  t.after(() => thesis.cleanup());
  thesis.scroll(THESIS_TOP);
  thesis.scroll(850);
  thesis.scroll(800);
  thesis.swipe(300, 400);
  thesis.flushFrames();
  assert.equal(thesis.captured, false);
  assert.equal(thesis.swiper.allowTouchMove, false);
  assert.equal(thesis.pageTouchMove(), false);

  for (const top of [760, 700, 300, 0]) thesis.scroll(top);
  assert.equal(thesis.captured, false,
    'an upward exit from below the Thesis top must not look like reverse entry');
  assert.equal(thesis.swiper.activeIndex, 0, 'leaving slide one must not recapture slide seven');
  assert.deepEqual(thesis.scrollRequests, [
    { top: THESIS_TOP, behavior: 'auto' },
    { top: THESIS_TOP, behavior: 'smooth' },
    { top: 0, behavior: 'smooth' },
  ]);
});

test('mobile Thesis: unsettled upward exit permits forward re-entry before the bottom guard expires', (t) => {
  const thesis = thesisHarness();
  t.after(() => thesis.cleanup());
  thesis.scroll(THESIS_TOP);
  thesis.scroll(850);
  thesis.scroll(800);
  thesis.swipe(300, 400);
  thesis.flushFrames();
  thesis.scroll(700);
  assert.equal(thesis.captured, false, 'the exit crossing must stay released');

  // Reverse immediately while the 1200 ms bottom-only guard is still active.
  // A blanket suspend window would silently lose this forward crossing.
  thesis.advance(100);
  thesis.scroll(780);
  assert.equal(thesis.captured, true, 'the top boundary must remain available for immediate re-entry');
  assert.equal(thesis.swiper.activeIndex, 0);
  assert.equal(thesis.swiper.allowTouchMove, true);
  assert.equal(thesis.pageTouchMove(), true);
  assert.deepEqual(thesis.scrollRequests, [
    { top: THESIS_TOP, behavior: 'auto' },
    { top: THESIS_TOP, behavior: 'smooth' },
    { top: 0, behavior: 'smooth' },
    { top: THESIS_TOP, behavior: 'auto' },
  ]);
});

test('mobile Thesis: downward release retains its cooldown and does not replay a crossed boundary', (t) => {
  const thesis = thesisHarness();
  t.after(() => thesis.cleanup());
  thesis.scroll(THESIS_TOP);
  thesis.swiper.slideTo(TOTAL - 1);
  thesis.swipe(300, 200);
  thesis.flushFrames();
  assert.equal(thesis.captured, false);
  assert.equal(thesis.swiper.allowTouchMove, false);
  assert.equal(thesis.pageTouchMove(), false);
  for (const top of [900, 700, 800]) thesis.scroll(top);
  thesis.advance(1232);
  assert.equal(thesis.captured, false, 'cooldown expiry must not replay a past crossing');
  assert.deepEqual(thesis.scrollRequests, [
    { top: THESIS_TOP, behavior: 'auto' },
    { top: GRAPH_TOP + 1, behavior: 'smooth' },
  ], 'a mid-exit reversal must stay released throughout the downward cooldown');

  thesis.scroll(900);
  thesis.scroll(700);
  assert.equal(thesis.captured, true);
  assert.equal(thesis.swiper.activeIndex, TOTAL - 1);
  assert.deepEqual(thesis.scrollRequests.at(-1), { top: THESIS_TOP, behavior: 'auto' });
});
