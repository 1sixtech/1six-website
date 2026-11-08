'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { WRITING_CATEGORIES, selectWritingCategory } from '@/lib/writingCatalog';
import { ArticleList, type ArticleSummary } from './ArticleList';

interface WritingIndexProps {
  articles: ArticleSummary[];
}

export function WritingIndex({ articles }: WritingIndexProps) {
  const searchParams = useSearchParams();
  const selected = selectWritingCategory(searchParams.get('category'));
  const shown = selected === 'all' ? articles : articles.filter((article) => article.category === selected);
  const filters = [{ id: 'all', label: 'All' }, ...WRITING_CATEGORIES];

  return (
    <>
      <nav className="writing-filters" aria-label="Filter writing by category">
        {filters.map((filter) => {
          const count = filter.id === 'all' ? articles.length : articles.filter((article) => article.category === filter.id).length;
          return (
            <Link
              key={filter.id}
              href={filter.id === 'all' ? '/writing' : `/writing?category=${filter.id}`}
              scroll={false}
              aria-current={selected === filter.id ? 'page' : undefined}
            >
              {filter.label}<span className="writing-filter-count" aria-label={`${count} ${count === 1 ? 'article' : 'articles'}`}>{count}</span>
            </Link>
          );
        })}
      </nav>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {shown.length} {shown.length === 1 ? 'article' : 'articles'} shown.
      </div>
      {shown.length > 0 ? <ArticleList articles={shown} /> : (
        <div className="writing-empty">
          <p>{WRITING_CATEGORIES.find((category) => category.id === selected)?.empty}</p>
          <Link href="/writing" scroll={false} className="writing-read-more">Browse all writing <span aria-hidden="true">↗</span></Link>
        </div>
      )}
    </>
  );
}
