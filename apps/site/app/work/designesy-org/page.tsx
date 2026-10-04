import type { Metadata } from 'next';
import Link from 'next/link';
import '../../instrument.css';
import '../work.css';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { pageMeta } from '../../lib/site-meta';
import { CONTRACT_VERSION } from '../../lib/design-system-contract';
import { AgentActions } from '../../lib/agent-actions';
import { CaseTitle, ScoreDelta, SourceList, StateMove, type Source } from '../case-instrument';

export const metadata: Metadata = pageMeta({
  title: 'designesy.org: D to A case study',
  description:
    'The publisher scored itself, got a D, fixed the gaps, and published the grade. Real before/after scores from the live /api/score endpoint: D 67.4 → A 96.3 in one session.',
  path: '/work/designesy-org',
  type: 'article',
  ogTitle: 'designesy.org · D to A · Designesy',
  ogDescription:
    'The same engine that grades every other site graded the publisher. D 67.4 → A 96.3: the fixes, the delta table, and the lessons.',
  twitterDescription: 'designesy.org D to A case study · designesy.org/work/designesy-org',
});

const BEFORE_SCORE = 67.4;
const AFTER_SCORE = 96.3;
const BEFORE_COUNTS = { pass: 12, fail: 9, warn: 2, skip: 3 };
const AFTER_COUNTS = { pass: 23, fail: 0, warn: 0, skip: 3 };

const DELTA = [
  { id: 'v01', item: 'Token values match live site :root foundation', before: 'FAIL', after: 'PASS' },
  { id: 'v05', item: 'focus-visible present on all interactive elements', before: 'FAIL', after: 'PASS' },
  { id: 'v06', item: 'Reduced-motion tiering (Tier 1/2/3) not a kill switch', before: 'FAIL', after: 'PASS' },
  { id: 'v11', item: 'No raw hex colors in component CSS', before: 'FAIL', after: 'PASS' },
  { id: 'v14', item: 'Cadence typography contract-diff', before: 'FAIL', after: 'PASS' },
  { id: 'v18', item: 'text-wrap: balance + pretty both present', before: 'WARN', after: 'PASS' },
  { id: 'v19', item: 'tabular-nums: 8 instances across the live CSS', before: 'FAIL', after: 'PASS' },
  { id: 'v08', item: 'Poise interaction rules match live /labs/poise', before: 'FAIL', after: 'PASS' },
  { id: 'v09', item: 'Poise keyboard-path published', before: 'FAIL', after: 'PASS' },
  { id: 'v10', item: 'Takt rules match CSS', before: 'FAIL', after: 'PASS' },
];

const SUMMARY =
  'designesy.org was scored by its own engine and got a D. The failures were concentrated in four areas: token discipline (raw hex, magic numbers), keyboard affordance (no focus-visible rings), reduced-motion handling (a kill switch rather than tiered), and Cadence typography (no text-wrap, no tabular-nums, no font-synthesis guards). One session resolved all 9 failures and 2 warnings. The score moved from D 67.4 to A 96.3, a 28.9-point gain in a single working session.';

const SOURCES: Source[] = [
  {
    href: '/score?url=designesy.org',
    title: 'Score designesy.org now',
    meta: 'Run the live engine against the publisher',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract ' + CONTRACT_VERSION,
    meta: 'The standard the score runs against',
  },
  {
    href: '/learn/why-we-built-a-public-design-score',
    title: 'Why a public score',
    meta: 'The argument this case study is evidence for',
  },
  {
    href: '/work',
    title: 'Work · case studies',
    meta: 'Index',
  },
];

const LESSONS = [
  'A score counts once it is public: running the engine against the publisher is the only honest test',
  '9 failures in one session is recoverable; the contract is reachable from a low baseline',
  'The biggest single jump came from token discipline: replacing raw hex and magic numbers moved 4 checks at once',
  'A SKIP is not a pass waiting to happen: the 3 browser-only checks stayed SKIP through the whole session, because no amount of static work can run a browser check',
  'The 3 SKIPs are honest: v02/v04 need a browser, v21 needs PSI or CDP; each is shown as unrun',
];

export default function DesignesyOrgCaseStudy() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/work" className="lab-crumb">
              Work
            </Link>
            <span aria-hidden="true"> · </span>
            Before/after case study
          </p>
          <CaseTitle name="designesy.org" tail="D to A" />
          <p className="surface-lede">
            The publisher scores itself, fixes the gaps, and publishes the
            grade.
          </p>
          <p className="surface-note">
            The same /api/score engine that grades every other site graded
            designesy.org. The result was a D: 9 failures, 2 warnings, 3
            skips. The fixes were real: token discipline, focus-visible
            rings, reduced-motion tiering, Cadence typography rules, and the
            static halves of the Poise/Takt checks. The score is now A,
            verified on the same terms as everyone else&rsquo;s.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">A · 96.3</span>
            <span className="lab-meta-item">Score · D 67.4 → A 96.3</span>
            <span className="lab-meta-item">Artifact · designesy.org</span>
            <span className="lab-meta-item">Date · 2026-07-25</span>
          </div>
          <AgentActions mdPath="/work/designesy-org.md" label="the designesy.org case study" />
        </section>

        <section className="doctrine-section fade-up" id="summary">
          <h2 className="doctrine-heading">Summary</h2>
          {/* Face and side (globals.css .definition-split): the statement on
              the face, the grade and its move in the side, divided on the
              7-line the Score delta instrument below divides on. The copy
              payload is the statement, which states every number itself. */}
          <div className="definition definition-split" data-copy={SUMMARY} data-copy-label="summary">
            <div className="definition-face">
              <p className="definition-label">Outcome</p>
              <p>{SUMMARY}</p>
            </div>
            <div className="definition-side">
              <span className="row-side-chip" data-state="pass">
                A · {AFTER_SCORE}
              </span>
              <dl>
                <div>
                  <dt>Before</dt>
                  <dd>D · {BEFORE_SCORE}</dd>
                </div>
                <div>
                  <dt>Gain</dt>
                  <dd>+{(AFTER_SCORE - BEFORE_SCORE).toFixed(1)} in one session</dd>
                </div>
                <div>
                  <dt>Scored</dt>
                  <dd>2026-07-25</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="score-delta">
          <h2 className="doctrine-heading">Score delta</h2>
          <ScoreDelta
            label="Score delta for designesy.org: before and after, scored by /api/score on 2026-07-25"
            host="designesy.org"
            date="2026-07-25"
            runs={[
              { label: 'Before', note: `D · ${BEFORE_SCORE}`, counts: BEFORE_COUNTS },
              { label: 'After', note: `A · ${AFTER_SCORE}`, counts: AFTER_COUNTS },
            ]}
            before={BEFORE_SCORE}
            after={AFTER_SCORE}
            note={
              <>
                <span className="sr-only">
                  Grade D, {BEFORE_SCORE}, to grade A, {AFTER_SCORE}:{' '}
                </span>
                <b>+{(AFTER_SCORE - BEFORE_SCORE).toFixed(1)}</b> points in one session.{' '}
                +{AFTER_COUNTS.pass - BEFORE_COUNTS.pass} pass, -{BEFORE_COUNTS.fail - AFTER_COUNTS.fail} fail,
                -{BEFORE_COUNTS.warn - AFTER_COUNTS.warn} warn; the {AFTER_COUNTS.skip} skips are
                unchanged (browser-only checks, honestly labeled).
              </>
            }
          />
        </section>

        <section className="doctrine-section fade-up" id="checks-moved">
          <h2 className="doctrine-heading">Checks that moved</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Every check that changed status between the before and after
            score. The fix that moved each one is documented in the
            corrections section.
          </p>
          <div className="principle-list">
            {DELTA.map((d) => (
              <div className="principle" key={d.id}>
                <span className="principle-num">{d.id}</span>
                <div className="principle-body">
                  <h3 className="cs-check-title">{d.item}</h3>
                  <StateMove before={d.before} after={d.after} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="corrections">
          <h2 className="doctrine-heading">Corrections</h2>
          <div className="definition">
            <p className="definition-label">The fix</p>
            <p>
              Replaced raw hex values with contract tokens across component
              CSS. Added focus-visible rings on every interactive element,
              tiered reduced-motion (Tier 1 remove, Tier 2 soften ≤200ms,
              Tier 3 keep; never a kill switch). Implemented the Cadence
              typography rules: text-wrap balance + pretty, tabular-nums in
              numeric contexts, font-synthesis guards, skip-ink on
              underlines. Fixed the Poise interaction, Poise keyboard-path,
              and Takt feel checks, which had been failing rather than
              unrun.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="lessons">
          <h2 className="doctrine-heading">Lessons</h2>
          <CheckGrid items={checkItemsFromStrings(LESSONS)} />
        </section>

        <section className="doctrine-section fade-up" id="remaining">
          <h2 className="doctrine-heading">What is still open</h2>
          <div className="definition">
            <p className="definition-label">Honest skips</p>
            <p>
              Three checks remain SKIP: v02 (responsive overflow at 4
              viewports), v04 (sound toggle aria-pressed flip), and v21
              (Core Web Vitals). All three need a browser path. The audit
              endpoint at /api/score/audit returns honest SKIPs with
              diagnostic strings until ENABLE_BROWSER_AUDIT=1 and PSI_API_KEY
              are set on the deployment. Each one is labeled as unrun.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="sources">
          <h2 className="doctrine-heading">Sources</h2>
          <SourceList items={SOURCES} />
        </section>

        <div className="status-note">
          Case study · designesy.org · D to A. Real before/after scores from
          /api/score, captured 2026-07-25. Three honest SKIPs remain:
          browser-only checks, unrun on the current deployment.
        </div>
      </main>

      <Footer />
    </>
  );
}