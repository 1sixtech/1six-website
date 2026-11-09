import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('./AboutCrossing.tsx', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  fileName: file.pathname,
}).outputText;

const OnwardLink = Symbol('OnwardLink');

function renderCrossing() {
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    './CrossingRoot': { CrossingRoot: Symbol('CrossingRoot') },
    './CrossingMark': { CrossingMark: Symbol('CrossingMark') },
    './OnwardLink': { OnwardLink },
    './aboutData': { BACKERS: [], CONTACT_EMAIL: 'hello@example.com', FIRMS: [], ORIGINS: [] },
  };
  const exports = {};
  new vm.Script(code, { filename: file.pathname }).runInContext(vm.createContext({
    exports,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
  }));
  return exports.AboutCrossing();
}

function walk(node, visit) {
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit));
  if (!node || typeof node !== 'object') return undefined;
  visit(node);
  return walk(node.props?.children, visit);
}

function collect(root, matches) {
  const found = [];
  walk(root, (node) => { if (matches(node)) found.push(node); });
  return found;
}

test('About: one screen per section, with the contact last, every onward link landing, and snap kept away from those it would trap', () => {
  const tree = renderCrossing();
  const bands = collect(tree, ({ props }) => props?.['data-crossing-band'] !== undefined);

  // CrossingRoot completes the fill as the last band lands, so its order is the contract.
  assert.deepEqual(bands.map(({ props }) => props['data-crossing-label']), ['about', 'products', 'origins', 'backers', 'contact']);
  assert.equal(collect(tree, ({ props }) => props?.['data-crossing-end'] !== undefined).length, 0);

  // The band fills the screen and the rule belongs to its content, so the rule
  // sits with the text instead of at the top edge of every screen.
  for (const band of bands) {
    assert.equal(band.props.children.type, 'div', band.props['data-crossing-label']);
    assert.equal(band.props.children.props.className, 'crossing-band__body', band.props['data-crossing-label']);
  }

  // Each section's onward link goes to the next one; a linked band takes focus.
  for (const [index, band] of bands.entries()) {
    const onward = collect(band, ({ type }) => type === OnwardLink);
    if (index === bands.length - 1) {
      assert.equal(onward.length, 0, 'the contact is the end of the crossing');
    } else {
      assert.equal(onward.length, 1);
      assert.equal(onward[0].props.href, `#${bands[index + 1].props.id}`);
      assert.equal(bands[index + 1].props.tabIndex, -1);
    }
  }
  assert.deepEqual(bands.slice(1).map(({ props }) => props.id), ['products', 'origins', 'investors', 'contact']);

  // A mandatory stop inside something taller than the screen hides the rest of
  // it, and snapping is motion: both exceptions have to wrap the only snap rule.
  const css = readFileSync(new URL('./about.css', import.meta.url), 'utf8');
  assert.equal(css.match(/scroll-snap-type/g).length, 1);
  assert.match(
    css,
    /@media \(min-height: 640px\) and \(prefers-reduced-motion: no-preference\) \{\s*html:has\(\.crossing\) \{\s*scroll-snap-type: y mandatory;/,
  );
});
