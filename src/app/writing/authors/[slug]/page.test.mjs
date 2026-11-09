import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('./page.tsx', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
  fileName: file.pathname,
}).outputText;

// Fixtures, not the real catalog: both branches must stay covered if a listed writer later gains a bio.
const WRITERS = [
  { slug: 'with-bio', name: 'With Bio', bio: 'Writes about markets.', credentials: ['First', 'Second'] },
  { slug: 'no-bio', name: 'No Bio', credentials: ['Only credential'] },
];
const ARTICLES = [
  { slug: 'theirs', authorSlug: 'no-bio' },
  { slug: 'someone-elses', authorSlug: 'with-bio' },
  { slug: 'unattributed', authorSlug: null },
];
const NOT_FOUND = new Error('NEXT_NOT_FOUND');
const ArticleList = Symbol('ArticleList');

function loadPage() {
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: Symbol('Fragment') },
    'next/link': Symbol('Link'),
    'next/navigation': { notFound() { throw NOT_FOUND; } },
    '@/components/writing/ArticleList': { ArticleList },
    '@/lib/writing': { getArticles: () => ARTICLES },
    '@/lib/writingCatalog': { WRITERS, getWriter: (slug) => WRITERS.find((writer) => writer.slug === slug) },
  };
  const exports = {};
  new vm.Script(code, { filename: file.pathname }).runInContext(vm.createContext({
    exports,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
  }));
  return exports;
}

const params = (slug) => ({ params: Promise.resolve({ slug }) });
const byClass = (className) => (node) => node.props?.className === className;
function find(node, predicate) {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (!node || typeof node !== 'object') return undefined;
  return predicate(node) ? node : find(node.props?.children, predicate);
}
const credentialsOf = (tree) => (
  find(tree, byClass('writing-profile__credentials')).props.children.map((item) => item.props.children)
);

test('writer metadata: without a bio, the credentials alone describe the page and its social cards', async () => {
  const metadata = await loadPage().generateMetadata(params('no-bio'));
  assert.equal(metadata.title, 'No Bio — Writing');
  assert.equal(metadata.description, 'Only credential.');
  assert.equal(metadata.openGraph.description, 'Only credential.');
  assert.equal(metadata.twitter.description, 'Only credential.');
  assert.equal(metadata.alternates.canonical, 'https://1six.tech/writing/authors/no-bio');
});

test('writer metadata: a bio leads the description and is what social cards quote', async () => {
  const metadata = await loadPage().generateMetadata(params('with-bio'));
  assert.equal(metadata.description, 'Writes about markets. First. Second.');
  assert.equal(metadata.openGraph.description, 'Writes about markets.');
  assert.equal(metadata.twitter.description, 'Writes about markets.');
});

test('writer profile: the bio paragraph exists only for a writer who has one', async () => {
  const { default: WriterPage } = loadPage();

  const withoutBio = await WriterPage(params('no-bio'));
  assert.equal(find(withoutBio, byClass('writing-profile__bio')), undefined);
  assert.deepEqual(credentialsOf(withoutBio), ['Only credential']);

  const withBio = await WriterPage(params('with-bio'));
  assert.equal(find(withBio, byClass('writing-profile__bio')).props.children, 'Writes about markets.');
  assert.deepEqual(credentialsOf(withBio), ['First', 'Second']);
});

test('writer profile: a writer without a bio still lists only their own articles', async () => {
  const tree = await loadPage().default(params('no-bio'));
  const list = find(tree, (node) => node.type === ArticleList);
  assert.deepEqual(list.props.articles.map(({ slug }) => slug), ['theirs']);
});

test('writer page: an unknown slug is not found before any writer field is read', async () => {
  const page = loadPage();
  assert.equal((await page.generateMetadata(params('../no-bio'))).title, 'Writer not found');
  await assert.rejects(page.default(params('../no-bio')), NOT_FOUND);
});
