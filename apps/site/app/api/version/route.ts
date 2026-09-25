// /api/version — which build is this?
//
// WHY THIS EXISTS
// Vercel's production alias does not always move with a new deployment. On
// 2026-09-25 that fired on EVERY deploy — four times in one session — in this
// shape: a deploy reaches `Ready`, CI is green, and www.designesy.org keeps
// serving the PREVIOUS build. There was no way to tell from outside, because
// nothing on the site identified which build was answering.
//
// The consequences are worse than a stale page:
//   • The post-deploy smoke test runs against the DEPLOYMENT url, which a stale
//     domain also passes — so the existing check structurally cannot catch it.
//     It tested "both production domains respond" for a 200 only, and a
//     week-old deployment answers 200 perfectly.
//   • Engine readings get cached per-URL for 24h, so a stale domain plus a warm
//     cache makes a shipped fix look like it never deployed. That misdiagnosis
//     already cost real time on this lane (documented in the handoff: "this
//     WILL fool you into thinking a deploy failed").
//
// This endpoint makes the deployed revision observable so the smoke test can
// ASSERT it rather than infer it from a 200.
//
// WHAT IT REPORTS, AND WHY ONLY THIS
// Vercel exposes the deployment's git metadata as build-time environment
// variables. We report the commit SHA plus the branch and environment — the
// minimum needed to answer "is the domain serving the build I just merged?".
//
// Deliberately NOT reported: anything that could aid an attacker. No tokens, no
// internal hostnames, no deployment-specific URLs beyond what is already public.
// A commit SHA of a public repository is already public; the repo is open.
//
// CACHING: `no-store`, and that is load-bearing. A cached answer here would
// defeat the entire purpose — the endpoint exists to report the CURRENT
// deployment, and an edge-cached response would report whichever deployment
// happened to warm it.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Vercel injects these at build time. They are absent in local dev, so each
 * falls back to an explicit marker rather than an empty string — an empty value
 * would make "not a Vercel build" indistinguishable from "unknown commit".
 */
function gitInfo() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || null;
  return {
    commit: sha,
    // Short form for human reading in a log; the full SHA is the assertion.
    commitShort: sha ? sha.slice(0, 7) : null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
    environment: process.env.VERCEL_ENV || 'local',
    // Present on previews and the production deployment alike; NOT the custom
    // domain, which is the whole point — the domain is what may be stale.
    deploymentUrl: process.env.VERCEL_URL || null,
    // Vercel's own deployment id (dpl_...). Distinct from the URL and stable.
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    region: process.env.VERCEL_REGION || null,
  };
}

export async function GET() {
  const info = gitInfo();
  return NextResponse.json(
    {
      ok: true,
      ...info,
      // True when this response came from a real deployment (has Vercel env),
      // false in local dev. Named explicitly so a consumer never has to infer it
      // from a null commit.
      deployed: info.commit !== null,
    },
    {
      headers: {
        // Never cache: a cached build identity answers for the wrong build.
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
