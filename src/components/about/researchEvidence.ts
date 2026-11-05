import { getArticle } from '@/lib/research';

/**
 * Server-only: the research article the About page cites as evidence of
 * method. Title, date, and the quoted key takeaways are read from the
 * synced article itself, so the quote stays verbatim if the article moves.
 * The author is left out on purpose: About presents the team collectively,
 * without individual names (PRODUCT.md); the byline stays on the article.
 */

export interface Takeaway {
  /** Bold lead-in as published, including its colon. */
  label: string;
  text: string;
}

export interface ResearchEvidence {
  href: string;
  title: string;
  date: string;
  dateLabel: string;
  takeaways: Takeaway[];
}

const SLUG = '001-hyperliquid-data-feed-latency';

/**
 * The takeaways About quotes, by their published bold labels (without the
 * colon): the baseline plus both own-node results; the vendor comparison
 * stays in the article. Chosen by label, not position, so a takeaway added
 * or reordered upstream cannot slip into the quote.
 */
export const QUOTED_LABELS = [
  'Public feed',
  'Own node, quiet market',
  'Own node, when the US stock market opens',
];

const FALLBACK = {
  title: 'How Hyperliquid data feed latency is measured',
  date: '2026-10-30',
  dateLabel: '30 Oct 2026',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function plainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTakeaways(html: string): Takeaway[] {
  const list = html.match(/<ul class="takeaways">([\s\S]*?)<\/ul>/);
  if (!list) return [];

  return Array.from(list[1].matchAll(/<li>([\s\S]*?)<\/li>/g))
    .map(([, item]) => {
      const lead = item.match(/^\s*<strong>([\s\S]*?)<\/strong>([\s\S]*)$/);
      return lead
        ? { label: plainText(lead[1]), text: plainText(lead[2]) }
        : { label: '', text: plainText(item) };
    })
    .filter((takeaway) => takeaway.text.length > 0);
}

const labelKey = (label: string) => label.replace(/:\s*$/, '').trim().toLowerCase();

/**
 * The article is synced at build time from another repository, so it can
 * change without a change here. In a production build a missing article or
 * a missing quoted takeaway fails the build (Vercel keeps the last good
 * deployment) instead of shipping a link to a 404 or a quote that changed
 * meaning. In development, where the articles may not be synced yet, the
 * page falls back to the citation alone.
 */
function evidenceMissing(reason: string): void {
  const message = `About cites research article "${SLUG}": ${reason}`;
  if (process.env.NODE_ENV === 'production') throw new Error(message);
  console.warn(message);
}

export function getResearchEvidence(): ResearchEvidence {
  const href = `/research/${SLUG}`;

  let article: ReturnType<typeof getArticle> = null;
  try {
    article = getArticle(SLUG);
  } catch {
    article = null;
  }

  if (!article) {
    evidenceMissing('the article is not in content/research (run scripts/sync-research.mjs).');
    return { href, ...FALLBACK, takeaways: [] };
  }

  const byLabel = new Map(parseTakeaways(article.html).map((t) => [labelKey(t.label), t]));
  const takeaways = QUOTED_LABELS.map((label) => byLabel.get(labelKey(label)));
  const missing = QUOTED_LABELS.filter((_, i) => !takeaways[i]);
  if (missing.length > 0) {
    evidenceMissing(`no key takeaway labelled ${missing.map((l) => `"${l}"`).join(', ')}.`);
  }

  return {
    href,
    title: article.title,
    date: article.date,
    dateLabel: article.dateLabel,
    takeaways: missing.length > 0 ? [] : (takeaways as Takeaway[]),
  };
}
