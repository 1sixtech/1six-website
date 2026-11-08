import Link from 'next/link';
import type { WritingArticle } from '@/lib/writing';
import { categoryLabel } from '@/lib/writingCatalog';

export type ArticleSummary = Omit<WritingArticle, 'html' | 'headings'>;

interface ArticleListProps {
  articles: ArticleSummary[];
}

export function ArticleList({ articles }: ArticleListProps) {
  return (
    <ul className="writing-list">
      {articles.map((article) => (
        <li key={article.slug}>
          <article className="writing-entry">
            <p className="writing-entry__category">{categoryLabel(article.category)}</p>
            <h2 className="writing-entry__title">
              <Link href={`/writing/${article.slug}`}>{article.title}</Link>
            </h2>
            <p className="writing-entry__byline">
              {article.authorSlug ? (
                <Link href={`/writing/authors/${article.authorSlug}`}>{article.author}</Link>
              ) : article.author}
              <span aria-hidden="true">·</span>
              <time dateTime={article.date}>{article.dateLabel}</time>
            </p>
            <p className="writing-entry__summary">{article.summary}</p>
            <Link className="writing-read-more" href={`/writing/${article.slug}`} aria-label={`Read ${article.title}`}>
              Read more <span aria-hidden="true">↗</span>
            </Link>
          </article>
        </li>
      ))}
    </ul>
  );
}
