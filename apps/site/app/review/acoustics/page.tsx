import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { ToggleRow } from '../../lib/toggle-row';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Acoustics field check',
  description:
    'Public Design Review of Lab Four · Acoustics — Kit One output format: eight dimensions, holds, tensions, corrections, and verification.',
  path: '/review/acoustics',
  ogTitle: 'Acoustics · field check',
  ogDescription:
    'Lab Four reviewed with Use Kit One · Design Review. Pass with notes — acoustic rules adopted in contract v0.3.0.',
  twitterDescription: 'Design Review of Lab Four — designesy.org/review/acoustics',
});

const DIMENSIONS = [
  {
    num: '01',
    title: 'Purpose',
    observation:
      'Acoustics states a single job: make interaction sound a token system, not decoration. The live artifact (cue grid), thesis, three principles, nine mapping rules, builder prompt, review checklist, provenance, and anti-patterns all serve that job.',
    judgment:
      'Purpose is clear and earns the form. The lab is an inspectable set of sound tokens with named roles, verified on the live cue grid.',
    action: 'Keep. Do not add ambient audio demos that dilute the interaction-only thesis.',
  },
  {
    num: '02',
    title: 'Clarity',
    observation:
      'Primary path is immediate: Lab Four eyebrow, title Acoustics, lede, then the live cue grid with SoundToggle. Every token is expressed with a name, a Cuelume cue, a character, and a role — not a vague preference.',
    judgment:
      'Primary value proposition is discoverable. The cue grid demonstrates the thesis by doing it. Each token pairs a human name with a machine cue identifier.',
    action: 'Keep. Preserve the cue grid as the first thing the reader encounters after the lede.',
  },
  {
    num: '03',
    title: 'Context',
    observation:
      'Built for the public designesy.org surface — dark foundation, shared topbar, Cuelume engine wired via data-cuelume-* attributes. The cue grid assumes desktop and mobile browsers with Web Audio support. Silent fallback handles browsers that block audio.',
    judgment:
      'Context fits a public lab. The cue grid is the demo; the silent fallback is the accessibility safety net. No ambient audio means no context where sound would be intrusive.',
    action: 'Keep. Document that silent fallback is tested, not assumed.',
  },
  {
    num: '04',
    title: 'Inclusion',
    observation:
      'Sound is opt-in via a single toggle; preference stored in localStorage under designesy:sound. Reduced motion defaults sound off. No focus-event sounds — screen reader users navigate without acoustic bombardment. Toggle is keyboard-accessible with aria-pressed. Silent fallback when Web Audio is blocked. Volume is not adjustable — mute is the only control.',
    judgment:
      'Structural inclusion is strong. The accessibility section documents five protections: reduced-motion proxy, no focus sounds, keyboard toggle, silent fallback, and fixed gain. Every protection is a design decision, not a fallback.',
    action: 'Keep all five accessibility protections. Do not add volume sliders — mute is the contract.',
  },
  {
    num: '05',
    title: 'System coherence',
    observation:
      'Values cite the acoustic token module: ten --cue:* tokens map to ten Cuelume cues. The contract adopted the nine mapping rules in v0.3.0. The token reference page (/acoustic-tokens) and machine export (/acoustic-tokens.json) are the single source. Cuelume v0.1.0 is the documented engine.',
    judgment:
      'Strong coherence. Acoustics extends the existing token system into the sound dimension without inventing a second architecture. Every cue traces to a token; every token traces to this document.',
    action: 'Keep lab demo, contract.acoustics, acoustic-tokens module, and live cue grid synchronized after adoption.',
  },
  {
    num: '06',
    title: 'Durability',
    observation:
      'Full lab anatomy is present: thesis, live artifact, principle, portable contract, token reference, accessibility, implementation notes, review checklist, provenance, anti-patterns, remix notes, and verification. Builder prompt is remixable. Rules are engine-agnostic in principle — the token model survives a Cuelume upgrade.',
    judgment:
      'Durable as a lab package and as contract material. Risk is engine coupling — if Cuelume v0.1.0 breaks or is abandoned, the token model survives but the cue synthesis needs a replacement engine.',
    action: 'When the Cuelume engine upgrades or changes, update the cue grid and verify all ten tokens still fire correctly.',
  },
  {
    num: '07',
    title: 'Delight',
    observation:
      'The cue grid is quiet by default — you enable sound, then hover. The sounds are subtle: tick for nav, sparkle for brand, chime for invitation, press for action. No sound is louder than the action it confirms. The toggle itself is a small, intentional gesture.',
    judgment:
      'Delight is earned through restraint, not spectacle. The absence of sound is the default experience; the presence of sound is the earned one. This is the thesis made audible.',
    action: 'Keep restraint. Reject proposals for ambient beds, loading sounds, or mood audio.',
  },
  {
    num: '08',
    title: 'Responsibility',
    observation:
      'No dark pattern in acoustics. Sound is opt-in, not opt-out. Reduced motion is a respected proxy. The toggle stores preference locally — no server tracking of sound usage. Silent fallback means blocked Web Audio degrades invisibly. Anti-patterns list eight explicit prohibitions.',
    judgment:
      'Status is explicit: live experiment whose rules are contract material. The eight anti-patterns are a standing guardrail. No open tensions remain — the system is complete as designed.',
    action: 'Keep status language accurate. Future cue additions require a token entry before markup wiring.',
  },
];

const HOLDS = [
  'Thesis is sharp: sound is a token, not a decoration',
  'Live artifact (cue grid) demonstrates every token with SoundToggle control',
  'Ten tokens, ten roles, one documented engine — no unmapped sounds',
  'Full lab anatomy shipped (thesis through verification)',
  'Public name is human and premium — Acoustics',
  'Nine mapping rules adopted into design system contract v0.3.0',
  'Five accessibility protections documented and verified',
  'Eight anti-patterns explicitly prohibited',
];

const TENSIONS = [
  {
    title: 'No field check existed until now',
    meta: 'Acoustics was the only lab without a Kit One field check page — this page closes that gap',
  },
  {
    title: 'Cuelume engine coupling',
    meta: 'Token model is portable; cue synthesis depends on Cuelume v0.1.0 — engine upgrade or abandonment requires re-verification of all ten cues',
  },
];

const CORRECTIONS = [
  {
    title: 'Create this field check page — APPLIED',
    meta: 'Lab Four now has the same Kit One field check as Labs One, Two, and Three (fixed 2026-08-01)',
  },
  {
    title: 'Add Acoustics to labs.ts machine export',
    meta: 'Acoustics entry in lib/labs.ts with 9 contract rules, engine, and field_check URL — JSON export at /labs/acoustics.json (fixed 2026-08-01)',
  },
  {
    title: 'Add Acoustics card to review hub',
    meta: 'Field checks grid on /review now includes Lab Four alongside Labs One, Two, and Three (fixed 2026-08-01)',
  },
  {
    title: 'Version future acoustic changes',
    meta: 'New cues or mapping rules require a contract bump after v0.4.0 — not silent edits',
  },
  {
    title: 'Keep machine export and live cue grid aligned',
    meta: 'acoustic-tokens.ts, /acoustic-tokens.json, and the cue grid on /labs/acoustics must show the same ten tokens',
  },
];

const VERIFICATION = [
  'Live route inspected: /labs/acoustics structure, cue grid, SoundToggle, status language',
  'Cuelume data-cuelume-* attributes confirmed on every interactive element in the cue grid',
  'Sound defaults off under prefers-reduced-motion — toggle still works when enabled',
  'No focus-event sounds — keyboard navigation through cue grid is silent',
  'Silent fallback when Web Audio is blocked (no errors, no visual change)',
  'Compared to design system contract v0.3.0 acoustic section — nine mapping rules match',
  'Compared to Use Kit One · Design Review output format — eight dimensions, holds, tensions, corrections',
  'Checked anti-patterns: no ambient audio, no loading sounds, no focus sounds, no randomization',
  'Checked naming: Acoustics remains human product language; Cuelume is attributed',
];

const SOURCES = [
  {
    href: '/labs/acoustics',
    title: 'Lab Four · Acoustics',
    meta: 'Artifact under review',
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Method and output format',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract',
    meta: 'Governing tokens · acoustic section adopted in v0.3.0',
  },
  {
    href: '/acoustic-tokens',
    title: 'Acoustic token reference',
    meta: 'Ten cues, ten roles — the sound parallel to the visual token system',
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

export default function AcousticsFieldCheckPage() {
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
          <h1 className="surface-title" data-scramble>Acoustics</h1>
          <p className="surface-lede">
            Lab Four reviewed with Use Kit One · Design Review.
          </p>
          <p className="surface-note">
            This packet applies the public Design Review kit to a live
            experiment — not the whole site. Outcome leads with consequences:
            what holds, what stays open, and what to do next.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Pass with notes</span>
            <span className="lab-meta-item">Kit · Design Review</span>
            <span className="lab-meta-item">Artifact · /labs/acoustics</span>
            <span className="lab-meta-item">Date · 2026-08-01</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="summary">
          <h2 className="doctrine-heading">Summary</h2>
          <div className="definition">
            <p className="definition-label">Outcome · pass with notes</p>
            <p>
              Acoustics is a considered lab. The cue grid confirms all ten tokens
              fire their named Cuelume sounds on hover (fine pointer) and press.
              Sound defaults off under reduced motion; the toggle remains
              functional. No focus-event sounds fire during keyboard navigation.
              Silent fallback handles blocked Web Audio without errors. Nine
              mapping rules are adopted into design system contract v0.3.0.
              Five accessibility protections are documented and verified. Eight
              anti-patterns are explicitly prohibited. Two tensions remain:
              this field check page did not exist until now (resolved by this
              page), and Cuelume engine coupling is a durability risk. Acoustic
              rules are adopted — remaining work is engine maintenance and
              synchronization, not re-arguing adoption.
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
                  https://www.designesy.org/labs/acoustics
                </span>
              </span>
            </ToggleRow>
            <ToggleRow index="02">
              <span className="row-body">
                <span className="row-title">Purpose claim</span>
                <span className="row-meta">
                  Make interaction sound a token system, not decoration
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
                  Contract v0.3.0 acoustic section · Kit One Design Review · Cuelume v0.1.0
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
              href="/labs/acoustics"
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Open Lab Four · Acoustics</span>
                <span className="row-meta">Live artifact</span>
              </span>
            </Link>
            <Link
              href="/acoustic-tokens"
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Acoustic token reference</span>
                <span className="row-meta">Ten cues, ten roles</span>
              </span>
            </Link>
            <Link
              href="/review/cadence"
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Field check · Cadence</span>
                <span className="row-meta">Prior field check pattern (Lab Three)</span>
              </span>
            </Link>
            <Link
              href="/kits/design-review"
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Use Kit One · Design Review</span>
                <span className="row-meta">Run the same method on your work</span>
              </span>
            </Link>
          </div>
        </section>

        <div className="status-note">
          Field check of Lab Four · Acoustics using Use Kit One · Design Review.
          Outcome: pass with notes. Institutional quality discipline — not a
          client report. Acoustic rules are adopted into contract v0.3.0;
          remaining notes are engine coupling awareness and synchronization.
        </div>
      </main>

      <Footer />
    </>
  );
}