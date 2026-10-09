import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { pageMeta } from '../../lib/site-meta';
import { AgentActions } from '../../lib/agent-actions';
import { ENGINE_CHECK_COUNT } from '../../lib/check-definitions';

export const metadata: Metadata = pageMeta({
  title: 'The pause button that emptied our pages',
  description:
    'The WCAG 2.2.2 pause control on designesy.org held entrance animations on their first frame. For visitors who paused motion, 8 pages rendered empty. How we found it, fixed it, and gated it.',
  path: '/learn/the-pause-button-that-emptied-our-pages',
  type: 'article',
  ogTitle: 'The pause button that emptied our pages · Designesy',
  ogDescription:
    'Our WCAG 2.2.2 pause control left 8 pages blank for the visitors who used it. How we found it, fixed it, and gated it.',
  twitterDescription:
    'A pause control that hid the content from the people who used it · designesy.org/learn',
});

const WHY_MISSED = [
  {
    num: '01',
    title: 'The CSS was valid',
    desc: 'Every rule did what it said. Nothing in the stylesheet was an error a linter could flag.',
  },
  {
    num: '02',
    title: 'The default view was right',
    desc: 'With motion on, which is how every test and every reviewer saw the site, the pages rendered correctly.',
  },
  {
    num: '03',
    title: 'The failure lived in a setting',
    desc: 'It appeared only after a visitor used the control, and only on pages that used the shared fade-in. Our own score engine reads the stylesheet as written, with motion on, so it passed too.',
  },
];

const GATES = [
  {
    num: '01',
    title: 'Every entrance that starts invisible says how it pauses',
    desc: 'The build lists each animation whose first frame is transparent and fails if one is added without being classified as ending, removed, or decorative.',
  },
  {
    num: '02',
    title: 'Pausing must not hide text',
    desc: 'In CI, 16 routes are loaded with motion on and paused, and any text visible in the first and invisible in the second fails the build. Run against the site as it was before the fix, it fails on the same 8 pages.',
  },
];

export default function PauseCaseStudyPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Learn · Case study</p>
          <h1 className="surface-title" data-scramble>The pause button that emptied our pages</h1>
          <p className="surface-lede">
            Our accessibility control hid the content from the people who used it.
          </p>
          <p className="surface-note">
            On 8 October 2026 we found that the site&apos;s &ldquo;Pause animations&rdquo; switch,
            the control WCAG 2.2.2 asks for, left eight of our pages showing nothing below the
            header. This is what happened, why every check passed, and the gate that now fails the
            build if it happens again.
          </p>
          <AgentActions mdPath="/learn/the-pause-button-that-emptied-our-pages.md" label="the pause case study" />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What a paused visitor saw</h2>
          <div className="definition">
            <p className="definition-label">How the switch works</p>
            <p>
              The switch sets one attribute on the page, and one rule then holds every animation on
              its current frame. The site restores the setting before the first paint, so a visitor
              who paused motion once gets it on every page after.
            </p>
          </div>
          <div className="definition">
            <p className="definition-label">Measured</p>
            <p>
              Many of our page headers fade in from transparent. Held on their first frame, they
              stay transparent. On /pricing a paused visitor saw the top bar and an empty page.
              Across 16 routes we measured, 1,198 pieces of text were visible with motion on and
              invisible with motion paused, on 8 of them: /contracts, /changelog, /labs, /pricing,
              /spring-validator, /badge, /work and /learn.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Why nothing caught it</h2>
          <div className="principle-list">
            {WHY_MISSED.map((r) => (
              <div className="principle" key={r.num}>
                <span className="principle-num">{r.num}</span>
                <div className="principle-body">
                  <h3>{r.title}</h3>
                  <p>{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">How we found it</h2>
          <p className="surface-note">
            We were fixing a smaller defect: under the pause, two status labels on the scoring
            instrument stayed invisible. To check whether the cause was wider, we loaded each route
            twice, once with motion on and once with the pause stored the way the switch stores it,
            and compared which text could be seen. The difference was 1,198 elements.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">The fix</h2>
          <div className="definition">
            <p className="definition-label">Paused means finished</p>
            <p>
              A pause should stop motion and show the finished state. An entrance that starts
              invisible now jumps to its last frame when motion is paused, which is exactly what a
              visitor with motion sees once it finishes. Looping animations still hold still, as the
              switch promises.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">The gate</h2>
          <div className="principle-list">
            {GATES.map((r) => (
              <div className="principle" key={r.num}>
                <span className="principle-num">{r.num}</span>
                <div className="principle-body">
                  <h3>{r.title}</h3>
                  <p>{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Check your own site</h2>
          <p className="surface-note">
            If your site has a pause control or a reduced-motion rule that pauses animations, turn
            it on and reload a page that fades in. If the content does not appear, the same rule is
            holding it on its first frame. We plan to add this check to the score engine in its
            next version, so a score will report it for any URL.
          </p>
          <div className="row-stack" role="list">
            <div role="listitem">
              <Link href="/score" className="row" data-cuelume-hover="bloom" data-cuelume-press>
                <span className="row-index">01</span>
                <span className="row-body">
                  <span className="row-title">Score any URL</span>
                  <span className="row-meta">Run the {ENGINE_CHECK_COUNT}-check engine against your own site</span>
                </span>
                <span className="row-side">
                  <span className="row-side-line">/score</span>
                  <span className="row-side-arrow" aria-hidden="true" />
                </span>
              </Link>
            </div>
            <div role="listitem">
              <Link href="/learn/why-we-built-a-public-design-score" className="row" data-cuelume-hover="bloom" data-cuelume-press>
                <span className="row-index">02</span>
                <span className="row-body">
                  <span className="row-title">Why we built a public design score</span>
                  <span className="row-meta">The same checks grade our site and yours</span>
                </span>
                <span className="row-side">
                  <span className="row-side-line">/learn/why-we-built-a-public-design-score</span>
                  <span className="row-side-arrow" aria-hidden="true" />
                </span>
              </Link>
            </div>
          </div>
        </section>

        <div className="status-note">
          The fix and both gates are public in the designesy-org repository. The numbers on this
          page come from loading each route with motion on and paused in Chrome at 1440 by 900.
        </div>
      </main>

      <Footer />
    </>
  );
}
