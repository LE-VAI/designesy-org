import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { SoundToggle } from '../../lib/sound-toggle';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { ToggleRow } from '../../lib/toggle-row';
import { CopyPrompt } from '../../lib/copy-prompt';
import { pageMeta } from '../../lib/site-meta';
import { acousticTokens } from '../../lib/acoustic-tokens';

export const metadata: Metadata = pageMeta({
  title: 'Acoustics',
  description:
    'Lab Four — interaction sound as a token system. Nineteen cues, nineteen roles, one documented engine. The sound parallel to the visual token system, made inspectable.',
  path: '/labs/acoustics',
  ogTitle: 'Acoustics · Lab Four — Designesy',
  ogDescription:
    'Interaction sound as a token system. Nineteen cues, nineteen roles, Cuelume v0.2.2 + cuelume-extend. No sound without a token name and rationale.',
  twitterDescription:
    'Interaction sound lab — nineteen cues, nineteen roles. designesy.org/labs/acoustics',
});

const ANATOMY_DONE = [
  'Thesis',
  'Live artifact — cue grid',
  'Principle — three rules',
  'Portable contract — nine mapping rules',
  'Implementation notes — builder prompt',
  'Review checklist — what to inspect',
  'Provenance — Cuelume + W3C DTCG context',
  'Anti-patterns — what acoustics is not',
  'Remix notes — how to adapt',
  'Verification — evidence on designesy.org',
];

const REVIEW_CHECKS = [
  'Does every sound trace to a named token in this document?',
  'Is sound opt-in, with preference stored and respected across sessions?',
  'Does sound default off under prefers-reduced-motion?',
  'Are hover sounds fine-pointer only, with touch mapped to a single tap?',
  'Are focus events silent — no hover cues fired on keyboard focus?',
  'Is there a silent fallback when Web Audio is blocked or unavailable?',
  'Is the toggle keyboard-accessible with aria-pressed state?',
  'Is there any ambient audio, background music, or mood bed? (Must be none.)',
  'Does every value cite a contract token or an open tension?',
];

const ANTI = [
  'Ambient background music or mood beds',
  'Loading sounds that play without a user gesture',
  'Hover sounds on touch devices (false hover)',
  'Focus-event sounds that bombard screen reader users',
  'Randomized cues — a different sound per page for the same role',
  'Unmapped sounds — any audio without a token name and rationale here',
  'Volume sliders as a substitute for a clean mute toggle',
  'Audio that cannot be silenced by reduced-motion preference',
];

const PROVENANCE = [
  'Cuelume v0.2.2 (MIT, Daniel Belyi) + cuelume-extend v0.2.0 — interaction audio engine',
  'W3C Design Tokens Format Module 2025.10 — acoustic type is net-new',
  'Designesy design system contract v0.3.0 — acoustic section adopted',
  'Site-wide integration — data-cuelume-* attributes on every interactive element',
  'Preference storage — localStorage key designesy:sound, owned by Designesy',
];

const PROMPT = `Build interaction audio as a token system, not decoration.

Rules:
1. Every sound maps to a named token (--cue:role). No unmapped sounds anywhere.
2. One primary cue family per role. Nav stays tick. Brand stays sparkle. Do not randomize.
3. Sound is opt-in via a single toggle; store preference in localStorage; default off when prefers-reduced-motion.
4. Hover sounds fire on fine-pointer only. On touch, map the same hover cue to a single tap.
5. No focus sounds. Sounds fire on pointer and click, never on focus events.
6. No ambient audio — interaction-only. No background music, no loading sounds, no mood beds.
7. Silent fallback when Web Audio is blocked. No errors, no visual degradation.
8. Reduced motion is an acoustic-reduction proxy. The user can still enable sound manually.
9. Every cue must trace to a token document. A sound in the markup without a token here is a contract violation.`;

export default function AcousticsLabPage() {
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
            Lab Four
          </p>
          <h1 className="surface-title" data-scramble>Acoustics</h1>
          <p className="surface-lede">
            Interaction sound as a token system.
          </p>
          <p className="surface-note">
            Acoustics studies the sound parallel to the visual token system. Nineteen
            cues, nineteen interaction roles, one documented engine. No sound appears
            on a Designesy surface without a token name and a rationale here. If
            the sound is louder than the action it confirms, it fails.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Live</span>
            <span className="lab-meta-item">Status · public experiment</span>
            <span className="lab-meta-item">Contract · adopted in v0.3.0</span>
            <span className="lab-meta-item">Engine · {acousticTokens.engine}</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="demo">
          <h2 className="doctrine-heading">Live artifact</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Enable sound, then hover or press each cue. Notice what does not
            happen: no ambient bed, no focus sounds, no randomization.
          </p>

          <div className="poise-actions" style={{ marginBottom: '1.5rem' }}>
            <SoundToggle />
            <span className="surface-note" style={{ marginLeft: '0.75rem' }}>
              Preference stored under <code>designesy:sound</code>. Defaults off
              under reduced motion.
            </span>
          </div>

          <div className="cue-grid">
            {acousticTokens.tokens.map((token, i) => (
              <div
                key={token.token}
                className="cue-cell"
                data-cuelume-hover={token.cuelume_cue}
                data-cuelume-press="press"
                tabIndex={0}
                role="button"
                aria-label={`${token.token} · ${token.interaction_role}`}
              >
                <span className="cue-cell-num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <code className="cue-cell-token">{token.token}</code>
                <span className="cue-cell-cue">{token.cuelume_cue}</span>
                <span className="cue-cell-role">{token.interaction_role}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Thesis</h2>
          <div className="definition">
            <p className="definition-label">What Acoustics tests</p>
            <p>
              Sound is a token, not a decoration. Each cue has a name, a role,
              and a character. The system is interaction-only — no ambient
              audio, no mood beds, no unmapped sounds. Preference is user-owned;
              reduced motion is an acoustic-reduction proxy.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Principle</h2>
          <ul className="principle-list">
            <li className="principle">
              <span className="principle-num">01</span>
              <div className="principle-body">
                <h3>Every sound has a name</h3>
                <p>
                  A sound without a token is a contract violation. Nineteen cues, nineteen
                  roles, documented here. If a new interaction needs audio, add a
                  token before adding the sound.
                </p>
              </div>
            </li>
            <li className="principle">
              <span className="principle-num">02</span>
              <div className="principle-body">
                <h3>Preference is part of craft</h3>
                <p>
                  Sound is opt-in. The toggle stores preference in localStorage;
                  reduced motion defaults it off. The user can always enable or
                  mute. Silent fallback means blocked Web Audio degrades
                  invisibly.
                </p>
              </div>
            </li>
            <li className="principle">
              <span className="principle-num">03</span>
              <div className="principle-body">
                <h3>One cue family per role</h3>
                <p>
                  Nav stays tick. Brand stays sparkle. Dense lists stay whisper.
                  Do not randomize per page without updating this document.
                  Consistency is the product quality; surprise is the failure.
                </p>
              </div>
            </li>
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Portable contract</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Mapping rules adopted into design system contract v0.3.0:
          </p>
          <div className="row-stack" role="list">
            {acousticTokens.mapping_rules.map((rule, i) => (
              <ToggleRow
                key={i}
                index={String(i + 1).padStart(2, '0')}
              >
                <span className="row-body">
                  <span className="row-title">Rule {String(i + 1).padStart(2, '0')}</span>
                  <span className="row-meta">{rule}</span>
                </span>
              </ToggleRow>
            ))}
          </div>
          <p className="surface-note" style={{ marginTop: '1.25rem' }}>
            Source contract:{' '}
            <Link href="/contracts/design-system">
              Design system contract v0.4.0
            </Link>
            {' · '}
            <Link href="/acoustic-tokens">Token reference page</Link>
            {' · '}
            <Link href="/acoustic-tokens.json">Machine export</Link>
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Token reference</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Nineteen cues, nineteen interaction roles, one documented engine. Every sound
            on a Designesy surface traces to a token here.
          </p>
          <div className="principle-list">
            {acousticTokens.tokens.map((token, i) => (
              <div className="principle" key={token.token}>
                <span className="principle-num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="principle-body">
                  <h3>
                    <code>{token.token}</code>{' '}
                    <span style={{ color: 'var(--muted-dim)' }}>
                      · {token.cuelume_cue}
                    </span>
                  </h3>
                  <p>
                    <strong style={{ color: 'var(--muted)' }}>Character.</strong>{' '}
                    {token.character}
                  </p>
                  <p style={{ marginTop: '0.45rem' }}>
                    <strong style={{ color: 'var(--muted)' }}>Role.</strong>{' '}
                    {token.interaction_role}
                  </p>
                  <p style={{ marginTop: '0.45rem', color: 'var(--muted-dim)' }}>
                    Where · {token.where_used}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Accessibility</h2>
          <ul className="checkmark-list">
            <li>
              <span>
                <strong>Reduced motion → sound off.</strong>{' '}
                {acousticTokens.accessibility.reduced_motion_sound_off}
              </span>
            </li>
            <li>
              <span>
                <strong>No focus sounds.</strong>{' '}
                {acousticTokens.accessibility.no_focus_sounds}
              </span>
            </li>
            <li>
              <span>
                <strong>Toggle is keyboard-accessible.</strong>{' '}
                {acousticTokens.accessibility.toggle_keyboard_accessible}
              </span>
            </li>
            <li>
              <span>
                <strong>Silent fallback.</strong>{' '}
                {acousticTokens.accessibility.silent_fallback}
              </span>
            </li>
            <li>
              <span>
                <strong>Volume is not adjustable.</strong>{' '}
                {acousticTokens.accessibility.volume_not_adjustable}
              </span>
            </li>
          </ul>
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
            Reuse the token model on any Designesy surface. Add a new cue by
            extending the acoustic-tokens module before wiring the sound into
            markup — the token document is the source of truth, not the
            attribute. Do not remix interaction cues into ambient beds or
            loading sounds; Cuelume is interaction-only. If a new role needs
            audio, start from the closest existing cue family before inventing a
            new character.
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
                title:
                  'Cue grid renders on /labs/acoustics with SoundToggle control',
              },
              {
                title:
                  'Every cue cell fires its named Cuelume sound on hover (fine pointer) and press',
              },
              {
                title:
                  'Sound defaults off under prefers-reduced-motion; toggle still works',
              },
              {
                title:
                  'No focus-event sounds — keyboard navigation through cue grid is silent',
              },
              {
                title:
                  'Silent fallback when Web Audio is blocked (no errors, no visual change)',
              },
              {
                title:
                  'All ten tokens map to the acoustic-tokens module and /acoustic-tokens.json export',
              },
              {
                title:
                  'AI Studio Director link to /labs/acoustics resolves (no 404)',
              },
            ]}
          />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Standards context</h2>
          <div className="definition">
            <p className="definition-label">W3C DTCG 2025.10</p>
            <p>
              {acousticTokens.standards_context.w3c_dtgc_2025_10}
            </p>
          </div>
          <div className="definition">
            <p className="definition-label">Proposed type</p>
            <p>
              {acousticTokens.standards_context.proposed_type}
            </p>
          </div>
          <div className="definition">
            <p className="definition-label">Reference format</p>
            <p>
              <code>{acousticTokens.standards_context.reference_format}</code>
            </p>
          </div>
        </section>

        <div className="status-note">
          Acoustics is Lab Four — a public experiment whose ten-cue token system
          was adopted into design system contract v0.3.0. The lab remains the
          inspectable source demo. Token reference lives at /acoustic-tokens;
          machine export at /acoustic-tokens.json.
        </div>
      </main>

      <Footer />
    </>
  );
}