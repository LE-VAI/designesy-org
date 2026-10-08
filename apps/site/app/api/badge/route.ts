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

const GRADE_COLOR: Record<string, string> = {
  A: 'brightgreen',
  B: 'green',
  C: 'yellow',
  D: 'orange',
  F: 'red',
};

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
          color: row.unreachable ? 'lightgrey' : (GRADE_COLOR[row.grade] ?? 'blue'),
          lastScored: row.scoredAt ?? LEADERBOARD_LAST_SCORED,
        }
      : {
          schemaVersion: 1,
          label: 'contract score',
          message: row ? 'not scored' : 'not on the leaderboard',
          color: 'lightgrey',
          isError: !row,
        };
  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
