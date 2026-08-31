// /api/leaderboard.csv — CSV export of the public leaderboard.
// Agent-citable and researcher-friendly: the sealambda shadcn index and
// Top MCPs both ship CSV/JSON data exports, and agent-readability is now a
// 2026 differentiator. This route serves the same SEED data as /api/leaderboard
// (JSON) but as RFC 4180 CSV with a header row, so agents and spreadsheets can
// ingest it without parsing JSON. CORS-enabled for cross-origin fetch.
//
// Columns: rank, url, name, tier, category, score, grade, pass, fail, warn,
// skip, tokens, seededBecause. Score/grade are empty for unscored sites.
//
// Provenance: studiomeyer four-markets report + sealambda shadcn registry
// maturity index pattern (2026). See /api/leaderboard for the JSON form.

export const dynamic = 'force-static';

import { SEED, LEADERBOARD_VERSION, LEADERBOARD_LAST_SCORED } from '../../leaderboard/seed';

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // RFC 4180: wrap in quotes if the field contains comma, quote, or newline;
  // double any internal quotes.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function GET() {
  const header = [
    'rank',
    'url',
    'name',
    'tier',
    'category',
    'score',
    'grade',
    'pass',
    'fail',
    'warn',
    'skip',
    'tokens',
    'seededBecause',
  ];

  const rows = SEED.map((s) => [
    s.rank,
    s.url,
    s.name,
    s.tier,
    s.category,
    s.score,
    s.grade,
    s.pass,
    s.fail,
    s.warn,
    s.skip,
    s.tokens,
    s.seededBecause,
  ].map(csvEscape).join(','));

  // Prepend metadata as comment rows (RFC 4180 says CSV has no comments, but
  // spreadsheets and agents both handle leading # lines; this is the same
  // convention sealambda uses in their .csv exports).
  const meta = [
    `# Designesy Leaderboard v${LEADERBOARD_VERSION}`,
    `# Last scored: ${LEADERBOARD_LAST_SCORED}`,
    `# Scored: ${SEED.filter((s) => s.score !== null).length} / ${SEED.length}`,
    `# Engine: deterministic 42-check design-contract verification (no LLM)`,
    `# Source: https://www.designesy.org/api/leaderboard (JSON)`,
    `# Methodology: https://www.designesy.org/methodology`,
  ];

  const csv = [...meta, header.join(','), ...rows].join('\n') + '\n';

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-leaderboard.csv"',
    },
  });
}