import type { Metadata } from 'next';
import '../instrument.css';
import '../engine.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';
import { registry } from '../lib/engine/registry';
import { EngineHead, EngineMethod, EngineNext, GradeLine } from '../lib/engine/engine-page';
import { DriftForm } from './drift-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'Drift radar',
  description:
    'Score any URL for AI-generated UI drift: 12 checks detect token fabrication, value variance, and off-contract patterns. The four documented 2026 drift failure modes, scored deterministically from compiled CSS.',
  path: '/drift',

  machineSibling: '/contracts/drift.json',
  ogTitle: 'Drift radar · Designesy',
  ogDescription:
    'Detect AI-generated UI drift: 12 deterministic checks against compiled CSS.',
  twitterDescription: 'Designesy drift radar · designesy.org/drift',
});

export default async function DriftPage({ searchParams }: { searchParams?: Promise<{ url?: string }> }) {
  const params = await searchParams;
  const initialUrl = typeof params?.url === 'string' ? params.url : '';
  const reg = registry('drift');

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg" data-pagefind-meta="priority:high">
        <EngineHead
          route="/drift"
          name="Drift radar"
          thesis="Catch a UI drifting off its own system: token names that resolve to nothing, and values that stop clustering on a scale. Built for interfaces an AI model wrote in one session and edited in the next."
          facts={[`${reg.count} checks`, 'compiled CSS', 'static analysis']}
          contract={{ href: '/contracts/drift', label: `contract ${reg.version} ${reg.status}` }}
        />

        <DriftForm initialUrl={initialUrl} registry={{ checks: reg.checks, groups: reg.groups, machine: reg.machine }} />

        <EngineMethod
          steps={[
            { title: 'Fetch the page', text: 'The HTML at the URL, then every stylesheet it links, plus inline style blocks.' },
            { title: 'Read the system', text: 'Every custom property declared, every var() reference, and each value set for color, spacing, radius, shadow and timing.' },
            { title: 'Run 12 checks', text: 'Four ask whether the tokens resolve. Eight ask whether the values cluster on a few steps.' },
            { title: 'Grade', text: 'Pass counts 1, warn 0.5, fail 0. Skipped checks leave the count. A is 90 and up.' },
          ]}
          formula={
            <>
              <span><b>score</b> = (pass + warn × 0.5) ÷ checks scored × 100</span>
              <GradeLine />
              <span>Static analysis of compiled CSS: no browser, no login.</span>
            </>
          }
        />

        <EngineNext
          items={[
            { title: 'Watch it over time', desc: 'Monitor runs these 12 checks again each time and compares the run with your first and your last.', route: '/monitor', carry: true },
            { title: 'Freeze it for your agents', desc: 'Guardrails turns the same tokens into a build contract and the lint rules that hold it.', route: '/guardrails', carry: true },
            { title: 'Run the full audit', desc: `The ${ENGINE_CHECK_COUNT}-check contract score, drift and AI readiness on one URL, with one combined score.`, route: '/score', carry: true },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
