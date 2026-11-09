import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { getArticle } from './writing.ts';
import { isDraftArticle } from './writingDraft.mjs';
import { isArticleSlug } from './writingSlug.mjs';

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

// A real Response, so a body released too early cannot be read, as in production.
const refusal = (status, text = '', headers = {}) => new Response(text, { status, headers });

/**
 * Runs the sync over `files` (path -> text), failing the downloads listed in `failing`.
 * `replies` maps part of a URL to the refusals [status, headers] GitHub gives it before answering;
 * `sizes` overrides the size the listing reports for a path, and `listing` rewrites the listing's
 * whole answer. Waits are recorded and not slept; `now` fixes the clock the script reads.
 */
function runSync(files, { failing = [], commitStatus = 200, commitBody = `${COMMIT}\n`, treeStatus = 200, offline = false, env = {}, truncated = false, sizes = {}, replies = {}, listing = (answer) => answer, now } = {}) {
  return new Promise((resolve) => {
    const result = { requests: [], headers: new Map(), refusals: [], waits: [], operations: [], written: new Map(), logged: [], errors: [], exit: undefined };
    const fileAt = (url) => {
      const { pathname } = new URL(url);
      return decodeURIComponent(pathname.split('/').slice(url.includes('/contents/') ? 5 : 4).join('/'));
    };
    const scripted = (url) => {
      const fragment = Object.keys(replies).find((part) => url.includes(part));
      return fragment === undefined ? undefined : replies[fragment].shift();
    };
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
      '../src/lib/writingSlug.mjs': { isArticleSlug },
    };
    new vm.Script(code, { filename: script.pathname }).runInContext(vm.createContext({
      exports: {},
      Buffer,
      ...(now === undefined ? {} : { Date: class extends Date { static now() { return now; } } }),
      setTimeout(callback, delay) {
        result.waits.push(delay);
        callback();
      },
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
        const refused = scripted(url);
        if (refused) {
          result.refusals.push(refusal(refused[0], 'busy', refused[1]));
          return result.refusals.at(-1);
        }
        if (url.includes('/commits/')) {
          if (commitStatus !== 200) return refusal(commitStatus, 'Not Found');
          return { ok: true, status: 200, text: async () => commitBody };
        }
        if (url.includes('/git/trees/')) {
          // Like GitHub, the tree exists only at a real commit.
          const status = url.includes(`/git/trees/${COMMIT}?`) ? treeStatus : 404;
          if (status !== 200) return refusal(status, 'tree unavailable');
          const size = (file) => (Object.hasOwn(sizes, file) ? sizes[file] : new TextEncoder().encode(files[file]).length);
          const tree = [{ type: 'tree', path: 'a-folder' }, ...Object.keys(files).map((file) => ({ type: 'blob', mode: '100644', path: file, size: size(file) }))];
          return { ok: true, status: 200, json: async () => listing({ tree, truncated }) };
        }
        const file = fileAt(url);
        if (failing.includes(file)) return refusal(500);
        return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(files[file]).buffer };
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
  assert.equal(run.requests.length, 5, 'the lookup, then the listing and its three retries; no download follows');
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

const LIVE = { '001-live/README.md': PUBLISHED };
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

/** Asserts a run stopped at the file listing: named reasons, nothing downloaded, nothing touched. */
function assertRefusedAtListing(run, reasons) {
  assert.equal(run.exit, 1);
  for (const reason of reasons) assert.match(run.errors[0].message, reason);
  assert.equal(run.requests.length, 2, 'the lookup and the listing, and no download');
  assert.deepEqual(run.operations, [], 'the last good sync stays in place');
}

test('a truncated listing fails the sync, because the files it leaves out would leave the site', async () => {
  const run = await runSync({ ...LIVE }, { truncated: true });
  assertRefusedAtListing(run, [/GitHub truncated the file listing of 1sixtech\/1six-researchs@a1b2c3d/]);
});

test('every numbered folder is either an article or a failed sync, and all the problems are named at once', async () => {
  const run = await runSync({
    ...LIVE,
    '002-Bad_Name/README.md': PUBLISHED,
    '002-Bad_Name/assets/chart.svg': '<svg/>',
    '003-figures/assets/chart.svg': '<svg/>',
    '004-nested/assets/README.md': 'not the article',
    '005-UPPER/assets/chart.svg': '<svg/>',
  });
  assertRefusedAtListing(run, [
    /Cannot publish 1sixtech\/1six-researchs@a1b2c3d:/,
    /002-Bad_Name: a folder name must be/,
    /003-figures: has no README\.md/,
    /004-nested: has no README\.md/,
    /005-UPPER: a folder name must be/,
    /005-UPPER: has no README\.md/,
  ]);
});

test('a README in the wrong case is no README, because the site reads only README.md', async () => {
  const run = await runSync({ ...LIVE, '002-lower/readme.md': PUBLISHED });
  assertRefusedAtListing(run, [/002-lower: has no README\.md/]);
});

test('a symbolic link in a numbered folder fails the sync before anything is downloaded, draft or not', async () => {
  const linked = (name) => ({
    listing: ({ tree, truncated }) => ({
      truncated,
      tree: tree.map((entry) => (entry.path === name ? { ...entry, mode: '120000', size: 19 } : entry)),
    }),
  });
  const figure = await runSync({ ...LIVE, '001-live/assets/chart.png': 'target' }, linked('001-live/assets/chart.png'));
  assertRefusedAtListing(figure, [/001-live\/assets\/chart\.png: a symbolic link cannot be published/]);

  const readme = await runSync({ ...LIVE }, linked('001-live/README.md'));
  assertRefusedAtListing(readme, [/001-live\/README\.md: a symbolic link cannot be published/]);

  const draft = await runSync({ ...LIVE, '002-wip/README.md': DRAFT, '002-wip/link.png': 'target' }, linked('002-wip/link.png'));
  assertRefusedAtListing(draft, [/002-wip\/link\.png: a symbolic link cannot be published/]);

  const outside = await runSync({ ...LIVE, 'docs/link.md': 'target' }, linked('docs/link.md'));
  assert.equal(outside.exit, undefined, 'a link outside the article folders is not read');
});

test('a draft in a misnamed folder fails too: the name is wrong whether or not it is published yet', async () => {
  const run = await runSync({ ...LIVE, '002-Wip/README.md': DRAFT });
  assertRefusedAtListing(run, [/002-Wip: a folder name must be/]);
});

test('files outside a numbered folder are not articles and are left alone', async () => {
  const run = await runSync({
    ...LIVE,
    'README.md': 'the repository',
    'LICENSE': 'license',
    '001-notes.md': 'a numbered file is not a folder',
    '12-ideas/notes.txt': 'two digits',
    '.github/workflows/publish.yml': 'on: push',
  });
  assert.equal(run.exit, undefined);
  assert.deepEqual([...run.written.keys()], ['/repo/content/writing/001-live/README.md']);
});

test('the site and the sync share one slug rule', () => {
  for (const name of ['001-live', '123-a-b-9']) assert.equal(isArticleSlug(name), true, name);
  for (const name of ['001', '001-', '01-live', '001_live', '001-Live', '001-a b', '001-a.b', '../001-a', '001-a/b', '001-a\n']) {
    assert.equal(isArticleSlug(name), false, name);
  }
  assert.equal(getArticle('001-Live'), null, 'a name the sync refuses has no article page');
});

test('every image type an article can show is copied, in either case', async () => {
  const images = ['a.avif', 'b.gif', 'c.jpeg', 'd.jpg', 'e.png', 'f.svg', 'g.webp', 'H.PNG', 'i.Svg'];
  const run = await runSync({ ...LIVE, ...Object.fromEntries(images.map((name) => [`001-live/assets/${name}`, 'image'])) });
  assert.equal(run.exit, undefined);
  for (const name of images) assert.equal(run.written.get(`/repo/public/writing-assets/001-live/assets/${name}`), 'image');
});

test('any other file in a published article fails the sync before any asset is downloaded', async () => {
  const run = await runSync({
    ...LIVE,
    '001-live/assets/page.html': '<script>alert(1)</script>',
    '001-live/data.csv': 'a,b',
    '001-live/assets/README.md': 'notes',
    '001-live/.DS_Store': 'finder',
    '001-live/assets/Makefile': 'all:',
    '001-live/assets/chart.svg.exe': 'binary',
  });
  assert.equal(run.exit, 1);
  for (const reason of [
    /001-live\/assets\/page\.html: \.html is not an allowed type/,
    /001-live\/data\.csv: \.csv is not an allowed type/,
    /001-live\/assets\/README\.md: \.md is not an allowed type/,
    /001-live\/\.DS_Store: a file with no extension is not an allowed type/,
    /001-live\/assets\/Makefile: a file with no extension is not an allowed type/,
    /001-live\/assets\/chart\.svg\.exe: \.exe is not an allowed type/,
  ]) assert.match(run.errors[0].message, reason);
  assert.equal(run.requests.length, 3, 'the lookup, the listing, and the README that shows it is published');
  assert.deepEqual(run.operations, [], 'the last good sync stays in place');
});

test('an asset over the size limit fails the sync before it is downloaded; one at the limit is copied', async () => {
  const atLimit = await runSync(
    { ...LIVE, '001-live/assets/big.png': 'image' },
    { sizes: { '001-live/assets/big.png': MAX_ASSET_BYTES } },
  );
  assert.equal(atLimit.exit, undefined);

  const over = await runSync(
    { ...LIVE, '001-live/assets/huge.png': 'image' },
    { sizes: { '001-live/assets/huge.png': MAX_ASSET_BYTES + 1 } },
  );
  assert.equal(over.exit, 1);
  assert.match(over.errors[0].message, /001-live\/assets\/huge\.png: is over the 5 MB limit \(5242881 bytes\)/);
  assert.equal(over.requests.some((url) => url.includes('huge')), false);
  assert.deepEqual(over.operations, [], 'the last good sync stays in place');

  for (const size of [undefined, null, '12']) {
    const unsized = await runSync(
      { ...LIVE, '001-live/assets/mystery.png': 'image' },
      { sizes: { '001-live/assets/mystery.png': size } },
    );
    assert.equal(unsized.exit, 1, `a listing that gives ${size} as the size does not get a pass`);
    assert.match(unsized.errors[0].message, /001-live\/assets\/mystery\.png: the GitHub listing gave no size/);
  }
});

test('a README over the size limit fails the sync before anything is downloaded, draft or not', async () => {
  const run = await runSync(
    { ...LIVE, '002-wip/README.md': DRAFT },
    { sizes: { '002-wip/README.md': MAX_ASSET_BYTES + 1 } },
  );
  assertRefusedAtListing(run, [/002-wip\/README\.md: is over the 5 MB limit \(5242881 bytes\)/]);
});

test('published assets are capped in total as well as each, before any asset is downloaded', async () => {
  const figures = (count) => Object.fromEntries(Array.from({ length: count }, (_, index) => [`001-live/assets/f${index}.png`, 'image']));
  const sizes = (count) => Object.fromEntries(Object.keys(figures(count)).map((file) => [file, MAX_ASSET_BYTES]));

  const atLimit = await runSync({ ...LIVE, ...figures(40) }, { sizes: sizes(40) });
  assert.equal(atLimit.exit, undefined, '40 files of 5 MB is exactly 200 MB');

  const over = await runSync({ ...LIVE, ...figures(41) }, { sizes: sizes(41) });
  assert.equal(over.exit, 1);
  assert.match(over.errors[0].message, /published assets total 214958080 bytes, over the 200 MB limit for one build/);
  assert.equal(over.requests.length, 3, 'the lookup, the listing, and the README that shows it is published');
  assert.deepEqual(over.operations, [], 'the last good sync stays in place');
});

test("a draft's working files are not checked, because they are never copied", async () => {
  const run = await runSync(
    { ...LIVE, '002-wip/README.md': DRAFT, '002-wip/data.csv': 'a,b', '002-wip/big.png': 'image' },
    { sizes: { '002-wip/big.png': MAX_ASSET_BYTES * 10 } },
  );
  assert.equal(run.exit, undefined);
  assert.deepEqual([...run.written.keys()], ['/repo/content/writing/001-live/README.md']);
  assert.equal(run.requests.some((url) => url.includes('data.csv') || url.includes('big.png')), false);
});

test('a server error is retried with growing waits, on the API and on file downloads', async () => {
  const lookup = await runSync({ ...LIVE }, { replies: { '/commits/': [[503], [502]] } });
  assert.equal(lookup.exit, undefined);
  assert.deepEqual(lookup.waits, [1000, 2000]);
  assert.equal(lookup.requests.filter((url) => url.includes('/commits/')).length, 3);

  const listing = await runSync({ ...LIVE }, { replies: { '/git/trees/': [[500]] } });
  assert.equal(listing.exit, undefined);
  assert.deepEqual(listing.waits, [1000]);

  const download = await runSync({ ...LIVE }, { replies: { 'raw.githubusercontent.com': [[500]] } });
  assert.equal(download.exit, undefined);
  assert.deepEqual(download.waits, [1000]);
});

test('a refusal is retried after the wait GitHub names: Retry-After, then the rate limit reset, then a minute', async () => {
  const retryAfter = await runSync({ ...LIVE }, { replies: { '/commits/': [[429, { 'retry-after': '30' }]] } });
  assert.equal(retryAfter.exit, undefined);
  assert.deepEqual(retryAfter.waits, [30_000]);

  const onServerError = await runSync({ ...LIVE }, { replies: { '/commits/': [[503, { 'retry-after': '7' }]] } });
  assert.deepEqual(onServerError.waits, [7000], 'Retry-After outranks the default backoff');

  const now = 1_800_000_000_500;
  const resetAt = String(Math.floor(now / 1000) + 20);
  const limited = await runSync({ ...LIVE }, { now, replies: { '/commits/': [[403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': resetAt }]] } });
  assert.equal(limited.exit, undefined);
  assert.deepEqual(limited.waits, [20_500], 'until the reset, and a second more');

  const unnamed = await runSync({ ...LIVE }, { replies: { '/commits/': [[403]] } });
  assert.equal(unnamed.exit, undefined);
  assert.deepEqual(unnamed.waits, [60_000]);
});

test('retries stop after three, and the sync then fails without touching the last good content', async () => {
  const always = () => [[503], [503], [503], [503], [503], [503]];
  const run = await runSync({ ...LIVE }, { replies: { 'raw.githubusercontent.com': always() } });
  assert.equal(run.exit, 1);
  assert.match(run.errors[0].message, /Failed to download 001-live\/README\.md: 503/);
  assert.equal(run.requests.filter((url) => url.startsWith('https://raw.')).length, 4);
  assert.deepEqual(run.waits, [1000, 2000, 4000]);
  assert.deepEqual(run.operations, []);
});

test('a limit that resets beyond the wait budget fails now and names the token', async () => {
  const resetAt = String(Math.floor(Date.now() / 1000) + 3000);
  const limited = () => [[403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': resetAt }]];
  const run = await runSync({ ...LIVE }, { replies: { '/commits/': limited() } });
  assert.equal(run.exit, 1);
  assert.match(run.errors[0].message, /GitHub commit lookup failed for main: 403 busy Set WRITING_GITHUB_TOKEN to raise the GitHub rate limit\./);
  assert.equal(run.requests.length, 1);
  assert.deepEqual(run.waits, []);

  const tooLong = await runSync({ ...LIVE }, { replies: { '/commits/': [[429, { 'retry-after': '3600' }]] } });
  assert.equal(tooLong.exit, 1);
  assert.equal(tooLong.requests.length, 1, 'a Retry-After past the budget is not waited out either');

  const authenticated = await runSync({ ...LIVE }, { env: { WRITING_GITHUB_TOKEN: 'tok' }, replies: { '/commits/': limited() } });
  assert.doesNotMatch(authenticated.errors[0].message, /WRITING_GITHUB_TOKEN/, 'a limited token is neither advised nor blamed');
});

test('anything else is an answer, not an outage, and is not retried', async () => {
  for (const status of [400, 401, 404, 422]) {
    const run = await runSync({ ...LIVE }, { commitStatus: status });
    assert.equal(run.exit, 1);
    assert.equal(run.requests.length, 1, `${status} is final`);
    assert.deepEqual(run.waits, []);
  }
});

test('a token GitHub rejects fails the sync at once and names the variable, because it would fail every build', async () => {
  const run = await runSync({ ...LIVE }, { env: { WRITING_GITHUB_TOKEN: 'expired' }, commitStatus: 401 });
  assert.equal(run.exit, 1);
  assert.match(run.errors[0].message, /GitHub commit lookup failed for main: 401 Not Found WRITING_GITHUB_TOKEN was rejected: replace or remove it\./);
  assert.equal(run.requests.length, 1);
  assert.deepEqual(run.operations, [], 'the last good sync stays in place');
});

test('without a token nothing is sent as one, and a blank token counts as none', async () => {
  for (const env of [{}, { WRITING_GITHUB_TOKEN: '' }, { WRITING_GITHUB_TOKEN: '   ' }]) {
    const run = await runSync({ ...LIVE, '001-live/assets/chart.svg': '<svg/>' }, { env });
    assert.equal(run.exit, undefined);
    for (const [url, headers] of run.headers) assert.equal(headers.Authorization, undefined, url);
    assert.equal(run.requests.filter((url) => url.startsWith('https://raw.githubusercontent.com/')).length, 2);
  }
});

test('with a token every request goes to the API, authenticated, at the resolved commit', async () => {
  const run = await runSync(
    { ...LIVE, '001-live/assets/q3 #1.svg': '<svg>q3</svg>' },
    { env: { WRITING_GITHUB_TOKEN: ' tok-123\n' } },
  );
  assert.equal(run.exit, undefined);
  assert.equal(run.requests.some((url) => url.includes('raw.githubusercontent.com')), false, 'the token never goes to another host');
  for (const url of run.requests) {
    assert.ok(url.startsWith('https://api.github.com/'), url);
    assert.equal(run.headers.get(url).Authorization, 'Bearer tok-123', url);
  }
  const download = `https://api.github.com/repos/${REPO}/contents/001-live/assets/q3%20%231.svg?ref=${COMMIT}`;
  assert.ok(run.requests.includes(download));
  assert.equal(run.headers.get(download).Accept, 'application/vnd.github.raw+json', 'any other media type answers with JSON');
  assert.equal(run.written.get('/repo/public/writing-assets/001-live/assets/q3 #1.svg'), '<svg>q3</svg>');
});

test('every published article is copied to its own folders, each with its own figures', async () => {
  const run = await runSync({
    '001-first/README.md': PUBLISHED,
    '001-first/assets/one.svg': '<svg>one</svg>',
    '002-second/README.md': PUBLISHED,
    '002-second/assets/two.png': 'two',
  });
  assert.deepEqual([...run.written.keys()].sort(), [
    '/repo/content/writing/001-first/README.md',
    '/repo/content/writing/002-second/README.md',
    '/repo/public/writing-assets/001-first/assets/one.svg',
    '/repo/public/writing-assets/002-second/assets/two.png',
  ]);
  assert.equal(run.written.get('/repo/public/writing-assets/002-second/assets/two.png'), 'two');
  assert.deepEqual(run.logged, [`Synced 2 writing article(s) from ${REPO}@main (a1b2c3d)`]);
});

test('a repository with no numbered folders has nothing to publish and fails like one holding only drafts', async () => {
  const run = await runSync({ 'README.md': 'the repository', 'LICENSE': 'license' });
  assertRefusedAtListing(run, [/No published articles found in 1sixtech\/1six-researchs@main/]);
});

test('token downloads name the same API version as the lookup and the listing', async () => {
  const run = await runSync({ ...LIVE }, { env: { WRITING_GITHUB_TOKEN: 'tok' } });
  const download = `https://api.github.com/repos/${REPO}/contents/001-live/README.md?ref=${COMMIT}`;
  assert.equal(run.headers.get(download)['X-GitHub-Api-Version'], '2022-11-28');
});

test('only files count: the sub-folders and submodules GitHub also lists are neither assets nor downloads', async () => {
  const run = await runSync(
    { ...LIVE, '001-live/assets/chart.svg': '<svg/>' },
    {
      listing: ({ tree, truncated }) => ({
        truncated,
        tree: [{ type: 'tree', path: '001-live' }, { type: 'tree', path: '001-live/assets' }, { type: 'commit', path: '001-live/vendored' }, ...tree],
      }),
    },
  );
  assert.equal(run.exit, undefined);
  assert.deepEqual([...run.written.keys()].sort(), [
    '/repo/content/writing/001-live/README.md',
    '/repo/public/writing-assets/001-live/assets/chart.svg',
  ]);
  assert.equal(run.requests.length, 4, 'the lookup, the listing, and the two files');
});

test('a listing with no file list fails the sync without touching the last good content', async () => {
  const run = await runSync({ ...LIVE }, { listing: () => ({}) });
  assertRefusedAtListing(run, []);
});

test('a numbered folder holding only a submodule is still found, and fails for having no README', async () => {
  const run = await runSync(
    { ...LIVE },
    {
      listing: ({ tree, truncated }) => ({
        truncated,
        tree: [...tree, { type: 'tree', path: '002-vendored' }, { type: 'commit', path: '002-vendored/upstream' }],
      }),
    },
  );
  assertRefusedAtListing(run, [/002-vendored: has no README\.md/]);
});

test('a folder is numbered only if its name opens with three digits and a hyphen', async () => {
  const run = await runSync({
    ...LIVE,
    '001/notes.txt': 'no hyphen',
    '2026-notes/notes.txt': 'a year',
    'archive-001-old/notes.txt': 'the digits come later',
  });
  assert.equal(run.exit, undefined);
  assert.deepEqual([...run.written.keys()], ['/repo/content/writing/001-live/README.md']);
});

test('a published article does not take the figures of a draft whose folder name starts the same way', async () => {
  const run = await runSync({
    ...LIVE,
    '001-live/assets/chart.svg': '<svg>public</svg>',
    '001-live-wip/README.md': DRAFT,
    '001-live-wip/assets/secret.svg': '<svg>unpublished</svg>',
  });
  assert.equal(run.exit, undefined);
  assert.deepEqual([...run.written.keys()].sort(), [
    '/repo/content/writing/001-live/README.md',
    '/repo/public/writing-assets/001-live/assets/chart.svg',
  ]);
  assert.equal(run.requests.some((url) => url.includes('secret')), false);
});

test('a folder the slug rule refuses is not loaded by the site, even when it is already on disk', async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'sync-writing-test-'));
  for (const slug of ['001-live', '002-Bad_Name']) {
    mkdirSync(path.join(folder, 'content/writing', slug), { recursive: true });
    writeFileSync(path.join(folder, 'content/writing', slug, 'README.md'), PUBLISHED);
  }
  const cwd = process.cwd();
  process.chdir(folder);
  try {
    // The module fixes its content folder when it loads, so this needs its own instance.
    const { getArticles } = await import('./writing.ts?misnamed-folder');
    assert.deepEqual(getArticles().map((article) => article.slug), ['001-live']);
  } finally {
    process.chdir(cwd);
    rmSync(folder, { recursive: true, force: true });
  }
});

test('a refusal that will be retried has its body released, and the answer the sync reports can still be read', async () => {
  const run = await runSync({ ...LIVE }, { replies: { '/commits/': [[503], [503], [503], [503]] } });
  assert.equal(run.exit, 1);
  assert.match(run.errors[0].message, /GitHub commit lookup failed for main: 503 busy/);
  assert.equal(run.refusals.length, 4);
  for (const retried of run.refusals.slice(0, 3)) assert.equal(retried.bodyUsed, true, 'an unread body holds its connection open');

  const pastBudget = await runSync({ ...LIVE }, { replies: { '/commits/': [[429, { 'retry-after': '3600' }]] } });
  assert.match(pastBudget.errors[0].message, /GitHub commit lookup failed for main: 429 busy/, 'a refusal not waited out is the answer');
});

test('a 403 with quota left waits a minute, however far away the hourly reset is', async () => {
  const resetAt = String(Math.floor(Date.now() / 1000) + 3000);
  const run = await runSync({ ...LIVE }, { replies: { '/commits/': [[403, { 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': resetAt }]] } });
  assert.equal(run.exit, undefined);
  assert.deepEqual(run.waits, [60_000]);
});

test('an exhausted limit with no reset time waits a minute, and one whose reset has passed waits a second', async () => {
  const noReset = await runSync({ ...LIVE }, { replies: { '/commits/': [[403, { 'x-ratelimit-remaining': '0' }]] } });
  assert.deepEqual(noReset.waits, [60_000]);

  const passed = String(Math.floor(Date.now() / 1000) - 100);
  const stale = await runSync({ ...LIVE }, { replies: { '/commits/': [[403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': passed }]] } });
  assert.equal(stale.exit, undefined);
  assert.deepEqual(stale.waits, [1000]);
});

test('Retry-After outranks an exhausted limit, and a server error keeps its backoff whatever the limit headers say', async () => {
  const limit = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 20) };
  const named = await runSync({ ...LIVE }, { replies: { '/commits/': [[403, { 'retry-after': '5', ...limit }]] } });
  assert.deepEqual(named.waits, [5000]);

  const serverError = await runSync({ ...LIVE }, { replies: { '/commits/': [[502, limit]] } });
  assert.deepEqual(serverError.waits, [1000]);
});

test('a Retry-After that is not a number of seconds is ignored rather than read as no wait at all', async () => {
  const date = { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' };
  const serverError = await runSync({ ...LIVE }, { replies: { '/commits/': [[503, date]] } });
  assert.deepEqual(serverError.waits, [1000]);

  const refused = await runSync({ ...LIVE }, { replies: { '/commits/': [[429, date]] } });
  assert.deepEqual(refused.waits, [60_000]);
});

test('a Retry-After of exactly a minute is waited out, and one second more is not', async () => {
  const atBudget = await runSync({ ...LIVE }, { replies: { '/commits/': [[429, { 'retry-after': '60' }]] } });
  assert.equal(atBudget.exit, undefined);
  assert.deepEqual(atBudget.waits, [60_000]);

  const overBudget = await runSync({ ...LIVE }, { replies: { '/commits/': [[429, { 'retry-after': '61' }]] } });
  assert.equal(overBudget.exit, 1);
  assert.deepEqual(overBudget.waits, []);
});

const TOKEN_ADVICE = /Set WRITING_GITHUB_TOKEN to raise the GitHub rate limit\./;
const TOKEN_REJECTED = /WRITING_GITHUB_TOKEN was rejected: replace or remove it\./;
const PAST_BUDGET = { 'retry-after': '3600' };

test('an anonymous build is told about the token wherever GitHub limits it, and not for any other failure', async () => {
  const lookup = await runSync({ ...LIVE }, { replies: { '/commits/': [[429, PAST_BUDGET]] } });
  assert.match(lookup.errors[0].message, TOKEN_ADVICE);

  const listing = await runSync({ ...LIVE }, { treeStatus: 403 });
  assert.match(listing.errors[0].message, TOKEN_ADVICE);

  const download = await runSync({ ...LIVE }, { replies: { 'raw.githubusercontent.com': [[403, PAST_BUDGET]] } });
  assert.match(download.errors[0].message, /Failed to download 001-live\/README\.md: 403/);
  assert.match(download.errors[0].message, TOKEN_ADVICE);

  const missing = await runSync({ ...LIVE }, { commitStatus: 404 });
  assert.doesNotMatch(missing.errors[0].message, /WRITING_GITHUB_TOKEN/);

  const outage = await runSync({ ...LIVE }, { failing: ['001-live/README.md'] });
  assert.doesNotMatch(outage.errors[0].message, /WRITING_GITHUB_TOKEN/);
});

test('a token is blamed for a 401 on the listing and on downloads too, and for nothing else', async () => {
  const env = { WRITING_GITHUB_TOKEN: 'expired' };
  const listing = await runSync({ ...LIVE }, { env, treeStatus: 401 });
  assert.match(listing.errors[0].message, /GitHub tree fetch failed: 401 tree unavailable/);
  assert.match(listing.errors[0].message, TOKEN_REJECTED);

  const download = await runSync({ ...LIVE }, { env, replies: { '/contents/': [[401]] } });
  assert.match(download.errors[0].message, /Failed to download 001-live\/README\.md: 401/);
  assert.match(download.errors[0].message, TOKEN_REJECTED);

  const missing = await runSync({ ...LIVE }, { env, commitStatus: 404 });
  assert.doesNotMatch(missing.errors[0].message, /WRITING_GITHUB_TOKEN/);
});
