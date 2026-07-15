import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { ToggleRow } from '../../lib/toggle-row';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Poise field check',
  description:
    'Public Design Review of Lab One · Poise — Kit One output format: eight dimensions, holds, tensions, corrections, and verification.',
  path: '/review/poise',
  ogTitle: 'Poise · field check',
  ogDescription:
    'Lab One reviewed with Use Kit One · Design Review. Pass with notes — interaction rules adopted in contract v0.1.1.',
  twitterDescription: 'Design Review of Lab One — designesy.org/review/poise',
});

const DIMENSIONS = [
  {
    num: '01',
    title: 'Purpose',
    observation:
      'Poise states a single job: make contact feel intentional. Live demo, thesis, principle, portable rules, prompt, checklist, provenance, and anti-patterns all serve that job.',
    judgment:
      'Purpose is clear and earns the form. The page is not a gallery of effects; it is an inspectable experiment.',
    action: 'Keep. Do not add decorative demos that dilute the thesis.',
  },
  {
    num: '02',
    title: 'Clarity',
    observation:
      'Primary path is immediate: Lab One eyebrow, title Poise, lede, then live artifact. Wordmark, press, sound, and reduced-motion blocks are labeled with tokens.',
    judgment:
      'Primary action is discoverable. Form suggests use. Hierarchy reduces uncertainty without competing chrome.',
    action: 'Keep. Preserve token callouts next to each control.',
  },
  {
    num: '03',
    title: 'Context',
    observation:
      'Built for the public designesy.org surface — dark foundation, shared topbar, institutional voice. Demo assumes desktop and mobile browsers; long anatomy sections still ask for scroll patience on small screens.',
    judgment:
      'Context fits a public lab. Dense doctrine below the fold is acceptable; the live artifact stays above the scroll of judgment.',
    action:
      'Document. Keep demo first on narrow widths. No second accent or light theme until contracted.',
  },
  {
    num: '04',
    title: 'Inclusion',
    observation:
      'prefers-reduced-motion collapses non-essential animation. Sound is opt-in and defaults off under reduced motion. Buttons are standard controls with focus-visible from the system. Keyboard-path verification for Poise is published at /review/poise/keyboard.',
    judgment:
      'Structural inclusion is real for motion, sound, and keyboard proof on this lab. Site-wide route packets remain open — this packet covers Poise only.',
    action:
      'Keep the Poise keyboard artifact current when controls change. Expand to other routes as separate packets, not silent claims.',
  },
  {
    num: '05',
    title: 'System coherence',
    observation:
      'Values cite contract tokens: --signal, ease-out, ease-in-out, 160ms press, opacity-only wordmark breath. Kind language matches lab mark (circle). Portable rules are adopted into design system contract v0.1.1.',
    judgment:
      'Strong coherence. Poise extends the system without inventing a second accent family or monogram. Adoption is explicit.',
    action:
      'Keep lab demo, contract.interaction, and live CSS synchronized after adoption.',
  },
  {
    num: '06',
    title: 'Durability',
    observation:
      'Full lab anatomy is present. Builder prompt is remixable. Behaviors are named and adopted into contract rules. Preference storage for sound is site-owned; audio engine only applies it.',
    judgment:
      'Durable as a lab package and as contract material. Risk is dual-source drift if contract tables and live CSS diverge later.',
    action:
      'When any Poise token changes, update live CSS, lab notes, and contract.interaction together.',
  },
  {
    num: '07',
    title: 'Delight',
    observation:
      'Wordmark breath and short press settle add finish. No glow, bounce, particle trail, or unsolicited sound. Emotional quality supports trust and precision.',
    judgment:
      'Delight is earned. It clarifies contact instead of decorating weak function.',
    action: 'Keep restraint. Reject spectacle proposals that fail the thesis.',
  },
  {
    num: '08',
    title: 'Responsibility',
    observation:
      'No dark pattern in sound or motion. Preference and reduced motion are first-class. Public naming stays human (Poise), not research-demo jargon. Adoption into v0.1.1 is explicit and public.',
    judgment:
      'Honest about status: live experiment whose rules are now contract material. That honesty is a responsibility hold.',
    action:
      'Keep status language accurate. Future rule changes require a new contract version, not silent edits.',
  },
];

const HOLDS = [
  'Thesis is sharp: if the response is louder than the action, it fails',
  'Live artifact demonstrates wordmark, press, sound preference, reduced motion',
  'Token-cited behaviors — no anonymous taste motion',
  'Full lab anatomy shipped (thesis through verification)',
  'Public name is human and premium — not lab-jargon product naming',
  'Interaction rules adopted into design system contract v0.1.1',
];

const TENSIONS = [
  {
    title: 'Site-wide keyboard packets',
    meta: 'Poise proof is published; other public routes are not covered by this artifact',
  },
  {
    title: 'Long anatomy on small screens',
    meta: 'Demo is clear; deep sections still demand patience below the fold',
  },
  {
    title: 'Dual-source risk after adoption',
    meta: 'Live CSS, lab copy, and contract.interaction must stay synchronized',
  },
  {
    title: 'Lab remains the demo surface',
    meta: 'Adopted rules still need the live lab for inspectable proof — do not archive Poise',
  },
];

const CORRECTIONS = [
  {
    title: 'Keep Poise keyboard artifact current',
    meta: 'Re-run /review/poise/keyboard when demo controls or chrome change',
  },
  {
    title: 'Version future interaction changes',
    meta: 'New contact rules require a contract bump after v0.1.1 — not silent edits',
  },
  {
    title: 'Expand keyboard packets route by route',
    meta: 'Do not claim site-wide keyboard proof from the Poise packet alone',
  },
  {
    title: 'Keep machine export and human tables aligned',
    meta: 'design-system.json and /contracts must show the same adopted rules',
  },
];

const VERIFICATION = [
  'Live route inspected: /labs/poise structure, demo blocks, status language',
  'Compared to design system contract v0.1.1 tokens, motion, and interaction rules',
  'Compared to Use Kit One · Design Review output format',
  'Checked anti-patterns: no glow, bounce, unsolicited sound, monogram mark',
  'Checked naming: Poise remains human product language',
  'Keyboard-path public proof: published at /review/poise/keyboard',
  'Mobile density: demo first; long doctrine remains a known context cost',
];

const SOURCES = [
  {
    href: '/labs/poise',
    title: 'Lab One · Poise',
    meta: 'Artifact under review',
  },
  {
    href: '/review/poise/keyboard',
    title: 'Keyboard path · Poise',
    meta: 'Tab order, focus-visible, activation proof',
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Method and output format',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract v0.1.1',
    meta: 'Governing tokens · Poise interaction rules adopted',
  },
  {
    href: '/review/designesy-org',
    title: 'Field check · designesy.org',
    meta: 'Prior public surface review (includes Poise in scope)',
  },
  {
    href: '/review',
    title: 'Review surface',
    meta: 'Eight dimensions doctrine',
  },
];

export default function PoiseFieldCheckPage() {
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
          <h1 className="surface-title" data-scramble>Poise</h1>
          <p className="surface-lede">
            Lab One reviewed with Use Kit One · Design Review.
          </p>
          <p className="surface-note">
            This packet applies the public Design Review kit to a live
            experiment — not the whole site. Outcome leads with consequences:
            what holds, what stays open, and what to do next.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Pass with notes</span>
            <span className="lab-meta-item">Kit · Design Review</span>
            <span className="lab-meta-item">Artifact · /labs/poise</span>
            <span className="lab-meta-item">Date · 2026-07-12</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="summary">
          <h2 className="doctrine-heading">Summary</h2>
          <div className="definition">
            <p className="definition-label">Outcome · pass with notes</p>
            <p>
              Poise is a considered lab. The live artifact proves restrained
              contact: opacity-only wordmark breath, short press settle, opt-in
              sound, and reduced-motion respect — all token-cited. Full anatomy
              is present. Keyboard-path verification is published. Interaction
              rules are adopted into design system contract v0.1.1. Remaining
              work is synchronization and site-wide proof expansion — not
              re-arguing adoption.
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
                  https://www.designesy.org/labs/poise
                </span>
              </span>
            </ToggleRow>
            <ToggleRow index="02">
              <span className="row-body">
                <span className="row-title">Purpose claim</span>
                <span className="row-meta">
                  Make Designesy contact feel intentional without spectacle
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
                  Contract v0.1.1 · Kit One Design Review · lab anti-patterns
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
                data-cuelume-release
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
              href="/labs/poise"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Open Lab One · Poise</span>
                <span className="row-meta">Live artifact</span>
              </span>
            </Link>
            <Link
              href="/review/poise/keyboard"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Keyboard path verification</span>
                <span className="row-meta">Public proof for Lab One controls</span>
              </span>
            </Link>
            <Link
              href="/kits/design-review"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
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
          Field check of Lab One · Poise using Use Kit One · Design Review.
          Outcome: pass with notes. Institutional quality discipline — not a
          client report. Interaction rules are adopted into contract v0.1.1;
          remaining notes are synchronization and site-wide proof expansion.
        </div>
      </main>

      <Footer />
    </>
  );
}
