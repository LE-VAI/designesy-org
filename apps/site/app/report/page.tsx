import type { Metadata } from 'next';
import '../instrument.css';
import '../engine.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta, SITE_BASE } from '../lib/site-meta';
import { ReportForm } from './report-form';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';
import { registry } from '../lib/engine/registry';
import { EngineHead, EngineMethod, EngineNext } from '../lib/engine/engine-page';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// When ?url= is present, explicitly point social images to the dynamic OG route
// with the url param so the grade card renders in link previews.
export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ url?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const rawUrl = typeof params?.url === 'string' ? params.url : '';
  const scoredUrl = rawUrl.trim();

  const base = pageMeta({
    title: 'Design-intelligence report',
    description:
      'Generate a unified design-intelligence report for any URL: score, drift, and readiness synthesized into one composite grade. One input, one output, one grade. The synthesis capstone.',
    path: '/report',

    machineSibling: '/contracts/report.json',
    ogTitle: 'Design-intelligence report · Designesy',
    ogDescription:
      'One URL, three engines, one composite grade. Score + drift + readiness in a single report.',
    twitterDescription: 'Designesy report · designesy.org/report',
  });

  if (scoredUrl) {
    const ogImageUrl = `${SITE_BASE}/report/opengraph-image?url=${encodeURIComponent(scoredUrl)}`;
    const twImageUrl = `${SITE_BASE}/report/twitter-image?url=${encodeURIComponent(scoredUrl)}`;
    return {
      ...base,
      openGraph: {
        ...base.openGraph,
        images: [{ url: ogImageUrl, width: 1200, height: 630, alt: 'Designesy Report: One URL, three engines' }],
      },
      twitter: {
        ...base.twitter,
        images: [{ url: twImageUrl, width: 1200, height: 630, alt: 'Designesy Report: One URL, three engines' }],
      },
    };
  }

  return base;
}

export default async function ReportPage({ searchParams }: { searchParams?: Promise<{ url?: string }> }) {
  const params = await searchParams;
  const initialUrl = typeof params?.url === 'string' ? params.url : '';
  const reg = registry('report');
  const view = (k: 'score' | 'drift' | 'readiness') => {
    const r = registry(k);
    return { checks: r.checks, groups: r.groups, machine: r.machine };
  };

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg" data-pagefind-meta="priority:high">
        <EngineHead
          route="/report"
          name="Report"
          thesis={`One URL through three engines, weighted into one grade you can cite: the ${ENGINE_CHECK_COUNT}-check contract score 50%, drift 30%, AI readiness 20%.`}
          facts={['3 engines', `${ENGINE_CHECK_COUNT + 12 + 10} checks`, `${reg.count} synthesis checks`]}
          contract={{ href: '/contracts/report', label: `contract ${reg.version} ${reg.status}` }}
        />

        <ReportForm
          initialUrl={initialUrl}
          registry={{ checks: reg.checks, groups: reg.groups, machine: reg.machine }}
          engines={{ score: view('score'), drift: view('drift'), readiness: view('readiness') }}
        />

        <EngineMethod
          steps={[
            { title: 'Fire three engines', text: 'The contract score, the drift radar and AI readiness, in parallel, each fetching the page itself.' },
            { title: 'Weigh them', text: 'Contract score counts 50%, drift 30%, readiness 20%. If one returns nothing, the others are re-weighted.' },
            { title: 'Check the report', text: 'Eight synthesis checks confirm every engine ran and that no engine sits more than 30 points from the composite.' },
            { title: 'Grade', text: 'The weighted sum, rounded, takes the same letter scale as every engine. A is 90 and up.' },
          ]}
          formula={
            <>
              <span><b>composite</b> = round(score × 0.5 + drift × 0.3 + readiness × 0.2)</span>
              <span><b>A</b> ≥ 90 · <b>B</b> ≥ 80 · <b>C</b> ≥ 70 · <b>D</b> ≥ 60 · <b>F</b> below</span>
              <span>The synthesis checks grade the report itself, apart from the composite.</span>
            </>
          }
        />

        <EngineNext
          items={[
            { title: 'Open the full audit', desc: 'The score page puts all four engines on one dashboard, with every finding filterable.', route: '/score', carry: true },
            { title: 'Watch the drift share', desc: 'Monitor re-runs the drift radar and compares each run with your first.', route: '/monitor', carry: true },
            { title: 'Fix the readiness share', desc: 'Guardrails writes the DESIGN.md and DTCG tokens an agent looks for.', route: '/guardrails', carry: true },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
