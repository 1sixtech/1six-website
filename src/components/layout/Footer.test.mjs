import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as site from '../../lib/site.ts';

// Render the actual Footer. FooterLink's click handling has its own tests; this
// is what connects it to the links a visitor can press.
const file = new URL('./Footer.tsx', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
  fileName: file.pathname,
}).outputText;

const FooterLink = Symbol('FooterLink');

function renderFooter() {
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: Symbol('Fragment') },
    '@/components/ui/Logo': { LogoFooter: Symbol('LogoFooter') },
    '@/lib/site': site,
    './FooterLink': { FooterLink },
  };
  const exports = {};
  new vm.Script(code, { filename: file.pathname }).runInContext(vm.createContext({
    exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `unmocked dependency: ${name}`);
      return dependencies[name];
    },
  }));
  return exports.Footer();
}

/** Every link in a rendered tree, in order, with the local FooterColumn expanded. */
function links(node, found = []) {
  if (Array.isArray(node)) node.forEach((child) => links(child, found));
  else if (node && typeof node === 'object') {
    if (typeof node.type === 'function') links(node.type(node.props), found);
    else {
      if (node.type === FooterLink || node.type === 'a') found.push(node);
      links(node.props?.children, found);
    }
  }
  return found;
}

test('footer: site links go through FooterLink, and mail and external links stay plain anchors', () => {
  const rendered = links(renderFooter());
  const hrefs = (type) => rendered.filter((link) => link.type === type).map((link) => link.props.href);
  const siteLinks = [...site.NAV_ITEMS.map(({ href }) => href), '/#investors'];
  const plainLinks = [`mailto:${site.CONTACT_EMAIL}`, 'https://x.com/1sixtech'];

  // The phone and desktop layouts each render their own copy of the columns.
  assert.deepEqual(hrefs(FooterLink), [...siteLinks, ...siteLinks]);
  assert.deepEqual(hrefs('a'), [...plainLinks, ...plainLinks]);

  // Moving a link between the two kinds must not change how the row looks.
  assert.equal(new Set(rendered.map((link) => link.props.className)).size, 1);
  assert.ok(rendered[0].props.className);
  for (const link of rendered) assert.ok(link.props.children, link.props.href);
});
