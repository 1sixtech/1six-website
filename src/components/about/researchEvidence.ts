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

/** The baseline plus both own-node results; the vendor comparison stays in the article. */
const QUOTED_TAKEAWAYS = 3;

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

export function getResearchEvidence(): ResearchEvidence {
  const href = `/research/${SLUG}`;

  let article: ReturnType<typeof getArticle> = null;
  try {
    article = getArticle(SLUG);
  } catch {
    article = null;
  }

  if (!article) {
    return { href, ...FALLBACK, takeaways: [] };
  }

  return {
    href,
    title: article.title,
    date: article.date,
    dateLabel: article.dateLabel,
    takeaways: parseTakeaways(article.html).slice(0, QUOTED_TAKEAWAYS),
  };
}
