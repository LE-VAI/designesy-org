import type { Metadata } from 'next';
import './score.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta, SITE_BASE } from '../lib/site-meta';
import { VerifyForm } from './verify-form';

// Static /score route — the entire page body is static and prerendered at
// build time, served from the CDN edge (TTFB 20-80ms instead of 300-800ms).
//
// The page used to be `export const dynamic = 'force-dynamic' + revalidate = 0`
// — forcing full SSR on every visit. That was necessary only because the
// page body read searchParams.url to pass to VerifyForm. But VerifyForm is
// already 'use client' — it can read the URL from window.location.search on
// mount, the same pattern it already uses for the auto-run-on-deep-link
// useEffect. So the page body has NO dynamic data dependency and can be
// fully static.
//
// Only generateMetadata stays dynamic (it reads searchParams to set OG
// images for ?url= deep links). Next.js handles metadata generation as a
// separate render path from the page body — the page itself stays static.
//
// Note on PPR: Partial Prerendering would achieve the same result (static
// shell + dynamic searchParams in Suspense), but PPR is canary-only in
// Next.js 15.5.x (it ships as stable in Next.js 16 via cacheComponents).
// This approach gets the TTFB win on stable Next.js 15.5.23 today.

// When ?url= is present, the auto-wired opengraph-image.tsx does NOT receive
// the parent page's searchParams — Next.js file-convention OG images get their
// own searchParams, so the auto-wired meta tag points to /score/opengraph-image
// with a build hash, NOT the url param. This means Twitterbot/crawlers fetch
// the default card (no grade) even when sharing /score?url=stripe.com.
//
// generateMetadata lets us explicitly set og:image and twitter:image to the
// dynamic OG route WITH the url param so the scored card renders in previews.
export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ url?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const rawUrl = typeof params?.url === 'string' ? params.url : '';
  const scoredUrl = rawUrl.trim();

  const base = pageMeta({
    title: 'Verify',
    description:
      'Four engines. One composite grade. Score (42 checks), drift (12), AI readiness (10), and guardrails (6) — all on one URL. Real-time. No login.',
    path: '/score',
    ogTitle: 'Verify any site — Designesy',
    ogDescription:
      '68 automated checks across 4 engines — score, drift, AI readiness, guardrails. Enter a URL, get a composite grade.',
  });

  // When a URL is being scored, explicitly point social images to the dynamic
  // OG route with the url param so the grade card renders in link previews.
  if (scoredUrl) {
    const ogImageUrl = `${SITE_BASE}/score/opengraph-image?url=${encodeURIComponent(scoredUrl)}`;
    const twImageUrl = `${SITE_BASE}/score/twitter-image?url=${encodeURIComponent(scoredUrl)}`;
    return {
      ...base,
      openGraph: {
        ...base.openGraph,
        images: [{ url: ogImageUrl, width: 1200, height: 630, alt: 'Designesy Score — design legitimacy grade' }],
      },
      twitter: {
        ...base.twitter,
        images: [{ url: twImageUrl, width: 1200, height: 630, alt: 'Designesy Score — design legitimacy grade' }],
      },
    };
  }

  return base;
}

export default function ScorePage() {
  // The page body is fully static. VerifyForm (a 'use client' component)
  // reads ?url= from window.location.search on mount — the same pattern
  // it already uses for its auto-run-on-deep-link useEffect. No searchParams
  // read here means no dynamic data dependency → the page prerenders at
  // build time and is served from the CDN edge.
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Verification</p>
          <h1 className="surface-title" data-scramble>
            Verify any site
          </h1>
          <p className="surface-lede">
            Four engines. One composite grade. Score (42 checks), drift (12), AI
            readiness (10), and guardrails (6) — all on one URL, one dashboard.
            The compliance layer for AI-generated UI.
          </p>
          <p className="surface-note">
            The homepage gives you the quick 42-check score. This is the power surface —
            every engine at once, with a composite grade that synthesizes score, drift, and
            readiness. Find out how close you are.
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <VerifyForm />
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">What the engines measure</h2>
          <div className="definition">
            <p className="definition-label">Four engines, one verdict</p>
            <p>
              Every check traces back to a specific token or rule in the{' '}
              {/* Span, not <a>: this definition is inside DefinitionCopyEnhancer
                  which makes the whole block role="button" + tabindex=0 (click-to-copy).
                  An <a> descendant triggers axe-core nested-interactive even when
                  demoted (tabindex=-1 + aria-hidden + href stripped), because the
                  rule keys on element type, not on a11y-tree presence. A span with
                  the same class renders identically (.text-link uses border-bottom +
                  ::after, not text-decoration) and carries no interactive semantics
                  to flag. data-dce-href preserves the link target as metadata. */}
              <span className="text-link" data-dce-href="/contracts/design-system">
                design system contract
              </span>
              . The <strong>Score</strong> engine runs 42 checks — motion, typography, color,
              accessibility, identity. <strong>Drift</strong> detects AI-generated UI drift —
              fabricated tokens, inline values, off-system variance. <strong>AI Readiness</strong> probes for machine-readable design context — llms.txt, agent.json, MCP, token files.
              <strong> Guardrails</strong> emits a frozen build-contract bundle — DTCG tokens,
              stylelint config, agent rules. The composite grade synthesizes score, drift, and
              readiness into one defensible number.
            </p>
          </div>

          <div className="engines-grid" data-reveal-group>
            <article className="engine-card" data-reveal>
              <header className="engine-card-head">
                <span className="engine-card-num">01</span>
                <h3 className="engine-card-title">Score</h3>
                <span className="engine-card-count" data-tabular>42 checks</span>
              </header>
              <p className="engine-card-desc">
                Live design-contract compliance — motion, typography, color, accessibility, identity against the v0.4.0 contract.
              </p>
              <ul className="engine-card-list">
                <li>Token presence and binding</li>
                <li>Motion standards (10)</li>
                <li>Cadence typography (cadence)</li>
                <li>Color in OKLCH</li>
                <li>Focus and reduced motion</li>
              </ul>
            </article>

            <article className="engine-card" data-reveal>
              <header className="engine-card-head">
                <span className="engine-card-num">02</span>
                <h3 className="engine-card-title">Drift</h3>
                <span className="engine-card-count" data-tabular>12 checks</span>
              </header>
              <p className="engine-card-desc">
                Detects AI-generated UI drift — fabricated tokens, inline values, off-system variance the Score engine rewards.
              </p>
              <ul className="engine-card-list">
                <li>Inline hex / rgb / hsl values</li>
                <li>Off-token shadow values</li>
                <li>Magic-number spacing</li>
                <li>Duplicate token definitions</li>
                <li>Stack inconsistency</li>
              </ul>
            </article>

            <article className="engine-card" data-reveal>
              <header className="engine-card-head">
                <span className="engine-card-num">03</span>
                <h3 className="engine-card-title">AI Readiness</h3>
                <span className="engine-card-count" data-tabular>10 checks</span>
              </header>
              <p className="engine-card-desc">
                Probes machine-readable design context — whether agents can ingest, score, and remix without scraping HTML.
              </p>
              <ul className="engine-card-list">
                <li>llms.txt presence</li>
                <li>agent.json / .well-known</li>
                <li>Token export (DTCG)</li>
                <li>MCP endpoint</li>
                <li>README / docs surface</li>
              </ul>
            </article>

            <article className="engine-card" data-reveal>
              <header className="engine-card-head">
                <span className="engine-card-num">04</span>
                <h3 className="engine-card-title">Guardrails</h3>
                <span className="engine-card-count" data-tabular>6 checks</span>
              </header>
              <p className="engine-card-desc">
                Emits a frozen build-contract bundle — DTCG tokens, stylelint config, agent rules — so the score is reproducible.
              </p>
              <ul className="engine-card-list">
                <li>Build contract bundle</li>
                <li>Stylelint config emit</li>
                <li>Agent-rule emit</li>
                <li>Token hash pinning</li>
                <li>Provenance line</li>
              </ul>
            </article>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}