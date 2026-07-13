import type { MetadataRoute } from 'next';

const BASE = 'https://www.designesy.org';
const NOW = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE,
      lastModified: NOW,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE}/open`,
      lastModified: NOW,
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    {
      url: `${BASE}/open.json`,
      lastModified: NOW,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE}/llms.txt`,
      lastModified: NOW,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${BASE}/llms-full.txt`,
      lastModified: NOW,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE}/.well-known/agent.json`,
      lastModified: NOW,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE}/open/handoff`,
      lastModified: NOW,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE}/docs`,
      lastModified: NOW,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE}/privacy`,
      lastModified: NOW,
      changeFrequency: 'monthly',
      priority: 0.55,
    },
    {
      url: `${BASE}/labs`,
      lastModified: NOW,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE}/labs/poise`,
      lastModified: NOW,
      changeFrequency: 'monthly',
      priority: 0.75,
    },
    {
      url: `${BASE}/labs/takt`,
      lastModified: NOW,
      changeFrequency: 'monthly',
      priority: 0.75,
    },
    {
      url: `${BASE}/kits`,
      lastModified: NOW,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${BASE}/kits/design-review`,
      lastModified: NOW,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${BASE}/kits/design-review.json`,
      lastModified: NOW,
      changeFrequency: 'monthly',
      priority: 0.65,
    },
    {
      url: `${BASE}/review`,
      lastModified: NOW,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE}/review/poise`,
      lastModified: NOW,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE}/review/poise/keyboard`,
      lastModified: NOW,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE}/review/keyboard`,
      lastModified: NOW,
      changeFrequency: 'monthly',
      priority: 0.75,
    },
    {
      url: `${BASE}/review/designesy-org`,
      lastModified: NOW,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE}/contracts`,
      lastModified: NOW,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE}/contracts/design-system`,
      lastModified: NOW,
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${BASE}/contracts/design-system.json`,
      lastModified: NOW,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
}
