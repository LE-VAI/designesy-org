import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { CheckGrid } from '../lib/check-grid';
import { checkItemsFromStrings } from '../lib/check-items';
import { pageMeta } from '../lib/site-meta';
import { CONTRACT_VERSION } from '../lib/design-system-contract';
import { AgentActions } from '../lib/agent-actions';
import { designReviewKit } from '../lib/kits/design-review';

export const metadata: Metadata = pageMeta({
  title: 'Review',
  description:
    'Designesy Review: quality gate for interfaces, systems, and agent output. Eight dimensions and public field checks.',
  path: '/review',
  ogDescription:
    'Review leads with consequences instead of personal taste. Eight dimensions and live field checks.',
  twitterDescription: 'Quality gate for public artifacts · designesy.org/review',
});

const DIMENSIONS = [
  { num: '01', title: 'Purpose', desc: 'What is the design trying to make possible? Which elements directly support that purpose? What can be removed without weakening action?' },
  { num: '02', title: 'Clarity', desc: 'Is the primary action discoverable? Does the form suggest use? Do labels, hierarchy, layout, and motion reduce uncertainty?' },
  { num: '03', title: 'Context', desc: 'Where and when will this be used? What constraints shape the experience: device, bandwidth, attention, lighting, language, ability, stress, social setting, maintenance?' },
  { num: '04', title: 'Inclusion', desc: 'Who benefits most? Who has to work harder? What assumptions about body, language, culture, knowledge, money, or technology are embedded?' },
  { num: '05', title: 'System coherence', desc: 'Does this follow an existing system? If it breaks the system, is the reason explicit and worth it? Can others reuse or extend the decision?' },
  { num: '06', title: 'Durability', desc: 'Will this hold up under repeated use? Can it be maintained, repaired, localized, and adapted? Is the need more durable than the trend?' },
  { num: '07', title: 'Delight', desc: 'Does the emotional quality clarify purpose, trust, identity, learning, or human connection? Or does it distract from weak function?' },
  { num: '08', title: 'Responsibility', desc: 'What environmental, economic, social, or human costs are hidden? Does the design distribute effort fairly? What would make it more honest?' },
];

const STANDARD =
  'The artifact should feel considered after it becomes functional.';

// "Review against": each row's side is the version that carries its rules.
const REVIEW_AGAINST = [
  {
    href: '/contracts/design-system',
    title: 'Design system contract',
    meta: 'Human home and machine export · Poise + Takt + Cadence + Acoustics',
    side: CONTRACT_VERSION,
  },
  {
    href: '/labs/poise',
    title: 'Lab One · Poise',
    meta: 'Restrained interaction',
    side: 'adopted v0.1.1',
  },
  {
    href: '/labs/takt',
    title: 'Lab Two · Takt',
    meta: 'Interface feel',
    side: 'adopted v0.1.2',
  },
  {
    href: '/labs/cadence',
    title: 'Lab Three · Cadence',
    meta: 'Text rhythm',
    side: 'adopted v0.1.3',
  },
  {
    href: '/labs/acoustics',
    title: 'Lab Four · Acoustics',
    meta: 'Interaction sound',
    side: 'adopted v0.3.0',
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Runnable package of these dimensions',
    side: `Kit v${designReviewKit.version}`,
  },
];

const REVIEW_CHECKS = [
  'Separate observed behavior from derived judgment',
  'Name tradeoffs',
  'Identify hidden burdens',
  'Check missing states',
  'Verify accessibility, responsiveness, keyboard flow',
  'Check persistence, performance, and source provenance',
  'Recommend concrete corrections',
];

export default function ReviewPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Quality gate</p>
          <h1 className="surface-title" data-scramble>Review</h1>
          <p className="surface-lede">
            Review leads with consequences and evidence.
          </p>
          <p className="surface-note">
            Designesy Review is the quality-control layer for interfaces,
            products, artifacts, identity systems, design systems, agent output,
            and environmental or experiential design. It evaluates purpose,
            clarity, context, inclusion, system coherence, durability, delight,
            responsibility, and verification proof.
          </p>
          <AgentActions mdPath="/review.md" label="the review index" />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Review dimensions</h2>
          <div className="principle-list">
            {DIMENSIONS.map((d) => (
              <div className="principle" key={d.num}>
                <span className="principle-num">{d.num}</span>
                <div className="principle-body">
                  <h3>{d.title}</h3>
                  <p>{d.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Agent review stance</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Peer checks for agents and reviewers.
          </p>
          <CheckGrid items={checkItemsFromStrings(REVIEW_CHECKS)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Quality bar</h2>
          <div className="definition definition-split" data-copy={STANDARD} data-copy-label="standard">
            <div className="definition-face">
              <p className="definition-label">Standard</p>
              <p>{STANDARD}</p>
            </div>
            <div className="definition-side">
              <span className="row-side-chip" data-state="pass">
                Considered
              </span>
              <dl>
                <div>
                  <dt>Baseline</dt>
                  <dd>Functional</dd>
                </div>
                <div>
                  <dt>Checked</dt>
                  <dd>{DIMENSIONS.length} dimensions</dd>
                </div>
                <div>
                  <dt>Method</dt>
                  <dd>Kit One v{designReviewKit.version}</dd>
                </div>
              </dl>
            </div>
          </div>
          <p className="surface-note">
            Functional is the baseline. Considered is the bar. An artifact is
            ready when every dimension above has been checked, tradeoffs have
            been named, and the remaining tensions are documented in the open.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Field checks</h2>
          <div className="field-grid" style={{ maxWidth: '100%' }}>
            <Link
              href="/review/poise"
              className="lab-card"
              data-cuelume-hover="tick"
              data-cuelume-press
            >
              <div className="lab-card-top">
                <span className="status-badge status-badge--lab">Lab One</span>
                <span className="lab-card-status">Pass with notes</span>
              </div>
              <h3 className="lab-card-title">Poise</h3>
              <p className="lab-card-lede">
                Kit One output format on the live lab.
              </p>
              <p className="lab-card-desc">
                Eight dimensions, holds, tensions, corrections, and
                keyboard-path proof, with rules adopted into contract v0.1.1.
              </p>
              <span className="lab-card-arrow">Open field check →</span>
            </Link>
            <Link
              href="/review/takt"
              className="lab-card"
              data-cuelume-hover="tick"
              data-cuelume-press
            >
              <div className="lab-card-top">
                <span className="status-badge status-badge--lab">Lab Two</span>
                <span className="lab-card-status">Pass with notes</span>
              </div>
              <h3 className="lab-card-title">Takt</h3>
              <p className="lab-card-lede">
                Kit One output format on the interface-feel lab.
              </p>
              <p className="lab-card-desc">
                Radii, press scale, outlines, hit areas, and stagger: five takt
                rules adopted into contract v0.1.2.
              </p>
              <span className="lab-card-arrow">Open field check →</span>
            </Link>
            <Link
              href="/review/cadence"
              className="lab-card"
              data-cuelume-hover="tick"
              data-cuelume-press
            >
              <div className="lab-card-top">
                <span className="status-badge status-badge--lab">Lab Three</span>
                <span className="lab-card-status">Pass with notes</span>
              </div>
              <h3 className="lab-card-title">Cadence</h3>
              <p className="lab-card-lede">
                Kit One output format on the text rhythm lab.
              </p>
              <p className="lab-card-desc">
                Font smoothing, scale, leading, tracking, measure, text-wrap,
                tabular numbers, and selection: 10 cadence rules adopted into
                contract v0.1.3.
              </p>
              <span className="lab-card-arrow">Open field check →</span>
            </Link>
            <Link
              href="/review/acoustics"
              className="lab-card"
              data-cuelume-hover="tick"
              data-cuelume-press
            >
              <div className="lab-card-top">
                <span className="status-badge status-badge--lab">Lab Four</span>
                <span className="lab-card-status">Pass with notes</span>
              </div>
              <h3 className="lab-card-title">Acoustics</h3>
              <p className="lab-card-lede">
                Kit One output format on the interaction sound lab.
              </p>
              <p className="lab-card-desc">
                Nineteen cues, nineteen roles, Cuelume v0.2.2: nine acoustic
                mapping rules adopted into contract v0.3.0.
              </p>
              <span className="lab-card-arrow">Open field check →</span>
            </Link>
            <Link
              href="/review/designesy-org"
              className="lab-card"
              data-cuelume-hover="tick"
              data-cuelume-press
            >
              <div className="lab-card-top">
                <span className="status-badge">Public surface</span>
                <span className="lab-card-status">Live</span>
              </div>
              <h3 className="lab-card-title">designesy.org</h3>
              <p className="lab-card-lede">
                Public review against design system contract {CONTRACT_VERSION}.
              </p>
              <p className="lab-card-desc">
                Holds, tensions, and standing rules for the live site, including
                Poise, Takt, Cadence, and Acoustics.
              </p>
              <span className="lab-card-arrow">Open review →</span>
            </Link>
            <Link
              href="/review/keyboard"
              className="lab-card"
              data-cuelume-hover="tick"
              data-cuelume-press
            >
              <div className="lab-card-top">
                <span className="status-badge">Verification</span>
                <span className="lab-card-status">Holds</span>
              </div>
              <h3 className="lab-card-title">Keyboard path</h3>
              <p className="lab-card-lede">
                Site-wide skip link, tab order, and focus-visible proof.
              </p>
              <p className="lab-card-desc">
                Shared chrome packet for every public route, complementing the
                Lab One keyboard path.
              </p>
              <span className="lab-card-arrow">Open keyboard path →</span>
            </Link>
          </div>
          <p className="surface-note" style={{ marginTop: '1.25rem' }}>
            Field checks publish when an artifact is live enough to judge.
            Empty slots are not advertised as upcoming reviews.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Use this as a kit</h2>
          <Link
            href="/kits/design-review"
            className="lab-card is-split"
            data-cuelume-hover="tick"
            data-cuelume-press
          >
            <div className="lab-card-panes">
              <div className="lab-card-face">
                <div className="lab-card-top">
                  <span className="status-badge status-badge--kit">Kit One</span>
                </div>
                <h3 className="lab-card-title">Design Review</h3>
                <p className="lab-card-lede">
                  Portable package of these dimensions for agents and teams.
                </p>
                <p className="lab-card-desc">
                  Prompt, output format, verification, and anti-patterns, ready
                  to hand off as a shareable path.
                </p>
                <span className="lab-card-arrow">
                  Open kit <span aria-hidden="true">→</span>
                </span>
              </div>
              {/* Read from the kit record /kits/design-review.json serves, so
                  the card cannot drift from the package. */}
              <dl className="lab-card-side">
                <div>
                  <dt>Status</dt>
                  <dd>Live</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>v{designReviewKit.version}</dd>
                </div>
                <div>
                  <dt>Dimensions</dt>
                  <dd>{designReviewKit.dimensions.length}</dd>
                </div>
                <div>
                  <dt>Permission</dt>
                  <dd>{designReviewKit.permission.split(' · ')[0]}</dd>
                </div>
                <div>
                  <dt>Machine export</dt>
                  <dd>design-review.json</dd>
                </div>
              </dl>
            </div>
          </Link>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Review against</h2>
          <div className="row-stack" role="list">
            {REVIEW_AGAINST.map((item, i) => (
              <div role="listitem" key={item.href}>
                <Link
                  href={item.href}
                  className="row"
                  data-cuelume-hover="whisper"
                  data-cuelume-press
                >
                  <span className="row-index">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="row-body">
                    <span className="row-title">{item.title}</span>
                    <span className="row-meta">{item.meta}</span>
                  </span>
                  <span className="row-side">
                    <span className="row-side-line">{item.side}</span>
                    <span className="row-side-arrow" aria-hidden="true" />
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </section>

        <div className="status-note">
          Review language and quality discipline for public artifacts. Published
          reviews live under /review. Field checks for Poise, Takt, Cadence,
          Acoustics, the public surface, and keyboard paths judge against the
          live contract.
        </div>
      </main>

      <Footer />
    </>
  );
}