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
// A badge view never starts a score of its own while the cache holds one for
// the site. On a miss it runs the same single cached score a visitor's first
// /score run would, and every later view (and the /score page) reads it. Three
// things keep that cheap:
//   1. The URL is cut to its site (scheme, host, port; no path, query or
//      fragment), so a query string cannot mint a new cache key per view:
//      one key per site per day, per deploy.
//   2. The response is CDN-cached (s-maxage 1 h, then stale-while-revalidate
//      for a day), so repeat views of an embed do not reach the function.
//   3. A blocked or malformed URL is answered before any fetch and cached a
//      day.
// There is no per-IP limiter on this route (nor on /score/badge, which shares
// it, or on the share-card images that call scoreUrl the same way): the edge
// limiter (middleware.ts) spends an Upstash command on every request it sees,
// and an image embedded in a popular page would spend the monthly budget that
// the scoring API's own limit depends on (it ran out on 2026-09-16).
//
// SAFETY
// The URL is validated with the shared SSRF guard (app/lib/url-guard.ts),
// never a local validator; the score's own fetch then goes through safeFetch
// (DNS resolution checked on every hop, the socket pinned to the checked
// address). Nothing from the request reaches the SVG except the site's host,
// reduced to [a-z0-9.-] and escaped (live-badge.ts).

import { autoDetectScope, scoreUrl } from '../../api/score/route';
import { isValidUrl, normalizeInputUrl } from '../url-guard';
import { renderLiveBadge, type BadgeTheme, type LiveBadgeState } from './live-badge';

/** Cache-Control per outcome. */
export const BADGE_CACHE = {
  /** A cached score: an hour at the edge, then served stale for a day while it refreshes. */
  scored: 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
  /** The site could not be read, or scoring failed: try again in five minutes. */
  unread: 'public, max-age=300, s-maxage=300',
  /** No URL, or one the guard refuses: the answer cannot change. */
  refused: 'public, max-age=86400, s-maxage=86400',
} as const;

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

function svgResponse(state: LiveBadgeState, theme: BadgeTheme, cache: string): Response {
  return new Response(renderLiveBadge(state, theme), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': cache,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/** GET handler body: `url` (required) and `theme` (`dark`, the default, or `light`). */
export async function liveBadgeResponse(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const theme: BadgeTheme = params.get('theme') === 'light' ? 'light' : 'dark';
  const site = siteOf(params.get('url') ?? '');
  if (!site) return svgResponse({ kind: 'not-scored', host: null }, theme, BADGE_CACHE.refused);

  const host = new URL(site).hostname;
  try {
    // The same arguments POST /api/score passes for a run with the scope left
    // on auto, so both read one cache entry.
    const result = await scoreUrl(site, autoDetectScope(site));
    const date = typeof result.retrievedAt === 'string' ? result.retrievedAt.slice(0, 10) : '';
    // An unread site has no grade, and a score without the date of its run
    // cannot say when it was true: both draw "Not scored", never a letter.
    if (result.score === null || result.grade === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return svgResponse({ kind: 'not-scored', host }, theme, BADGE_CACHE.unread);
    }
    return svgResponse(
      { kind: 'scored', grade: result.grade, score: result.score, date, host },
      theme,
      BADGE_CACHE.scored,
    );
  } catch {
    return svgResponse({ kind: 'not-scored', host }, theme, BADGE_CACHE.unread);
  }
}
