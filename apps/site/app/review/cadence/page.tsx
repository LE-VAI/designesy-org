import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { ToggleRow } from '../../lib/toggle-row';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Cadence field check',
  description:
    'Public Design Review of Lab Three · Cadence — Kit One output format: eight dimensions, holds, tensions, corrections, and verification.',
  path: '/review/cadence',
  ogTitle: 'Cadence · field check',
  ogDescription:
    'Lab Three reviewed with Use Kit One · Design Review. Pass with notes — typography rules adopted in contract v0.1.3.',
  twitterDescription: 'Design Review of Lab Three — designesy.org/review/cadence',
});

const DIMENSIONS = [
  {
    num: '01',
    title: 'Purpose',
    observation:
      'Cadence states a single job: make text feel composed, not placed. The live artifact (this page), thesis, principles, portable rules, builder prompt, checklist, provenance, and anti-patterns all serve that job.',
    judgment:
      'Purpose is clear and earns the form. The lab is not a typography essay; it is an inspectable set of rules with exact values verified on live CSS.',
    action: 'Keep. Do not add decorative typography demos that dilute the rules.',
  },
  {
    num: '02',
    title: 'Clarity',
    observation:
      'Primary path is immediate: Lab Three eyebrow, title Cadence, lede, then the live artifact note (this page is the demo). Every rule is expressed with an exact value, not a preference.',
    judgment:
      'Primary value proposition is discoverable. Form suggests use. Each principle pairs explanation with concrete CSS values.',
    action: 'Keep. Preserve exact-value callouts next to every rule.',
  },
  {
    num: '03',
    title: 'Context',
    observation:
      'Built for the public designesy.org surface — dark foundation, system font stack, shared topbar. The lab assumes desktop and mobile browsers; long anatomy sections still ask for scroll patience on small screens.',
    judgment:
      'Context fits a public lab. Dense doctrine below the fold is acceptable; the live artifact is the page itself, so the demo is always visible.',
    action:
      'Document. Keep demo-first on narrow widths. No decorative font demos until contracted.',
  },
  {
    num: '04',
    title: 'Inclusion',
    observation:
      'Rem-based scale respects user font-size preferences. 16px input floor prevents iOS auto-zoom. text-wrap: pretty improves readability across viewports. font-synthesis: none is not yet set — a gap that affects users on browsers that synthesize fake weights.',
    judgment:
      'Structural inclusion is strong for scale and input sizing. The font-synthesis gap is a real inclusion tension — fake weights reduce readability for users without the named faces.',
    action:
      'Add font-synthesis: none to :root in globals.css. Document as a correction, not a future note.',
  },
  {
    num: '05',
    title: 'System coherence',
    observation:
      'Values cite contract tokens: --signal for ::selection, --maxw for measure, system stack for body. The typography block in the contract already documents the scale. Cadence extends the system without inventing a second font family.',
    judgment:
      'Strong coherence. Cadence refines the existing typography block without introducing new tokens or fonts. Adoption is explicit.',
    action:
      'Keep lab demo, contract.typography, and live CSS synchronized after adoption.',
  },
  {
    num: '06',
    title: 'Durability',
    observation:
      'Full lab anatomy is present. Builder prompt is remixable. Rules are system-agnostic — express in any styling system. The system stack is the contract; no web font dependency to maintain.',
    judgment:
      'Durable as a lab package and as contract material. Risk is dual-source drift if contract.typography and live CSS diverge later.',
    action:
      'When any typography value changes, update live CSS, lab notes, and contract.typography together.',
  },
  {
    num: '07',
    title: 'Delight',
    observation:
      'text-wrap: balance on headings and pretty on body add quiet polish — the browser handles line breaking without JavaScript. ::selection styled with signal blue makes every selection feel intentional. Tabular numbers make data feel precise.',
    judgment:
      'Delight is earned through composition, not decoration. The cadence of text is the delight — no glow, animation, or spectacle needed.',
    action: 'Keep restraint. Reject decorative typography proposals that fail the thesis.',
  },
  {
    num: '08',
    title: 'Responsibility',
    observation:
      'No dark pattern in typography. Rem-based scale respects user preferences. 16px input floor is a real accessibility protection. Open tensions are documented honestly: font-synthesis, logical properties, and underline-from-font are named as gaps, not hidden.',
    judgment:
      'Honest about status: live experiment whose rules are now contract material, with three named open tensions. That honesty is a responsibility hold.',
    action:
      'Keep status language accurate. Future rule changes require a new contract version, not silent edits.',
  },
];

const HOLDS = [
  'Thesis is sharp: text rhythm is composed, not placed',
  'Live artifact is the page itself — every rule is visible as you read',
  '10 verified rules with exact values — not preferences',
  'Full lab anatomy shipped (thesis through verification)',
  'Public name is human and premium — Cadence, not "typography-system-v1"',
  'Typography rules adopted into design system contract v0.1.3',
  'Open tensions named honestly — font-synthesis, logical properties, underline-from-font',
];

const TENSIONS = [
  {
    title: 'font-synthesis: none not set',
    meta: 'Browser may synthesize fake weights when the named face is unavailable — reduces readability',
  },
  {
    title: 'No logical properties',
    meta: 'margin-left, padding-right used instead of margin-inline, padding-inline — direction-ready is blocked',
  },
  {
    title: 'text-underline-position and skip-ink not set',
    meta: 'Underlines do not align to font metrics or skip descenders — affects link readability',
  },
  {
    title: 'Inter not self-hosted',
    meta: 'Named in the system stack but not bundled — system fallback is intentional, but self-hosting remains a future option',
  },
];

const CORRECTIONS = [
  {
    title: 'Add font-synthesis: none to :root',
    meta: 'Prevents the browser from synthesizing fake weights — one line in globals.css',
  },
  {
    title: 'Add text-underline-position: from-font and text-decoration-skip-ink: auto',
    meta: 'Aligns underlines to font metrics and skips descenders — improves link readability',
  },
  {
    title: 'Migrate physical properties to logical ones',
    meta: 'Replace margin-left/padding-right with margin-inline/padding-inline for direction-ready layouts',
  },
  {
    title: 'Version future typography changes',
    meta: 'New type rules require a contract bump after v0.1.3 — not silent edits',
  },
  {
    title: 'Keep machine export and human tables aligned',
    meta: 'design-system.json and /contracts must show the same adopted cadence rules',
  },
];

const VERIFICATION = [
  'Live route inspected: /labs/cadence structure, demo blocks, status language',
  'Live CSS audit (48,755 bytes) — font smoothing, line-heights, letter-spacing, text-wrap, tabular-nums, ::selection, user-select all parsed',
  'Compared to design system contract v0.1.2 typography block',
  'Compared to Use Kit One · Design Review output format',
  'Checked anti-patterns: no px font sizes, no decorative display fonts, no default ::selection',
  'Checked naming: Cadence remains human product language',
  '10 rules verified pass, 3 rules verified fail (open tensions documented)',
  'Mobile: 16px root, rem-based scale, text-wrap: pretty confirmed',
];

const SOURCES = [
  {
    href: '/labs/cadence',
    title: 'Lab Three · Cadence',
    meta: 'Artifact under review',
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Method and output format',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract v0.1.2',
    meta: 'Governing tokens · typography block',
  },
  {
    href: 'https://github.com/jakubkrehel/skills',
    title: 'Krehel /better-typography',
    meta: '18 typography principles (MIT) — source material',
  },
  {
    href: '/review/poise',
    title: 'Field check · Poise',
    meta: 'Prior field check pattern (Lab One)',
  },
  {
    href: '/review',
    title: 'Review surface',
    meta: 'Eight dimensions doctrine',
  },
];

export default function CadenceFieldCheckPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/review" className="lab-crumb">
              Review
            </Link>
            <span aria-hidden="true"> · </span>
            Field check
          </p>
          <h1 className="surface-title" data-scramble>Cadence</h1>
          <p className="surface-lede">
            Lab Three reviewed with Use Kit One · Design Review.
          </p>
          <p className="surface-note">
            This packet applies the public Design Review kit to a live
            experiment — not the whole site. Outcome leads with consequences:
            what holds, what stays open, and what to do next.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Pass with notes</span>
            <span className="lab-meta-item">Kit · Design Review</span>
            <span className="lab-meta-item">Artifact · /labs/cadence</span>
            <span className="lab-meta-item">Date · 2026-07-13</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="summary">
          <h2 className="doctrine-heading">Summary</h2>
          <div className="definition">
            <p className="definition-label">Outcome · pass with notes</p>
            <p>
              Cadence is a considered lab. The live CSS audit confirms 10 of 13
              verifiable typography rules: font smoothing on root, rem-based
              scale, line-height by role, tracking by size, measure cap,
              text-wrap balance and pretty, tabular numbers, ::selection with
              signal blue, user-select on UI chrome, and 16px input floor.
              Three rules are not yet set in CSS: font-synthesis: none,
              text-underline-position: from-font, and logical properties.
              These are documented as open tensions and corrections — not
              hidden. Full anatomy is present. Typography rules are adopted
              into design system contract v0.1.3. Remaining work is three CSS
              additions and synchronization — not re-arguing adoption.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="inputs">
          <h2 className="doctrine-heading">Inputs used</h2>
          <div className="row-stack" role="list">
            <ToggleRow index="01">
              <span className="row-body">
                <span className="row-title">Artifact</span>
                <span className="row-meta">
                  https://www.designesy.org/labs/cadence
                </span>
              </span>
            </ToggleRow>
            <ToggleRow index="02">
              <span className="row-body">
                <span className="row-title">Purpose claim</span>
                <span className="row-meta">
                  Make text feel composed rather than placed
                </span>
              </span>
            </ToggleRow>
            <ToggleRow index="03">
              <span className="row-body">
                <span className="row-title">Audience and context</span>
                <span className="row-meta">
                  Public builders, agents, and reviewers on designesy.org
                </span>
              </span>
            </ToggleRow>
            <ToggleRow index="04">
              <span className="row-body">
                <span className="row-title">Governing rules</span>
                <span className="row-meta">
                  Contract v0.1.2 · Kit One Design Review · Krehel /better-typography
                </span>
              </span>
            </ToggleRow>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="dimensions">
          <h2 className="doctrine-heading">Dimension findings</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Each dimension: observation, judgment, action — Kit One format.
          </p>
          <div className="principle-list">
            {DIMENSIONS.map((d) => (
              <div className="principle" key={d.num}>
                <span className="principle-num">{d.num}</span>
                <div className="principle-body">
                  <h3>{d.title}</h3>
                  <p>
                    <strong style={{ color: 'var(--muted)' }}>Observation.</strong>{' '}
                    {d.observation}
                  </p>
                  <p style={{ marginTop: '0.45rem' }}>
                    <strong style={{ color: 'var(--muted)' }}>Judgment.</strong>{' '}
                    {d.judgment}
                  </p>
                  <p
                    style={{
                      marginTop: '0.45rem',
                      color: 'var(--muted-dim)',
                    }}
                  >
                    Action · {d.action}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="holds">
          <h2 className="doctrine-heading">Holds</h2>
          <CheckGrid items={checkItemsFromStrings(HOLDS)} />
        </section>

        <section className="doctrine-section fade-up" id="tensions">
          <h2 className="doctrine-heading">Tensions</h2>
          <CheckGrid items={TENSIONS} />
        </section>

        <section className="doctrine-section fade-up" id="corrections">
          <h2 className="doctrine-heading">Corrections</h2>
          <CheckGrid items={CORRECTIONS} />
        </section>

        <section className="doctrine-section fade-up" id="verification">
          <h2 className="doctrine-heading">Verification performed</h2>
          <CheckGrid items={checkItemsFromStrings(VERIFICATION)} />
        </section>

        <section className="doctrine-section fade-up" id="sources">
          <h2 className="doctrine-heading">Sources used</h2>
          <div className="row-stack" role="list">
            {SOURCES.map((item, i) => (
              <Link
                key={item.href}
                href={item.href}
                className="row"
                role="listitem"
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
              </Link>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Related</h2>
          <div className="row-stack" role="list">
            <Link
              href="/labs/cadence"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Open Lab Three · Cadence</span>
                <span className="row-meta">Live artifact</span>
              </span>
            </Link>
            <Link
              href="/labs/takt"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Lab Two · Takt</span>
                <span className="row-meta">Prior field check pattern</span>
              </span>
            </Link>
            <Link
              href="/kits/design-review"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Use Kit One · Design Review</span>
                <span className="row-meta">Run the same method on your work</span>
              </span>
            </Link>
          </div>
        </section>

        <div className="status-note">
          Field check of Lab Three · Cadence using Use Kit One · Design Review.
          Outcome: pass with notes. Institutional quality discipline — not a
          client report. Typography rules are adopted into contract v0.1.3;
          remaining notes are three CSS additions and synchronization.
        </div>
      </main>

      <Footer />
    </>
  );
}