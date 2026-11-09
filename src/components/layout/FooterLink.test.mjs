import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as site from '../../lib/site.ts';

// Run the real link and hash-scroll helper. Only the browser, Next, and GSAP
// boundaries are fake.
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

const linkFile = new URL('./FooterLink.tsx', import.meta.url);
const hashFile = new URL('../../lib/hashScroll.ts', import.meta.url);

function footerLink({ pathname, href, hash = '' }) {
  const trace = [];
  const focusCalls = [];
  const main = new EventTarget();
  main.focus = (options) => focusCalls.push({ tabIndex: main.tabIndex, ...options });
  main.removeAttribute = (name) => { if (name === 'tabindex') delete main.tabIndex; };
  const Link = Symbol('Link');
  const jsx = (type, props) => ({ type, props });
  let url = pathname + hash;
  const window = new EventTarget();
  Object.defineProperty(window, 'location', { get: () => new URL(url, 'https://example.test') });
  window.scrollTo = ({ top }) => trace.push({ type: 'scroll', top });
  const dependencies = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: Symbol('Fragment') },
    'next/link': Link,
    'next/navigation': { usePathname: () => pathname },
    gsap: { registerPlugin() {} },
    'gsap/ScrollTrigger': { ScrollTrigger: {} },
    '@/lib/site': site,
  };
  function load(file) {
    const exports = {};
    const context = vm.createContext({
      window,
      CustomEvent,
      document: {
        getElementById: (id) => id === 'main-content' ? main : null,
      },
      history: {
        replaceState(_state, _title, next) {
          url = next;
          trace.push({ type: 'history', url });
        },
      },
      exports,
      require(specifier) {
        assert.ok(Object.hasOwn(dependencies, specifier), `unmocked dependency: ${specifier}`);
        return dependencies[specifier];
      },
    });
    new vm.Script(compile(file), { filename: file.pathname }).runInContext(context);
    return exports;
  }
  const hashScroll = load(hashFile);
  dependencies['@/lib/hashScroll'] = hashScroll;
  window.addEventListener(hashScroll.HASH_SCROLL_REQUEST_EVENT, (event) => {
    trace.push({ type: 'capture-request', hash: event.detail.hash });
  });
  const { FooterLink } = load(linkFile);
  const rendered = FooterLink({ href, className: 'link', children: 'Thesis' });
  return {
    trace,
    focusCalls,
    main,
    window,
    rendered,
    Link,
    get url() { return url; },
    click(modifiers = {}) {
      const event = {
        button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        ...modifiers,
      };
      rendered.props.onClick(event);
      return event;
    },
  };
}

test('footer link: Thesis on Thesis releases capture and returns to Hero', () => {
  const link = footerLink({ pathname: '/thesis', href: '/thesis' });
  assert.equal(link.rendered.type, link.Link, 'still a real link for crawlers and new tabs');
  assert.equal(link.click().defaultPrevented, true);
  assert.deepEqual(link.trace, [
    { type: 'capture-request', hash: 'top' },
    { type: 'history', url: '/thesis' },
    { type: 'scroll', top: 0 },
  ]);
  assert.deepEqual(link.focusCalls, [{ tabIndex: -1, preventScroll: true }],
    'focus left on this link would send the next Tab back down to the footer');
});

test('footer link: the landmark is focusable only while it holds that focus', () => {
  const link = footerLink({ pathname: '/thesis', href: '/thesis' });
  link.click();
  assert.equal(link.main.tabIndex, -1);
  link.main.dispatchEvent(new Event('blur'));
  assert.equal(Object.hasOwn(link.main, 'tabIndex'), false,
    'left focusable, any click in a long article would send the next Tab to the top');

  const back = footerLink({ pathname: '/thesis', href: '/thesis' });
  back.click();
  back.window.dispatchEvent(new Event('popstate'));
  assert.equal(Object.hasOwn(back.main, 'tabIndex'), false, 'browser Back does not blur it');

  const layout = readFileSync(new URL('../../app/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /<main id="main-content">/);
  const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /#main-content:focus \{\s*outline: none;/, 'a landmark is not a control and draws no ring');
});

test('footer link: Thesis on Thesis drops a section hash', () => {
  const link = footerLink({ pathname: '/thesis', href: '/thesis', hash: '#products' });
  link.click();
  assert.equal(link.url, '/thesis');
});

test('footer link: every other link stays with Next', () => {
  for (const [pathname, href] of [['/', '/thesis'], ['/writing', '/thesis'], ['/thesis', '/'], ['/thesis', '/writing'], ['/thesis', '/#investors']]) {
    const link = footerLink({ pathname, href });
    assert.equal(link.click().defaultPrevented, false, `${href} on ${pathname}`);
    assert.deepEqual(link.trace, [], `${href} on ${pathname}`);
    assert.deepEqual(link.focusCalls, [], `${href} on ${pathname}`);
  }
});

test('footer link: a modified click on Thesis stays with the browser', () => {
  for (const modifiers of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const link = footerLink({ pathname: '/thesis', href: '/thesis' });
    assert.equal(link.click(modifiers).defaultPrevented, false, JSON.stringify(modifiers));
    assert.deepEqual(link.trace, [], JSON.stringify(modifiers));
  }
});

test('footer link: the rendered link keeps its destination, style, and label', () => {
  const { rendered } = footerLink({ pathname: '/writing', href: '/thesis' });
  assert.equal(rendered.props.href, '/thesis');
  assert.equal(rendered.props.className, 'link');
  assert.equal(rendered.props.children, 'Thesis');
});
