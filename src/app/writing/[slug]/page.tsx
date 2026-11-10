import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FigureViewer } from '@/components/writing/FigureViewer';
import { getArticle, getArticles } from '@/lib/writing';
import { categoryLabel } from '@/lib/writingCatalog';

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getArticles().map((article) => ({ slug: article.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return { title: 'Writing' };

  const url = `https://1six.tech/writing/${article.slug}`;
  return {
    title: article.title,
    description: article.summary,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: `${article.title} | 1SIX`,
      description: article.summary,
      url,
      publishedTime: article.date,
      authors: [article.author],
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: article.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${article.title} | 1SIX`,
      description: article.summary,
    },
  };
}

export default async function WritingArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  return (
    <article>
      <p className="writing-meta text-[13px] tracking-[0.01em]">
        <Link href="/writing" className="transition-colors hover:text-[var(--color-accent)] active:text-[var(--color-accent)]">
          Writing
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href={`/writing?category=${article.category}`} className="writing-category-link">
          {categoryLabel(article.category)}
        </Link>
      </p>
      <h1 className="mt-4 text-[32px] font-medium leading-[1.12] tracking-[-0.025em] text-balance md:text-[40px]">
        {article.title}
      </h1>
      <p className="writing-meta mt-4 text-[13px] tracking-[0.01em]">
        {article.authorSlug ? (
          <Link href={`/writing/authors/${article.authorSlug}`} className="writing-author-link">
            {article.author}
          </Link>
        ) : article.author}
        <span aria-hidden="true"> · </span>
        <time dateTime={article.date}>{article.dateLabel}</time>
      </p>

      {article.headings.length > 0 && (
        <nav
          className="mt-8 border-y border-[var(--color-divider)] pt-4 pb-5"
          aria-label="Contents"
        >
          <p className="writing-meta text-[13px] tracking-[0.01em]">Contents</p>
          <ol className="mt-3 flex list-none flex-col gap-2 p-0">
            {article.headings.map((heading) => (
              <li key={heading.id}>
                <a
                  href={`#${heading.id}`}
                  className="text-[15px] leading-[1.4] underline decoration-[color-mix(in_srgb,var(--color-text)_35%,transparent)] underline-offset-[3px] transition-colors hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)] active:text-[var(--color-accent)] active:decoration-[var(--color-accent)]"
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div
        className="writing-body mt-8"
        dangerouslySetInnerHTML={{ __html: article.html }}
      />
      <FigureViewer />
    </article>
  );
}
