// /benchmarks: designesy beside hallmark and slop-eval, the two closest tools,
// and the wider field. Everything about designesy is read from the engine
// registry and the leaderboard data; everything about the other tools is the
// research of 2026-08-01, dated where it is shown.

import type { Metadata } from 'next';
import Link from 'next/link';
import '../instrument.css';
import '../engine.css';
import '../data.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { ENGINE_CHECK_COUNT } from '../hero-stats';
import { AgentActions } from '../lib/agent-actions';
import { CATEGORY_WEIGHTS, CHECKS as REGISTRY, ENGINE_MANUAL_CHECK_COUNT, ENGINE_VERSION } from '../lib/check-definitions';
import { EngineHead, EngineNext } from '../lib/engine/engine-page';
import { display } from '../lib/engine/types';
import { byUrl, SELF_URL, SCORES_DATE, fmt, toneOf } from '../lib/data/cohort';
import { DataTable } from '../lib/data/figure';

export const metadata: Metadata = pageMeta({
  title: 'Benchmarks',
  description:
    'Designesy vs hallmark vs slop-eval: a side-by-side benchmark of design verification engines. What each catches that the others do not, plus the wider emerging landscape.',
  path: '/benchmarks',
  ogDescription:
    'Three tools, three questions: hallmark prevents slop, slop-eval scores slop, designesy verifies contract conformance, plus the wider landscape.',
  twitterDescription:
    'Competitive benchmark · designesy.org/benchmarks',
});

const RESEARCHED = '2026-08-01';
const SELF = byUrl(SELF_URL);
const CATEGORIES = Object.keys(CATEGORY_WEIGHTS).length;
const MANUAL_ITEMS = REGISTRY.filter((c) => c.type === 'manual').map((c) => c.id);

const TOOLS = [
  {
    attr: 'Question it answers',
    d: 'Does this conform to the contracted design system?',
    h: 'Does this look AI-generated?',
    s: 'How much slop does this design contain?',
  },
  { attr: 'Kind', d: 'Contract conformance verification', h: 'Anti-slop gate at generation time', s: 'Anti-slop evaluation skill' },
  { attr: 'Delivery', d: 'URL API and MCP tools an agent can call', h: 'Agent skill (a prompt-encoded rule set)', s: 'Agent skill (a deterministic scoring script)' },
  { attr: 'Checks', d: `${ENGINE_CHECK_COUNT} in ${CATEGORIES} categories`, h: '57 binary gates and 6 pre-emit axes', s: '108 tells in 6 families and 2 positive axes' },
  { attr: 'License', d: 'See designesy.org', h: 'MIT', s: 'Apache-2.0' },
  { attr: `GitHub stars, ${RESEARCHED}`, d: 'n/a', h: '20.5k', s: '40 (parent repository)' },
];

// Where the three overlap: designesy check, then the others' equivalents.
const SHARED = [
  { d: 'v06, v22', what: 'Contrast (WCAG AA and APCA)', h: 'gates 40, 41', s: 'X5 (critical)' },
  { d: 'v03', what: 'Focus-visible rings', h: 'gate 26', s: 'X14' },
  { d: 'v05', what: 'prefers-reduced-motion', h: 'gate 27', s: 'none' },
  { d: 'v11', what: 'No transition: all', h: 'gate 10', s: 'none' },
  { d: 'v28', what: 'Reading width 45 to 75ch', h: 'gate 25', s: 'none' },
  { d: 'v26', what: 'At most 3 font families', h: 'gate 37', s: 'none' },
  { d: 'v02', what: 'No horizontal scroll', h: 'gate 34', s: 'none' },
  { d: 'v24', what: 'Touch targets 44px and up (WCAG 2.5.5)', h: 'gate 26, in part', s: 'none' },
];

const DESIGNESY_ONLY = [
  { id: 'v01', what: 'Token values match the live :root foundation (contract to live conformance)' },
  { id: 'v08, v09, v10', what: 'Poise and Takt verification: the interaction-feel contract' },
  { id: 'v12', what: 'will-change kept to transform and opacity' },
  { id: 'v13', what: 'Press scales 0.96 and 0.985, above the 0.95 floor' },
  { id: 'v14', what: 'Cadence typography rules match the contract' },
  { id: 'v15', what: 'Font smoothing: antialiased and grayscale' },
  { id: 'v16', what: 'A rem-based scale with a 16px root' },
  { id: 'v17', what: 'Line-height by role (headings 1.08, body 1.55)' },
  { id: 'v18', what: 'text-wrap: balance and pretty both present' },
  { id: 'v19', what: 'tabular-nums in 8 places or more' },
  { id: 'v20', what: '::selection styled in the brand accent' },
  { id: 'v21', what: 'Core Web Vitals (LCP under 2.5s, INP under 200ms, CLS under 0.1)' },
  { id: 'v23', what: 'Duration tokens, --duration-quick to --duration-slow' },
  { id: 'x01, x02, x03', what: 'font-synthesis, text-underline-position and skip-ink' },
  { id: 'v27', what: 'Input font size of 16px or more (no iOS zoom)' },
  { id: 'v29', what: 'Token layers, primitive to semantic to component (DSAF A1.1)' },
  { id: 'v34', what: 'AI-disclosure readiness (EU AI Act, Article 50, in force from 2026-08-02)' },
  { id: 'v35', what: 'Forced-colors readiness' },
  { id: 'v36', what: 'Unicode security: UTS #39 confusables in token names and CSS' },
  { id: 'v37', what: 'DESIGN.md spec layer (Google @google/design.md lint)' },
];

const THEIRS_ONLY = [
  { what: 'AI-slop look: purple gradients, centred heroes, fake chrome', where: 'hallmark 1 to 7, 42, 43, 45, 47; slop-eval C1 to C15, T1 to T10, K1 to K27, L1 to L21' },
  { what: 'Structural variety across pages', where: 'hallmark 8, 20, 21, 32, 57; slop-eval L15, L19, L21, axis 7' },
  { what: 'Signature and uniqueness, a positive rubric', where: 'slop-eval axis 7 (a 7-element formula, weighted 3 times)' },
  { what: 'Cohesion, a positive rubric', where: 'slop-eval axis 8 (4 checks)' },
  { what: 'Invented metrics and fake copy', where: 'hallmark 46; slop-eval W3' },
  { what: 'AI fingerprints in navigation and footer', where: 'hallmark 42, 43; slop-eval L14, L20, K12' },
  { what: 'Re-drawn UI chrome: fake browser bars, phone frames', where: 'hallmark 47; slop-eval K7, K16' },
  { what: 'Token improvisation: inline hex that bypasses the token block', where: 'hallmark 48; slop-eval C9, C10' },
  { what: 'Hover boop, hover lift and hover scale', where: 'hallmark 11; slop-eval M2, M4' },
  { what: 'Dead controls and fake interactivity', where: 'slop-eval M8 (critical)' },
  { what: 'Pre-emit self-critique on 6 axes scored 1 to 5', where: 'hallmark' },
];

const FIELD = [
  { name: 'Impeccable', approach: '46 AI-slop tells, in the slop-eval lineage', note: 'The largest tell catalogue, community-sourced' },
  { name: 'design-slop-cop', approach: '14 anti-slop patterns, rule-based', note: 'Light and fast, with a focused set' },
  { name: 'anti-slop-design', approach: 'Design-quality guardrails', note: 'Lints before output instead of scoring after' },
  { name: 'Atlassian ADS MCP', approach: 'A design-system MCP server (v0.21.1)', note: 'Benchmarked against design.md: fewer tokens, lower variance' },
];

// One column law for every table on the page, in shell columns (of 12): the
// label takes 2 and the next column 4, so the hallmark and slop-eval columns
// (3 and 3) fall on the same lines in each comparison, and a descriptive
// table's last column starts on the hallmark line.
const COMPARE = [2, 4, 3, 3];
const DESCRIBE = [2, 4, 6];

const SOURCES = [
  { what: 'designesy score', where: `the weekly leaderboard run of ${SCORES_DATE}, engine ${ENGINE_VERSION}` },
  { what: 'hallmark, 57 gates', where: 'github.com/Nutlope/hallmark, skills/hallmark/references/slop-test.md' },
  { what: 'slop-eval, 108 tells', where: 'github.com/fabricioctelles/skills, skills/slop-eval/references/tells.md' },
  { what: 'slop-eval scoring', where: 'github.com/fabricioctelles/skills, skills/slop-eval/SKILL.md' },
  { what: 'slop-eval upstream', where: 'pols.dev/slop.md' },
  { what: '@google/design.md', where: 'npmjs.com/package/@google/design.md (v0.4.0, Apache 2.0)' },
];

export default function BenchmarksPage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg dx">
        <EngineHead
          route="/benchmarks"
          name="Benchmarks"
          thesis="Three tools, three questions. hallmark stops slop as a design is generated, slop-eval scores slop after the fact, and designesy verifies a site against a versioned contract. Where they overlap, and what each one catches alone."
          facts={['3 tools', `researched ${RESEARCHED}`, SELF ? `self-score ${fmt(SELF.score)} ${SELF.grade}` : 'self-score']}
          contract={{ href: '/methodology', label: 'the methodology' }}
        >
          <AgentActions mdPath="/benchmarks.md" label="the benchmarks page" />
        </EngineHead>

        <section className="eg-section" aria-labelledby="bm-tools-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="bm-tools-h">
                The three tools
              </h2>
              <p className="eg-section-sub">designesy from its registry; the others as researched on {RESEARCHED}</p>
            </div>
          </div>
          <div className="dx-table-box">
            <DataTable
              caption="designesy, hallmark and slop-eval compared, attribute by attribute."
              head={['', 'designesy', 'hallmark', 'slop-eval']}
              cols={COMPARE}
              stack="rows"
              rows={TOOLS.map((t) => [t.attr, t.d, t.h, t.s])}
            />
          </div>
          <p className="dx-lead dx-after">
            A full pipeline can use all three: hallmark while a design is generated, slop-eval to score what exists, designesy to
            verify the result against the contract. Of the three, only designesy scores a URL through an API, which is what CI,
            leaderboards and automated pipelines call.
          </p>
        </section>

        <section className="eg-section" aria-labelledby="bm-shared-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="bm-shared-h">
                Where they overlap
              </h2>
              <p className="eg-section-sub">{SHARED.length} designesy checks with an equivalent in either tool</p>
            </div>
          </div>
          <div className="dx-table-box">
            <DataTable
              caption="designesy checks with an equivalent in hallmark or slop-eval."
              head={['Check', 'What it asks', 'hallmark', 'slop-eval']}
              cols={COMPARE}
              stack="rows"
              rows={SHARED.map((r) => [<code key="c">{r.d}</code>, r.what, r.h, r.s])}
            />
          </div>
        </section>

        <section className="eg-section" aria-labelledby="bm-ours-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="bm-ours-h">
                What designesy checks that they do not
              </h2>
              <p className="eg-section-sub">{DESIGNESY_ONLY.length} checks with no hallmark or slop-eval equivalent</p>
            </div>
          </div>
          <ul className="dx-checks dx-checks-cols">
            {DESIGNESY_ONLY.map((c) => (
              <li key={c.id}>
                <span className="dx-check-head">
                  <code>{c.id}</code>
                  <span className="dx-check-item">{c.what}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="eg-section" aria-labelledby="bm-theirs-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="bm-theirs-h">
                What they check that designesy does not
              </h2>
              <p className="eg-section-sub">the gaps: how a design looks, which the contract leaves to them</p>
            </div>
          </div>
          <ul className="dx-checks dx-checks-split">
            {THEIRS_ONLY.map((c) => (
              <li key={c.what}>
                <span className="dx-check-item">{c.what}</span>
                <span className="dx-check-how">{c.where}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="eg-section" aria-labelledby="bm-self-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="bm-self-h">
                On designesy.org itself
              </h2>
              <p className="eg-section-sub">weekly run of {SCORES_DATE}</p>
            </div>
          </div>
          <div className="dx-table-box">
            <DataTable
              caption="Each tool on designesy.org."
              head={['Tool', 'Result', 'What it found']}
              cols={DESCRIBE}
              stack="rows"
              rows={[
                [
                  'designesy',
                  SELF ? (
                    <span key="s" className="dx-rank-sg">
                      <span className="dx-grade" data-tone={toneOf(SELF.grade)}>
                        {SELF.grade}
                      </span>
                      <span className="dx-num">{fmt(SELF.score)}</span>
                    </span>
                  ) : (
                    'not scored'
                  ),
                  SELF
                    ? `${SELF.pass} pass, ${SELF.warn} warn, ${SELF.fail} fail, ${SELF.skip} skipped. ${ENGINE_MANUAL_CHECK_COUNT} manual checks (${MANUAL_ITEMS.join(', ')}) need a browser, so they sit outside the score.`
                    : '',
                ],
                ['hallmark', 'Not run', 'A skill with no URL API. Expected to flag near-pure black and white, zero-chroma neutrals and the navigation structure.'],
                ['slop-eval', 'Not run', 'A skill with no URL API. Expected to flag the cool charcoal dark theme, the mono house voice (minor), and to pass the focus states.'],
              ]}
            />
          </div>
        </section>

        <section className="eg-section" aria-labelledby="bm-field-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="bm-field-h">
                The wider field
              </h2>
              <p className="eg-section-sub">newer entrants worth tracking, as of {RESEARCHED}</p>
            </div>
          </div>
          <div className="dx-table-box">
            <DataTable
              caption={`Newer design-verification tools, as of ${RESEARCHED}.`}
              head={['Tool', 'Approach', 'What sets it apart']}
              cols={DESCRIBE}
              stack="rows"
              rows={FIELD.map((f) => [f.name, f.approach, f.note])}
            />
          </div>
          <p className="dx-src">
            mcpservers.org indexed 81 design-related MCP servers on {RESEARCHED}. The designesy MCP server has 17 tools; see the{' '}
            <Link href="/docs/mcp">MCP docs</Link>.
          </p>
        </section>

        <section className="eg-section" aria-labelledby="bm-src-h">
          <h2 className="eg-h2" id="bm-src-h">
            Sources
          </h2>
          <dl className="dx-defs">
            {SOURCES.map((s) => (
              <div key={s.what}>
                <dt>{s.what}</dt>
                <dd>{display(s.where)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <EngineNext
          items={[
            { title: 'The methodology', desc: 'Every designesy check, its weight and how it is decided.', route: '/methodology' },
            { title: 'The leaderboard', desc: 'The same engine on 30 sites, re-scored weekly.', route: '/leaderboard' },
            { title: 'The contract', desc: 'The versioned design contract every check reads.', route: '/contracts/design-system' },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
