import ReportOpenGraphImage from '../opengraph-image';

// GET /score/report/og?url=<site>: the report's share card, with the grade.
// /score/report/opengraph-image is a metadata image route, which receives no
// search params, so it was prerendered once as the default card; this handler
// reads ?url= itself and draws the same card (see app/score/og/route.ts).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url') ?? '';
  const card = await ReportOpenGraphImage({ searchParams: Promise.resolve({ url }) });
  const headers = new Headers(card.headers);
  headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
  return new Response(card.body, { status: card.status, headers });
}
