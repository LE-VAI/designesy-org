import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { CheckGrid } from '../lib/check-grid';
import { checkItemsFromStrings } from '../lib/check-items';
import { pageMeta } from '../lib/site-meta';
import { AgentActions } from '../lib/agent-actions';
import { CONTRACT_VERSION } from '../lib/design-system-contract';
import { labs } from '../lib/labs';
import { acousticTokens } from '../lib/acoustic-tokens';
import { designReviewKit } from '../lib/kits/design-review';
import './labs.css';

const LAB_INDEX = [labs.poise, labs.takt, labs.cadence, labs.acoustics];

type VerdictState = 'pass' | 'warn' | 'fail';

/** A field-check outcome as a state: a clean pass, a pass with notes (warn),
 *  or anything else (fail). Never the brand blue. */
function verdictState(outcome: string): VerdictState {
  if (outcome === 'pass') return 'pass';
  return outcome.startsWith('pass') ? 'warn' : 'fail';
}

/* When every lab carries the same field-check outcome the column says
   nothing, so the bar states it once and each row shows what does differ
   (its rule count). A lab whose outcome differs brings the column back. */
const LAB_OUTCOMES = new Set(LAB_INDEX.map((lab) => lab.field_check.outcome));
const SHARED_OUTCOME = LAB_OUTCOMES.size === 1 ? LAB_INDEX[0].field_check.outcome : null;

type RelatedRow = {
  href: string;
  title: string;
  meta: string;
  /** The row's datum: a version or count, in the side pane's mono. */
  datum?: string;
  /** Or a field-check verdict, as a state chip. */
  verdict?: string;
  /** A route outside this site: the side shows its host and a ↗. */
  external?: boolean;
};

/* Related surfaces. Each row's datum (a version, a count, or a field
   check's verdict as a state chip) and its route stand in the side pane
   behind the 7-line; the face keeps the title and one line. */
const RELATED: RelatedRow[] = [
  {
    href: '/contracts/design-system',
    title: 'Design system contract',
    meta: `Where lab behavior is measured: Poise in v${labs.poise.adopted_in_contract}, Takt in v${labs.takt.adopted_in_contract}, Cadence in v${labs.cadence.adopted_in_contract}, Acoustics in v${labs.acoustics.adopted_in_contract}`,
    datum: CONTRACT_VERSION,
  },
  {
    href: '/review/poise',
    title: 'Field check · Poise',
    meta: 'Kit One review of Lab One',
    verdict: labs.poise.field_check.outcome,
  },
  {
    href: '/review/takt',
    title: 'Field check · Takt',
    meta: 'Kit One review of Lab Two',
    verdict: labs.takt.field_check.outcome,
  },
  {
    href: '/review/cadence',
    title: 'Field check · Cadence',
    meta: 'Kit One review of Lab Three',
    verdict: labs.cadence.field_check.outcome,
  },
  {
    href: '/acoustic-tokens',
    title: 'Acoustic token reference',
    meta: 'Nineteen cues, nineteen roles: the sound parallel to the visual token system',
    datum: `v${acousticTokens.version} · ${acousticTokens.tokens.length} tokens`,
  },
  {
    href: '/review/acoustics',
    title: 'Field check · Acoustics',
    meta: 'Kit One review of Lab Four',
    verdict: labs.acoustics.field_check.outcome,
  },
  {
    href: '/review/designesy-org',
    title: 'Public surface review',
    meta: 'designesy.org checked against the design system contract',
    datum: `baseline ${CONTRACT_VERSION}`,
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Eight-dimension inspection method for any artifact',
    datum: `v${designReviewKit.version} · ${designReviewKit.dimensions.length} dimensions`,
  },
  {
    href: 'https://designesy.ai.studio/',
    title: 'Try the Studio',
    meta: 'The contract, conversational: type, motion, spacing, or score any site',
    datum: 'external',
    external: true,
  },
  {
    href: '/continuity',
    title: 'Continuity waitlist',
    meta: 'Design judgment that stays current',
    datum: 'early access · free to join',
  },
];

/** The route as the side pane prints it: a path here, a host elsewhere. */
function routeLabel(row: RelatedRow): string {
  return row.external ? new URL(row.href).host : row.href;
}

export const metadata: Metadata = pageMeta({
  title: 'Labs',
  description:
    'Designesy Labs: experiments that compile into contracts. Lab One is Poise (restrained interaction). Lab Two is Takt (interface feel). Lab Three is Cadence (text rhythm). Lab Four is Acoustics (interaction sound).',
  path: '/labs',
  ogDescription:
    'Experiments that compile into contracts. Lab One · Poise, Lab Two · Takt, Lab Three · Cadence, Lab Four · Acoustics are live.',
  twitterDescription: 'Experiments that compile into contracts · designesy.org/labs',
});

const LAB_ANATOMY = [
  'Thesis',
  'Live artifact or demo',
  'Principle explanation',
  'Portable contract',
  'Builder-ready implementation prompt',
  'Review checklist',
  'Provenance',
  'Anti-patterns',
  'Remix notes',
  'Verification artifact',
];

const LAB_BOUNDARIES = [
  'Controlled experiments with a stated thesis',
  'Inspectable artifacts you can check',
  'Tests of a design principle',
  'Observations tied to the contract',
  'Working demos on the live site',
  'A workbench for design principles',
];

export default function LabsPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <div className="labs-hero">
          <section className="surface-header fade-up">
            <p className="surface-eyebrow" data-scramble>Experiment lane</p>
            <h1 className="surface-title" data-scramble>Labs</h1>
            <p className="surface-lede">
              Experiments that compile into contracts.
            </p>
            <p className="surface-note">
              A Lab is a controlled design experiment where a principle becomes
              visible, testable, remixable, and reviewable. Labs are the public
              practical layer of Designesy: a workbench where a thesis becomes a
              live artifact, review checklist, portable contract, and
              implementation-ready prompt.
            </p>
            <AgentActions mdPath="/labs.md" label="the labs index" />
          </section>

          {/* The lab index: the page's standing object, on the far side of the
              7-line. Every value is read from the labs' own records (the same
              ones /labs/<lab>.json serves). */}
          <nav className="labs-rack fade-up fade-up-delay-1" aria-labelledby="labs-rack-title">
            <div className="labs-rack-bar">
              <p className="labs-rack-title" id="labs-rack-title">
                Lab index
              </p>
              <p className="labs-rack-state">
                <span className="labs-rack-stat">
                  <i className="labs-rack-led" aria-hidden="true" />
                  {LAB_INDEX.filter((lab) => lab.status === 'live').length} live
                  {SHARED_OUTCOME && <span className="sr-only">, </span>}
                </span>
                {SHARED_OUTCOME && (
                  <span className="labs-rack-stat">
                    <i
                      className="labs-rack-led"
                      data-state={verdictState(SHARED_OUTCOME)}
                      aria-hidden="true"
                    />
                    all {SHARED_OUTCOME}
                  </span>
                )}
              </p>
            </div>
            <ol className="labs-rack-list">
              {LAB_INDEX.map((lab, i) => (
                <li key={lab.id}>
                  <Link
                    href={`/labs/${lab.id}`}
                    className="labs-rack-row"
                    data-cuelume-hover="tick"
                    data-cuelume-press="tick"
                  >
                    <span className="labs-rack-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="labs-rack-name">{lab.title}</span>
                    {SHARED_OUTCOME ? (
                      <span className="labs-rack-check">
                        {lab.contract_rules.length} rules
                      </span>
                    ) : (
                      <span className="labs-rack-check">
                        <i
                          className="labs-rack-led"
                          data-state={verdictState(lab.field_check.outcome)}
                          aria-hidden="true"
                        />
                        {lab.field_check.outcome}
                      </span>
                    )}
                    <span className="labs-rack-meta">
                      Lab {lab.number} · contract v{lab.adopted_in_contract}
                      {SHARED_OUTCOME ? null : <> · {lab.contract_rules.length} rules</>}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Live labs</h2>
          <div className="lab-grid">
          <Link
            href="/labs/poise"
            className="lab-card"
            data-cuelume-hover="tick" data-cuelume-press="tick"
          >
            <div className="lab-card-top">
              <span className="status-badge status-badge--lab">Lab One</span>
              <span className="lab-card-status">Live</span>
            </div>
            <h3 className="lab-card-title">Poise</h3>
            <p className="lab-card-lede">
              How Designesy responds when someone touches it.
            </p>
            <p className="lab-card-desc">
              Restrained interaction: wordmark, press, sound preference, and
              reduced motion, made inspectable against the design system
              contract.
            </p>
            <span className="lab-card-arrow">Open lab →</span>
          </Link>
          <Link
            href="/labs/takt"
            className="lab-card"
            data-cuelume-hover="tick" data-cuelume-press="tick"
          >
            <div className="lab-card-top">
              <span className="status-badge status-badge--lab">Lab Two</span>
              <span className="lab-card-status">Live</span>
            </div>
            <h3 className="lab-card-title">Takt</h3>
            <p className="lab-card-lede">
              How an interface feels under your hands.
            </p>
            <p className="lab-card-desc">
              Concentric radii, press scale, image outlines, hit areas, and
              stagger rhythm as portable rules with exact values, compiled from
              external design intelligence and verified on designesy.org.
            </p>
            <span className="lab-card-arrow">Open lab →</span>
          </Link>
          <Link
            href="/labs/cadence"
            className="lab-card"
            data-cuelume-hover="tick" data-cuelume-press="tick"
          >
            <div className="lab-card-top">
              <span className="status-badge status-badge--lab">Lab Three</span>
              <span className="lab-card-status">Live</span>
            </div>
            <h3 className="lab-card-title">Cadence</h3>
            <p className="lab-card-lede">
              The rhythm of text on a page.
            </p>
            <p className="lab-card-desc">
              Font smoothing, rem-based scale, line-height by role, tracking by
              size, measure, text-wrap, tabular numbers, and selection as
              portable rules with exact values, compiled from external
              typography intelligence and verified on designesy.org.
            </p>
            <span className="lab-card-arrow">Open lab →</span>
          </Link>
          <Link
            href="/labs/acoustics"
            className="lab-card"
            data-cuelume-hover="tick" data-cuelume-press="tick"
          >
            <div className="lab-card-top">
              <span className="status-badge status-badge--lab">Lab Four</span>
              <span className="lab-card-status">Live</span>
            </div>
            <h3 className="lab-card-title">Acoustics</h3>
            <p className="lab-card-lede">
              Interaction sound as a token system.
            </p>
            <p className="lab-card-desc">
              Nineteen cues, nineteen interaction roles, one documented engine.
              The sound parallel to the visual token system: every sound carries a
              token name and rationale. Cuelume v0.2.2, adopted in contract
              v0.3.0.
            </p>
            <span className="lab-card-arrow">Open lab →</span>
          </Link>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Related surfaces</h2>
          <div className="row-stack" role="list">
            {RELATED.map((row, i) => {
              const body = (
                <>
                  <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="row-body">
                    <span className="row-title">{row.title}</span>
                    <span className="row-meta">{row.meta}</span>
                  </span>
                  <span className="row-side">
                    <span className="row-side-line">
                      {row.verdict ? (
                        <span className="row-side-chip" data-state={verdictState(row.verdict)}>
                          {row.verdict}
                        </span>
                      ) : (
                        row.datum
                      )}
                    </span>
                    <span className="row-side-line">{routeLabel(row)}</span>
                    <span className="row-side-arrow" aria-hidden="true">
                      {row.external ? (
                        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 9.5 9.5 2.5M4 2.5h5.5V8" /></svg>
                      ) : null}
                    </span>
                  </span>
                </>
              );
              return (
                <div role="listitem" key={row.href}>
                  {row.external ? (
                    <a
                      href={row.href}
                      className="row"
                      target="_blank"
                      rel="noopener noreferrer"
                      data-cuelume-hover="bloom"
                      data-cuelume-press
                    >
                      {body}
                    </a>
                  ) : (
                    <Link
                      href={row.href}
                      className="row"
                      data-cuelume-hover="bloom"
                      data-cuelume-press
                    >
                      {body}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Lab anatomy</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Package map for a mature Lab. Each cell makes the experiment
            inspectable, reviewable, and promotable into durable rules.
          </p>
          <CheckGrid dense items={checkItemsFromStrings(LAB_ANATOMY)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Promotion rule</h2>
          <div className="definition">
            <p className="definition-label">Core rule</p>
            <p>
              An experiment becomes contract material only after its useful
              behavior is named.
            </p>
          </div>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Before promotion, a Lab records:
          </p>
          <CheckGrid
            items={checkItemsFromStrings([
              'What the artifact tests',
              'What caused the behavior',
              'What it communicates',
              'Where it belongs',
              'What would make it excessive',
              'How it degrades for accessibility, performance, or reduced motion',
            ])}
          />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Lab boundaries</h2>
          <CheckGrid
            items={checkItemsFromStrings(LAB_BOUNDARIES)}
          />
        </section>

        <div className="status-note">
          Labs ship as named experiments with thesis, review status, and
          promotion readiness. Poise is Lab One. Takt is Lab Two. Cadence is
          Lab Three. Acoustics is Lab Four. Future labs follow the same anatomy
          and the site drift rule: every public UI change cites a contract token
          or an open tension.
        </div>
      </main>

      <Footer />
    </>
  );
}
