// /api/leaderboard: withdrawn.
//
// The public leaderboard is withdrawn (decided 2026-10-23, CHANGELOG.md). This
// endpoint answers 410 Gone, so a client that used to read it learns that it is
// gone on purpose, not that the site is broken. designesy.org's own score is
// still served at /api/badge?site=designesy.org.
//
// Not prerendered: Next writes a static body only for a status under 400 (or a
// 404), so this 410 is answered per request. The CORS header is the one the
// endpoint always sent.

const GONE_MESSAGE =
  "The public leaderboard has been withdrawn. designesy.org's own score is at /api/badge?site=designesy.org.";

export function GET() {
  return Response.json(
    {
      ok: false,
      error: 'gone',
      message: GONE_MESSAGE,
      selfScore: '/api/badge?site=designesy.org',
    },
    {
      status: 410,
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
