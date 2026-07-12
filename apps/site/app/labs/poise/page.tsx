import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { SoundToggle } from '../../lib/sound-toggle';

export const metadata: Metadata = {
  title: 'Poise',
  description:
    'How Designesy responds when someone touches it. A lab on restrained interaction: wordmark, press, sound preference, and reduced motion.',
  openGraph: {
    title: 'Poise · Designesy Labs',
    description:
      'How Designesy responds when someone touches it. Restrained interaction, made inspectable.',
  },
};

const ANATOMY_DONE = [
  'Thesis',
  'Live artifact or demo',
  'Principle explanation',
  'Portable contract',
  'Implementation notes',
  'Review checklist',
  'Provenance',
  'Anti-patterns',
  'Remix notes',
  'Verification',
];

const REVIEW_CHECKS = [
  'Does the response clarify contact, or decorate it?',
  'Is press feedback felt within a single short settle (~160ms)?',
  'Does the wordmark mark stay a heartbeat, never a glow or blob?',
  'Does sound default off under reduced motion, and stay optional always?',
  'Can every interactive control be used with keyboard and focus-visible?',
  'Would removing the motion still leave a complete, usable interface?',
  'Does every value cite a contract token or an open tension?',
];

const ANTI = [
  'Neon glows, particle trails, or bouncing icons as “feedback”',
  'Long springy presses that make the UI feel elastic instead of precise',
  'Sound that fires without an explicit preference path',
  'Hover lift on touch devices (false hover)',
  'Naming interaction products with lab-jargon (pulse, signal, sonic, neural)',
  'Motion that cannot be reduced',
];

const PROVENANCE = [
  'Designesy design system contract v0.1 — live tokens on designesy.org',
  'globals.css :root — --signal, --ease-out, --ease-in-out, --duration',
  'Cuelume v0.1.0 — interaction audio, preference owned by Designesy',
  'Motion stance — short settles, entrance economy, reduced-motion respect',
  'Public naming standard — mini-flagship product names; no AI-lab vocabulary',
];

const PROMPT = `Build interaction feedback that feels finished, not flashy.

Rules:
1. Primary press: scale(0.97) over ~160ms using ease-out. No bounce.
2. Wordmark mark: opacity breath only (about 3s cycle). No blur, no shadow glow.
3. Sound is opt-in via a single toggle; store preference; default off when prefers-reduced-motion.
4. Hover lift only under (hover: hover) and (pointer: fine).
5. prefers-reduced-motion collapses non-essential animation to near-zero duration.
6. Cite contract tokens (--signal, --ease-out, --duration) or name an open tension.
7. Public name must sound like a product, not a research demo.`;

export default function PoiseLabPage() {
  return (
    <>
      <Topbar scrolled />

      <main className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/labs" className="lab-crumb">
              Labs
            </Link>
            <span aria-hidden="true"> · </span>
            Lab One
          </p>
          <h1 className="surface-title">Poise</h1>
          <p className="surface-lede">
            How Designesy responds when someone touches it.
          </p>
          <p className="surface-note">
            Poise studies restrained interaction: a quiet wordmark, a short press,
            an optional sound preference, and full respect for reduced motion.
            If the response is louder than the action, it fails.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Live</span>
            <span className="lab-meta-item">Status · public experiment</span>
            <span className="lab-meta-item">Promotion · candidate for contract v0.1.1</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="demo">
          <h2 className="doctrine-heading">Live artifact</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Try each control. Notice what does not happen: no glow, no bounce,
            no unsolicited sound.
          </p>

          <div className="poise-stage">
            <div className="poise-stage-block">
              <p className="poise-stage-label">Wordmark</p>
              <p className="wordmark-hero poise-wordmark" aria-label="designesy">
                designesy<span className="dot">.</span>
              </p>
              <p className="poise-stage-note">
                Token: <code>--signal</code> · motion:{' '}
                <code>3.2s --ease-in-out</code> opacity only
              </p>
            </div>

            <div className="poise-stage-block">
              <p className="poise-stage-label">Press</p>
              <div className="hero-actions poise-actions">
                <button
                  type="button"
                  className="button primary"
                  data-cuelume-press
                  data-cuelume-release
                >
                  Primary
                </button>
                <button
                  type="button"
                  className="button ghost"
                  data-cuelume-press
                  data-cuelume-release
                >
                  Ghost
                </button>
              </div>
              <p className="poise-stage-note">
                Token: <code>scale(0.97)</code> ·{' '}
                <code>160ms --ease-out</code>
              </p>
            </div>

            <div className="poise-stage-block">
              <p className="poise-stage-label">Sound preference</p>
              <div className="poise-sound-row">
                <SoundToggle />
                <span className="poise-stage-note" style={{ margin: 0 }}>
                  Designesy owns preference; audio only applies it. Defaults off
                  under reduced motion.
                </span>
              </div>
            </div>

            <div className="poise-stage-block">
              <p className="poise-stage-label">Reduced motion</p>
              <div className="definition" style={{ marginBottom: 0 }}>
                <p className="definition-label">Contract requirement</p>
                <p>
                  When <code>prefers-reduced-motion: reduce</code> is set,
                  non-essential animation collapses. The interface remains
                  complete without the breath or entrance choreography.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Thesis</h2>
          <div className="definition">
            <p className="definition-label">What Poise tests</p>
            <p>
              Contact should feel intentional. Feedback exists to confirm the
              action, not to perform. Restraint is the product quality.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Principle</h2>
          <ul className="principle-list">
            <li className="principle">
              <span className="principle-num">01</span>
              <div className="principle-body">
                <h3>Purpose earns motion</h3>
                <p>
                  Motion is present only when it clarifies state change. The
                  wordmark mark breathes to keep the brand alive; the button
                  settles to prove the press registered.
                </p>
              </div>
            </li>
            <li className="principle">
              <span className="principle-num">02</span>
              <div className="principle-body">
                <h3>Economy is intelligence</h3>
                <p>
                  One accent family, short durations, no secondary spectacle.
                  If three effects compete, remove two.
                </p>
              </div>
            </li>
            <li className="principle">
              <span className="principle-num">03</span>
              <div className="principle-body">
                <h3>Preference is part of craft</h3>
                <p>
                  Sound and motion are not defaults forced on every visitor.
                  Reduced motion and mute are first-class states, not afterthoughts.
                </p>
              </div>
            </li>
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Portable contract</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Rules ready to promote into design system contract v0.1.1:
          </p>
          <ul className="checkmark-list">
            <li>
              Wordmark mark may use opacity breath only; never blur, glow, or
              gradient decoration
            </li>
            <li>
              Interactive press settle: <code>scale(0.97)</code> at ~160ms with{' '}
              <code>--ease-out</code>
            </li>
            <li>
              Sound preference key <code>designesy:sound</code>; engine follows
              Designesy, not the reverse
            </li>
            <li>
              Reduced motion disables non-essential animation and defaults sound
              off
            </li>
            <li>
              Hover translation only under fine pointer + hover-capable media
            </li>
            <li>
              Public product names stay human and premium; internal token names
              may differ
            </li>
          </ul>
          <p className="surface-note" style={{ marginTop: '1.25rem' }}>
            Source contract:{' '}
            <Link href="/contracts#design-system-contract">
              Design system contract v0.1
            </Link>
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Implementation notes</h2>
          <div className="definition">
            <p className="definition-label">Codex-ready prompt</p>
            <pre className="lab-prompt">{PROMPT}</pre>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Review checklist</h2>
          <ul className="checkmark-list">
            {REVIEW_CHECKS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Provenance</h2>
          <ul className="checkmark-list">
            {PROVENANCE.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Anti-patterns</h2>
          <ul className="avoid-list">
            {ANTI.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Remix notes</h2>
          <p className="surface-note">
            Reuse the press settle and preference model on any Designesy surface.
            Do not remix the wordmark breath into cards, icons, or backgrounds —
            that belongs only to the mark. If a new control needs feedback,
            start from press + focus-visible before inventing a new motion.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Lab anatomy coverage</h2>
          <ul className="checkmark-list">
            {ANATOMY_DONE.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Verification</h2>
          <ul className="checkmark-list">
            <li>Demo renders on /labs/poise with topbar sound control</li>
            <li>Wordmark mark animates only via opacity; reduced-motion kills it</li>
            <li>Buttons scale on :active without layout shift</li>
            <li>Sound toggle flips aria-pressed and Cuelume setEnabled</li>
            <li>All values map to contract tokens or named open tensions</li>
            <li>No public surface uses internal control-plane naming</li>
          </ul>
        </section>

        <div className="status-note">
          Poise is Lab One — a public experiment, not a finished product line.
          Useful behaviors above are promotion candidates for design system
          contract v0.1.1 after review.
        </div>
      </main>

      <Footer />
    </>
  );
}
