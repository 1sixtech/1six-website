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
    '@/lib/hashScroll': { HASH_SCROLL_REQUEST_EVENT: 'hash' },
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
    './thesisData': thesisData,
    './thesisSlideActive': { ThesisSlideActive },
    './ThesisSectionMobile': { ThesisSectionMobile: Symbol('ThesisSectionMobile') },
  });
  const desktop = ThesisSection();
  return desktop.type(desktop.props);
}

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
