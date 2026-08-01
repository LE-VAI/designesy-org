import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { HapticsToggle } from '../../lib/haptics-toggle';
import { SoundToggle } from '../../lib/sound-toggle';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { ToggleRow } from '../../lib/toggle-row';
import { CopyPrompt } from '../../lib/copy-prompt';
import { DemoCell, DemoGrid } from '../../lib/demo-cell';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Poise',
  description:
    'How Designesy responds when someone touches it. A lab on restrained interaction: wordmark, press, sound, haptics, and reduced motion.',
  path: '/labs/poise',
  ogTitle: 'Poise · Lab One',
  ogDescription:
    'How Designesy responds when someone touches it. Restrained interaction, made inspectable.',
  twitterDescription:
    'Restrained interaction lab — designesy.org/labs/poise',
});

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
  'Designesy design system contract v0.1.1 — live tokens and adopted Poise interaction rules',
  'Live token foundation — accent, ease-out, ease-in-out, duration',
  'Cuelume v0.1.0 — interaction audio; preference owned by Designesy',
  'Motion stance — short settles, entrance economy, reduced-motion respect',
  'Public naming — human, premium product names; no research-demo vocabulary',
];

const PROMPT = `Build interaction feedback that feels finished, not flashy.

Rules:
1. Primary press: scale(0.97) over ~160ms using ease-out. No bounce.
2. Wordmark mark: opacity breath only (about 3s cycle). No blur, no shadow glow.
3. Sound is opt-in via a single toggle; store preference; default off when prefers-reduced-motion.
4. Hover lift only under (hover: hover) and (pointer: fine).
5. prefers-reduced-motion collapses non-essential animation to near-zero duration.
6. Cite contract tokens (accent, ease-out, duration) or name an open tension.
7. Public name must sound like a product, not a research demo.`;

export default function PoiseLabPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/labs" className="lab-crumb">
              Labs
            </Link>
            <span aria-hidden="true"> · </span>
            Lab One
          </p>
          <h1 className="surface-title" data-scramble>Poise</h1>
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
            <span className="lab-meta-item">Contract · adopted in v0.1.1</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="demo">
          <h2 className="doctrine-heading">Live artifact</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Try each control. Notice what does not happen: no glow, no bounce,
            no unsolicited sound.
          </p>

          <DemoGrid>
            <DemoCell
              label="Wordmark breath"
              note={<>{`Token: `}<code>--signal</code>{` · motion: `}<code>3.2s --ease-in-out</code>{` opacity only`}</>}
            >
              <p
                className="wordmark-hero poise-wordmark"
                aria-label="designesy"
                data-cuelume-hover="droplet"
                data-cuelume-press="sparkle"
              >
                designesy<span className="dot">.</span>
              </p>
            </DemoCell>

            <DemoCell
              label="Press settle"
              note={<>{`Token: `}<code>scale(0.97)</code>{` · `}<code>160ms --ease-out</code></>}
            >
              <div className="hero-actions poise-actions">
                <button
                  type="button"
                  className="button primary"
                  data-cuelume-press
                >
                  Primary
                </button>
                <button
                  type="button"
                  className="button ghost"
                  data-cuelume-press
                >
                  Ghost
                </button>
              </div>
            </DemoCell>

            <DemoCell
              label="Sound preference"
              note="Designesy owns preference; audio only applies it. Defaults off under reduced motion."
            >
              <SoundToggle />
            </DemoCell>

            <DemoCell
              label="Haptics preference"
              note="Default on when Vibration API is present. Toggle hides on unsupported devices. Press/tap only — never hover."
            >
              <HapticsToggle />
            </DemoCell>

            <DemoCell
              label="Reduced motion"
              note={<>{`When `}<code>prefers-reduced-motion: reduce</code>{` is set, non-essential animation collapses. The interface remains complete without the breath or entrance choreography.`}</>}
            >
              <div className="poise-reduced-demo">
                <div className="poise-reduced-bar poise-reduced-bar--on" />
                <div className="poise-reduced-bar poise-reduced-bar--off" />
                <div className="poise-reduced-labels">
                  <span className="poise-reduced-tag">Motion on</span>
                  <span className="poise-reduced-tag">Reduced motion</span>
                </div>
              </div>
            </DemoCell>
          </DemoGrid>
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
            Rules adopted into design system contract v0.1.1:
          </p>
          <div className="row-stack" role="list">
            {[
              {
                title: 'Wordmark mark',
                meta: 'Opacity breath only — never blur, glow, or gradient decoration',
              },
              {
                title: 'Press settle',
                meta: 'scale(0.97) at ~160ms with --ease-out',
              },
              {
                title: 'Sound preference',
                meta: 'Key designesy:sound; engine follows Designesy',
              },
              {
                title: 'Reduced motion',
                meta: 'Disables non-essential animation; defaults sound off',
              },
              {
                title: 'Hover translation',
                meta: 'Only under fine pointer + hover-capable media',
              },
              {
                title: 'Public names',
                meta: 'Human and premium; internal token names may differ',
              },
            ].map((item, i) => (
              <ToggleRow key={item.title} index={String(i + 1).padStart(2, '0')}>
                <span className="row-body">
                  <span className="row-title">{item.title}</span>
                  <span className="row-meta">{item.meta}</span>
                </span>
              </ToggleRow>
            ))}
          </div>
          <p className="surface-note" style={{ marginTop: '1.25rem' }}>
            Source contract:{' '}
            <Link href="/contracts#design-system-contract">
              Design system contract v0.4.0
            </Link>
            {' · '}
            <Link href="/contracts/design-system">Contract home</Link>
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Implementation notes</h2>
          <p className="definition-label" style={{ marginBottom: '0.75rem' }}>Builder prompt</p>
          <CopyPrompt label="builder prompt">
            {PROMPT}
          </CopyPrompt>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Review checklist</h2>
          <CheckGrid items={checkItemsFromStrings(REVIEW_CHECKS)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Provenance</h2>
          <CheckGrid items={checkItemsFromStrings(PROVENANCE)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Anti-patterns</h2>
          <CheckGrid items={checkItemsFromStrings(ANTI, { avoid: true })} />
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
          <CheckGrid dense items={checkItemsFromStrings(ANATOMY_DONE)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Verification</h2>
          <CheckGrid
            items={[
              {
                title: 'Demo renders on /labs/poise with topbar sound control',
              },
              {
                title:
                  'Wordmark mark animates only via opacity; reduced-motion kills it',
              },
              {
                title: 'Buttons scale on :active without layout shift',
              },
              {
                title:
                  'Sound toggle flips aria-pressed and applies the audio preference',
              },
              {
                title: 'Keyboard path published at /review/poise/keyboard',
                href: '/review/poise/keyboard',
              },
              {
                title:
                  'All values map to contract tokens or named open tensions',
              },
              {
                title:
                  'No public surface uses internal control-plane naming',
              },
            ]}
          />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Field check</h2>
          <Link
            href="/review/poise"
            className="lab-card"
            data-cuelume-hover="tick"
            data-cuelume-press="tick"
          >
            <div className="lab-card-top">
              <span className="status-badge">Pass with notes</span>
              <span className="lab-card-status">Kit One</span>
            </div>
            <h3 className="lab-card-title">Poise · public review</h3>
            <p className="lab-card-lede">
              Design Review applied to this lab.
            </p>
            <p className="lab-card-desc">
              Eight dimensions, holds, tensions, and corrections — the kit
              output format made public for Lab One.
            </p>
            <span className="lab-card-arrow">Open field check →</span>
          </Link>
          <div className="row-stack" role="list" style={{ marginTop: '0.75rem' }}>
            <Link
              href="/review/poise/keyboard"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Keyboard path verification</span>
                <span className="row-meta">
                  Tab order, focus-visible, activation, reduced motion
                </span>
              </span>
            </Link>
          </div>
        </section>

        <div className="status-note">
          Poise is Lab One — a public experiment whose portable interaction rules
          were adopted into design system contract v0.1.1. The lab remains the
          inspectable source demo. Public judgment lives at /review/poise;
          keyboard proof at /review/poise/keyboard.
        </div>
      </main>

      <Footer />
    </>
  );
}
