import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
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

// Every answer is a real Response, so a body released too early cannot be read, as in production.
const refusal = (status, text = '', headers = {}) => new Response(text, { status, headers });

// How Node's fetch rejects when a request never gets an answer: a TypeError whose cause names the reason.
const networkError = (code, message) => new TypeError('fetch failed', { cause: Object.assign(new Error(message), { code }) });
const dropped = () => networkError('ECONNRESET', 'read ECONNRESET');
// What AbortSignal.timeout rejects with, in fetch() or, once the headers are in, in the body read.
const timedOut = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError');
// What a body read rejects with when the connection closes mid-transfer.
const terminated = () => new TypeError('terminated', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) });

/** A 200 whose body breaks after its first bytes. */
function brokenBody(reason) {
  let pulls = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      pulls += 1;
      if (pulls === 1) controller.enqueue(new TextEncoder().encode('<svg>par'));
      else controller.error(reason);
    },
  }));
}

/** An answer whose connection dropped before its body could be read or released. */
const unreadableBody = (status, headers) => new Response(new ReadableStream({ start(controller) { controller.error(dropped()); } }), { status, headers });

/**
 * Runs the sync over `files` (path -> text), failing the downloads listed in `failing`.
 * `replies` maps part of a URL to what GitHub gives it before answering normally: a refusal
 * [status, headers], an error the request rejects with, or a Response to return as is;
 * `sizes` overrides the size the listing reports for a path, and `listing` rewrites the listing's
 * whole answer. Waits are recorded and not slept, unless `deferWaits` lets each run a few event
 * loop turns so other requests can go on meanwhile; `now` fixes the clock the script reads.
 * `signals` lists each request's signal; `peak` is the most requests open at once, from the call
 * until the body is read or released; `sentWhileWaiting` and `peakWhileWaiting` count requests
 * sent, and the most open, while a deferred wait is pending; `warnings` holds the retry lines.
 */
function runSync(files, { failing = [], commitStatus = 200, commitBody = `${COMMIT}\n`, treeStatus = 200, offline = false, env = {}, truncated = false, sizes = {}, replies = {}, listing = (answer) => answer, deferWaits = false, now } = {}) {
  return new Promise((resolve) => {
    const result = { requests: [], headers: new Map(), signals: [], peak: 0, sentWhileWaiting: 0, peakWhileWaiting: 0, refusals: [], waits: [], operations: [], written: new Map(), logged: [], warnings: [], errors: [], exit: undefined };
    let open = 0;
    let waiting = 0;
    // A request stays open until its body is read to the end or released, as on a real connection.
    const held = (response) => {
      const reader = response.body?.getReader();
      if (!reader) {
        open -= 1;
        return response;
      }
      let closed = false;
      const close = () => {
        if (!closed) open -= 1;
        closed = true;
      };
      return new Response(new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              close();
              controller.close();
            } else controller.enqueue(value);
          } catch (error) {
            close();
            controller.error(error);
          }
        },
        cancel(reason) {
          close();
          return reader.cancel(reason);
        },
      // Read only on demand, so an answer nobody touches stays unread.
      }, { highWaterMark: 0 }), { status: response.status, headers: response.headers });
    };
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
      // Never fires: a request past its deadline is scripted as the error the real signal would raise.
      AbortSignal: { timeout: (delay) => ({ timeout: delay }) },
      setTimeout(callback, delay) {
        result.waits.push(delay);
        if (!deferWaits) return callback();
        waiting += 1;
        let turns = 20;
        const tick = () => {
          if (turns > 0) {
            turns -= 1;
            setImmediate(tick);
            return;
          }
          waiting -= 1;
          callback();
        };
        tick();
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
        warn(line) { result.warnings.push(line); },
        error(error) { result.errors.push(error); },
      },
      async fetch(url, init) {
        result.requests.push(url);
        result.headers.set(url, { ...init.headers });
        result.signals.push(init.signal);
        // A real request is answered later, never at once; the gap shows how many are open together.
        open += 1;
        result.peak = Math.max(result.peak, open);
        if (waiting > 0) {
          result.sentWhileWaiting += 1;
          result.peakWhileWaiting = Math.max(result.peakWhileWaiting, open);
        }
        await new Promise((resolve) => setImmediate(resolve));
        try {
          return held(answer(url));
        } catch (error) {
          open -= 1;
          throw error;
        }
      },
    }));

    function answer(url) {
      if (offline) throw networkError('ENOTFOUND', 'getaddrinfo ENOTFOUND api.github.com');
      const reply = scripted(url);
      if (reply instanceof Error) throw reply;
      if (reply instanceof Response) return reply;
      if (reply) {
        result.refusals.push(refusal(reply[0], 'busy', reply[1]));
        return result.refusals.at(-1);
      }
      if (url.includes('/commits/')) {
        if (commitStatus !== 200) return refusal(commitStatus, 'Not Found');
        return new Response(commitBody);
      }
      if (url.includes('/git/trees/')) {
        // Like GitHub, the tree exists only at a real commit.
        const status = url.includes(`/git/trees/${COMMIT}?`) ? treeStatus : 404;
        if (status !== 200) return refusal(status, 'tree unavailable');
        const size = (file) => (Object.hasOwn(sizes, file) ? sizes[file] : new TextEncoder().encode(files[file]).length);
        const tree = [{ type: 'tree', path: 'a-folder' }, ...Object.keys(files).map((file) => ({ type: 'blob', mode: '100644', path: file, size: size(file) }))];
        return Response.json(listing({ tree, truncated }));
      }
      const file = fileAt(url);
      if (failing.includes(file)) return refusal(500);
      return new Response(files[file]);
    }
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

test('a network failure that persists is retried three times, then fails the sync before anything is listed or touched', async () => {
  const run = await runSync({ '001-live/README.md': PUBLISHED }, { offline: true });
  const lookup = `https://api.github.com/repos/${REPO}/commits/main`;
  assert.equal(run.exit, 1);
  assert.equal(run.errors[0].message, `GitHub request failed after 3 retries: ${lookup}`);
  assert.equal(run.errors[0].cause.cause.code, 'ENOTFOUND', "Node's own reason stays attached for the build log");
  assert.deepEqual(run.requests, [lookup, lookup, lookup, lookup], 'no listing and no download follow a failed lookup');
  assert.deepEqual(run.waits, [1000, 2000, 4000], 'the server-error backoff');
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

test('READMEs are capped in total before any is downloaded, and one with no listed size is refused', async () => {
  const folders = Array.from({ length: 41 }, (_, index) => `0${String(index).padStart(2, '0')}-article`);
  const files = Object.fromEntries(folders.map((folder) => [`${folder}/README.md`, PUBLISHED]));
  const sizes = Object.fromEntries(Object.keys(files).map((file) => [file, MAX_ASSET_BYTES]));
  const over = await runSync(files, { sizes });
  assertRefusedAtListing(over, [/READMEs total 214958080 bytes, over the 200 MB limit for one build/]);

  const unsized = await runSync({ ...LIVE }, { sizes: { '001-live/README.md': undefined } });
  assertRefusedAtListing(unsized, [/001-live\/README\.md: the GitHub listing gave no size/]);
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

test('a request that fails on the way is retried with the server-error backoff, on the API and on file downloads', async () => {
  const lookup = await runSync({ ...LIVE }, { replies: { '/commits/': [dropped(), networkError('ENOTFOUND', 'getaddrinfo ENOTFOUND api.github.com')] } });
  assert.equal(lookup.exit, undefined);
  assert.deepEqual(lookup.waits, [1000, 2000]);
  assert.equal(lookup.requests.filter((url) => url.includes('/commits/')).length, 3);

  const listing = await runSync({ ...LIVE }, { replies: { '/git/trees/': [dropped()] } });
  assert.equal(listing.exit, undefined);
  assert.deepEqual(listing.waits, [1000]);

  const download = await runSync({ ...LIVE }, { replies: { 'raw.githubusercontent.com': [dropped()] } });
  assert.equal(download.exit, undefined);
  assert.deepEqual(download.waits, [1000]);
  assert.equal(download.written.get('/repo/content/writing/001-live/README.md'), PUBLISHED);

  const authenticated = await runSync({ ...LIVE }, { env: { WRITING_GITHUB_TOKEN: 'tok' }, replies: { '/contents/': [dropped()] } });
  assert.equal(authenticated.exit, undefined);
  assert.deepEqual(authenticated.waits, [1000]);
});

test('a request still unanswered or unread at its 30-second deadline is abandoned and sent again', async () => {
  const beforeAnswer = await runSync({ ...LIVE }, { replies: { '/commits/': [timedOut()] } });
  assert.equal(beforeAnswer.exit, undefined);
  assert.deepEqual(beforeAnswer.waits, [1000]);

  const inBody = await runSync(
    { ...LIVE, '001-live/assets/chart.svg': '<svg>public</svg>' },
    { replies: { 'chart.svg': [brokenBody(timedOut())] } },
  );
  assert.equal(inBody.exit, undefined);
  assert.deepEqual(inBody.waits, [1000]);
  assert.equal(inBody.written.get('/repo/public/writing-assets/001-live/assets/chart.svg'), '<svg>public</svg>');
});

test('a body cut off partway is downloaded again in full, so part of a file is never saved', async () => {
  const run = await runSync(
    { ...LIVE, '001-live/assets/chart.svg': '<svg>public</svg>' },
    { replies: { 'chart.svg': [brokenBody(terminated()), brokenBody(terminated())] } },
  );
  assert.equal(run.exit, undefined);
  assert.deepEqual(run.waits, [1000, 2000]);
  assert.equal(run.written.get('/repo/public/writing-assets/001-live/assets/chart.svg'), '<svg>public</svg>');
});

test('every attempt has its own 30-second timeout, so a retry does not start on a spent one', async () => {
  for (const env of [{}, { WRITING_GITHUB_TOKEN: 'tok' }]) {
    const run = await runSync(
      { ...LIVE, '001-live/assets/chart.svg': '<svg/>' },
      { env, replies: { '/commits/': [[503]], 'chart.svg': [dropped()] } },
    );
    assert.equal(run.exit, undefined);
    assert.equal(run.requests.length, 6, 'two lookups, the listing, the README, and the figure twice');
    assert.equal(run.signals.length, run.requests.length);
    for (const signal of run.signals) assert.deepEqual(signal, { timeout: 30_000 });
    assert.equal(new Set(run.signals).size, run.signals.length);
  }
});

const TWENTY_FIGURES = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`001-live/assets/f${index}.svg`, `<svg>${index}</svg>`]));
const figureAt = (name) => `https://raw.githubusercontent.com/${REPO}/${COMMIT}/001-live/assets/${name}`;

/** Asserts every one of the twenty figures was saved whole. */
function assertAllFigures(run) {
  for (const [file, text] of Object.entries(TWENTY_FIGURES)) assert.equal(run.written.get(`/repo/public/writing-assets/${file}`), text, file);
}

test('a download that keeps failing on the way fails the sync, names the request, and leaves the last good sync in place', async () => {
  const always = () => [dropped(), dropped(), dropped(), dropped()];
  const figure = figureAt('chart.svg');
  const run = await runSync({ ...LIVE, '001-live/assets/chart.svg': '<svg/>' }, { replies: { 'chart.svg': always() } });
  assert.equal(run.exit, 1);
  assert.equal(run.errors[0].message, `GitHub request failed after 3 retries: ${figure}`);
  assert.equal(run.requests.filter((url) => url === figure).length, 4);
  assert.deepEqual(run.waits, [1000, 2000, 4000]);
  assert.deepEqual(run.operations, [], 'nothing is deleted until every file has arrived');

  const cutOff = await runSync({ ...LIVE }, { replies: { 'raw.githubusercontent.com': Array.from({ length: 4 }, () => brokenBody(timedOut())) } });
  assert.equal(cutOff.exit, 1);
  assert.equal(cutOff.errors[0].cause.name, 'TimeoutError');
  assert.deepEqual(cutOff.operations, []);

  const authenticated = await runSync({ ...LIVE }, { env: { WRITING_GITHUB_TOKEN: 'secret-token' }, replies: { '/contents/': always() } });
  assert.equal(authenticated.exit, 1);
  assert.match(authenticated.errors[0].message, /contents\/001-live\/README\.md\?ref=/);
  assert.doesNotMatch(authenticated.errors[0].message, /secret-token/, 'the token travels in a header, never in the message');
});

test('downloads run eight at a time, READMEs and figures alike, and every file still arrives', async () => {
  const folders = Array.from({ length: 20 }, (_, index) => `0${String(index).padStart(2, '0')}-article`);
  const readmes = await runSync(Object.fromEntries(folders.map((folder) => [`${folder}/README.md`, `# ${folder}\n\nDate: 2026-11-01\n`])));
  assert.equal(readmes.exit, undefined);
  assert.equal(readmes.peak, 8);
  assert.equal(readmes.written.size, 20);
  for (const folder of folders) assert.equal(readmes.written.get(`/repo/content/writing/${folder}/README.md`), `# ${folder}\n\nDate: 2026-11-01\n`);

  const assets = await runSync({ ...LIVE, ...TWENTY_FIGURES });
  assert.equal(assets.exit, undefined);
  assert.equal(assets.peak, 8);
  assertAllFigures(assets);

  const few = await runSync({ ...LIVE, '001-live/assets/a.svg': '<svg/>', '001-live/assets/b.svg': '<svg/>' });
  assert.equal(few.peak, 2, 'fewer files than the limit still download together');
});

test('a download that fails after the first eight have started still stops the sync before anything is removed', async () => {
  const late = figureAt('f15.svg');
  const run = await runSync({ ...LIVE, ...TWENTY_FIGURES }, { failing: ['001-live/assets/f15.svg'] });
  assert.equal(run.exit, 1);
  assert.match(run.errors[0].message, /Failed to download 001-live\/assets\/f15\.svg: 500/);
  assert.ok(run.requests.filter((url) => url.includes('/assets/')).indexOf(late) >= 8, 'the file waited for a free slot');
  assert.equal(run.peak, 8);
  assert.deepEqual(run.operations, [], 'nothing is deleted until every file has arrived');
});

test('a lookup or a listing whose body breaks partway is read again, so part of a commit or a listing is never used', async () => {
  const lookup = await runSync({ ...LIVE }, { replies: { '/commits/': [brokenBody(terminated())] } });
  assert.equal(lookup.exit, undefined);
  assert.deepEqual(lookup.waits, [1000]);
  assert.equal(lookup.requests[2], `https://api.github.com/repos/${REPO}/git/trees/${COMMIT}?recursive=1`, 'the listing reads the whole commit');

  const listing = await runSync({ ...LIVE }, { replies: { '/git/trees/': [brokenBody(timedOut())] } });
  assert.equal(listing.exit, undefined);
  assert.deepEqual(listing.waits, [1000]);
  assert.equal(listing.written.get('/repo/content/writing/001-live/README.md'), PUBLISHED);
});

test('a listing that answers with something other than JSON fails the sync, unretried, before anything is downloaded or touched', async () => {
  const run = await runSync({ ...LIVE }, { replies: { '/git/trees/': [new Response('<html>Unicorn!</html>')] } });
  assertRefusedAtListing(run, []);
  assert.equal(run.errors[0].name, 'SyntaxError');
  assert.deepEqual(run.waits, [], 'a complete answer is not an outage');
});

test('a refusal whose body is missing or cannot be read keeps the wait GitHub named, and one past the budget still fails at once', async () => {
  const empty = await runSync({ ...LIVE }, { replies: { '/commits/': [new Response(null, { status: 429, headers: { 'retry-after': '30' } })] } });
  assert.equal(empty.exit, undefined);
  assert.deepEqual(empty.waits, [30_000], 'nothing to release, so the wait GitHub named still holds');

  const broken = await runSync({ ...LIVE }, { replies: { '/commits/': [unreadableBody(429, { 'retry-after': '30' })] } });
  assert.equal(broken.exit, undefined);
  assert.equal(broken.requests.filter((url) => url.includes('/commits/')).length, 2);
  assert.deepEqual(broken.waits, [30_000], 'a body that will not release does not shorten the wait');

  const pastBudget = await runSync({ ...LIVE }, { replies: { '/commits/': [unreadableBody(429, { 'retry-after': '3600' })] } });
  assert.equal(pastBudget.exit, 1);
  assert.equal(pastBudget.requests.length, 1, 'a wait past the budget is not attempted');
  assert.deepEqual(pastBudget.waits, []);
  assert.equal(pastBudget.errors[0].message, 'GitHub commit lookup failed for main: 429 (body unreadable) Set WRITING_GITHUB_TOKEN to raise the GitHub rate limit.');

  const missing = await runSync({ ...LIVE }, { replies: { '/commits/': [unreadableBody(404)] } });
  assert.equal(missing.exit, 1);
  assert.equal(missing.requests.length, 1, 'a refusal is its own answer, body or not');
  assert.equal(missing.errors[0].message, 'GitHub commit lookup failed for main: 404 (body unreadable)');
});

test('refusals and network failures share one budget of three retries', async () => {
  const lookup = `https://api.github.com/repos/${REPO}/commits/main`;
  const run = await runSync({ ...LIVE }, { replies: { '/commits/': [[503], dropped(), [503], dropped()] } });
  assert.equal(run.exit, 1);
  assert.deepEqual(run.requests, [lookup, lookup, lookup, lookup]);
  assert.deepEqual(run.waits, [1000, 2000, 4000]);
  assert.equal(run.errors[0].message, `GitHub request failed after 3 retries: ${lookup}`);
});

test('a request the client cannot even build fails at once, not after three retries as if GitHub were down', async () => {
  const invalid = new TypeError('Headers.append: "x" is an invalid header value.');
  const run = await runSync({ ...LIVE }, { replies: { '/commits/': [invalid] } });
  assert.equal(run.exit, 1);
  assert.equal(run.requests.length, 1);
  assert.deepEqual(run.waits, []);
  assert.equal(run.errors[0].message, 'Headers.append: "x" is an invalid header value.');
});

test('a token with a space, line break, or non-ASCII character fails before any request and is never printed', async () => {
  for (const token of ['ghp_secret\nghp_more', 'ghp_secret…', 'ghp secret']) {
    const run = await runSync({ ...LIVE }, { env: { WRITING_GITHUB_TOKEN: token } });
    assert.equal(run.exit, 1, JSON.stringify(token));
    assert.deepEqual(run.requests, [], 'fetch would quote the whole header in its error');
    assert.match(run.errors[0].message, /WRITING_GITHUB_TOKEN has a space, line break, or non-ASCII character in it/);
    assert.doesNotMatch(inspect(run.errors[0]), /secret/);
  }
});

test('a request keeps its slot through its retries, so it is tried again before the files queued behind it start', async () => {
  const meanwhile = await runSync({ ...LIVE, ...TWENTY_FIGURES }, { deferWaits: true, replies: { '/f0.svg': [[503]] } });
  assert.equal(meanwhile.exit, undefined);
  assert.equal(meanwhile.peakWhileWaiting, 7, 'the other seven slots keep working while it waits');
  assertAllFigures(meanwhile);

  const order = await runSync({ ...LIVE, ...TWENTY_FIGURES }, { replies: { '/f0.svg': [[503]] } });
  assert.ok(order.requests.lastIndexOf(figureAt('f0.svg')) < order.requests.indexOf(figureAt('f8.svg')), 'its retry comes before the ninth file');
});

const FORTY_FIGURES = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`001-live/assets/f${index}.svg`, `<svg>${index}</svg>`]));

test('a lasting outage fails once the first files use up their retries, without first trying every queued file', async () => {
  const unreachable = await runSync({ ...LIVE, ...FORTY_FIGURES }, { replies: { '/assets/f': Array.from({ length: 200 }, () => dropped()) } });
  assert.equal(unreachable.exit, 1);
  assert.match(unreachable.errors[0].message, /^GitHub request failed after 3 retries: .*\/assets\/f[0-7]\.svg$/);
  assert.equal(unreachable.requests.includes(figureAt('f39.svg')), false, 'the queue does not have to drain before the build fails');
  assert.deepEqual(unreachable.operations, []);

  const limited = await runSync({ ...LIVE, ...FORTY_FIGURES }, { replies: { '/assets/f': Array.from({ length: 200 }, () => [429, { 'retry-after': '30' }]) } });
  assert.equal(limited.exit, 1);
  assert.match(limited.errors[0].message, /^Failed to download 001-live\/assets\/f[0-7]\.svg: 429 Set WRITING_GITHUB_TOKEN/);
  assert.equal(limited.requests.includes(figureAt('f39.svg')), false, 'a lasting limit is not asked once per file');
  assert.deepEqual(limited.operations, []);
});

test('a rate limit holds every request until it resets, not only the one GitHub refused', async () => {
  const run = await runSync({ ...LIVE, ...TWENTY_FIGURES }, { deferWaits: true, replies: { '/f0.svg': [[429, { 'retry-after': '30' }]] } });
  assert.equal(run.exit, undefined);
  assert.deepEqual(run.waits, [30_000], 'one wait for the whole sync');
  assert.equal(run.sentWhileWaiting, 0, 'nothing is sent while GitHub has asked to wait');
  assert.deepEqual(run.warnings, [`Retry 1 of 3 in 30 s after 429: ${figureAt('f0.svg')}`]);
  assertAllFigures(run);
});

test('a 403 rate limit holds every request too, whether GitHub names the wait or only the reset', async () => {
  const named = await runSync({ ...LIVE, ...TWENTY_FIGURES }, { deferWaits: true, replies: { '/f0.svg': [[403, { 'retry-after': '30' }]] } });
  assert.equal(named.exit, undefined);
  assert.deepEqual(named.waits, [30_000]);
  assert.equal(named.sentWhileWaiting, 0);
  assertAllFigures(named);

  const now = 1_800_000_000_500;
  const exhausted = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(now / 1000) + 20) };
  const primary = await runSync({ ...LIVE, ...TWENTY_FIGURES }, { now, deferWaits: true, replies: { '/f0.svg': [[403, exhausted]] } });
  assert.equal(primary.exit, undefined);
  assert.deepEqual(primary.waits, [20_500]);
  assert.equal(primary.sentWhileWaiting, 0);
  assertAllFigures(primary);
});

test('a longer rate limit that arrives during a shorter one holds every request to the longer wait', async () => {
  const run = await runSync({ ...LIVE, ...TWENTY_FIGURES }, { deferWaits: true, replies: { '/f0.svg': [[429, { 'retry-after': '5' }]], '/f1.svg': [[429, { 'retry-after': '30' }]] } });
  assert.equal(run.exit, undefined);
  assert.deepEqual(run.waits, [5000, 30_000]);
  assert.equal(run.sentWhileWaiting, 0, 'a request that began waiting on the shorter pause waits out the longer one too');
  assertAllFigures(run);
});

test('a request whose own backoff ends during a rate limit waits the limit out before it retries', async () => {
  const run = await runSync({ ...LIVE, ...TWENTY_FIGURES }, { deferWaits: true, replies: { '/f0.svg': [[503]], '/f1.svg': [[429, { 'retry-after': '30' }]] } });
  assert.equal(run.exit, undefined);
  assert.deepEqual(run.waits, [1000, 30_000]);
  assert.equal(run.sentWhileWaiting, 0, 'the server error\'s retry is held by the pause too');
  assertAllFigures(run);
});

test('a shorter rate limit does not cut short a longer one already running', async () => {
  const run = await runSync({ ...LIVE, ...TWENTY_FIGURES }, { deferWaits: true, replies: { '/f0.svg': [[429, { 'retry-after': '30' }]], '/f1.svg': [[429, { 'retry-after': '5' }]] } });
  assert.equal(run.exit, undefined);
  assert.deepEqual(run.waits, [30_000], 'one pause, the longer');
  assert.equal(run.sentWhileWaiting, 0);
  assertAllFigures(run);
});

test('eight downloads that each fail once still finish and give their slots on, so the files queued behind them follow', async () => {
  const run = await runSync({ ...LIVE, ...TWENTY_FIGURES }, { replies: { '/assets/f': Array.from({ length: 8 }, () => dropped()) } });
  assert.equal(run.exit, undefined, 'a slot never given on would leave the sync pending until Node exits 0 with nothing printed');
  assert.equal(run.peak, 8);
  assertAllFigures(run);
});

test('every retry prints one line with its number, wait, reason, and request, and never the token', async () => {
  const lookup = `https://api.github.com/repos/${REPO}/commits/main`;
  const run = await runSync({ ...LIVE }, { env: { WRITING_GITHUB_TOKEN: 'secret-token' }, replies: { '/commits/': [[503], dropped(), timedOut()] } });
  assert.equal(run.exit, undefined);
  assert.deepEqual(run.warnings, [
    `Retry 1 of 3 in 1 s after 503: ${lookup}`,
    `Retry 2 of 3 in 2 s after ECONNRESET: ${lookup}`,
    `Retry 3 of 3 in 4 s after TimeoutError: ${lookup}`,
  ]);

  const quiet = await runSync({ ...LIVE });
  assert.deepEqual(quiet.warnings, [], 'a sync with nothing to retry prints only its summary');
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

test('a numbered folder holding only a submodule, or a submodule in its place, is found and fails for having no README', async () => {
  const withEntries = (extra) => ({ listing: ({ tree, truncated }) => ({ truncated, tree: [...tree, ...extra] }) });
  const nested = await runSync({ ...LIVE }, withEntries([{ type: 'tree', path: '002-vendored' }, { type: 'commit', path: '002-vendored/upstream' }]));
  assertRefusedAtListing(nested, [/002-vendored: has no README\.md/]);

  const atRoot = await runSync({ ...LIVE }, withEntries([{ type: 'commit', mode: '160000', path: '003-vendored' }]));
  assertRefusedAtListing(atRoot, [/003-vendored: has no README\.md/]);
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
