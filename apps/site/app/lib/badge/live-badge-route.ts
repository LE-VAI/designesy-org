// The live badge's request handling, shared by GET /api/badge?url= and the
// older GET /score/badge?url= (whose embeds keep working and now draw the same
// badge).
//
// WHAT IT SHOWS
// The site's current cached score: the same cache entry the /score page and
// POST /api/score read and write (scoreUrl, keyed by the URL and the scope
// /api/score derives from it, kept 24 h and keyed by the deploy's commit). So
// the badge and the report it links to show the same run, and the date on the
// badge is that run's own timestamp (retrievedAt, stamped inside the cached
// function), never the time the image was served.
//
// COST
// A badge view that the cache answers costs nothing and is never limited. A
// cache miss starts a fresh score (fetch the site, run the engine), and that
// path alone is limited:
//   1. The URL is cut to its site (scheme, host, port; no path, query or
//      fragment), so a query string cannot mint a new cache key per view:
//      one key per site per day, per deploy.
//   2. A miss runs only through scoreUrl's miss gate (withScoreMissGate), which
//      asks lib/badge/miss-limit.ts first: 20 fresh scores per IP and 300 in
//      all per hour, Upstash-backed, failing CLOSED. A refused miss draws
//      "Not scored", cached 60 s, and no fetch happens. It is never a 429: a
//      broken image in someone's README is worse than a neutral badge.
//   3. The response is CDN-cached (s-maxage 1 h, then stale-while-revalidate
//      for a day), so repeat views of an embed do not reach the function.
//   4. A blocked or malformed URL is answered before any fetch and cached a
//      day.
// No limit sits on the views themselves: README embeds arrive through GitHub's
// image proxy from a shared pool of IPs, and a per-view limit would refuse
// legitimate cached views (and spend an Upstash command on each).
// scripts/check-badge-miss-limit.js runs this route offline and holds all of
// it: a miss is gated, a hit is not, a refusal fetches nothing.
//
// SAFETY
// The URL is validated with the shared SSRF guard (app/lib/url-guard.ts),
// never a local validator; the score's own fetch then goes through safeFetch
// (DNS resolution checked on every hop, the socket pinned to the checked
// address). Nothing from the request reaches the SVG except the site's host,
// reduced to [a-z0-9.-] and escaped (live-badge.ts).

import { autoDetectScope, scoreUrl } from '../../api/score/route';
import { withScoreMissGate } from '../score-miss-gate';
import { isValidUrl, normalizeInputUrl } from '../url-guard';
import { renderLiveBadge, type BadgeTheme, type LiveBadgeState } from './live-badge';
import { decideBadgeMiss, type MissDecision } from './miss-limit';

/** Cache-Control per outcome. */
export const BADGE_CACHE = {
  /** A cached score: an hour at the edge, then served stale for a day while it refreshes. */
  scored: 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
  /** The site could not be read, or scoring failed: try again in five minutes. */
  unread: 'public, max-age=300, s-maxage=300',
  /** No URL, or one the guard refuses: the answer cannot change. */
  refused: 'public, max-age=86400, s-maxage=86400',
  /** A cache miss the miss limit refused: ask again in a minute. */
  limited: 'public, max-age=60, s-maxage=60',
} as const;

/** Thrown by the miss gate to stop a fresh score before it starts. */
class BadgeMissRefused extends Error {
  constructor(readonly decision: MissDecision) {
    super('badge miss refused');
  }
}

/**
 * The site a badge URL names: `https://host[:port]/`, validated by the shared
 * guard before and after the cut. Null for anything the guard refuses.
 */
export function siteOf(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  const url = normalizeInputUrl(trimmed);
  if (!url || !isValidUrl(url)) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  const site = `${u.protocol}//${u.host}/`;
  return isValidUrl(site) ? site : null;
}

function svgResponse(state: LiveBadgeState, theme: BadgeTheme, cache: string, miss?: MissDecision | null): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': cache,
    'Access-Control-Allow-Origin': '*',
  };
  // On a miss, say whether the miss limiter ran (active, degraded, inactive),
  // as the middleware does for the API routes: a skipped limiter must not look
  // like a working one from the outside.
  if (miss) headers['RateLimit-Limiter'] = miss.outcome;
  return new Response(renderLiveBadge(state, theme), { headers });
}

/** GET handler body: `url` (required) and `theme` (`dark`, the default, or `light`). */
export async function liveBadgeResponse(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const theme: BadgeTheme = params.get('theme') === 'light' ? 'light' : 'dark';
  const site = siteOf(params.get('url') ?? '');
  if (!site) return svgResponse({ kind: 'not-scored', host: null }, theme, BADGE_CACHE.refused);

  const host = new URL(site).hostname;
  // Set only when the cache missed: the gate runs on a miss, never on a hit.
  const miss: { decision: MissDecision | null } = { decision: null };
  try {
    // The same arguments POST /api/score passes for a run with the scope left
    // on auto, so both read one cache entry. The gate runs before a fresh
    // score only; a refusal throws out of the cached function before any fetch.
    const result = await withScoreMissGate(
      async () => {
        miss.decision = await decideBadgeMiss(request.headers);
        if (!miss.decision.allowed) throw new BadgeMissRefused(miss.decision);
      },
      () => scoreUrl(site, autoDetectScope(site)),
    );
    const date = typeof result.retrievedAt === 'string' ? result.retrievedAt.slice(0, 10) : '';
    // An unread site has no grade, and a score without the date of its run
    // cannot say when it was true: both draw "Not scored", never a letter.
    if (result.score === null || result.grade === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return svgResponse({ kind: 'not-scored', host }, theme, BADGE_CACHE.unread, miss.decision);
    }
    return svgResponse(
      { kind: 'scored', grade: result.grade, score: result.score, date, host },
      theme,
      BADGE_CACHE.scored,
      miss.decision,
    );
  } catch (err) {
    if (err instanceof BadgeMissRefused) {
      return svgResponse({ kind: 'not-scored', host }, theme, BADGE_CACHE.limited, err.decision);
    }
    return svgResponse({ kind: 'not-scored', host }, theme, BADGE_CACHE.unread, miss.decision);
  }
}
