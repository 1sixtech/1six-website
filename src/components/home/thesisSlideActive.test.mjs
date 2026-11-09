import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Neighbouring Thesis slides stay mounted so a change shows art at once. Each
// is told whether it is the one on screen, on both layouts, so that a hidden
// slide's canvas holds still.
const TOTAL = 7;
const ThesisSlideActive = Symbol('ThesisSlideActive');
const jsx = (type, props) => ({ type, props });
const runtime = { jsx, jsxs: jsx, Fragment: Symbol('Fragment') };
const noop = () => {};

function load(relative, dependencies, globals = {}) {
  const file = new URL(relative, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: file.pathname,
  });
  const exports = {};
  new vm.Script(outputText, { filename: file.pathname }).runInContext(vm.createContext({
    ...globals,
    exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `unmocked dependency: ${name}`);
      return dependencies[name];
    },
  }));
  return exports;
}

/** Every slide's provider in a rendered tree, in slide order. */
function providers(node, found = []) {
  if (Array.isArray(node)) node.forEach((child) => providers(child, found));
  else if (node && typeof node === 'object') {
    if (node.type === ThesisSlideActive) found.push(node);
    providers(node.props?.children, found);
  }
  return found;
}

const text = (node) => (typeof node === 'string' ? node : text(node.props.children));

/** `useState(0)` is each layout's slide index; the rest keep their initial value. */
const reactAt = (slide) => ({
  useRef: (current) => ({ current }),
  useState: (initial) => [initial === 0 ? slide : initial, noop],
  useCallback: (callback) => callback,
  useEffect: noop,
  useSyncExternalStore: () => false,
});
const THESIS_STATES = Array.from({ length: TOTAL }, (_, id) => ({ id, mobileContent: `phone ${id}`, desktopContent: `desktop ${id}` }));
const thesisData = { TOTAL, THESIS_STATES };

function renderMobile(slide) {
  const { ThesisSectionMobile } = load('./ThesisSectionMobile.tsx', {
    react: reactAt(slide),
    'react/jsx-runtime': runtime,
    'swiper/react': { Swiper: Symbol('Swiper'), SwiperSlide: Symbol('SwiperSlide') },
    'swiper/modules': { EffectFade: Symbol('EffectFade') },
    'swiper/css': {},
    'swiper/css/effect-fade': {},
    '@/lib/hashScroll': { HASH_SCROLL_REQUEST_EVENT: 'hash', PAGE_TOP_REQUEST: 'top' },
    './thesisData': thesisData,
    './thesisSlideActive': { ThesisSlideActive },
    './captureSettle': { movedAwayFrom: () => false },
  });
  return ThesisSectionMobile();
}

function renderDesktop(slide) {
  const { ThesisSection } = load('./ThesisSection.tsx', {
    react: reactAt(slide),
    'react/jsx-runtime': runtime,
    gsap: { default: { registerPlugin: noop } },
    'gsap/ScrollTrigger': { ScrollTrigger: {} },
    'gsap/Observer': { Observer: {} },
    '@gsap/react': { useGSAP: noop },
    '@/hooks/useReducedMotion': { useReducedMotion: () => false },
    '@/lib/hashScroll': { HASH_SCROLL_REQUEST_EVENT: 'hash', PAGE_TOP_REQUEST: 'top' },
    './thesisData': thesisData,
    './thesisSlideActive': { ThesisSlideActive },
    './ThesisSectionMobile': { ThesisSectionMobile: Symbol('ThesisSectionMobile') },
  });
  const desktop = ThesisSection();
  return desktop.type(desktop.props);
}

/** The desktop layout with its effects run, its pages mounted, and gsap recorded. */
function mountDesktop() {
  const sets = [];
  const timelines = [];
  const effects = [];
  const setups = [];
  let trigger;
  const window = new EventTarget();
  Object.assign(window, { innerWidth: 1440, scrollTo: noop });
  const { ThesisSection } = load('./ThesisSection.tsx', {
    react: { ...reactAt(0), useEffect: (setup) => effects.push(setup) },
    'react/jsx-runtime': runtime,
    gsap: {
      default: {
        registerPlugin: noop,
        set: (element, vars) => sets.push({ page: element.page, ...vars }),
        timeline: () => {
          const timeline = { killed: false, to: () => timeline, fromTo: () => timeline, kill() { this.killed = true; } };
          timelines.push(timeline);
          return timeline;
        },
      },
    },
    'gsap/ScrollTrigger': {
      ScrollTrigger: {
        config: noop,
        create: (config) => {
          trigger = config;
          return { kill: noop, start: 0, end: 600 };
        },
      },
    },
    'gsap/Observer': { Observer: { create: () => ({ enable: noop, disable: noop }) } },
    '@gsap/react': { useGSAP: (setup) => setups.push(setup) },
    '@/hooks/useReducedMotion': { useReducedMotion: () => false },
    '@/lib/hashScroll': { HASH_SCROLL_REQUEST_EVENT: 'hash', PAGE_TOP_REQUEST: 'top' },
    './thesisData': thesisData,
    './thesisSlideActive': { ThesisSlideActive },
    './ThesisSectionMobile': { ThesisSectionMobile: Symbol('ThesisSectionMobile') },
  }, { window, document: { readyState: 'complete', documentElement: { classList: { add: noop, remove: noop } } } });
  const desktop = ThesisSection();
  const tree = desktop.type(desktop.props);
  const dots = [];
  let page = 0;
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (typeof node.props?.ref === 'function') node.props.ref({ page: page++ });
    else if (node.props?.ref) node.props.ref.current = { addEventListener: noop, removeEventListener: noop };
    if (node.props?.['aria-label']?.startsWith('Go to section')) dots.push(node);
    walk(node.props?.children);
  };
  walk(tree);
  effects.forEach((setup) => setup());
  setups.forEach((setup) => setup());
  return { sets, timelines, dots, window, trigger };
}

test('Thesis desktop: a return to the top stops a crossfade in flight and shows page one', () => {
  const { sets, timelines, dots, window } = mountDesktop();
  dots[3].props.onClick();
  assert.equal(timelines.length, 1);

  // A section name is not this request and must not disturb the crossfade.
  window.dispatchEvent(new CustomEvent('hash', { detail: { hash: 'products' } }));
  assert.equal(timelines[0].killed, false);

  sets.length = 0;
  window.dispatchEvent(new CustomEvent('hash', { detail: { hash: 'top' } }));
  assert.equal(timelines[0].killed, true, 'its completion would scroll back into Thesis');
  assert.deepEqual(sets.map(({ page, autoAlpha, yPercent }) => [page, autoAlpha, yPercent]),
    Array.from({ length: TOTAL }, (_, page) => [page, page === 0 ? 1 : 0, 0]));

  dots[2].props.onClick();
  assert.equal(timelines.length, 2, 'a stopped crossfade must not leave the pages locked as animating');
});

test('Thesis desktop: a jump from below the pin to Hero rests on page one', () => {
  const { sets, trigger } = mountDesktop();
  sets.length = 0;
  // ScrollTrigger reports a jump across the whole pin as re-entering it and leaving it.
  trigger.onEnterBack();
  trigger.onLeaveBack();
  const shown = new Map(sets.map(({ page, autoAlpha }) => [page, autoAlpha]));
  assert.deepEqual([...shown], Array.from({ length: TOTAL }, (_, page) => [page, page === 0 ? 1 : 0]));
});

test('Thesis: only the slide on screen is active on either layout, and a hidden slide tells its canvas to hold still', () => {
  for (const [render, content] of [[renderMobile, 'phone'], [renderDesktop, 'desktop']]) {
    const middle = providers(render(3));
    assert.deepEqual(middle.map(({ props }) => props.value), [false, true, false], `${content}: slide 4 and its neighbours`);
    assert.deepEqual(middle.map(({ props }) => text(props.children)), [2, 3, 4].map((slide) => `${content} ${slide}`));

    const first = providers(render(0));
    assert.deepEqual(first.map(({ props }) => props.value), [true, false], `${content}: the first slide has one neighbour`);
  }

  // Outside any slide (the reduced-motion layout renders none) a canvas just runs.
  const { ThesisSlideActive: context } = load('./thesisSlideActive.ts', {
    react: { createContext: (defaultValue) => ({ defaultValue }) },
  });
  assert.equal(context.defaultValue, true);

  for (const active of [true, false]) {
    const AsciiCanvas = Symbol('AsciiCanvas');
    const { AsciiThesis } = load('../ascii/AsciiThesis.tsx', {
      react: {
        useContext: (asked) => { assert.equal(asked, ThesisSlideActive); return active; },
        useRef: (current) => ({ current }),
        useLayoutEffect: noop,
        useCallback: (callback) => callback,
      },
      'react/jsx-runtime': runtime,
      'next/dynamic': { default: () => AsciiCanvas },
      '@/lib/introState': { setRouteVisualReady: noop },
      '@/lib/siteAssets': { ATLASES: { dark: { thesis: '/sheet.png' } }, THESIS_SLIDE_VIDEOS: ['/slide.mp4'] },
      '@/components/providers/ThemeProvider': { useTheme: () => ({ theme: 'dark' }) },
      '@/components/home/thesisSlideActive': { ThesisSlideActive },
    });
    const canvas = AsciiThesis({ stateNumber: 1 });
    assert.equal(canvas.type, AsciiCanvas);
    assert.equal(canvas.props.paused, !active);
    assert.equal(canvas.props.eager, true, 'it stays built, so the slide change shows art at once');
  }
});
