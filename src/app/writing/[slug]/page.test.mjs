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

const ARTICLE = {
  slug: '001-markets',
  title: 'On Markets',
  summary: 'Why markets move.',
  author: 'With Bio',
  date: '2026-11-01',
};

function loadPage() {
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: Symbol('Fragment') },
    'next/link': Symbol('Link'),
    'next/navigation': { notFound() { throw new Error('NEXT_NOT_FOUND'); } },
    '@/components/writing/FigureViewer': { FigureViewer: Symbol('FigureViewer') },
    '@/lib/writing': {
      getArticle: (slug) => (slug === ARTICLE.slug ? ARTICLE : undefined),
      getArticles: () => [ARTICLE],
    },
    '@/lib/writingCatalog': { categoryLabel: () => 'Research' },
  };
  const exports = {};
  new vm.Script(code, { filename: file.pathname }).runInContext(vm.createContext({
    exports,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
  }));
  return exports;
}

const params = (slug) => ({ params: Promise.resolve({ slug }) });

test('article metadata: no tab title of its own, while the social cards carry the article title', async () => {
  const metadata = await loadPage().generateMetadata(params(ARTICLE.slug));
  // The root layout's "1six" is every page's tab title.
  assert.equal(Object.hasOwn(metadata, 'title'), false);
  assert.equal(metadata.openGraph.title, 'On Markets | 1SIX');
  assert.equal(metadata.twitter.title, 'On Markets | 1SIX');
  assert.equal(metadata.openGraph.images[0].alt, 'On Markets');
  assert.equal(metadata.description, 'Why markets move.');
  assert.equal(metadata.alternates.canonical, 'https://1six.tech/writing/001-markets');
});

test('article metadata: an unknown slug adds nothing, so the root layout\'s title and description apply', async () => {
  // Compared by keys: the object comes from the vm's realm.
  assert.deepEqual(Object.keys(await loadPage().generateMetadata(params('../001-markets'))), []);
});
