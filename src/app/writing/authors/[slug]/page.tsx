import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleList } from '@/components/writing/ArticleList';
import { getArticles } from '@/lib/writing';
import { getWriter, WRITERS } from '@/lib/writingCatalog';

interface WriterPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return WRITERS.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: WriterPageProps): Promise<Metadata> {
  const { slug } = await params;
  const writer = getWriter(slug);
  if (!writer) return { title: 'Writer not found' };
  const url = `https://1six.tech/writing/authors/${writer.slug}`;
  const credentials = `${writer.credentials.join('. ')}.`;
  const socialDescription = writer.bio || credentials;
  return {
    title: `${writer.name} — Writing`,
    description: writer.bio ? `${writer.bio} ${credentials}` : credentials,
    alternates: { canonical: url },
    openGraph: { title: `${writer.name} | 1SIX`, description: socialDescription, url, type: 'profile' },
    twitter: { card: 'summary_large_image', title: `${writer.name} | 1SIX`, description: socialDescription },
  };
}

export default async function WriterPage({ params }: WriterPageProps) {
  const { slug } = await params;
  const writer = getWriter(slug);
  if (!writer) notFound();
  const articles = getArticles().filter((article) => article.authorSlug === writer.slug);

  return (
    <>
      <Link href="/writing" className="writing-back">← All writing</Link>
      <header className="writing-profile">
        <p className="writing-entry__category">Writer</p>
        <h1 className="writing-page-title">{writer.name}</h1>
        {writer.bio ? <p className="writing-profile__bio">{writer.bio}</p> : null}
        <ul className="writing-profile__credentials">
          {writer.credentials.map((credential) => <li key={credential}>{credential}</li>)}
        </ul>
      </header>
      <section aria-labelledby="writer-articles-title">
        <h2 id="writer-articles-title" className="writing-profile__heading">Writing by {writer.name}</h2>
        {articles.length > 0 ? <ArticleList articles={articles} /> : <p className="writing-empty">No articles yet.</p>}
      </section>
    </>
  );
}
