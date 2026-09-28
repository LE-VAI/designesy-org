import type { Metadata } from 'next';
import '../instrument.css';
import '../engine.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';
import { registry } from '../lib/engine/registry';
import { EngineHead, EngineMethod, EngineNext } from '../lib/engine/engine-page';
import { CompareForm } from './compare-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  // Was 'Token diff'. Every route that reaches this page calls it Compare —
  // the URL is /compare, the command palette entry is "Compare design systems",
  // /contracts/compare labels its CTA "Compare two URLs →", and this page's own
  // lede opens "Compare two design systems". The <h1> was the only surface in
  // the chain using a different name, so following any of those links landed on
  // a heading that did not match the link you clicked.
  //
  // "Diff" is still accurate vocabulary — it names the operation, and the
  // description below keeps it. What changes is the page's NAME, which is now
  // the one every caller already uses.
  title: 'Compare',
  description:
    'Compare two design systems from live URLs: diff tokens added, removed, renamed, value-changed, scale drift, contrast drift, and structure delta. The only URL-scoped design-token diff engine. 8 emission checks plus score delta on both sites.',
  path: '/compare',

  machineSibling: '/contracts/compare.json',
  ogTitle: 'Compare design systems · Designesy',
  ogDescription:
    'Diff two design systems from live URLs: tokens added, removed, renamed, value-changed, scale drift.',
  twitterDescription: 'Designesy compare · designesy.org/compare',
});

export default async function ComparePage({ searchParams }: { searchParams?: Promise<{ a?: string; b?: string }> }) {
  const params = await searchParams;
  const initialA = typeof params?.a === 'string' ? params.a : '';
  const initialB = typeof params?.b === 'string' ? params.b : '';
  const reg = registry('compare');

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg" data-pagefind-meta="priority:high">
        <EngineHead
          route="/compare"
          name="Compare"
          thesis="Diff two live design systems token by token: what one has and the other lacks, what was renamed or changed, how far each scale moved, and which colors lost contrast."
          facts={['two URLs', `${reg.count} dimensions`, 'compiled CSS']}
          contract={{ href: '/contracts/compare', label: `contract ${reg.version} ${reg.status}` }}
        />

        <CompareForm initialA={initialA} initialB={initialB} registry={{ checks: reg.checks, groups: reg.groups, machine: reg.machine }} />

        <EngineMethod
          steps={[
            { title: 'Fetch both', text: 'Each URL is fetched fresh, with every stylesheet it links.' },
            { title: 'Extract two token sets', text: 'Every custom property each site declares, by name and value.' },
            { title: 'Diff 8 dimensions', text: 'Names on one side only, likely renames, changed values, scale stops, structure, contrast and both contract scores.' },
            { title: 'Grade the diff', text: 'Each dimension computed counts. The grade reports how complete the diff is; the diff is the result.' },
          ]}
          formula={
            <>
              <span><b>completeness</b> = (pass + warn × 0.5) ÷ 8 × 100</span>
              <span><b>renamed</b> = names within 2 edits, with different values</span>
              <span>Static analysis of both sites: no browser, no login.</span>
            </>
          }
        />

        <EngineNext
          items={[
            { title: 'Watch one of them', desc: 'Monitor re-runs the drift checks on a site and flags tokens that change between runs.', route: '/monitor', carry: true },
            { title: 'Score one of them', desc: `The ${ENGINE_CHECK_COUNT}-check contract score, drift and AI readiness on one URL, with one composite grade.`, route: '/score', carry: true },
            { title: 'Freeze the one you trust', desc: "Guardrails turns a site's tokens into a build contract for AI coding agents.", route: '/guardrails', carry: true },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
