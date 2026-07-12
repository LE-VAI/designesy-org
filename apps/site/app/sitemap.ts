import type { MetadataRoute } from 'next';

const BASE = 'https://www.designesy.org';

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
      url: `${BASE}/labs/poise`,
      lastModified: new Date('2026-07-12'),
      changeFrequency: 'monthly',
      priority: 0.75,
    },
    {
      url: `${BASE}/kits`,
      lastModified: new Date('2026-07-12'),
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${BASE}/kits/design-review`,
      lastModified: new Date('2026-07-12'),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${BASE}/review`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE}/review/designesy-org`,
      lastModified: new Date('2026-07-12'),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE}/contracts`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE}/contracts/design-system`,
      lastModified: new Date('2026-07-12'),
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${BASE}/contracts/design-system.json`,
      lastModified: new Date('2026-07-12'),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
}
