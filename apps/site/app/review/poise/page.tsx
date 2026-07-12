import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';

export const metadata: Metadata = {
  title: 'Poise field check',
  description:
    'Public Design Review of Lab One · Poise — Kit One output format: eight dimensions, holds, tensions, corrections, and verification.',
  openGraph: {
    title: 'Poise · field check',
    description:
      'Lab One reviewed with Use Kit One · Design Review. Pass with notes — candidate for contract v0.1.1.',
    url: 'https://www.designesy.org/review/poise',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Poise · field check',
    description:
      'Design Review of Lab One — designesy.org/review/poise',
  },
};

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
      'Values cite contract tokens: --signal, ease-out, ease-in-out, 160ms press, opacity-only wordmark breath. Kind language matches lab mark (circle). Portable rules are recorded as candidates for v0.1.1, not silent canon.',
    judgment:
      'Strong coherence. Poise extends the system without inventing a second accent family or monogram.',
    action:
      'Keep candidates explicit until adoption. Silence is not adoption.',
  },
  {
    num: '06',
    title: 'Durability',
    observation:
      'Full lab anatomy is present. Builder prompt is remixable. Behaviors are named so they can promote into contract rules. Preference storage for sound is site-owned; audio engine only applies it.',
    judgment:
      'Durable as a lab package. Promotion path is clear. Risk is dual-source drift if contract tables and live CSS diverge later.',
    action:
      'When any Poise token changes, update live CSS, lab notes, and contract candidate language together.',
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
      'No dark pattern in sound or motion. Preference and reduced motion are first-class. Public naming stays human (Poise), not research-demo jargon. Page does not claim contract adoption it has not earned.',
    judgment:
      'Honest about status: live experiment, candidate for v0.1.1. That honesty is a responsibility hold.',
    action:
      'Keep status language accurate. Adopt into v0.1.1 only by explicit order, then update this packet.',
  },
];

const HOLDS = [
  'Thesis is sharp: if the response is louder than the action, it fails',
  'Live artifact demonstrates wordmark, press, sound preference, reduced motion',
  'Token-cited behaviors — no anonymous taste motion',
  'Full lab anatomy shipped (thesis through verification)',
  'Public name is human and premium — not lab-jargon product naming',
  'Candidates for contract v0.1.1 are labeled, not smuggled into canon',
];

const TENSIONS = [
  {
    title: 'Site-wide keyboard packets',
    meta: 'Poise proof is published; other public routes are not covered by this artifact',
  },
  {
    title: 'Contract adoption still open',
    meta: 'Poise rules remain candidates until v0.1.1 is explicitly ordered',
  },
  {
    title: 'Long anatomy on small screens',
    meta: 'Demo is clear; deep sections still demand patience below the fold',
  },
  {
    title: 'Dual-source risk after adoption',
    meta: 'Live CSS, lab copy, and contract tables must stay synchronized',
  },
];

const CORRECTIONS = [
  {
    title: 'Keep Poise keyboard artifact current',
    meta: 'Re-run /review/poise/keyboard when demo controls or chrome change',
  },
  {
    title: 'Keep v0.1.1 adoption explicit',
    meta: 'Do not imply contract status until Commander order and contract edit ship',
  },
  {
    title: 'Expand keyboard packets route by route',
    meta: 'Do not claim site-wide keyboard proof from the Poise packet alone',
  },
  {
    title: 'On adoption, refresh this packet outcome',
    meta: 'Move from pass-with-notes candidate to adopted rule set',
  },
];

const VERIFICATION = [
  'Live route inspected: /labs/poise structure, demo blocks, status language',
  'Compared to design system contract v0.1 tokens and motion stance',
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
    title: 'Design system contract v0.1',
    meta: 'Governing token and motion baseline',
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

      <main className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/review" className="lab-crumb">
              Review
            </Link>
            <span aria-hidden="true"> · </span>
            Field check
          </p>
          <h1 className="surface-title">Poise</h1>
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
              is present. Keyboard-path verification is published. Remaining
              work is adoption discipline and site-wide proof expansion: keep
              candidate status honest, and promote to contract v0.1.1 only by
              explicit order.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="inputs">
          <h2 className="doctrine-heading">Inputs used</h2>
          <div className="row-stack" role="list">
            <div className="row" role="listitem">
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Artifact</span>
                <span className="row-meta">
                  https://www.designesy.org/labs/poise
                </span>
              </span>
            </div>
            <div className="row" role="listitem">
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Purpose claim</span>
                <span className="row-meta">
                  Make Designesy contact feel intentional without spectacle
                </span>
              </span>
            </div>
            <div className="row" role="listitem">
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Audience and context</span>
                <span className="row-meta">
                  Public builders, agents, and reviewers on designesy.org
                </span>
              </span>
            </div>
            <div className="row" role="listitem">
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Governing rules</span>
                <span className="row-meta">
                  Contract v0.1 · Kit One Design Review · lab anti-patterns
                </span>
              </span>
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="dimensions">
          <h2 className="doctrine-heading">Dimension findings</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Each dimension: observation, judgment, action — Kit One format.
          </p>
          <div className="principle-list">
            {DIMENSIONS.map((d) => (
              <div className="principle" key={d.num} data-cuelume-hover="whisper">
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
          <div className="row-stack" role="list">
            {HOLDS.map((item, i) => (
              <div className="row" role="listitem" key={item}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="tensions">
          <h2 className="doctrine-heading">Tensions</h2>
          <div className="row-stack" role="list">
            {TENSIONS.map((item, i) => (
              <div className="row" role="listitem" key={item.title}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item.title}</span>
                  <span className="row-meta">{item.meta}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="corrections">
          <h2 className="doctrine-heading">Corrections</h2>
          <div className="row-stack" role="list">
            {CORRECTIONS.map((item, i) => (
              <div className="row" role="listitem" key={item.title}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item.title}</span>
                  <span className="row-meta">{item.meta}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="verification">
          <h2 className="doctrine-heading">Verification performed</h2>
          <div className="row-stack" role="list">
            {VERIFICATION.map((item, i) => (
              <div className="row" role="listitem" key={item}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item}</span>
                </span>
              </div>
            ))}
          </div>
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
          client report. Candidates for contract v0.1.1 remain open until
          explicitly adopted.
        </div>
      </main>

      <Footer />
    </>
  );
}
