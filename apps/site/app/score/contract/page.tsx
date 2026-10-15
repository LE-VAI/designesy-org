import type { Metadata } from 'next';
import '../../instrument.css';
import '../../engine.css';
import './contract.css';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { pageMeta } from '../../lib/site-meta';
import { CHECKS, ENGINE_CHECK_COUNT } from '../../lib/check-definitions';
import { CONTRACT_VERSION } from '../../lib/design-system-contract';
import { EngineHead, EngineMethod, EngineNext, GradeLine } from '../../lib/engine/engine-page';
import { BASELINE_GROUPS, BASELINE_IDS, BASELINE_STATIC_MAX, baselineTitle } from '../../lib/own-contract/baseline';
import { CONTRAST_FAIL_BELOW, CONTRAST_LARGE_PASS, CONTRAST_PASS, FIDELITY_CEILINGS, FIDELITY_DEFS, FIDELITY_WEIGHTS, MIN_SCORED_CHECKS, SHARE_PASS_AT } from '../../lib/own-contract/formula';
import { MIN_COLORS } from '../../lib/own-contract/limits';
import type { RegistryCheck } from '../../lib/engine/types';
import { ContractForm, type ResultsSetup } from './contract-form';
import type { CheckDef } from './contract-findings';

// Reads searchParams (the deep link ?url=&contract=), so it renders per request.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'Your contract, verified',
  description:
    'Score a live page against your own DESIGN.md or DTCG design tokens: how closely the page follows your contract, and how it does on web standards every site is held to. Free, and nothing is stored.',
  path: '/score/contract',
  ogTitle: 'Your contract, verified · Designesy',
  ogDescription: 'Score a live page against your own DESIGN.md or design tokens. Two numbers, never blended.',
  twitterDescription: 'Designesy · score a page against your own contract',
});

/** A deep link names a linked contract only: an https address, never contract text. */
function contractUrlParam(v: unknown): string {
  return typeof v === 'string' && /^https:\/\/\S+$/i.test(v.trim()) ? v.trim() : '';
}

export default async function ContractPage({ searchParams }: { searchParams?: Promise<{ url?: string; contract?: string }> }) {
  const params = await searchParams;
  const initialUrl = typeof params?.url === 'string' ? params.url : '';
  const initialContract = contractUrlParam(params?.contract);

  // The two registers, from the published formula (fidelity) and the
  // registry's customer titles (baseline): no count is typed on this page.
  const fidelity: RegistryCheck[] = FIDELITY_DEFS.map((d) => ({ id: d.id, label: d.title, item: d.title, pass: d.criterion, group: 'fidelity' }));
  const baseline: RegistryCheck[] = BASELINE_IDS.map((id) => {
    const def = CHECKS.find((c) => c.id === id);
    return { id, label: baselineTitle(id), item: baselineTitle(id), pass: def?.pass ?? '', group: 'baseline' };
  });
  const total = fidelity.length + baseline.length;
  const manual = Object.values(BASELINE_GROUPS).filter((g) => g.manual).reduce((n, g) => n + g.checks.length, 0);
  const weights = Object.entries(FIDELITY_WEIGHTS).sort((a, b) => b[1] - a[1]);
  const cap = (id: string) => FIDELITY_CEILINGS.find((c) => c.check === id)?.cap;
  const titles: Record<string, string> = Object.fromEntries([...fidelity, ...baseline].map((c) => [c.id, c.label]));
  const ceilings: Record<string, number> = Object.fromEntries(FIDELITY_CEILINGS.map((c) => [c.check, c.cap]));

  // What the result view cites, from the same constants the engine scores with.
  const label = (k: string) => (k === 'keyboard' ? 'Keyboard and focus' : k.charAt(0).toUpperCase() + k.slice(1));
  const groupOf = (id: string) => Object.entries(BASELINE_GROUPS).find(([, g]) => g.checks.includes(id));
  const defs: Record<string, CheckDef> = Object.fromEntries([
    ...FIDELITY_DEFS.map((d) => [d.id, { title: d.title, criterion: d.criterion, category: label(d.category), weight: FIDELITY_WEIGHTS[d.category] }] as const),
    ...BASELINE_IDS.map((id) => {
      const g = groupOf(id);
      return [id, { title: baselineTitle(id), criterion: CHECKS.find((c) => c.id === id)?.threshold ?? '', category: g ? label(g[0]) : '', weight: g ? g[1].weight : 0, manual: !!g?.[1].manual }] as const;
    }),
  ]);
  const scoredGroups = Object.entries(BASELINE_GROUPS).filter(([, g]) => !g.manual).sort((a, b) => b[1].weight - a[1].weight);
  const leftOutIds = CHECKS.map((c) => c.id).filter((id) => !BASELINE_IDS.includes(id));
  const setup: ResultsSetup = {
    defs,
    thresholds: { sharePassAt: SHARE_PASS_AT, contrastPass: CONTRAST_PASS, contrastLargePass: CONTRAST_LARGE_PASS, contrastFailBelow: CONTRAST_FAIL_BELOW },
    staticMax: BASELINE_STATIC_MAX,
    calc: {
      rule: 'Each check scores 1 for a pass, 0.5 for a warning and 0 for a failure. Checks that did not run are left out. Categories carry fixed weights, shared by their scored checks.',
      fidelity: `${weights.map(([k, w]) => `${k} ${w}`).join(', ')}. A failing contrast pair caps it at ${cap('f09')}; a failing primary action pair caps it at ${cap('f10')}.`,
      baseline: `${scoredGroups.map(([k, g]) => `${label(k).toLowerCase()} ${g.weight}`).join(', ')}. ${manual === 1 ? 'One check needs' : `${manual === 2 ? 'Two' : manual} checks need`} a browser and ${manual === 1 ? 'is' : 'are'} left out here.`,
    },
    leftOut: { count: leftOutIds.length, ids: leftOutIds.join(', ') },
  };

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="eg cf">
        <EngineHead
          route="/score/contract"
          name="Your contract, verified"
          thesis="Score a live page against your own DESIGN.md or design tokens. You get two numbers: how closely the page follows your contract, and how it does on web standards every site is held to."
          facts={[`${total} checks`, 'DESIGN.md or DTCG', 'free on every plan', 'nothing stored']}
          contract={{ href: '/contracts/design-system', label: `baseline rules ${CONTRACT_VERSION}` }}
        />

        <ContractForm
          initialUrl={initialUrl}
          initialContract={initialContract}
          registry={{ checks: [...fidelity, ...baseline], groups: [], machine: '/api/score/checks/own-contract' }}
          fidelityIds={fidelity.map((c) => c.id)}
          baselineIds={baseline.map((c) => c.id)}
          titles={titles}
          ceilings={ceilings}
          minScored={MIN_SCORED_CHECKS}
          setup={setup}
        />

        <EngineMethod
          steps={[
            { title: 'Read your contract', text: `DESIGN.md front matter or DTCG JSON, read into one model. A contract that drops a token or declares fewer than ${MIN_COLORS} colors comes back with the reason.` },
            { title: 'Find your tokens', text: "Each declared value is looked for in the page's HTML and CSS, by value and by CSS variable name. A token map joins names that differ." },
            { title: 'Score two numbers', text: `Fidelity from the ${fidelity.length} checks that read your contract. Baseline from ${baseline.length} web checks that read none. Each stands on its own.` },
            { title: 'Keep nothing', text: 'Your contract is discarded after the run; only anonymous usage counts remain. A linked contract can be shared, a pasted one cannot.' },
          ]}
          formula={
            <>
              <span>
                <b>fidelity</b> = {weights.map(([k, w]) => `${k} ${w}`).join(' · ')}
              </span>
              <GradeLine />
              <span>
                A failing contrast pair caps fidelity at {cap('f09')}; a failing primary action pair caps it at {cap('f10')}. {manual === 1 ? 'One baseline check needs' : `${manual} baseline checks need`} a browser and {manual === 1 ? 'is' : 'are'} left out here.
              </span>
            </>
          }
        />

        <EngineNext
          items={[
            { title: 'Score with the Designesy contract', desc: `All four engines and the ${ENGINE_CHECK_COUNT}-check contract score, on any public URL.`, route: '/score' },
            { title: 'Read the rules behind the baseline', desc: `The ${CONTRACT_VERSION} contract, including the ${baseline.length} universal checks the baseline runs.`, route: '/contracts/design-system' },
            { title: 'Compare plans', desc: 'Scoring your own contract is free on every plan. Continuity watches a site over time.', route: '/pricing' },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
