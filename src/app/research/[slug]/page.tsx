import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArticle, getArticles } from '@/lib/research';

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
  if (!article) return { title: 'Research' };

  const url = `https://1six.tech/research/${article.slug}`;
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

export default async function ResearchArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  return (
    <article>
      <p className="research-meta text-[13px] tracking-[-0.13px]">
        <Link href="/research" className="transition-colors hover:text-[var(--color-accent)]">
          Research
        </Link>
        <span aria-hidden="true"> · </span>
        {article.number}
      </p>
      <h1 className="mt-4 text-[28px] font-medium leading-[1.2] tracking-[-0.56px] md:text-[36px] md:tracking-[-0.72px]">
        {article.title}
      </h1>
      <p className="research-meta mt-4 text-[14px] tracking-[-0.14px]">
        {article.author}
        <span aria-hidden="true"> · </span>
        <time dateTime={article.date}>{article.dateLabel}</time>
      </p>

      {article.headings.length > 0 && (
        <nav className="mt-8 border-t border-[var(--color-divider)] pt-4" aria-label="Contents">
          <p className="research-meta text-[12px] tracking-[-0.12px]">Contents</p>
          <ol className="mt-3 flex list-none flex-col gap-2 p-0">
            {article.headings.map((heading) => (
              <li key={heading.id}>
                <a
                  href={`#${heading.id}`}
                  className="text-[15px] leading-[1.4] tracking-[-0.15px] underline decoration-[color-mix(in_srgb,var(--color-text)_35%,transparent)] underline-offset-[3px] transition-colors hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)]"
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div
        className="research-body mt-2"
        dangerouslySetInnerHTML={{ __html: article.html }}
      />
    </article>
  );
}
