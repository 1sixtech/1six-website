import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import sharp from 'sharp';
import ts from 'typescript';
import { APPLE_ICON_SIZE, FAVICON_SIZE } from '../../scripts/make-icons.mjs';
import * as site from '../lib/site.ts';

// Only the metadata is read here, so every component a module imports is a stand-in.
const dependencies = {
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: Symbol('Fragment') },
  react: { Suspense: Symbol('Suspense') },
  'react-dom': { preload() {} },
  './fonts/pretendard-variable.css': {},
  './globals.css': {},
  '@/components/providers/ThemeProvider': { ThemeProvider: Symbol('ThemeProvider') },
  '@/components/layout/Header': { Header: Symbol('Header') },
  '@/components/layout/Footer': { Footer: Symbol('Footer') },
  '@vercel/analytics/next': { Analytics: Symbol('Analytics') },
  '@/components/intro/PageEntry': { PageEntry: Symbol('PageEntry') },
  '@/lib/site': site,
  '@/lib/themeInit': { THEME_INIT_SCRIPT: '' },
  '@/components/about/AboutCrossing': { AboutCrossing: Symbol('AboutCrossing') },
  '@/components/about/aboutData': { BACKERS: [{ name: 'A Backer' }], FIRMS: ['A Firm'] },
  '@/components/about/about.css': {},
  '@/components/home/HeroSection': { HeroSection: Symbol('HeroSection') },
  '@/components/home/ThesisSection': { ThesisSection: Symbol('ThesisSection') },
  '@/components/home/ThesisGraph': { ThesisGraph: Symbol('ThesisGraph') },
  '@/components/home/ProductsHeading': { ProductsHeading: Symbol('ProductsHeading') },
  '@/components/home/ProductMap': { ProductMap: Symbol('ProductMap') },
  '@/components/ui/ScrollRevealWrapper': { ScrollRevealWrapper: Symbol('ScrollRevealWrapper') },
  '@/components/ui/ScrollToTop': { ScrollToTop: Symbol('ScrollToTop') },
  '@/components/writing/ArticleList': { ArticleList: Symbol('ArticleList') },
  '@/components/writing/WritingIndex': { WritingIndex: Symbol('WritingIndex') },
  '@/lib/writing': { getArticles: () => [] },
};

function moduleOf(relative) {
  const file = new URL(relative, import.meta.url);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: file.pathname,
  }).outputText;
  const exports = {};
  new vm.Script(code, { filename: file.pathname }).runInContext(vm.createContext({
    exports,
    URL,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), `${relative}: ${name}`); return dependencies[name]; },
  }));
  return exports;
}
const metadataOf = (relative) => moduleOf(relative).metadata;

function find(node, matches) {
  if (Array.isArray(node)) return node.map((child) => find(child, matches)).find(Boolean);
  if (!node || typeof node !== 'object') return undefined;
  return matches(node) ? node : find(node.props?.children, matches);
}

const PUBLIC = new URL('../../public/', import.meta.url);

test('tab title: every page shows the root layout\'s "1six", and Open Graph cards keep titles of their own', () => {
  const root = metadataOf('./layout.tsx');
  // A plain string, not a template: a page title could not be wrapped into "%s | 1SIX" again.
  assert.equal(root.title, '1six');
  assert.match(root.openGraph.title, /1SIX/);
  assert.match(root.twitter.title, /1SIX/);

  // The article and writer pages are held to the same rule by their own page tests.
  for (const page of ['./page.tsx', './thesis/page.tsx', './writing/page.tsx']) {
    const metadata = metadataOf(page);
    assert.equal(Object.hasOwn(metadata, 'title'), false, `${page} sets a tab title`);
    // A page's openGraph replaces the layout's whole, so it has to bring its own title.
    assert.match(metadata.openGraph.title, /1SIX/, page);
  }
});

// The line of every tab title a route file sets: a `title` key (plain, quoted or
// shorthand) on its exported `metadata` object, or on an object its
// generateMetadata returns. Titles inside openGraph and twitter are card titles.
function tabTitleLines(text) {
  const source = ts.createSourceFile('route.tsx', text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const lines = [];
  const unwrap = (node) => {
    while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
    return node;
  };
  const check = (node) => {
    const object = unwrap(node);
    if (!object || !ts.isObjectLiteralExpression(object)) return;
    for (const property of object.properties) {
      const key = (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && property.name;
      if (key && (ts.isIdentifier(key) || ts.isStringLiteral(key)) && key.text === 'title') {
        lines.push(source.getLineAndCharacterOfPosition(property.getStart()).line + 1);
      }
    }
  };
  // Every object generateMetadata returns itself, not those of functions nested in it.
  const checkReturns = (body) => {
    if (!ts.isBlock(body)) return check(body);
    const visit = (node) => {
      if (ts.isReturnStatement(node)) check(node.expression);
      else if (!ts.isFunctionLike(node)) ts.forEachChild(node, visit);
    };
    ts.forEachChild(body, visit);
  };
  const exported = (node) => ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword);
  for (const statement of source.statements) {
    if (!exported(statement)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'generateMetadata' && statement.body) checkReturns(statement.body);
    if (!ts.isVariableStatement(statement)) continue;
    for (const { name, initializer } of statement.declarationList.declarations) {
      if (!ts.isIdentifier(name) || !initializer) continue;
      if (name.text === 'metadata') check(initializer);
      const fn = unwrap(initializer);
      if (name.text === 'generateMetadata' && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) checkReturns(fn.body);
    }
  }
  return lines;
}

test('tab title guard: finds plain, quoted and shorthand titles in metadata, and nothing else', () => {
  assert.deepEqual(tabTitleLines("export const metadata = { title: 'X' };"), [1]);
  assert.deepEqual(tabTitleLines("export const metadata: Metadata = { 'title': 'X' };"), [1]);
  assert.deepEqual(tabTitleLines("const title = 'X';\nexport const metadata = { title };"), [2]);
  assert.deepEqual(tabTitleLines("export async function generateMetadata() {\n  if (x) return {};\n  return { title: 'X' };\n}"), [3]);
  assert.deepEqual(tabTitleLines("export const generateMetadata = async () => ({ title: 'X' });"), [1]);
  // Card titles, data objects, and objects a nested function returns are not tab titles.
  assert.deepEqual(tabTitleLines("export const metadata = { openGraph: { title: 'X' }, twitter: { title: 'X' } };"), []);
  assert.deepEqual(tabTitleLines('export default function Page() { return items.map((a) => ({ title: a.title })); }'), []);
  assert.deepEqual(tabTitleLines("export async function generateMetadata() { const card = () => ({ title: 'X' }); return {}; }"), []);
});

test('tab title: no route file under src/app sets a tab title of its own', () => {
  const app = new URL('./', import.meta.url);
  const routeFiles = readdirSync(app, { recursive: true })
    .map((file) => file.split(sep).join('/'))
    .filter((file) => /(^|\/)(page|layout|not-found|error|template|default)\.tsx$/.test(file) && file !== 'layout.tsx');
  assert.ok(routeFiles.length >= 8, `found ${routeFiles.length} route files`);

  for (const file of routeFiles) {
    const lines = tabTitleLines(readFileSync(new URL(file, app), 'utf8'));
    assert.deepEqual(lines, [], `${file} sets a tab title on line ${lines.join(', ')}`);
  }
  // The guard does see the root layout's own title.
  assert.equal(tabTitleLines(readFileSync(new URL('layout.tsx', app), 'utf8')).length, 1);
});

test('favicon: every icon URL carries ICON_VERSION, and every icon is the size it claims', async () => {
  const { icons } = metadataOf('./layout.tsx');
  const version = `?v=${site.ICON_VERSION}`;
  const fallback = `${FAVICON_SIZE}x${FAVICON_SIZE}`;
  // Copied out field by field: the list comes from the vm's realm.
  assert.deepEqual(Array.from(icons.icon, ({ url, type, sizes }) => [url, type, sizes]), [
    [`/favicon.svg${version}`, 'image/svg+xml', 'any'],
    [`/favicon.png${version}`, 'image/png', fallback],
  ]);
  assert.equal(icons.apple, `/apple-icon.png${version}`);
  assert.ok(existsSync(new URL('./favicon.svg', PUBLIC)), 'public/favicon.svg is missing');

  // The web app manifest and the Organization logo share the versioned fallback.
  const manifest = moduleOf('./manifest.ts').default();
  assert.deepEqual(Array.from(manifest.icons, ({ src, sizes, type }) => [src, sizes, type]), [[`/favicon.png${version}`, fallback, 'image/png']]);
  const html = moduleOf('./layout.tsx').default({ children: null });
  const jsonLd = find(html, ({ props }) => props?.type === 'application/ld+json');
  assert.equal(JSON.parse(jsonLd.props.dangerouslySetInnerHTML.__html).logo, `https://1six.tech/favicon.png${version}`);

  // make-icons.mjs renders each PNG at its size; the declarations above have to agree.
  for (const [name, size] of [['favicon.png', FAVICON_SIZE], ['apple-icon.png', APPLE_ICON_SIZE]]) {
    const { width, height, format } = await sharp(fileURLToPath(new URL(name, PUBLIC))).metadata();
    assert.deepEqual([format, width, height], ['png', size, size], name);
  }
});
