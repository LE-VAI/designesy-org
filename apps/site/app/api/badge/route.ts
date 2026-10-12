// /api/badge: the site's score as a badge, in two forms.
//
//   ?url=<site>[&theme=light]  The live badge (SVG): "Scored by Designesy", the
//                              site, its grade and score, and the date of the
//                              run, from the score cache. Any site; one that
//                              cannot be read or that the SSRF guard refuses
//                              draws "Not scored". See lib/badge/.
//   ?site=<host>               shields.io "endpoint" JSON for a leaderboard site
//                              (below), for shields-style READMEs.
//
// The live badge is the lead embed on /badge (owner decision 2026-10-11): the
// static images read the same for every site, so a page could show one whatever
// its score.
//
// shields embed:
//   https://img.shields.io/endpoint?url=https%3A%2F%2Fwww.designesy.org%2Fapi%2Fbadge%3Fsite%3Ddesignesy.org
// (shields' dynamic-JSON badge cannot filter /api/leaderboard by site, hence this route.)
//
// Why the JSON exists: the README carried a hand-copied score ("93% A, 36
// passed, 1 skipped") that drifted from the live engine (98 A, 39 passed, 0
// skipped on 2026-10-08). A badge built from the leaderboard seed, the same
// data /api/leaderboard serves, cannot drift; it changes when the weekly
// re-score lands.
import { liveBadgeResponse } from '../../lib/badge/live-badge-route';
import { SEED, LEADERBOARD_LAST_SCORED, staleLabel } from '../../leaderboard/seed';

// Grade → shields colour, as a bare hex. A grade takes only its grade token,
// never a brand colour or a shields named colour (brand ledger D5, D37): the
// named set painted D in the brand's flame orange. Each is the light-theme
// grade token from globals.css, because the badge sits on other people's
// pages and does not follow their theme.
//
// Shields picks the text colour itself and the endpoint cannot set it: white
// when (299r + 587g + 114b) / 255000 is at most 0.69, else #333. On every
// colour here it paints white. On the B and C bases (#5d960c, #b07d04) white
// is 3.60:1 and 3.63:1, under 4.5:1, so those two take the grade's -ink token,
// the one built to carry text. WCAG 2.x ratios of the text shields renders:
//
//   grade  colour   token          text   text/colour
//   A      #15803d  --grade-a      #fff   5.02
//   B      #497509  --grade-b-ink  #fff   5.48
//   C      #896203  --grade-c-ink  #fff   5.51
//   D      #c9216c  --grade-d      #fff   5.36
//   F      #dc2626  --grade-f      #fff   4.83
//   -      #6b6b6b  NEUTRAL_FILL   #fff   5.33
//
// scripts/check-badge-grade-tokens.js holds these to the tokens.
const GRADE_COLOR: Record<string, string> = {
  A: '15803d',
  B: '497509',
  C: '896203',
  D: 'c9216c',
  F: 'dc2626',
};
// Unreachable, not scored, not listed: a neutral grey (no grade, no brand).
const NEUTRAL_COLOR = '6b6b6b';

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return value.toLowerCase().replace(/^www\./, '');
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.has('url')) return liveBadgeResponse(request);

  const site = hostOf(params.get('site') ?? '');
  const row = SEED.find((s) => hostOf(s.url) === site);
  // A score the latest run could not renew (site unreachable) is labelled in
  // the leaderboard's own words, "last scored <date> · could not re-score", and
  // greyed: never presented as current.
  const body =
    row && row.score !== null && row.grade
      ? {
          schemaVersion: 1,
          label: 'contract score',
          message: row.unreachable
            ? `${row.score}/100 ${row.grade} (${staleLabel(row.scoredAt)})`
            : `${row.score}/100 ${row.grade}`,
          color: row.unreachable ? NEUTRAL_COLOR : (GRADE_COLOR[row.grade] ?? NEUTRAL_COLOR),
          lastScored: row.scoredAt ?? LEADERBOARD_LAST_SCORED,
        }
      : {
          schemaVersion: 1,
          label: 'contract score',
          message: row ? 'not scored' : 'not on the leaderboard',
          color: NEUTRAL_COLOR,
          isError: !row,
        };
  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
