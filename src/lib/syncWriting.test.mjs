import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { isDraftArticle } from './writingDraft.mjs';

// The script runs on load and rewrites content/writing and public/writing-assets
// under the repository, so it runs here against a fake GitHub and a recorded
// filesystem, rooted at a path that does not exist.
const script = new URL('../../scripts/sync-writing.mjs', import.meta.url);
const code = ts.transpileModule(
  readFileSync(script, 'utf8').replace('import.meta.url', "'file:///repo/scripts/sync-writing.mjs'"),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    // A .mjs name would keep the output an ES module, which vm.Script cannot run.
    fileName: script.pathname.replace(/\.mjs$/, '.ts'),
  },
).outputText;

/** Runs the sync over `files` (path -> text), failing the downloads listed in `failing`. */
function runSync(files, { failing = [] } = {}) {
  return new Promise((resolve) => {
    const result = { requests: [], operations: [], written: new Map(), logged: [], errors: [], exit: undefined };
    const fileAt = (url) => decodeURIComponent(new URL(url).pathname.split('/').slice(4).join('/'));
    const dependencies = {
      'node:path': { default: path },
      'node:url': { fileURLToPath },
      'node:fs/promises': {
        mkdir: async () => {},
        rm: async (target) => { result.operations.push(['rm', target]); },
        writeFile: async (target, bytes) => {
          result.operations.push(['write', target]);
          result.written.set(target, bytes.toString('utf8'));
        },
      },
      '../src/lib/writingDraft.mjs': { isDraftArticle },
    };
    new vm.Script(code, { filename: script.pathname }).runInContext(vm.createContext({
      exports: {},
      Buffer,
      require(name) {
        assert.ok(Object.hasOwn(dependencies, name), `unmocked dependency: ${name}`);
        return dependencies[name];
      },
      process: {
        env: {},
        exit(code) { result.exit = code; resolve(result); },
      },
      console: {
        log(line) { result.logged.push(line); resolve(result); },
        error(error) { result.errors.push(error); },
      },
      async fetch(url) {
        result.requests.push(url);
        if (url.startsWith('https://api.github.com/')) {
          const tree = [{ type: 'tree', path: 'a-folder' }, ...Object.keys(files).map((file) => ({ type: 'blob', path: file }))];
          return { ok: true, json: async () => ({ tree }) };
        }
        const file = fileAt(url);
        if (failing.includes(file)) return { ok: false, status: 500 };
        return { ok: true, arrayBuffer: async () => new TextEncoder().encode(files[file]).buffer };
      },
    }));
  });
}

const PUBLISHED = '# Live\n\nDate: 2026-11-01\n\nBody.\n';
const DRAFT = '# Not yet\n\nDate: 2026-11-08 (draft)\n\nNot yet.\n';

test('a draft and its figures never leave GitHub; a published article and its assets are synced in full', async () => {
  const run = await runSync({
    '001-live/README.md': PUBLISHED,
    '001-live/assets/chart.svg': '<svg>public</svg>',
    '002-wip/README.md': DRAFT,
    '002-wip/assets/secret.svg': '<svg>unpublished</svg>',
    'LICENSE': 'not an article',
  });
  assert.deepEqual([...run.written.keys()].sort(), [
    '/repo/content/writing/001-live/README.md',
    '/repo/public/writing-assets/001-live/assets/chart.svg',
  ]);
  assert.equal(run.written.get('/repo/content/writing/001-live/README.md'), PUBLISHED);
  assert.equal(run.written.get('/repo/public/writing-assets/001-live/assets/chart.svg'), '<svg>public</svg>');
  assert.equal(run.requests.some((url) => url.includes('secret')), false, "a draft's figure is not even downloaded");
  assert.deepEqual(run.operations.slice(0, 2), [
    ['rm', '/repo/content/writing'],
    ['rm', '/repo/public/writing-assets'],
  ], 'the previous sync is cleared before anything lands');
  assert.deepEqual(run.logged, ['Synced 1 writing article(s) from 1sixtech/noctis-articles@main, skipped 1 draft(s)']);
  assert.equal(run.exit, undefined);

  const noDrafts = await runSync({ '001-live/README.md': PUBLISHED });
  assert.deepEqual(noDrafts.logged, ['Synced 1 writing article(s) from 1sixtech/noctis-articles@main']);
});

test('nothing to publish, or a README it cannot read, fails the sync and leaves the last good content in place', async () => {
  const onlyDrafts = await runSync({ '002-wip/README.md': DRAFT, '002-wip/assets/secret.svg': '<svg/>' });
  assert.equal(onlyDrafts.exit, 1);
  assert.match(onlyDrafts.errors[0].message, /No published articles found in 1sixtech\/noctis-articles@main/);
  assert.deepEqual(onlyDrafts.operations, [], 'nothing deleted, nothing written');

  const unreadable = await runSync(
    { '001-live/README.md': PUBLISHED, '002-wip/README.md': DRAFT },
    { failing: ['002-wip/README.md'] },
  );
  assert.equal(unreadable.exit, 1);
  assert.match(unreadable.errors[0].message, /Failed to download 002-wip\/README\.md: 500/);
  assert.deepEqual(unreadable.operations, [], 'an unknown article might be a draft: stop before touching anything');
});
