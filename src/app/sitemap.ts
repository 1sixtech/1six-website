import type { MetadataRoute } from 'next';
import { getArticles } from '@/lib/research';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://1six.tech';
  const articles = getArticles();
  const latestArticle = articles.reduce((latest, article) =>
    article.date > latest.date ? article : latest,
  );

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/research`,
      lastModified: new Date(latestArticle.date),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...articles.map((article) => ({
      url: `${baseUrl}/research/${article.slug}`,
      lastModified: new Date(article.date),
      changeFrequency: 'yearly' as const,
      priority: 0.7,
    })),
  ];
}
