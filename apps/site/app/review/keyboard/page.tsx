import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { ToggleRow } from '../../lib/toggle-row';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Keyboard path',
  description:
    'Site-wide keyboard path for designesy.org — skip link, shared chrome tab order, focus-visible criteria, activation, and reduced-motion notes.',
  path: '/review/keyboard',
  ogDescription:
    'Public verification packet for shared chrome and default surface routes: skip to content, tab order, focus rings, activation.',
  twitterDescription:
    'Site-wide keyboard verification — designesy.org/review/keyboard',
});

const SCOPE = [
  {
    title: 'Skip to content',
    meta: 'a.skip-link in shared topbar · first focusable control',
  },
  {
    title: 'Shared chrome',
    meta: 'Wordmark, primary nav, sound toggle, footer wayfinding',
  },
  {
    title: 'Surface routes',
    meta: 'Open, Docs, Labs, Kits, Review, Contracts, Privacy, home',
  },
  {
    title: 'In-page row links',
    meta: 'Native Link / button rows with focus-visible rings',
  },
  {
    title: 'Machine exports',
    meta: 'JSON routes remain ordinary navigable URLs',
  },
  {
    title: 'Lab-specific controls',
    meta: 'Covered in detail by /review/poise/keyboard',
  },
];

const TAB_ORDER = [
  {
    step: '01',
    title: 'Skip to content',
    meta: 'Appears on focus · jumps to #main-content',
  },
  {
    step: '02',
    title: 'Topbar wordmark',
    meta: 'Link · home · focus-visible ring',
  },
  {
    step: '03',
    title: 'Primary nav',
    meta: 'Open → Docs → Labs → Kits → Review → Contracts',
  },
  {
    step: '04',
    title: 'Sound toggle',
    meta: 'Button · aria-pressed · no audio on focus alone',
  },
  {
    step: '05',
    title: 'Main content',
    meta: '#main-content · first in-page control in document order',
  },
  {
    step: '06',
    title: 'Body rows, cards, and CTAs',
    meta: 'Links and buttons only · no positive tabindex',
  },
  {
    step: '07',
    title: 'Footer wayfinding',
    meta: 'Open, Docs, Labs, Kits, Review, Contracts, Privacy, mail',
  },
];

const FOCUS_RULES = [
  {
    title: 'focus-visible ring',
    meta: '2px solid --signal-light · outline-offset 2px · radius-sm',
  },
  {
    title: 'Skip link visibility',
    meta: 'Off-screen until focus · no permanent chrome clutter',
  },
  {
    title: 'Native interactive elements',
    meta: 'Primary actions are link or button · no mouse-only traps',
  },
  {
    title: 'Sound toggle state',
    meta: 'aria-label and aria-pressed update with preference',
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
    title: 'Buttons',
    meta: 'Space or Enter · no pointer required',
  },
  {
    title: 'Sound toggle',
    meta: 'Space or Enter flips preference · no unsolicited audio on focus',
  },
  {
    title: 'Skip link',
    meta: 'Enter moves focus target to main content landmark',
  },
];

const REDUCED_MOTION = [
  {
    title: 'Entrance choreography',
    meta: 'Fade-up durations collapse under prefers-reduced-motion',
  },
  {
    title: 'Wordmark breath',
    meta: 'Non-essential motion collapses · chrome remains complete',
  },
  {
    title: 'Scroll behavior',
    meta: 'Smooth scroll disabled when reduced motion is preferred',
  },
  {
    title: 'Controls remain',
    meta: 'Skip link, nav, sound toggle, and CTAs stay operable',
  },
];

const RESULTS = [
  {
    title: 'Skip link is site-wide',
    meta: 'Shared topbar · first Tab stop on every route using Topbar',
    status: 'Hold',
  },
  {
    title: 'Main landmark is addressable',
    meta: 'id=main-content on public page mains',
    status: 'Hold',
  },
  {
    title: 'focus-visible is system-wide',
    meta: 'Contract token path on interactive controls',
    status: 'Hold',
  },
  {
    title: 'Shared chrome is keyboard operable',
    meta: 'Wordmark, nav, sound, footer links',
    status: 'Hold',
  },
  {
    title: 'Lab One still has a dedicated packet',
    meta: '/review/poise/keyboard remains the Poise control proof',
    status: 'Hold',
  },
  {
    title: 'Route-by-route operator re-runs',
    meta: 'This packet defines method; field evidence stays re-runnable',
    status: 'Open practice',
  },
];

const METHOD = [
  'Open any public route on https://www.designesy.org',
  'Press Tab once — confirm Skip to content appears and is first',
  'Activate skip link — focus should land at main content',
  'Tab through wordmark, primary nav, sound toggle, then body controls',
  'Confirm focus-visible rings on each interactive control',
  'On sound toggle: Space/Enter flips aria-pressed; no audio on focus alone',
  'Enable prefers-reduced-motion and re-check that controls remain usable',
  'For Lab One demo buttons, also run /review/poise/keyboard',
];

const RELATED = [
  {
    href: '/review/poise/keyboard',
    title: 'Poise keyboard path',
    meta: 'Lab-specific control proof',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract v0.1.1',
    meta: 'focus-visible, reduced-motion, interaction rules',
  },
  {
    href: '/review/designesy-org',
    title: 'Field check · designesy.org',
    meta: 'Public surface review packet',
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Verification checklist language',
  },
];

export default function SiteKeyboardPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>
            <Link href="/review" className="lab-crumb">
              Review
            </Link>
            <span aria-hidden="true"> · </span>
            Verification
          </p>
          <h1 className="surface-title" data-scramble>Keyboard path</h1>
          <p className="surface-lede">
            Public proof that shared chrome and default surface routes stay
            operable without a pointer.
          </p>
          <p className="surface-note">
            This packet closes the site-wide open from Lab One. It records skip
            link, main landmark, tab order, focus-visible criteria, activation,
            reduced-motion notes, and a re-run method for the whole public
            surface.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Published</span>
            <span className="lab-meta-item">Scope · site-wide chrome + surfaces</span>
            <span className="lab-meta-item">Date · 2026-07-12</span>
            <span className="lab-meta-item">Result · holds</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="verdict">
          <h2 className="doctrine-heading">Verdict</h2>
          <div className="definition">
            <p className="definition-label">Keyboard path · holds</p>
            <p>
              Shared topbar now exposes a skip link as the first focusable
              control. Public mains expose a main-content landmark. Primary
              navigation, sound preference, body rows, and footer links remain
              native interactive elements with contract focus rings. Lab One
              keeps its dedicated packet for demo controls.
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
            shared chrome.
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
            {METHOD.map((step, i) => (
              <ToggleRow key={step} index={String(i + 1).padStart(2, '0')}>
                <span className="row-body">
                  <span className="row-title">{step}</span>
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

        <div className="status-note">
          Keyboard path is part of public legitimacy. If a new interactive
          pattern ships without native focus and activation, treat that as an
          open tension — silence is not accessibility adoption.
        </div>
      </main>

      <Footer />
    </>
  );
}
