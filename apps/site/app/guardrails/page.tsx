import type { Metadata } from 'next';
import '../instrument.css';
import '../engine.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { registry } from '../lib/engine/registry';
import { EngineHead, EngineMethod, EngineNext } from '../lib/engine/engine-page';
import { GuardrailsForm } from './guardrails-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'Guardrails',
  description:
    'Generate a frozen build contract for AI coding agents from any design system — DTCG tokens, Stylelint config, AGENTS.md rules, component contract, anti-patterns, and DESIGN.md (Google open spec). The product layer.',
  path: '/guardrails',

  machineSibling: '/contracts/guardrails.json',
  ogTitle: 'Guardrails · Designesy',
  ogDescription:
    'Turn your design system into the file AI agents read and the lint that enforces it — now with DESIGN.md emission.',
  twitterDescription: 'Designesy guardrails — designesy.org/guardrails',
});

export default async function GuardrailsPage({ searchParams }: { searchParams?: Promise<{ url?: string }> }) {
  const params = await searchParams;
  const initialUrl = typeof params?.url === 'string' ? params.url : '';
  const reg = registry('guardrails');

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg" data-pagefind-meta="priority:high">
        <EngineHead
          route="/guardrails"
          name="Guardrails"
          thesis="Turn a live site's tokens into a build contract an AI coding agent reads before it writes UI: the tokens, the lint rules that hold them, and the rules for using them."
          facts={[`${reg.count} files`, 'compiled CSS', 'DTCG and DESIGN.md']}
          contract={{ href: '/contracts/guardrails', label: `contract ${reg.version} ${reg.status}` }}
        />

        <GuardrailsForm initialUrl={initialUrl} registry={{ checks: reg.checks, groups: reg.groups, machine: reg.machine }} />

        <EngineMethod
          steps={[
            { title: 'Fetch the page', text: 'The HTML at the URL and every stylesheet it links.' },
            { title: 'Extract the tokens', text: 'Every custom property the site declares, converted to the W3C DTCG format.' },
            { title: 'Write six files', text: 'Tokens, lint rules, agent rules, a component contract, anti-patterns and a DESIGN.md.' },
            { title: 'Grade the bundle', text: 'Each file written counts 1, over six. The grade measures the bundle, and the contract score measures the design.' },
          ]}
          formula={
            <>
              <span><b>score</b> = files written ÷ 6 × 100</span>
              <span><b>A</b> ≥ 90 · <b>B</b> ≥ 80 · <b>C</b> ≥ 70 · <b>D</b> ≥ 60 · <b>F</b> below</span>
              <span>Static analysis and generation: no browser, no login.</span>
            </>
          }
        />

        <EngineNext
          items={[
            { title: 'See what the contract guards against', desc: 'The drift radar scores the same tokens for invented names and loose scales.', route: '/drift', carry: true },
            { title: 'Watch it after you ship', desc: 'Monitor re-runs the drift checks and flags tokens added, removed or renamed since your first run.', route: '/monitor', carry: true },
            { title: 'Diff it against another system', desc: 'Compare lines two live token sets up: added, removed, renamed and changed.', route: '/compare', carry: true, param: 'a' },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
