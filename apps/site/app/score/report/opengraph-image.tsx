import { ImageResponse } from 'next/og';
import { renderOgCard } from '../../lib/og-card';
import { scoreUrl, normalizeInputUrl, isValidUrl } from '../../api/score/route';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Score Report — Full verification report';

export default async function OpenGraphImage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const params = await searchParams;
  const rawUrl = typeof params?.url === 'string' ? params.url : '';

  // Default card when no URL — mirrors the static card
  if (!rawUrl) {
    return renderOgCard({
      eyebrow: 'Score Report',
      title: 'Full verification report',
      lede: '40 deterministic checks against the Designesy design system contract.',
      path: 'designesy.org/score/report',
    });
  }

  const url = normalizeInputUrl(rawUrl);
  if (!url || !isValidUrl(url)) {
    return renderOgCard({
      eyebrow: 'Score Report',
      title: 'Invalid URL',
      lede: 'Enter a valid domain like designesy.org or nike.com.',
      path: 'designesy.org/score/report',
    });
  }

  try {
    const result = await scoreUrl(url);
    return renderOgCard({
      eyebrow: 'Score Report',
      title: `Grade ${result.grade} — ${result.score}%`,
      lede: `${result.pass} passed · ${result.fail} failed · ${result.warn} warnings — full verification report`,
      path: 'designesy.org/score/report',
      badge: result.grade,
    });
  } catch {
    return renderOgCard({
      eyebrow: 'Score Report',
      title: 'Score pending',
      lede: `Could not reach ${url.replace(/^https?:\/\//, '').replace(/^www\./, '').slice(0, 40)}. Try again at designesy.org/score.`,
      path: 'designesy.org/score/report',
    });
  }
}