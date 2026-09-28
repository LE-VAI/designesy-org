// /frameworks: one evaluation page per scored site, grouped by the category
// the seed files it under. Rows, ranks and profiles come from lib/data/cohort.

import type { Metadata } from 'next';
import '../instrument.css';
import '../engine.css';
import '../data.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { PageShareButton } from '../lib/page-share';
import { AgentActions } from '../lib/agent-actions';
import { ENGINE_CHECK_COUNT } from '../hero-stats';
import { EngineHead } from '../lib/engine/engine-page';
import { COHORT, BATCH_CATEGORIES, BATCH_RUN_DATE, SCORES_DATE, CATEGORY_LABELS, fmt, inCategory } from '../lib/data/cohort';
import { SiteTable } from '../lib/data/site-table';

export const metadata: Metadata = pageMeta({
  title: 'Framework Evaluations',
  description:
    `Every scored site, each with its own evaluation article. 30 sites scored against the ${ENGINE_CHECK_COUNT}-check engine: browse by category, compare scores, read the findings.`,
  path: '/frameworks',
  ogTitle: 'Framework Evaluations · Designesy',
  ogDescription:
    `30 sites scored against a ${ENGINE_CHECK_COUNT}-check design contract engine. Each has a dedicated evaluation page with per-category breakdowns.`,
  twitterDescription: 'Framework evaluations · designesy.org/frameworks',
});

export const revalidate = 3600;

// Seed categories, largest first, then by name.
const GROUPS = [...new Set(COHORT.map((s) => s.category))]
  .map((c) => ({ name: c, sites: inCategory(c) }))
  .sort((a, b) => b.sites.length - a.sites.length || a.name.localeCompare(b.name));

const idOf = (c: string) => `fw-${c.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

export default function FrameworksIndexPage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg dx" data-pagefind-meta="priority:high">
        <EngineHead
          route="/frameworks"
          name="Framework evaluations"
          thesis={`One page for each of the ${COHORT.length} scored sites: where it sits on the grade scale, each category against the cohort's mean, and the peers it is filed with.`}
          facts={[`${COHORT.length} sites`, `${GROUPS.length} groups`, `scored ${SCORES_DATE}`]}
          contract={{ href: '/leaderboard', label: 'the full ranking' }}
        >
          <div className="dx-actions">
            <PageShareButton
              text={`${COHORT.length} sites scored against a ${ENGINE_CHECK_COUNT}-check design contract, each with its own evaluation page.`}
              label="Share the framework evaluations"
            />
          </div>
          <AgentActions mdPath="/frameworks.md" label="the frameworks index" />
        </EngineHead>

        <nav className="dx-toc" aria-label="Groups">
          <p className="dx-toc-label" aria-hidden="true">
            Groups
          </p>
          <ol>
            {GROUPS.map((g) => (
              <li key={g.name}>
                <a href={`#${idOf(g.name)}`}>
                  {g.name} <span className="dx-num">{g.sites.length}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {GROUPS.map((g) => (
          <section className="eg-section" id={idOf(g.name)} key={g.name} aria-labelledby={`${idOf(g.name)}-h`}>
            <div className="eg-section-head">
              <div>
                <h2 className="eg-h2" id={`${idOf(g.name)}-h`}>
                  {g.name}
                </h2>
                <p className="eg-section-sub">
                  {g.sites.length} {g.sites.length === 1 ? 'site' : 'sites'} · best {g.sites[0].name} at {fmt(g.sites[0].score)}
                </p>
              </div>
            </div>
            <SiteTable sites={g.sites} caption={`${g.name}: ${g.sites.length} scored sites, by cohort rank.`} />
          </section>
        ))}

        <p className="dx-src">
          Rank is the site&apos;s place among all {COHORT.length}. By category: one column per category, heaviest first (
          {BATCH_CATEGORIES.map((k) => CATEGORY_LABELS[k].toLowerCase()).join(', ')}), from the batch run of {BATCH_RUN_DATE};
          scores from {SCORES_DATE}.
        </p>
      </main>
      <Footer />
    </>
  );
}
