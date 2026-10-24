// /api/leaderboard.csv: withdrawn.
//
// The public leaderboard is withdrawn (decided 2026-10-23, CHANGELOG.md),
// and its CSV export with it. This endpoint answers 410 Gone in plain text (there
// is no data left to export as CSV). designesy.org's own score is still served
// at /api/badge?site=designesy.org.
//
// Not prerendered: Next writes a static body only for a status under 400 (or a
// 404), so this 410 is answered per request. The CORS header is the one the
// endpoint always sent.

const GONE_MESSAGE =
  "The public leaderboard has been withdrawn. designesy.org's own score is at /api/badge?site=designesy.org.\n";

export function GET() {
  return new Response(GONE_MESSAGE, {
    status: 410,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
