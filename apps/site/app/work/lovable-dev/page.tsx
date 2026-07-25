import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'lovable.dev — A on arrival case study',
  description:
    'An AI-built site that already passes the Designesy contract — without knowing it existed. A 93.2, 19 pass, 0 fail. The 3 remaining WARNs and the projection to A+.',
  path: '/work/lovable-dev',
  type: 'article',
  ogTitle: 'lovable.dev · A on arrival · Designesy',
  ogDescription:
    'An AI app platform site that scores A on the Designesy contract without citing it. The upper bound of what an AI-built site can score today.',
  twitterDescription: 'lovable.dev A on arrival case study — designesy.org/work/lovable-dev',
});

const COUNTS = { pass: 19, fail: 0, warn: 3, skip: 4 };

const REMAINING = [
  { id: 'v12', item: 'will-change restricted to transform and opacity only', status: 'WARN', note: 'A non-transform/opacity will-change declaration exists somewhere in the CSS. One-line fix: scope it to transform/opacity only.' },
  { id: 'v16', item: 'Rem-based scale: all text sizes in rem, root at 16px', status: 'WARN', note: 'Most text is in rem but the check wants confirmation the root is locked at 16px. A single html { font-size: 16px; } would resolve it.' },
  { id: 'v19', item: 'tabular-nums: 8 instances across the live CSS', status: 'WARN', note: 'Numeric contexts (stats, counts, prices) could use font-variant-numeric: tabular-nums to prevent column jitter. 0 instances found today.' },
];

const SKIPS = [
  { id: 'v02', item: 'Responsive overflow at 4 viewports', note: 'Needs a browser at 375/720/860/1080. ENABLE_BROWSER_AUDIT=1 on the deployment.' },
  { id: 'v04', item: 'Sound toggle aria-pressed flip', note: 'Needs a browser to click the toggle and observe state. lovable.dev may not have a sound toggle — that would resolve as PASS or WARN.' },
  { id: 'v21', item: 'Core Web Vitals (LCP/INP/CLS)', note: 'Needs PageSpeed Insights API or a Chromium CDP trace. PSI_API_KEY on the deployment.' },
  { id: 'v22', item: 'Primary button WCAG AA contrast', note: 'Browser check — the static path cannot measure computed contrast against a signal fill.' },
];

const LESSONS = [
  'An AI-built site can score A on a contract it never read — good defaults are reachable from a competent generator',
  'Zero failures is the headline; the 3 WARNs are token-strictness, not design failures',
  'The 4 SKIPs are the deployment\'s limitation, not the site\'s — lovable.dev is not penalized for unrun checks',
  'The projected A+ is one session of token tightening away — no architectural change required',
  'This is the strongest argument for the contract: it does not care who built the site, only what the visitor receives',
];

export default function LovableCaseStudy() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/work" className="lab-crumb">
              Work
            </Link>
            <span aria-hidden="true"> · </span>
            Before/after case study
          </p>
          <h1 className="surface-title">lovable.dev · A on arrival</h1>
          <p className="surface-lede">
            An AI-built site that already passes the contract — without
            knowing it existed.
          </p>
          <p className="surface-note">
            lovable.dev was scored by the same /api/score engine that grades
            every other site. The result was an A — 19 pass, 0 fail, 3 warn, 4
            skip — without the site ever citing the Designesy contract. This
            is the case the AI-site-build narrative did not expect: a
            generator that ships good defaults and lands in contract
            territory by accident.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">A · 93.2</span>
            <span className="lab-meta-item">Score · A 93.2 (before only)</span>
            <span className="lab-meta-item">Artifact · lovable.dev</span>
            <span className="lab-meta-item">Date · 2026-07-25</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="summary">
          <h2 className="doctrine-heading">Summary</h2>
          <div className="definition">
            <p className="definition-label">Outcome · A · 93.2</p>
            <p>
              lovable.dev scores A on the Designesy contract — 19 of 26
              checks pass, 0 fail, 3 warn, 4 skip. The 3 warnings are
              token-strictness gaps (will-change scope, rem confirmation,
              tabular-nums). The 4 skips are browser-only checks that the
              current deployment cannot run. The headline is the zero in
              the failure column: an AI app platform shipped a site that
              breaks no contract rules the static engine can see.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="score">
          <h2 className="doctrine-heading">Score breakdown</h2>
          <div className="doctrine-cols">
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                A · 93.2 · before only
              </h3>
              <p className="surface-note" style={{ fontSize: '0.85rem' }}>
                {COUNTS.pass} pass · {COUNTS.fail} fail · {COUNTS.warn} warn · {COUNTS.skip} skip
              </p>
            </div>
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                Projected · A+
              </h3>
              <p className="surface-note" style={{ fontSize: '0.85rem' }}>
                Resolving the 3 WARNs (v12, v16, v19) would land lovable.dev
                at A+ — no architectural change, only token tightening.
              </p>
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="remaining-warns">
          <h2 className="doctrine-heading">The 3 warnings</h2>
          <div className="principle-list">
            {REMAINING.map((r) => (
              <div className="principle" key={r.id}>
                <span className="principle-num">{r.id}</span>
                <div className="principle-body">
                  <h3 style={{ fontSize: '0.95rem' }}>{r.item}</h3>
                  <p>{r.note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="skips">
          <h2 className="doctrine-heading">The 4 skips (honest)</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Each skip is the deployment&rsquo;s limitation, not the
            site&rsquo;s. lovable.dev is not penalized for an unrun check —
            the engine returns SKIP with a diagnostic string.
          </p>
          <div className="principle-list">
            {SKIPS.map((s) => (
              <div className="principle" key={s.id}>
                <span className="principle-num">{s.id}</span>
                <div className="principle-body">
                  <h3 style={{ fontSize: '0.95rem' }}>{s.item}</h3>
                  <p>{s.note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="lessons">
          <h2 className="doctrine-heading">Lessons</h2>
          <CheckGrid items={checkItemsFromStrings(LESSONS)} />
        </section>

        <section className="doctrine-section fade-up" id="sources">
          <h2 className="doctrine-heading">Sources</h2>
          <div className="row-stack" role="list">
            <Link
              href="/score?url=lovable.dev"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Score lovable.dev now</span>
                <span className="row-meta">Re-run the live engine against the same URL</span>
              </span>
            </Link>
            <Link
              href="/contracts/design-system"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Design system contract v0.3.0</span>
                <span className="row-meta">The contract lovable.dev passes without citing</span>
              </span>
            </Link>
            <Link
              href="/score/lovable"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Score your Lovable site</span>
                <span className="row-meta">Target landing page for Lovable-built sites</span>
              </span>
            </Link>
            <Link
              href="/work"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Work — case studies</span>
                <span className="row-meta">Index</span>
              </span>
            </Link>
          </div>
        </section>

        <div className="status-note">
          Case study · lovable.dev · A on arrival. Real score from
          /api/score, captured 2026-07-25. The &ldquo;after&rdquo; is
          projected, not measured — the 3 WARNs would need to be fixed on
          lovable.dev itself, which is not this publisher&rsquo;s site to fix.
        </div>
      </main>

      <Footer />
    </>
  );
}