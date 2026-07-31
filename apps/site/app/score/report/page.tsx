import type { Metadata } from 'next';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { pageMeta } from '../../lib/site-meta';
import { ScoreReport } from './score-report';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'Score Report',
  description:
    'Full verification report — 40 deterministic checks against the Designesy design system contract, v0.4.0.',
  path: '/score/report',
});

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
