import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

// researchEvidence.ts imports '@/lib/research'; resolve the alias to src/.
const SRC = new URL('../../', import.meta.url);
const canHook = typeof nodeModule.registerHooks === 'function';
const skip = canHook ? false : 'needs module.registerHooks (Node 22.15+)';

// The article About cites, as a fixture (the real one is synced at build).
const SLUG = '001-hyperliquid-data-feed-latency';
const root = mkdtempSync(path.join(tmpdir(), 'evidence-test-'));
const readme = path.join(root, 'content/research', SLUG, 'README.md');
mkdirSync(path.dirname(readme), { recursive: true });
// Published labels, out of order, with a takeaway About does not quote and
// one without a label.
const ARTICLE = `# How the feed is measured

Author: Tester
Date: 2026-10-30

## Key takeaways

- **Data feed vendor:** trails the public feed; not quoted on About.
- **Own node, quiet market:** first on 65% of trades.
- Plain takeaway, no label.
- **Public feed:** the public feed lags by *0.9 s* at the median.
- **Own node, when the US stock market opens:** under <1 ms at the median & less at p95.

## Method

Body text.
`;
writeFileSync(readme, ARTICLE);

const cwd = process.cwd();
let getResearchEvidence;
if (canHook) {
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!specifier.startsWith('@/')) return nextResolve(specifier, context);
      const url = new URL(specifier.slice(2), SRC);
      const file = fileURLToPath(url);
      return nextResolve(existsSync(`${file}.ts`) ? `${url.href}.ts` : url.href, context);
    },
  });
  process.chdir(root);
  ({ getResearchEvidence } = await import('./researchEvidence.ts'));
}
after(() => {
  process.chdir(cwd);
  rmSync(root, { recursive: true, force: true });
});

/** Runs fn as a production (or development) build would. */
function asBuild(env, fn) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = env;
  try {
    return fn();
  } finally {
    process.env.NODE_ENV = previous;
  }
}

test('About quotes the takeaways it names, by label and in its order, whatever their position', { skip }, () => {
  const evidence = asBuild('production', () => getResearchEvidence());
  assert.deepEqual(evidence, {
    href: `/research/${SLUG}`,
    title: 'How the feed is measured',
    date: '2026-10-30',
    dateLabel: '30 Oct 2026',
    takeaways: [
      { label: 'Public feed:', text: 'the public feed lags by 0.9 s at the median.' },
      { label: 'Own node, quiet market:', text: 'first on 65% of trades.' },
      { label: 'Own node, when the US stock market opens:', text: 'under <1 ms at the median & less at p95.' },
    ],
  });
});

test('a production build fails when a quoted takeaway or the article itself is gone', { skip }, () => {
  // A label renamed upstream: the quote would change meaning, so the build stops.
  writeFileSync(readme, ARTICLE.replace('**Public feed:**', '**Public data feed:**'));
  assert.throws(() => asBuild('production', () => getResearchEvidence()), /no key takeaway labelled "Public feed"/);

  // The article renamed or dropped upstream: no link to a 404.
  rmSync(readme);
  assert.throws(() => asBuild('production', () => getResearchEvidence()), new RegExp(SLUG));

  // In development (articles not synced yet) the page keeps the citation alone.
  const warn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    assert.deepEqual(asBuild('development', () => getResearchEvidence()), {
      href: `/research/${SLUG}`,
      title: 'How Hyperliquid data feed latency is measured',
      date: '2026-10-30',
      dateLabel: '30 Oct 2026',
      takeaways: [],
    });
    assert.match(warnings[0], /not in content\/research/);
  } finally {
    console.warn = warn;
    writeFileSync(readme, ARTICLE);
  }
});
