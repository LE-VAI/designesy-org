import type { Metadata } from 'next';
import '../instrument.css';
import '../engine.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { MonitorForm } from './monitor-form';
import { registry } from '../lib/engine/registry';
import { EngineHead, EngineMethod, EngineNext } from '../lib/engine/engine-page';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'Drift monitor',
  description:
    'Monitor any URL for design-drift over time: re-scores on a cadence, stores snapshots, computes deltas against the baseline, and emails you when drift is detected. 10 governance checks plus the 12 drift checks on every run.',
  path: '/monitor',

  machineSibling: '/contracts/monitor.json',
  ogTitle: 'Drift monitor · Designesy',
  ogDescription:
    'Continuous design-drift monitoring with email alerts: score deltas, trend slopes, new violations, token mutations.',
  twitterDescription: 'Designesy drift monitor · designesy.org/monitor',
});

export default async function MonitorPage({ searchParams }: { searchParams?: Promise<{ url?: string }> }) {
  const params = await searchParams;
  const initialUrl = typeof params?.url === 'string' ? params.url : '';
  const reg = registry('monitor');
  const drift = registry('drift');

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg" data-pagefind-meta="priority:high">
        <EngineHead
          route="/monitor"
          name="Drift monitor"
          thesis="Watch a URL for drift over time. Each run is kept as a snapshot in your browser and compared with your first run and your last, so a regression shows up on the run it lands."
          facts={[`${reg.count} governance checks`, `${drift.count} drift checks a run`, 'history in your browser']}
          contract={{ href: '/contracts/monitor', label: `contract ${reg.version} ${reg.status}` }}
        />

        <MonitorForm
          initialUrl={initialUrl}
          registry={{ checks: reg.checks, groups: reg.groups, machine: reg.machine }}
          drift={{ checks: drift.checks, groups: drift.groups, machine: drift.machine }}
        />

        <EngineMethod
          steps={[
            { title: 'Run the drift radar', text: 'The same 12 checks as the drift radar, on the live page.' },
            { title: 'Load your history', text: 'Earlier snapshots of this URL, read from this browser and sent with the run.' },
            { title: 'Compare', text: 'Against the first run and the last: score, three-run trend, new failures, the token set and the contract version.' },
            { title: 'Alert', text: 'A drop past the threshold raises an alert, mailed to the address you left, at most once an hour.' },
          ]}
          formula={
            <>
              <span><b>governance</b> = (pass + warn × 0.5) ÷ 10 × 100</span>
              <span>The grade measures the watch; the drift checks measure the site.</span>
              <span>Snapshots stay in this browser: 50 runs per URL.</span>
            </>
          }
        />

        <EngineNext
          items={[
            { title: 'Read one run in full', desc: 'The drift radar shows the same 12 checks with every finding, for a single scan.', route: '/drift', carry: true },
            { title: 'Diff two moments or two sites', desc: 'Compare lines two live token sets up: added, removed, renamed and changed.', route: '/compare', carry: true, param: 'a' },
            { title: 'Hold the line with a build contract', desc: 'Guardrails writes the tokens and the lint rules that keep new code on them.', route: '/guardrails', carry: true },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
