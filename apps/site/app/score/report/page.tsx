import type { Metadata } from 'next';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { pageMeta, SITE_BASE } from '../../lib/site-meta';
import { ScoreReport } from './score-report';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Same pattern as /score/page.tsx — when ?url= is present, explicitly point
// social images to the dynamic OG route with the url param so the grade card
// renders in link previews instead of the default static card.
export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ url?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const rawUrl = typeof params?.url === 'string' ? params.url : '';
  const scoredUrl = rawUrl.trim();

  const base = pageMeta({
    title: 'Score Report',
    description:
      'Full verification report — 40 deterministic checks against the Designesy design system contract, v0.4.0.',
    path: '/score/report',
  });

  if (scoredUrl) {
    const ogImageUrl = `${SITE_BASE}/score/report/opengraph-image?url=${encodeURIComponent(scoredUrl)}`;
    const twImageUrl = `${SITE_BASE}/score/report/twitter-image?url=${encodeURIComponent(scoredUrl)}`;
    return {
      ...base,
      openGraph: {
        ...base.openGraph,
        images: [{ url: ogImageUrl, width: 1200, height: 630, alt: 'Designesy Score Report — Full verification report' }],
      },
      twitter: {
        ...base.twitter,
        images: [{ url: twImageUrl, width: 1200, height: 630, alt: 'Designesy Score Report — Full verification report' }],
      },
    };
  }

  return base;
}

export default async function ScoreReportPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const params = await searchParams;
  const initialUrl = params?.url || '';

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="site-shell">
        <section className="section">
          <p className="eyebrow">Verification Report</p>
          <h1
            className=" doctrine-heading"
            data-scramble
          >
            {initialUrl ? `Report: ${initialUrl}` : 'Score Report'}
          </h1>
          <p className="lede">
            40 deterministic checks against the Designesy design system
            contract v0.4.0. Each check cites the contract rule it verifies.
          </p>
        </section>
        <section className="section">
          <ScoreReport initialUrl={initialUrl} />
        </section>
      </main>
      <Footer />
    </>
  );
}
