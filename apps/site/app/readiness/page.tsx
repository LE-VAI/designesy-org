import type { Metadata } from 'next';
import '../instrument.css';
import '../engine.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';
import { registry } from '../lib/engine/registry';
import { EngineHead, EngineMethod, EngineNext, GradeLine } from '../lib/engine/engine-page';
import { ReadinessForm } from './readiness-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'AI Readiness score',
  description:
    'Score any URL for design-system AI readiness: 10 checks probe for machine-readable tokens, llms.txt, agent.json, MCP endpoint, DESIGN.md, sitemap, robots.txt, and social meta. The 6th maturity axis, automated.',
  path: '/readiness',

  machineSibling: '/contracts/readiness.json',
  ogTitle: 'AI Readiness score · Designesy',
  ogDescription:
    'Is your design system the default context AI tools build from? 10 automated checks.',
  twitterDescription: 'Designesy AI readiness · designesy.org/readiness',
});

export default async function ReadinessPage({ searchParams }: { searchParams?: Promise<{ url?: string }> }) {
  const params = await searchParams;
  const initialUrl = typeof params?.url === 'string' ? params.url : '';
  const reg = registry('readiness');

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg" data-pagefind-meta="priority:high">
        <EngineHead
          route="/readiness"
          name="AI readiness"
          thesis="What an AI agent can read about your design system before it builds anything: token files, plain-text briefs, discovery documents and a tool endpoint, probed at the site's origin."
          facts={[`${reg.count} checks`, '9 locations', 'HTTP probes']}
          contract={{ href: '/contracts/readiness', label: `contract ${reg.version} ${reg.status}` }}
        />

        <ReadinessForm initialUrl={initialUrl} registry={{ checks: reg.checks, groups: reg.groups, machine: reg.machine }} />

        <EngineMethod
          steps={[
            { title: 'Find the origin', text: 'Every probe runs against the site root, whatever page the URL names.' },
            { title: 'Probe 9 locations', text: 'Common paths for each file, a tools/list call to the MCP endpoint, and the page head for share tags.' },
            { title: 'Run 10 checks', text: 'Found passes. Found in a shape agents read poorly warns. Missing fails.' },
            { title: 'Grade', text: 'Pass counts 1, warn 0.5, fail 0, over all 10 checks. A is 90 and up.' },
          ]}
          formula={
            <>
              <span><b>score</b> = (pass + warn × 0.5) ÷ 10 × 100</span>
              <GradeLine />
              <span>HTTP probes from our server: no browser, no login.</span>
            </>
          }
        />

        <EngineNext
          items={[
            { title: 'Generate what is missing', desc: "Guardrails writes a DESIGN.md and DTCG tokens from the site's own CSS.", route: '/guardrails', carry: true },
            { title: 'See a complete set', desc: 'The machine files this site publishes about itself, each one linked.', route: '/open' },
            { title: 'Run the full audit', desc: `The ${ENGINE_CHECK_COUNT}-check contract score, drift and AI readiness on one URL, with one composite grade.`, route: '/score', carry: true },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
