import type { Metadata } from 'next';
import Link from 'next/link';
import { getArticles } from '@/lib/research';

const description = 'Articles on Hyperliquid infrastructure, with our own measurements.';

export const metadata: Metadata = {
  title: 'Research',
  description,
  alternates: {
    canonical: 'https://1six.tech/research',
  },
  openGraph: {
    title: 'Research | 1SIX',
    description,
    url: 'https://1six.tech/research',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '1SIX Research',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Research | 1SIX',
    description,
  },
};

export default function ResearchPage() {
  const articles = getArticles();

  return (
    <>
      <h1 className="text-[32px] font-medium leading-[1.15] tracking-[-0.64px] md:text-[40px] md:tracking-[-0.8px]">
        Research
      </h1>
      <p className="research-meta mt-4 text-[16px] leading-[1.5] md:text-[18px]">
        {description}
      </p>
      <div className="mt-12 border-b border-[var(--color-divider)]">
        {articles.map((article) => (
          <Link
            key={article.slug}
            href={`/research/${article.slug}`}
            className="group block border-t border-[var(--color-divider)] py-7"
          >
            <p className="text-[13px] tracking-[-0.13px] text-[var(--color-accent)]">
              {article.number}
            </p>
            <h2 className="mt-2 text-[22px] font-medium leading-[1.25] tracking-[-0.44px] transition-colors group-hover:text-[var(--color-accent)] md:text-[26px] md:tracking-[-0.52px]">
              {article.title}
            </h2>
            <p className="research-meta mt-2 text-[13px] tracking-[-0.13px]">
              {article.author}
              <span aria-hidden="true"> · </span>
              <time dateTime={article.date}>{article.dateLabel}</time>
            </p>
            <p className="mt-3 text-[16px] leading-[1.55] tracking-[-0.16px]">
              {article.summary}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
