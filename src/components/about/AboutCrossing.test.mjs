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
    /@media \(min-height: 760px\) and \(prefers-reduced-motion: no-preference\),\s*\(min-height: 640px\) and \(max-width: 767px\) and \(prefers-reduced-motion: no-preference\),\s*\(min-height: 640px\) and \(min-width: 1024px\) and \(prefers-reduced-motion: no-preference\) \{\s*html:has\(\.crossing\):not\(\[data-nav-leaving\]\) \{\s*scroll-snap-type: y mandatory;/,
  );

  // The phone's first screen is two boxes, the mark and the statement. Without a
  // stop at the statement's end, a short phone could never rest on what is below the fold.
  assert.match(css, /\.crossing-band--statement \.crossing-band__body \{\s*scroll-snap-align: end;/);

  // Every section has its own screen, so a rule above a title separates nothing:
  // the rule sits under the title and divides it from its content.
  assert.match(css, /\.crossing-heading \{\s*padding-bottom: var\(--crossing-rule-gap\);\s*border-bottom: 1px solid var\(--color-text\);/);
  assert.doesNotMatch(css, /\.crossing-band__body \{[^}]*border-top/);
});

test('About: the product is labeled a prediction market on wider screens, and phones go straight to its name', () => {
  const [products] = collect(renderCrossing(), ({ props }) => props?.id === 'products');
  const [tag] = collect(products, ({ props }) => props?.className === 'crossing-tag crossing-product__tag');
  assert.equal(tag.props.children, '01 / prediction market');

  // The phone block (max-width: 767px) hides the label; wider screens keep the shared .crossing-tag.
  const css = readFileSync(new URL('./about.css', import.meta.url), 'utf8');
  const start = css.indexOf('@media (max-width: 767px) {');
  assert.notEqual(start, -1, 'about.css has a phone block');
  let end = css.indexOf('{', start);
  for (let depth = 0; end < css.length; end++) {
    if (css[end] === '{') depth++;
    else if (css[end] === '}' && --depth === 0) break;
  }
  assert.match(css.slice(start, end), /\.crossing-product__tag \{\s*display: none;\s*\}/);
  assert.equal(css.match(/\.crossing-product__tag \{/g).length, 1, 'only the phone block styles the label on its own');
});
