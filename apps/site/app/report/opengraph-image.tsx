import { ImageResponse } from 'next/og';
import { renderOgCard } from '../lib/og-card';
import { scoreUrl, normalizeInputUrl, isValidUrl } from '../api/score/route';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Report — One URL, three engines';

export default async function OpenGraphImage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const params = await searchParams;
  const rawUrl = typeof params?.url === 'string' ? params.url : '';

  if (!rawUrl) {
    return renderOgCard({
      eyebrow: 'Report',
      title: 'One URL, three engines',
      lede: 'Score + drift + readiness in a single composite report. One grade for design intelligence.',
      path: 'designesy.org/report',
    });
  }

  const url = normalizeInputUrl(rawUrl);
  if (!url || !isValidUrl(url)) {
    return renderOgCard({
      eyebrow: 'Report',
      title: 'Invalid URL',
      lede: 'Enter a valid domain like designesy.org or nike.com.',
      path: 'designesy.org/report',
    });
  }

  try {
    const result = await scoreUrl(url);
    return renderOgCard({
      eyebrow: 'Designesy Report',
      title: `Grade ${result.grade} — ${result.score}%`,
      lede: `${result.pass} passed · ${result.fail} failed · composite design-intelligence report`,
      path: 'designesy.org/report',
      badge: result.grade,
    });
  } catch {
    return renderOgCard({
      eyebrow: 'Report',
      title: 'Report pending',
      lede: `Could not reach ${url.replace(/^https?:\/\//, '').replace(/^www\./, '').slice(0, 40)}. Try again at designesy.org/report.`,
      path: 'designesy.org/report',
    });
  }
}