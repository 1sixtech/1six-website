import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ArticleList } from '@/components/writing/ArticleList';
import { WritingIndex } from '@/components/writing/WritingIndex';
import { getArticles } from '@/lib/writing';

const description = 'Research, perspectives, and news from 1six.';

export const metadata: Metadata = {
  description,
  alternates: { canonical: 'https://1six.tech/writing' },
  openGraph: {
    title: 'Writing | 1SIX',
    description,
    url: 'https://1six.tech/writing',
  },
  twitter: { card: 'summary_large_image', title: 'Writing | 1SIX', description },
};

export default function WritingPage() {
  const articles = getArticles().map(({ slug, number, title, author, authorSlug, category, date, dateLabel, summary }) => (
    { slug, number, title, author, authorSlug, category, date, dateLabel, summary }
  ));

  return (
    <>
      <h1 className="writing-page-title">Writing</h1>
      <p className="writing-page-description">{description}</p>
      <Suspense fallback={<ArticleList articles={articles} />}>
        <WritingIndex articles={articles} />
      </Suspense>
    </>
  );
}
