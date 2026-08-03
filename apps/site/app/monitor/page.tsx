import type { Metadata } from 'next';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { MonitorForm } from './monitor-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'Drift monitor',
  description:
    'Monitor any URL for design-drift over time — re-scores on a cadence, stores snapshots, computes deltas against the baseline, and emails you when drift is detected. 10 governance checks plus the 12 drift checks on every run.',
  path: '/monitor',
  ogTitle: 'Drift monitor · Designesy',
  ogDescription:
    'Continuous design-drift monitoring with email alerts — score deltas, trend slopes, new violations, token mutations.',
  twitterDescription: 'Designesy drift monitor — designesy.org/monitor',
});

export default async function MonitorPage({ searchParams }: { searchParams?: Promise<{ url?: string }> }) {
  const params = await searchParams;
  const initialUrl = typeof params?.url === 'string' ? params.url : '';

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Verification</p>
          <h1 className="surface-title" data-scramble>Drift monitor</h1>
          <p className="surface-lede">
            Monitor any URL for design-drift over time — re-scores on a
            cadence, stores snapshots, computes deltas against the baseline,
            and surfaces regressions before they compound.
          </p>
          <p className="surface-note">
            The continuous-governance layer over the drift radar. Every prior
            designesy surface is a snapshot — this one turns them into a watched
            series. 10 governance checks plus the 12 drift checks on every run.
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <MonitorForm initialUrl={initialUrl} />
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">What it does</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            The monitor engine fetches the target URL, runs the same 12 drift
            checks as the drift radar (d01-d12), then computes 10 monitor checks
            (m01-m10) by comparing the current run against your stored snapshot
            history. Snapshots are saved in your browser localStorage — your
            data never leaves your device.
          </p>
          <p className="surface-note">
            Governance scoring: 10 checks. PASS=1, WARN=0.5, FAIL=0. Score =
            (points/10) × 100. The monitor score reflects governance health
            (is the watch working, is the site stable), not design quality —
            design quality is the /score surface.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}