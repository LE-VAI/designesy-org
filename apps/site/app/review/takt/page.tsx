import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { ToggleRow } from '../../lib/toggle-row';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Takt field check',
  description:
    'Public Design Review of Lab Two · Takt — Kit One output format: eight dimensions, holds, tensions, corrections, and verification. Interface feel rules adopted into contract v0.1.2.',
  path: '/review/takt',
  ogTitle: 'Takt · field check',
  ogDescription:
    'Lab Two reviewed with Use Kit One · Design Review. Pass with notes — takt rules adopted in contract v0.1.2.',
  twitterDescription: 'Design Review of Lab Two — designesy.org/review/takt',
});

const DIMENSIONS = [
  {
    num: '01',
    title: 'Purpose',
    observation:
      'Takt states a single job: make interfaces feel built rather than rendered. Five principles with exact values (concentric radii, press scale, image outlines, hit areas, stagger rhythm) all serve that job. The live artifact is the page itself — every interactive surface demonstrates the rules.',
    judgment:
      'Purpose is clear and self-demonstrating. The lab is an inspectable compilation of interface-feel rules with provenance.',
    action: 'Keep. Do not add decorative demos that dilute the exact-value thesis.',
  },
  {
    num: '02',
    title: 'Clarity',
    observation:
      'Primary path is immediate: Lab Two eyebrow, title Takt, lede, then principles with exact values. Each principle has a bold title and a one-sentence body with the exact number. Portable contract section lists all 8 rules as toggleable rows. Builder prompt is one-click copyable.',
    judgment:
      'Primary action is discoverable. Every rule has its exact value visible — 0.96, 44px, 100ms, 0.1 opacity. No vague language. Hierarchy reduces uncertainty.',
    action: 'Keep. Preserve exact-value callouts in every principle body.',
  },
  {
    num: '03',
    title: 'Context',
    observation:
      'Built for the public designesy.org surface — dark foundation, shared topbar, institutional voice. Rules are system-agnostic (expressed in values, not framework). Remix notes explicitly state the rules work in Tailwind, plain CSS, or CSS-in-JS.',
    judgment:
      'Context fits a public lab with cross-system applicability. The exact-value approach means rules travel — they are not locked to a framework.',
    action:
      'Keep system-agnostic framing. Do not tie rules to a specific framework in future versions.',
  },
  {
    num: '04',
    title: 'Inclusion',
    observation:
      'Hit area rule (44px touch, 40px desktop) is explicit and verified on live nav links. Stagger rule includes "skip on page load" — no unsolicited motion on first render. will-change is restricted to transform/opacity/filter only, preventing GPU layer abuse on low-end devices. Reduced-motion handling exists on the parent site.',
    judgment:
      'Structural inclusion is real for touch, performance, and motion sensitivity. The 44px floor is a WCAG-adjacent commitment.',
    action:
      'Keep hit area floor explicit. Verify on mobile viewport when a keyboard-path packet is published.',
  },
  {
    num: '05',
    title: 'System coherence',
    observation:
      'Live CSS confirms: --radius (6px) and --radius-sm (4px) are the only radius tokens. Concentric rule holds — card padding (4px) + inner radius (2px) = outer (6px). Press scales match: scale(0.96) on check-cells, scale(0.985) on pillars and rows (softer for longer surfaces). No transition:all anywhere in the stylesheet. will-change appears only as transform and transform,opacity. Fade-up stagger uses 80ms increments (delay-1 through delay-5). All transitions name specific properties.',
    judgment:
      'Strong coherence. Takt rules describe what the live site already does — the lab codifies existing practice. Press scale variants (0.96 for tight controls, 0.985 for larger surfaces) are a deliberate calibration, not inconsistency.',
    action:
      'Promote both press-scale variants into contract v0.1.2: 0.96 for cells/buttons, 0.985 for cards/rows.',
  },
  {
    num: '06',
    title: 'Durability',
    observation:
      'Full lab anatomy is present: thesis, principles, portable contract, builder prompt, review checklist, provenance, anti-patterns, remix notes, anatomy coverage, verification, field check link. Rules have exact values that do not degrade — 0.96 is 0.96 regardless of framework or year. Builder prompt is copyable and self-contained.',
    judgment:
      'Durable as a lab package and as contract material. Rules are value-precise, not trend-dependent. Risk is the same dual-source drift as Poise: if contract tables and live CSS diverge.',
    action:
      'When any takt value changes, update live CSS, lab notes, and contract.takt together.',
  },
  {
    num: '07',
    title: 'Delight',
    observation:
      'The page itself is the demonstration — staggered fade-up sections, press feedback on every toggle, check-grid cells that respond. No glow, bounce, or particle effects. Emotional quality comes from precision: exact values, visible numbers, credited provenance.',
    judgment:
      'Delight is earned through precision, not decoration. The interface-feel rules produce a surface that feels assembled because the numbers are right.',
    action: 'Keep exact-value framing. Reject proposals that add spectacle to substitute for wrong numbers.',
  },
  {
    num: '08',
    title: 'Responsibility',
    observation:
      'Provenance is explicit: rules compiled from external sources (Amicro @SubhanHQ, Krehel /better-ui MIT) and cross-referenced against contract v0.1.1. No rule is claimed as original when it is compiled. External sources are credited. Anti-patterns section prevents the rules from becoming hidden doctrine.',
    judgment:
      'Provenance and status are explicit: a compilation lab whose rules are now contract material. External sources are credited. The adoption path is public.',
    action:
      'Keep provenance current. If new rules are added from external sources, credit them. Future rule changes require a contract bump.',
  },
];

const HOLDS = [
  'Concentric radii verified: --radius 6px, --radius-sm 4px, padding 4px, inner 2px — outerRadius = innerRadius + padding holds',
  'Press scale 0.96 on check-grid cells, 0.985 on pillars and rows — both above 0.95 floor',
  'No transition:all in the entire stylesheet — every transition names its properties',
  'will-change restricted to transform and transform,opacity — no will-change:all',
  'Stagger rhythm: fade-up-delay-1 through delay-5 at 80ms increments (~100ms order)',
  'Hit area floor: all nav links and controls ≥ 40×40px desktop',
  'Outline (not border) on focus-visible: 2px solid var(--signal-light)',
  'Full lab anatomy present with external provenance credited',
];

const TENSIONS = [
  {
    title: 'Image outline rule unverified',
    meta: '1px outline at 0.1 opacity on images — site has no image surfaces to test against yet',
  },
  {
    title: 'Hit area on mobile unverified',
    meta: '44px touch floor needs mobile viewport testing — desktop 40px confirmed only',
  },
  {
    title: 'Press scale has two variants',
    meta: '0.96 for tight controls, 0.985 for larger surfaces — deliberate but needs contract documentation',
  },
  {
    title: 'Dual-source drift risk after adoption',
    meta: 'Live CSS, lab copy, and contract.takt must stay synchronized after v0.1.2',
  },
];

const CORRECTIONS = [
  {
    title: 'Promote takt rules into contract v0.1.2',
    meta: 'Concentric radii, press scale (0.96/0.985), no transition:all, spare will-change, stagger rhythm, hit area floor',
  },
  {
    title: 'Document press scale variants in contract',
    meta: '0.96 for cells/buttons, 0.985 for cards/rows — both are takt, not inconsistency',
  },
  {
    title: 'Verify image outline rule when image surfaces ship',
    meta: 'Add 1px outline at 0.1 opacity (pure white on dark) to any future image surface',
  },
  {
    title: 'Publish mobile hit area verification',
    meta: 'Test 44px touch floor on mobile viewport when keyboard-path packet expands',
  },
  {
    title: 'Keep machine export and human tables aligned',
    meta: 'design-system.json and /contracts must show the same takt rules after v0.1.2',
  },
];

const VERIFICATION = [
  'Live CSS audited: 47,680 bytes, all transitions, scales, will-change, radii, outlines parsed',
  'Concentric radii: --radius 6px, --radius-sm 4px, padding 4px — outerRadius = innerRadius + padding confirmed',
  'Press scale: scale(0.96) on check-cells, scale(0.985) on pillars/rows — both above 0.95 floor',
  'No transition:all found — every transition names specific properties (background, transform, color, opacity, border-color)',
  'will-change: only transform and transform,opacity — no will-change:all or permanent will-change',
  'Stagger: fade-up-delay-1 through delay-5 at 80ms increments (0.08s, 0.16s, 0.24s, 0.32s, 0.4s)',
  'Focus-visible: 2px solid var(--signal-light) outline, not border',
  'Hit area: nav links and controls ≥ 40×40px on desktop (mobile untested)',
  'Compared to Use Kit One · Design Review output format',
  'Cross-referenced against design system contract tokens; adopted into v0.1.2',
];

const SOURCES = [
  {
    href: '/labs/takt',
    title: 'Lab Two · Takt',
    meta: 'Artifact under review',
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Method and output format',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract v0.4.0',
    meta: 'Governing tokens · takt rules adopted in v0.1.2',
  },
  {
    href: '/labs/poise',
    title: 'Lab One · Poise',
    meta: 'Prior lab — motion restraint, same anatomy pattern',
  },
  {
    href: '/review/poise',
    title: 'Field check · Poise',
    meta: 'Prior field check — pass with notes, adopted in v0.1.1',
  },
  {
    href: '/review',
    title: 'Review surface',
    meta: 'Eight dimensions doctrine',
  },
];

export default function TaktFieldCheckPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/review" className="lab-crumb">
              Review
            </Link>
            <span aria-hidden="true"> · </span>
            Field check
          </p>
          <h1 className="surface-title">Takt</h1>
          <p className="surface-lede">
            Lab Two reviewed with Use Kit One · Design Review.
          </p>
          <p className="surface-note">
            This packet applies the public Design Review kit to Lab Two —
            interface feel as portable rules with exact values. The live CSS
            was parsed and every takt rule was verified against the actual
            stylesheet. Outcome leads with consequences.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Pass with notes</span>
            <span className="lab-meta-item">Kit · Design Review</span>
            <span className="lab-meta-item">Artifact · /labs/takt</span>
            <span className="lab-meta-item">Date · 2026-07-13</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="summary">
          <h2 className="doctrine-heading">Summary</h2>
          <div className="definition">
            <p className="definition-label">Outcome · pass with notes</p>
            <p>
              Takt is a considered lab. The live CSS confirms every rule: no
              transition:all, will-change restricted to transform/opacity, press
              scale 0.96 on cells and 0.985 on larger surfaces, concentric
              radii holding, stagger at 80ms increments. The lab codifies what
              the site already does. Two rules remain unverified (image
              outlines — no image surfaces yet; mobile hit area — desktop
              only). Five rules are promoted into contract v0.1.2. Remaining
              work is verification and synchronization, not re-argument.
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
                  https://www.designesy.org/labs/takt + live CSS audit
                </span>
              </span>
            </ToggleRow>
            <ToggleRow index="02">
              <span className="row-body">
                <span className="row-title">Purpose claim</span>
                <span className="row-meta">
                  Make interfaces feel built rather than rendered through
                  exact-value rules
                </span>
              </span>
            </ToggleRow>
            <ToggleRow index="03">
              <span className="row-body">
                <span className="row-title">Audience and context</span>
                <span className="row-meta">
                  Public builders, agents, and reviewers on designesy.org —
                  system-agnostic rules for any styling framework
                </span>
              </span>
            </ToggleRow>
            <ToggleRow index="04">
              <span className="row-body">
                <span className="row-title">Governing rules</span>
                <span className="row-meta">
                  Contract v0.1.2 · Kit One Design Review · takt lab
                  anti-patterns
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
                data-cuelume-hover="bloom"
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
              href="/labs/takt"
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Open Lab Two · Takt</span>
                <span className="row-meta">Live artifact</span>
              </span>
            </Link>
            <Link
              href="/kits/design-review"
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Use Kit One · Design Review</span>
                <span className="row-meta">Run the same method on your work</span>
              </span>
            </Link>
            <Link
              href="/review/poise"
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Field check · Poise</span>
                <span className="row-meta">Prior lab review — pass with notes</span>
              </span>
            </Link>
          </div>
        </section>

        <div className="status-note">
          Field check of Lab Two · Takt using Use Kit One · Design Review.
          Outcome: pass with notes. Live CSS confirms every verifiable rule.
          Five takt rules adopted into contract v0.1.2. Remaining notes are
          image-outline and mobile-hit-area verification, and synchronization
          after adoption.
        </div>
      </main>

      <Footer />
    </>
  );
}