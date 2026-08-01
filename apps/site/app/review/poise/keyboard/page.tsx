import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../../lib/topbar';
import { Footer } from '../../../lib/footer';
import { CheckGrid } from '../../../lib/check-grid';
import { ToggleRow } from '../../../lib/toggle-row';
import { pageMeta } from '../../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Poise keyboard path',
  description:
    'Public keyboard-path verification for Lab One · Poise — tab order, focus-visible, activation, and reduced-motion notes.',
  path: '/review/poise/keyboard',
  ogTitle: 'Poise · keyboard path',
  ogDescription:
    'Verification artifact for Lab One controls: tab order, focus rings, Enter/Space, reduced motion.',
  twitterDescription:
    'Keyboard verification for Lab One — designesy.org/review/poise/keyboard',
});

const SCOPE = [
  {
    title: 'Primary press (demo)',
    meta: 'button.button.primary · data-cuelume-press/release',
  },
  {
    title: 'Ghost press (demo)',
    meta: 'button.button.ghost · data-cuelume-press/release',
  },
  {
    title: 'Sound preference',
    meta: 'button.sound-toggle · aria-pressed · aria-label',
  },
  {
    title: 'Lab crumb · Labs',
    meta: 'Link to /labs in surface eyebrow',
  },
  {
    title: 'Field check card',
    meta: 'Link to /review/poise from the lab page',
  },
  {
    title: 'Contract links on lab',
    meta: 'Links into design system contract surfaces',
  },
  {
    title: 'Chrome (shared)',
    meta: 'Topbar wordmark, primary nav, sound toggle, footer links',
  },
];

const TAB_ORDER = [
  {
    step: '01',
    title: 'Topbar wordmark',
    meta: 'Link · home · focus-visible ring',
  },
  {
    step: '02',
    title: 'Primary nav',
    meta: 'Score → Leaderboard → Contract → Kits → Docs · each link focusable',
  },
  {
    step: '03',
    title: 'Topbar sound toggle',
    meta: 'Button · aria-pressed · label flips mute/enable',
  },
  {
    step: '04',
    title: 'Lab crumb · Labs',
    meta: 'In-page link before main claim',
  },
  {
    step: '05',
    title: 'Primary press control',
    meta: 'Demo button · Enter/Space activate · active scale(0.97)',
  },
  {
    step: '06',
    title: 'Ghost press control',
    meta: 'Demo button · same keyboard activation model',
  },
  {
    step: '07',
    title: 'In-demo sound toggle',
    meta: 'Same control family as topbar · preference is site-owned',
  },
  {
    step: '08',
    title: 'Body links and field check card',
    meta: 'Contract links, field check card, footer wayfinding',
  },
];

const FOCUS_RULES = [
  {
    title: 'focus-visible ring',
    meta: '2px solid --signal-light · outline-offset 2px · radius-sm',
  },
  {
    title: 'No mouse-only traps',
    meta: 'All primary actions are native button or link elements',
  },
  {
    title: 'Sound toggle labels',
    meta: 'aria-label and aria-pressed update with preference state',
  },
  {
    title: 'Decorative marks',
    meta: 'Wordmark period and mark glyphs are not extra tab stops',
  },
];

const ACTIVATION = [
  {
    title: 'Links',
    meta: 'Enter activates · standard browser behavior',
  },
  {
    title: 'Buttons (press demo)',
    meta: 'Space or Enter · press feedback is visual settle, not a route change',
  },
  {
    title: 'Sound toggle',
    meta: 'Space or Enter flips preference · no unsolicited audio on focus alone',
  },
  {
    title: 'Hover lift',
    meta: 'Only under (hover: hover) and (pointer: fine) · not required for keyboard use',
  },
];

const REDUCED_MOTION = [
  {
    title: 'Wordmark breath',
    meta: 'Collapses under prefers-reduced-motion · interface remains complete',
  },
  {
    title: 'Entrance choreography',
    meta: 'Fade-up durations collapse · content still readable in order',
  },
  {
    title: 'Press settle',
    meta: 'Short active scale remains acceptable as state feedback; no bounce',
  },
  {
    title: 'Sound default',
    meta: 'Preference defaults off under reduced motion · still keyboard-toggleable',
  },
];

const RESULTS = [
  {
    title: 'Tab order is linear and complete',
    meta: 'Chrome → lab crumb → demo controls → body links → footer',
    status: 'Hold',
  },
  {
    title: 'focus-visible is system-wide',
    meta: 'Contract token path: outline 2px --signal-light',
    status: 'Hold',
  },
  {
    title: 'Demo buttons are keyboard-operable',
    meta: 'Native button elements · no pointer-only handlers required',
    status: 'Hold',
  },
  {
    title: 'Sound toggle announces state',
    meta: 'aria-pressed + aria-label · no sound on focus alone',
    status: 'Hold',
  },
  {
    title: 'Reduced motion does not remove controls',
    meta: 'Preference and press remain available without breath animation',
    status: 'Hold',
  },
  {
    title: 'Site-wide keyboard packet for every route',
    meta: 'Published at /review/keyboard · skip link + main landmark + shared chrome',
    status: 'Hold',
  },
];

const METHOD = [
  'Open https://www.designesy.org/labs/poise in a desktop browser',
  'Use keyboard only — Tab / Shift+Tab through the page',
  'Confirm each stop matches the tab order table',
  'On buttons: Space and Enter activate without pointer',
  'On sound toggle: confirm aria-pressed flips and no audio on focus alone',
  'Enable prefers-reduced-motion and re-check that controls remain usable',
  'Record any trap, missing ring, or unlabeled control as a tension',
];

const RELATED = [
  {
    href: '/labs/poise',
    title: 'Lab One · Poise',
    meta: 'Artifact under verification',
  },
  {
    href: '/review/poise',
    title: 'Field check · Poise',
    meta: 'Kit One review packet this proof supports',
  },
  {
    href: '/review/keyboard',
    title: 'Keyboard path · site-wide',
    meta: 'Skip link, main landmark, shared chrome packet',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract v0.4.0',
    meta: 'focus-visible, reduced-motion, and adopted Poise interaction rules',
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Verification checklist language',
  },
];

export default function PoiseKeyboardVerificationPage() {
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
            <Link href="/review/poise" className="lab-crumb">
              Poise
            </Link>
            <span aria-hidden="true"> · </span>
            Verification
          </p>
          <h1 className="surface-title">Keyboard path</h1>
          <p className="surface-lede">
            Public proof that Lab One controls are operable without a pointer.
          </p>
          <p className="surface-note">
            This is a verification artifact, not a redesign. It records tab
            order, focus-visible criteria, activation rules, reduced-motion
            notes, and re-run method for /labs/poise.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Published</span>
            <span className="lab-meta-item">Scope · Lab One · Poise</span>
            <span className="lab-meta-item">Date · 2026-07-12</span>
            <span className="lab-meta-item">Result · holds with one open</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="verdict">
          <h2 className="doctrine-heading">Verdict</h2>
          <div className="definition">
            <p className="definition-label">Keyboard path · holds</p>
            <p>
              Poise demo controls and shared chrome are reachable and operable
              by keyboard. Focus rings follow contract tokens. Sound does not
              fire on focus alone. Reduced motion removes non-essential motion
              without removing controls. Site-wide chrome is covered by
              /review/keyboard; this packet remains Lab One specific.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="scope">
          <h2 className="doctrine-heading">Scope</h2>
          <CheckGrid items={SCOPE} />
        </section>

        <section className="doctrine-section fade-up" id="tab-order">
          <h2 className="doctrine-heading">Expected tab order</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Order is document order. No positive tabindex values are used on
            Poise controls.
          </p>
          <div className="row-stack" role="list">
            {TAB_ORDER.map((item) => (
              <ToggleRow key={item.step} index={item.step}>
                <span className="row-body">
                  <span className="row-title">{item.title}</span>
                  <span className="row-meta">{item.meta}</span>
                </span>
              </ToggleRow>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="focus">
          <h2 className="doctrine-heading">Focus-visible criteria</h2>
          <CheckGrid items={FOCUS_RULES} />
        </section>

        <section className="doctrine-section fade-up" id="activation">
          <h2 className="doctrine-heading">Activation</h2>
          <CheckGrid items={ACTIVATION} />
        </section>

        <section className="doctrine-section fade-up" id="reduced-motion">
          <h2 className="doctrine-heading">Reduced motion</h2>
          <CheckGrid items={REDUCED_MOTION} />
        </section>

        <section className="doctrine-section fade-up" id="results">
          <h2 className="doctrine-heading">Results</h2>
          <CheckGrid items={RESULTS} />
        </section>

        <section className="doctrine-section fade-up" id="method">
          <h2 className="doctrine-heading">Re-run method</h2>
          <div className="row-stack" role="list">
            {METHOD.map((item, i) => (
              <ToggleRow key={item} index={String(i + 1).padStart(2, '0')}>
                <span className="row-body">
                  <span className="row-title">{item}</span>
                </span>
              </ToggleRow>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="related">
          <h2 className="doctrine-heading">Related</h2>
          <div className="row-stack" role="list">
            {RELATED.map((item, i) => (
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

        <div className="status-note">
          Keyboard-path verification for Lab One · Poise. Published so inclusion
          claims cite proof, not intention. Site-wide route packets remain an
          open system state — this artifact does not claim them.
        </div>
      </main>

      <Footer />
    </>
  );
}
