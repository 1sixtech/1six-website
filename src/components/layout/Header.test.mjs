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

function headerHarness({ pathname = '/thesis', scrollY = 844, hash = '' } = {}) {
  const hooks = [];
  const frames = [];
  const trace = [];
  const unlocks = [];
  const timers = new Map();
  const delays = [];
  let timerId = 0;
  const window = new EventTarget();
  window.scrollY = scrollY;
  window.scrollTo = (options, y) => {
    window.scrollY = typeof options === 'number' ? y : options.top;
    trace.push({ type: 'scroll', top: window.scrollY });
  };
  let bodyPosition = '';
  const document = {
    body: {
      style: {
        get position() { return bodyPosition; },
        set position(value) {
          // What the snap flag held at the moment the page regrew.
          if (bodyPosition === 'fixed' && value === '') unlocks.push(document.documentElement.dataset.navLeaving);
          bodyPosition = value;
        },
      },
    },
    documentElement: { dataset: {} },
  };
  let url = pathname + hash;
  Object.defineProperty(window, 'location', { get: () => new URL(url, 'https://example.test') });
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
    'gsap/ScrollTrigger': { ScrollTrigger: {} },
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
      replaceState(_state, _title, next) {
        const nextUrl = new URL(next, `https://example.test${url}`);
        url = nextUrl.pathname + nextUrl.hash;
        trace.push({ type: 'history-replace', url });
      },
    },
    requestAnimationFrame: (callback) => frames.push(callback),
    setTimeout(callback, delay) {
      timers.set(++timerId, callback);
      delays.push(delay);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
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
    document, window, trace, unlocks, delays,
    get url() { return url; },
    get pendingTimers() { return timers.size; },
    runTimers() {
      for (const [id, callback] of [...timers]) {
        timers.delete(id);
        callback();
      }
    },
    navigate(next) {
      pathname = next;
      url = next;
      render();
    },
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

test('header: same-route mobile Thesis returns to Hero after unlocking the menu', () => {
  // A different saved menu position makes an accidental restoration observable.
  const header = headerHarness({ scrollY: 1200 });
  header.openMenu();
  const event = header.clickNav('/thesis');

  assert.equal(event.defaultPrevented, true, 'a same-route Link cannot release the captured slider');
  assert.equal(header.menuOpen, false);
  assert.equal(header.document.body.style.position, '');
  assert.equal(header.document.documentElement.dataset.menuOpen, undefined);
  assert.equal(header.url, '/thesis', 'no section hash, or a reload would skip Hero');
  assert.deepEqual(header.trace, [
    { type: 'capture-request', hash: 'top', position: '', menuOpen: undefined },
    { type: 'history-replace', url: '/thesis' },
    { type: 'scroll', top: 0 },
  ]);
  header.flushFrames();
  assert.equal(header.window.scrollY, 0);
  assert.deepEqual(header.trace.filter((entry) => entry.type === 'scroll'), [{ type: 'scroll', top: 0 }],
    'closing the menu must not restore its previous position');
});

test('header: same-route Thesis drops a section hash without adding a history entry', () => {
  for (const hash of ['#thesis', '#products']) {
    const header = headerHarness({ hash, scrollY: 2000 });
    header.clickNav('/thesis', { mobile: false });
    assert.equal(header.url, '/thesis', hash);
    assert.equal(header.window.scrollY, 0, hash);
    assert.deepEqual(header.trace.filter((entry) => entry.type.startsWith('history')),
      [{ type: 'history-replace', url: '/thesis' }], hash);
  }
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

test('header: desktop Thesis returns to Hero without poisoning a later ordinary menu close', () => {
  const header = headerHarness();
  assert.equal(header.clickNav('/thesis', { mobile: false }).defaultPrevented, true);
  header.flushFrames();
  assert.equal(header.url, '/thesis');
  assert.equal(header.window.scrollY, 0);

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

test('header: a menu link leaving a page turns its snap off before the unlock and until the route commits', () => {
  for (const href of ['/thesis', '/writing']) {
    const header = headerHarness({ pathname: '/', scrollY: 1508 });
    header.openMenu();
    header.window.scrollY = 0;
    header.clickNav(href);
    header.flushFrames();
    assert.deepEqual(header.unlocks, ['1'], `${href}: the page must regrow with snap already off`);
    assert.equal(header.document.documentElement.dataset.navLeaving, '1', `${href}: off until the route commits`);
    header.navigate(href);
    assert.equal(header.document.documentElement.dataset.navLeaving, undefined, `${href}: cleared with the route`);
    assert.equal(header.window.scrollY, 0, `${href}: no restored position`);
  }
});

test('header: a navigation that never commits cannot leave the snap off for the rest of the visit', () => {
  const header = headerHarness({ pathname: '/', scrollY: 1508 });
  header.openMenu();
  header.clickNav('/thesis');
  assert.equal(header.document.documentElement.dataset.navLeaving, '1');
  assert.equal(header.pendingTimers, 1);
  assert.deepEqual(header.delays, [5000], 'it has to outlast a slow route commit');
  header.runTimers();
  assert.equal(header.document.documentElement.dataset.navLeaving, undefined);
});

test('header: a committed route cancels the snap expiry, and a newer press restarts it', () => {
  const committed = headerHarness({ pathname: '/', scrollY: 1508 });
  committed.openMenu();
  committed.clickNav('/thesis');
  committed.navigate('/thesis');
  assert.equal(committed.pendingTimers, 0);

  const repeated = headerHarness({ pathname: '/', scrollY: 1508 });
  repeated.openMenu();
  repeated.clickNav('/thesis');
  repeated.openMenu();
  repeated.clickNav('/writing');
  assert.equal(repeated.pendingTimers, 1, 'one expiry per pending navigation');
});

test('header: closing the menu after a route change under it keeps the new page where it is', () => {
  const header = headerHarness({ pathname: '/', scrollY: 1688 });
  header.openMenu();
  // Browser Back while the menu covers the page.
  header.window.scrollY = 0;
  header.navigate('/thesis');
  assert.equal(header.menuOpen, true);
  assert.equal(header.document.body.style.position, 'fixed', 'the new page stays locked behind the menu');
  assert.equal(header.document.documentElement.dataset.menuOpen, '1');

  header.closeMenu();
  header.flushFrames();
  assert.equal(header.window.scrollY, 0, "the previous page's offset must not carry over");
  assert.equal(header.document.body.style.position, '');
  assert.equal(header.document.documentElement.dataset.menuOpen, undefined);
});

test('header: only a real route change turns the snap off', () => {
  const closed = headerHarness({ pathname: '/', scrollY: 1508 });
  closed.openMenu();
  closed.window.scrollY = 0;
  closed.closeMenu();
  closed.flushFrames();
  assert.equal(closed.document.documentElement.dataset.navLeaving, undefined, 'the close button stays on this page');
  assert.equal(closed.window.scrollY, 1508, 'and restores the position');

  // A press on the current page is not leaving: it keeps its snap and its section.
  const sameRoute = headerHarness({ pathname: '/', scrollY: 1508 });
  sameRoute.openMenu();
  sameRoute.clickNav('/');
  assert.equal(sameRoute.document.documentElement.dataset.navLeaving, undefined);

  const modified = headerHarness({ pathname: '/', scrollY: 1508 });
  modified.openMenu();
  modified.clickNav('/thesis', { metaKey: true });
  assert.equal(modified.document.documentElement.dataset.navLeaving, undefined, 'a new tab leaves this page open');

  const desktop = headerHarness({ pathname: '/', scrollY: 1508 });
  desktop.clickNav('/thesis', { mobile: false });
  assert.equal(desktop.document.documentElement.dataset.navLeaving, undefined, 'no menu lock to lift');
});

test('header: only keyboard focus holds the hidden Thesis header on screen', () => {
  const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.site-header:has\(:focus-visible\) \{\s*transform: translateY\(0\) !important;/);
  const fallback = /@supports not selector\(:has\(\*\)\) \{\s*\.site-header:focus-within \{\s*transform: translateY\(0\) !important;[^}]*\}\s*\}/;
  assert.match(css, fallback, 'a browser without :has() must not lose the header');
  assert.doesNotMatch(css.replace(fallback, ''), /\.site-header:focus-within/, 'Chrome leaves focus on a link it was clicked on');
});

test('header: a second press on Thesis stays on Hero with no hash left to drop', () => {
  const header = headerHarness({ hash: '#products', scrollY: 2000 });
  header.clickNav('/thesis', { mobile: false });
  header.trace.length = 0;

  assert.equal(header.clickNav('/thesis', { mobile: false }).defaultPrevented, true);
  assert.equal(header.url, '/thesis');
  assert.equal(header.window.scrollY, 0);
  assert.deepEqual(header.trace, [
    { type: 'capture-request', hash: 'top', position: '', menuOpen: undefined },
    { type: 'history-replace', url: '/thesis' },
    { type: 'scroll', top: 0 },
  ]);
});

test('header: same-route Thesis from the menu sets no snap flag, because nothing is leaving', () => {
  const header = headerHarness({ scrollY: 1200 });
  header.openMenu();
  header.clickNav('/thesis');
  assert.deepEqual(header.unlocks, [undefined], 'not set when the page regrew');
  assert.equal(header.document.documentElement.dataset.navLeaving, undefined);
});

test('header: a menu press on any other current page closes the menu and stays with Next', () => {
  for (const pathname of ['/', '/writing']) {
    const header = headerHarness({ pathname, scrollY: 1508 });
    header.openMenu();
    const event = header.clickNav(pathname);
    header.flushFrames();
    assert.equal(event.defaultPrevented, false, pathname);
    assert.equal(header.menuOpen, false, pathname);
    assert.equal(header.document.body.style.position, '', pathname);
    assert.equal(header.document.documentElement.dataset.menuOpen, undefined, pathname);
    assert.deepEqual(header.trace, [], `${pathname}: only Thesis takes over a same-page press`);
  }
});

test('header: a menu link from any page turns the snap off and clears it with the route, arrival on About included', () => {
  const routes = [['/thesis', '/'], ['/writing', '/'], ['/thesis', '/writing'], ['/writing/an-article', '/writing']];
  for (const [pathname, href] of routes) {
    const header = headerHarness({ pathname, scrollY: 1200 });
    header.openMenu();
    header.clickNav(href);
    assert.equal(header.document.documentElement.dataset.navLeaving, '1', `${pathname} -> ${href}`);
    header.navigate(href);
    assert.equal(header.document.documentElement.dataset.navLeaving, undefined, `${pathname} -> ${href}`);
  }
});
