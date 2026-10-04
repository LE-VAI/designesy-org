import type { Metadata } from 'next';
import '../instrument.css';
import '../engine.css';
import './score.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta, SITE_BASE } from '../lib/site-meta';
import { VerifyForm } from './verify-form';
import { CONTRACT_VERSION } from '../lib/design-system-contract';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';
import { DRIFT_CHECK_COUNT } from '../lib/drift-contract';
import { READINESS_CHECK_COUNT } from '../lib/readiness-contract';
import { GUARDRAILS_CHECK_COUNT } from '../lib/guardrails-contract';
import { registry } from '../lib/engine/registry';
import { EngineHead, EngineMethod, EngineNext, GradeLine } from '../lib/engine/engine-page';

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
    // Was 'Verify'. Thirty-one inbound CTAs — the nav item, the command
    // palette, every "Score a site" / "Start scoring" button across /pricing,
    // /leaderboard, /methodology, /continuity, /maturity and the homepage —
    // all say Score, and the URL is /score. Not one inbound link said
    // "Verify". The destination was the only surface using different
    // vocabulary for the same thing, so clicking "Start scoring" landed on a
    // page headed "Verify any site" and the reader had to work out whether
    // they had arrived where they aimed. Aligned to the majority term its own
    // URL already uses.
    //
    // "Verify/Verified" is NOT retired — it is the badge product's name
    // ("Verified by Designesy"), a different artifact from the scoring engine,
    // and it keeps that vocabulary.
    title: 'Score',
    description:
      `Four engines. One composite grade. Score (${ENGINE_CHECK_COUNT} checks), drift (12), AI readiness (10), and guardrails (6), all on one URL. Real-time. No login.`,
    path: '/score',
    ogTitle: 'Score any site · Designesy',
    // The total is COMPUTED from the four engines' own check lists. This string
    // read "68 automated checks" while the engines actually sum to 70
    // (42+12+10+6) — a literal that had drifted from the engines it described,
    // on the page whose job is to count them. Deriving it means adding a check
    // to any engine updates this line automatically.
    ogDescription: `${ENGINE_CHECK_COUNT + DRIFT_CHECK_COUNT + READINESS_CHECK_COUNT + GUARDRAILS_CHECK_COUNT} automated checks across 4 engines: score, drift, AI readiness, guardrails. Enter a URL, get a composite grade.`,
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
        images: [{ url: ogImageUrl, width: 1200, height: 630, alt: 'Designesy Score: design legitimacy grade' }],
      },
      twitter: {
        ...base.twitter,
        images: [{ url: twImageUrl, width: 1200, height: 630, alt: 'Designesy Score: design legitimacy grade' }],
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
  const parts = (['score', 'drift', 'readiness', 'guardrails'] as const).map((k) => registry(k));
  const view = {
    checks: parts.flatMap((r) => r.checks),
    groups: parts.flatMap((r) => r.groups),
    machine: '/contracts/design-system.json',
  };
  const names = { score: 'Contract score', drift: 'Drift radar', readiness: 'AI readiness', guardrails: 'Guardrails' };
  const blocks = parts.map((r) => ({
    key: r.key,
    name: names[r.key as keyof typeof names],
    count: r.count,
    ids: r.checks.map((c) => c.id),
  }));
  const total = ENGINE_CHECK_COUNT + DRIFT_CHECK_COUNT + READINESS_CHECK_COUNT + GUARDRAILS_CHECK_COUNT;

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg" data-pagefind-meta="priority:high">
        <EngineHead
          route="/score"
          name="Score any site"
          thesis={`All four engines on one URL: the ${ENGINE_CHECK_COUNT}-check contract score, drift, AI readiness and guardrails, with one composite grade and every finding a click away.`}
          facts={['4 engines', `${total} checks`, 'no login']}
          contract={{ href: '/contracts/design-system', label: `contract ${CONTRACT_VERSION}` }}
        />

        <VerifyForm view={view} blocks={blocks} />

        <EngineMethod
          steps={[
            { title: 'Fire four engines', text: 'In parallel, each fetching the page itself: contract score, drift, readiness, guardrails.' },
            { title: 'Weigh three', text: 'The composite is the contract score at 50%, drift at 30% and readiness at 20%.' },
            { title: 'Keep one apart', text: 'Guardrails grades the bundle it writes for agents, so it reports beside the composite.' },
            { title: 'Remember the last run', text: 'Your previous composite for the site is kept in this browser, and the change shows on the next run.' },
          ]}
          formula={
            <>
              <span><b>composite</b> = score × 0.5 + drift × 0.3 + readiness × 0.2</span>
              <GradeLine />
              <span>Checks a person must confirm are left out of every score.</span>
            </>
          }
        />

        <EngineNext
          items={[
            { title: 'Read the contract behind the checks', desc: `The ${CONTRACT_VERSION} design system contract, with every rule the ${ENGINE_CHECK_COUNT} checks enforce.`, route: '/contracts/design-system' },
            { title: 'See where others land', desc: 'The public leaderboard, scored by the same engine and dated.', route: '/leaderboard' },
            { title: 'Watch a site over time', desc: 'Monitor re-runs the drift checks and compares every run with your first.', route: '/monitor' },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
