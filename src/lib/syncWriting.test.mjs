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

const COMMIT = 'a1b2c3d'.padEnd(40, '0');
const REPO = '1sixtech/1six-researchs';

/** Runs the sync over `files` (path -> text), failing the downloads listed in `failing`. */
function runSync(files, { failing = [], commitStatus = 200, commitBody = `${COMMIT}\n`, treeStatus = 200, offline = false, env = {} } = {}) {
  return new Promise((resolve) => {
    const result = { requests: [], headers: new Map(), operations: [], written: new Map(), logged: [], errors: [], exit: undefined };
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
        env,
        exit(code) { result.exit = code; resolve(result); },
      },
      console: {
        log(line) { result.logged.push(line); resolve(result); },
        error(error) { result.errors.push(error); },
      },
      async fetch(url, init) {
        result.requests.push(url);
        result.headers.set(url, { ...init.headers });
        if (offline) throw new Error('getaddrinfo ENOTFOUND api.github.com');
        if (url.includes('/commits/')) {
          return { ok: commitStatus === 200, status: commitStatus, text: async () => (commitStatus === 200 ? commitBody : 'Not Found') };
        }
        if (url.startsWith('https://api.github.com/')) {
          // Like GitHub, the tree exists only at a real commit.
          const status = url.includes(`/git/trees/${COMMIT}?`) ? treeStatus : 404;
          if (status !== 200) return { ok: false, status, text: async () => 'tree unavailable' };
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
  assert.deepEqual(run.logged, [`Synced 1 writing article(s) from ${REPO}@main (a1b2c3d), skipped 1 draft(s)`]);
  assert.equal(run.exit, undefined);

  const noDrafts = await runSync({ '001-live/README.md': PUBLISHED });
  assert.deepEqual(noDrafts.logged, [`Synced 1 writing article(s) from ${REPO}@main (a1b2c3d)`]);
});

test('the listing and every download read the resolved commit, because a branch URL is cached for five minutes', async () => {
  const run = await runSync({ '001-live/README.md': PUBLISHED, '001-live/assets/chart.svg': '<svg/>' });
  assert.deepEqual(run.requests.slice(0, 2), [
    `https://api.github.com/repos/${REPO}/commits/main`,
    `https://api.github.com/repos/${REPO}/git/trees/${COMMIT}?recursive=1`,
  ]);
  assert.deepEqual(run.requests.slice(2).sort(), [
    `https://raw.githubusercontent.com/${REPO}/${COMMIT}/001-live/README.md`,
    `https://raw.githubusercontent.com/${REPO}/${COMMIT}/001-live/assets/chart.svg`,
  ]);
});

test('GitHub is asked for the bare SHA, because the lookup reads the response body as the commit', async () => {
  const run = await runSync({ '001-live/README.md': PUBLISHED });
  const [lookup, listing, download] = run.requests;
  assert.equal(run.headers.get(lookup).Accept, 'application/vnd.github.sha', 'any other media type answers with JSON');
  assert.equal(run.headers.get(listing).Accept, 'application/vnd.github+json');
  for (const url of [lookup, listing]) {
    assert.equal(run.headers.get(url)['X-GitHub-Api-Version'], '2022-11-28');
  }
  for (const url of [lookup, listing, download]) {
    assert.equal(run.headers.get(url)['User-Agent'], '1six-website');
  }
});

test('WRITING_GIT_REF selects the commit; only the lookup and the build log name the ref itself', async () => {
  const pinned = { env: { WRITING_GIT_REF: 'v1.2.0' } };
  const run = await runSync({ '001-live/README.md': PUBLISHED, '001-live/assets/chart.svg': '<svg/>' }, pinned);
  assert.equal(run.requests[0], `https://api.github.com/repos/${REPO}/commits/v1.2.0`);
  assert.equal(run.requests.length, 4);
  for (const url of run.requests.slice(1)) {
    assert.ok(url.includes(COMMIT) && !url.includes('v1.2.0'), `${url} reads the resolved commit`);
  }
  assert.deepEqual(run.logged, [`Synced 1 writing article(s) from ${REPO}@v1.2.0 (a1b2c3d)`]);

  const unknown = await runSync({ '001-live/README.md': PUBLISHED }, { ...pinned, commitStatus: 404 });
  assert.equal(unknown.exit, 1);
  assert.match(unknown.errors[0].message, /GitHub commit lookup failed for v1\.2\.0: 404 Not Found/);
  assert.deepEqual(unknown.operations, [], 'a pin that does not resolve leaves the last good sync in place');
});

test('a blank WRITING_GIT_REF means main, and a ref is escaped so a "#" cannot cut it short', async () => {
  const article = { '001-live/README.md': PUBLISHED };
  const blank = await runSync(article, { env: { WRITING_GIT_REF: '' } });
  assert.equal(blank.requests[0], `https://api.github.com/repos/${REPO}/commits/main`);

  const tag = await runSync(article, { env: { WRITING_GIT_REF: 'v1.2#reviewed' } });
  assert.equal(tag.requests[0], `https://api.github.com/repos/${REPO}/commits/v1.2%23reviewed`);
  assert.deepEqual(tag.logged, [`Synced 1 writing article(s) from ${REPO}@v1.2#reviewed (a1b2c3d)`]);

  const branch = await runSync(article, { env: { WRITING_GIT_REF: 'release/next' } });
  assert.equal(branch.requests[0], `https://api.github.com/repos/${REPO}/commits/release%2Fnext`);
});

test('a file name with URL characters is requested escaped at the commit and saved under its real name', async () => {
  const run = await runSync({
    '001-live/README.md': PUBLISHED,
    '001-live/assets/q3 chart #1?.svg': '<svg>q3</svg>',
  });
  assert.ok(run.requests.includes(`https://raw.githubusercontent.com/${REPO}/${COMMIT}/001-live/assets/q3%20chart%20%231%3F.svg`));
  assert.equal(run.written.get('/repo/public/writing-assets/001-live/assets/q3 chart #1?.svg'), '<svg>q3</svg>');
});

test('a commit that cannot be resolved fails the sync before anything is listed or touched', async () => {
  const run = await runSync({ '001-live/README.md': PUBLISHED }, { commitStatus: 404 });
  assert.equal(run.exit, 1);
  assert.match(run.errors[0].message, /GitHub commit lookup failed for main: 404 Not Found/);
  assert.equal(run.requests.length, 1, 'no listing and no download follow a failed lookup');
  assert.deepEqual(run.operations, [], 'the last good sync stays in place');
});

test('a network failure fails the sync before anything is listed or touched', async () => {
  const run = await runSync({ '001-live/README.md': PUBLISHED }, { offline: true });
  assert.equal(run.exit, 1);
  assert.match(run.errors[0].message, /ENOTFOUND/);
  assert.equal(run.requests.length, 1, 'no listing and no download follow a failed lookup');
  assert.deepEqual(run.operations, [], 'the last good sync stays in place');
});

test('a lookup that answers without a usable commit stops at the listing, not at the content on disk', async () => {
  const run = await runSync({ '001-live/README.md': PUBLISHED }, { commitBody: '' });
  assert.equal(run.exit, 1);
  assert.match(run.errors[0].message, /GitHub tree fetch failed: 404 tree unavailable/);
  assert.equal(run.requests.length, 2, 'no download follows a failed listing');
  assert.deepEqual(run.operations, [], 'the last good sync stays in place');
});

test('a listing GitHub refuses fails the sync before anything is downloaded or touched', async () => {
  const run = await runSync({ '001-live/README.md': PUBLISHED }, { treeStatus: 403 });
  assert.equal(run.exit, 1);
  assert.match(run.errors[0].message, /GitHub tree fetch failed: 403 tree unavailable/);
  assert.equal(run.requests.length, 2, 'no download follows a failed listing');
  assert.deepEqual(run.operations, [], 'the last good sync stays in place');
});

test('nothing to publish, or a README it cannot read, fails the sync and leaves the last good content in place', async () => {
  const onlyDrafts = await runSync({ '002-wip/README.md': DRAFT, '002-wip/assets/secret.svg': '<svg/>' });
  assert.equal(onlyDrafts.exit, 1);
  assert.match(onlyDrafts.errors[0].message, /No published articles found in 1sixtech\/1six-researchs@main/);
  assert.deepEqual(onlyDrafts.operations, [], 'nothing deleted, nothing written');

  const unreadable = await runSync(
    { '001-live/README.md': PUBLISHED, '002-wip/README.md': DRAFT },
    { failing: ['002-wip/README.md'] },
  );
  assert.equal(unreadable.exit, 1);
  assert.match(unreadable.errors[0].message, /Failed to download 002-wip\/README\.md: 500/);
  assert.deepEqual(unreadable.operations, [], 'an unknown article might be a draft: stop before touching anything');
});

test('an asset that cannot be downloaded fails the sync without touching the last good content', async () => {
  const run = await runSync(
    { '001-live/README.md': PUBLISHED, '001-live/assets/chart.svg': '<svg/>' },
    { failing: ['001-live/assets/chart.svg'] },
  );
  assert.equal(run.exit, 1);
  assert.match(run.errors[0].message, /Failed to download 001-live\/assets\/chart\.svg: 500/);
  assert.deepEqual(run.operations, [], 'nothing is deleted until every file has arrived');
});
