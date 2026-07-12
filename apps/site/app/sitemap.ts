import type { MetadataRoute } from 'next';

const BASE = 'https://designesy.org';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-07-11');

  return [
    {
      url: BASE,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE}/docs`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE}/labs`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE}/review`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE}/contracts`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
  ];
}
