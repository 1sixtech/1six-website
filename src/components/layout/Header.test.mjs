import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as site from '../../lib/site.ts';

// Render the actual Header and run its effects with controlled hooks. The real
// hash-scroll helpers run too; only their browser and GSAP boundaries are fake.
// This tests navigation and menu-lock ownership, not native touch scrolling.
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

const headerFile = new URL('./Header.tsx', import.meta.url);
const hashFile = new URL('../../lib/hashScroll.ts', import.meta.url);
const headerCode = compile(headerFile);
const hashCode = compile(hashFile);

function headerHarness({ pathname = '/thesis', scrollY = 844 } = {}) {
  const hooks = [];
  const frames = [];
  const trace = [];
  const thesisTop = 844;
  const window = new EventTarget();
  window.scrollY = scrollY;
  window.scrollTo = (options, y) => {
    window.scrollY = typeof options === 'number' ? y : options.top;
    trace.push({ type: 'scroll', top: window.scrollY });
  };
  const document = {
    body: { style: {} },
    documentElement: { dataset: { thesisCaptured: '1' } },
    getElementById: (id) => id === 'thesis' ? {
      getBoundingClientRect: () => ({ top: thesisTop - window.scrollY }),
    } : null,
  };
  let url = pathname;
  let cursor = 0;
  let rendered;
  let pendingEffects;
  const changed = (previous, next) => !previous || !next
    || previous.length !== next.length
    || next.some((value, index) => !Object.is(value, previous[index]));
  const effect = (setup, deps) => {
    const index = cursor++;
    const previous = hooks[index];
    if (changed(previous?.deps, deps)) pendingEffects.push({ index, setup, deps });
  };
  const Link = Symbol('Link');
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: {
      useRef(value) {
        const index = cursor++;
        hooks[index] ??= { current: value };
        return hooks[index];
      },
      useState(initial) {
        const index = cursor++;
        hooks[index] ??= { value: initial };
        return [hooks[index].value, (value) => {
          hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value;
        }];
      },
      useCallback(callback, deps) {
        const index = cursor++;
        if (changed(hooks[index]?.deps, deps)) hooks[index] = { callback, deps };
        return hooks[index].callback;
      },
      useEffect: effect,
      useLayoutEffect: effect,
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: Symbol('Fragment') },
    'next/link': Link,
    'next/navigation': { usePathname: () => pathname },
    gsap: { registerPlugin() {} },
    'gsap/ScrollTrigger': { ScrollTrigger: {
      refresh: () => trace.push({ type: 'refresh' }),
    } },
    '@/hooks/useScrollReveal': { useScrollReveal: () => true },
    '@/components/ui/Logo': { LogoHeader: Symbol('Logo') },
    '@/components/ui/ThemeToggle': { ThemeToggle: Symbol('ThemeToggle') },
    '@/lib/site': site,
  };
  const globals = {
    document,
    window,
    CustomEvent,
    history: {
      pushState(_state, _title, next) {
        const nextUrl = new URL(next, `https://example.test${url}`);
        url = nextUrl.pathname + nextUrl.hash;
        trace.push({ type: 'history', url });
      },
    },
    requestAnimationFrame: (callback) => frames.push(callback),
  };
  function load(code, file) {
    const exports = {};
    const context = vm.createContext({
      ...globals,
      exports,
      require(specifier) {
        assert.ok(Object.hasOwn(dependencies, specifier), `unmocked dependency: ${specifier}`);
        return dependencies[specifier];
      },
    });
    new vm.Script(code, { filename: file.pathname }).runInContext(context);
    return exports;
  }
  const hashScroll = load(hashCode, hashFile);
  dependencies['@/lib/hashScroll'] = hashScroll;
  window.addEventListener(hashScroll.HASH_SCROLL_REQUEST_EVENT, (event) => {
    trace.push({
      type: 'capture-request', hash: event.detail.hash,
      position: document.body.style.position,
      menuOpen: document.documentElement.dataset.menuOpen,
    });
  });
  const { Header } = load(headerCode, headerFile);
  function render() {
    cursor = 0;
    pendingEffects = [];
    rendered = Header();
    // DOM animation/focus refs intentionally remain null. Menu scroll-lock
    // effects still run, including cleanup and the subsequent close effect.
    for (const { index, setup, deps } of pendingEffects) {
      hooks[index]?.cleanup?.();
      hooks[index] = { deps, cleanup: setup() };
    }
  }
  function walk(node, predicate) {
    if (Array.isArray(node)) return node.map((child) => walk(child, predicate)).find(Boolean);
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    return walk(node.props?.children, predicate);
  }
  const find = (predicate) => walk(rendered, predicate);
  render();
  return {
    document, window, trace,
    get url() { return url; },
    get menuOpen() { return !!find((node) => node.props?.id === 'mobile-menu'); },
    openMenu() {
      find((node) => node.props?.['aria-label'] === 'Menu').props.onClick();
      render();
      assert.equal(document.body.style.position, 'fixed');
      assert.equal(document.documentElement.dataset.menuOpen, '1');
    },
    clickNav(href, { mobile = true, ...modifiers } = {}) {
      const link = find((node) => node.type === Link && node.props.href === href
        && Object.hasOwn(node.props, 'data-menu-item') === mobile);
      assert.ok(link, `rendered ${mobile ? 'mobile' : 'desktop'} link: ${href}`);
      const event = {
        button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        ...modifiers,
      };
      link.props.onClick(event);
      render();
      return event;
    },
    flushFrames() {
      while (frames.length) frames.splice(0).forEach((callback) => callback());
    },
    closeMenu() {
      find((node) => node.props?.['aria-label'] === 'Close menu').props.onClick();
      render();
    },
  };
}

test('header: same-route mobile Thesis prevents Hero navigation and requests capture after unlocking the menu', () => {
  // A different saved menu position makes an accidental restoration observable.
  const header = headerHarness({ scrollY: 1200 });
  header.openMenu();
  const event = header.clickNav('/thesis');

  assert.equal(event.defaultPrevented, true, 'Next must not scroll the captured page to Hero');
  assert.equal(header.menuOpen, false);
  assert.equal(header.document.body.style.position, '');
  assert.equal(header.document.documentElement.dataset.menuOpen, undefined);
  assert.equal(header.document.documentElement.dataset.thesisCaptured, '1');
  assert.deepEqual(header.trace, [
    { type: 'capture-request', hash: 'thesis', position: '', menuOpen: undefined },
    { type: 'history', url: '/thesis#thesis' },
    { type: 'refresh' },
  ]);
  header.flushFrames();
  assert.equal(header.window.scrollY, 844);
  assert.deepEqual(header.trace.filter((event) => event.type === 'scroll'), [{ type: 'scroll', top: 844 }],
    'closing the menu must not restore its previous position after the target scroll');
});

test('header: modified and non-primary Thesis clicks preserve native Link behavior and the open menu', () => {
  for (const modifiers of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const header = headerHarness();
    header.openMenu();
    const event = header.clickNav('/thesis', modifiers);
    header.flushFrames();
    assert.equal(event.defaultPrevented, false, JSON.stringify(modifiers));
    assert.equal(header.menuOpen, true);
    assert.equal(header.document.body.style.position, 'fixed');
    assert.equal(header.document.documentElement.dataset.menuOpen, '1');
    assert.equal(header.url, '/thesis');
    assert.deepEqual(header.trace, []);
  }
});

test('header: cross-route mobile links release the menu without intercepting Next navigation or restoring scroll', () => {
  for (const [pathname, href] of [['/thesis', '/writing'], ['/thesis', '/'], ['/', '/thesis']]) {
    const header = headerHarness({ pathname, scrollY: 1200 });
    header.openMenu();
    const event = header.clickNav(href);
    header.flushFrames();
    assert.equal(event.defaultPrevented, false, `${pathname} -> ${href}`);
    assert.equal(header.menuOpen, false);
    assert.equal(header.document.body.style.position, '');
    assert.equal(header.document.documentElement.dataset.menuOpen, undefined);
    assert.deepEqual(header.trace, [], 'Next owns the destination scroll');
  }
});

test('header: desktop Thesis uses the section target without poisoning a later ordinary menu close', () => {
  const header = headerHarness();
  assert.equal(header.clickNav('/thesis', { mobile: false }).defaultPrevented, true);
  header.flushFrames();
  assert.equal(header.url, '/thesis#thesis');
  assert.equal(header.window.scrollY, 844);

  header.window.scrollY = 1400;
  header.openMenu();
  header.window.scrollY = 0;
  header.closeMenu();
  header.flushFrames();
  assert.equal(header.window.scrollY, 1400, 'a desktop click must not leave a stale manual-unlock flag');
  assert.equal(header.document.documentElement.dataset.menuOpen, undefined);

  header.trace.length = 0;
  assert.equal(header.clickNav('/writing', { mobile: false }).defaultPrevented, false);
  header.flushFrames();
  assert.deepEqual(header.trace, [], 'ordinary desktop cross-route navigation stays with Next');
});
