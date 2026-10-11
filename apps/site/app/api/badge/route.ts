// /api/badge?site=<host> — shields.io "endpoint" badge JSON for a leaderboard site.
//
// Why: the README carried a hand-copied score ("93% A, 36 passed, 1 skipped")
// that drifted from the live engine (98 A, 39 passed, 0 skipped on 2026-10-08).
// A badge built from the leaderboard seed — the same data /api/leaderboard
// serves — cannot drift; it changes when the weekly re-score lands.
//
// Embed:
//   https://img.shields.io/endpoint?url=https%3A%2F%2Fwww.designesy.org%2Fapi%2Fbadge%3Fsite%3Ddesignesy.org
// (shields' dynamic-JSON badge cannot filter /api/leaderboard by site, hence this route.)
import { SEED, LEADERBOARD_LAST_SCORED } from '../../leaderboard/seed';

// Grade → shields colour, as a bare hex. A grade takes only its grade token,
// never a brand colour or a shields named colour (brand ledger D5, D37): the
// named set painted D in the brand's flame orange. Each is the light-theme
// grade token from globals.css, as on the SVG badge at /score/badge, because
// the badge sits on other people's pages and does not follow their theme.
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
// Unreachable, not scored, not listed: the SVG badge's neutral grey.
const NEUTRAL_COLOR = '6b6b6b';

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return value.toLowerCase().replace(/^www\./, '');
  }
}

export function GET(request: Request) {
  const site = hostOf(new URL(request.url).searchParams.get('site') ?? '');
  const row = SEED.find((s) => hostOf(s.url) === site);
  // A held-over score (site unreachable on the last run) is labelled as such and
  // greyed, with its own measurement date -- never presented as current.
  const body =
    row && row.score !== null && row.grade
      ? {
          schemaVersion: 1,
          label: 'contract score',
          message: row.unreachable
            ? `${row.score}/100 ${row.grade} (held over from ${row.scoredAt ?? 'an earlier run'})`
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
