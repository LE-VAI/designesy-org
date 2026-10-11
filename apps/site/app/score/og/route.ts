import ScoreOpenGraphImage from '../opengraph-image';

// GET /score/og?url=<site>: the share card of a scored site, with its grade.
//
// /score's metadata used to point og:image at /score/opengraph-image?url=.
// That file is a metadata image route, which receives no search params, so
// Next prerendered it once as the default card and served it immutable:
// every shared result previewed "Score any site", never its grade (the same
// 31,469 bytes with and without ?url=). This handler reads ?url= itself and
// draws the same card (opengraph-image.tsx); the plain card stays at its own
// path for /score without a URL.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url') ?? '';
  const card = await ScoreOpenGraphImage({ searchParams: Promise.resolve({ url }) });
  // A grade can change on the next run: cache for a day, not for a year.
  const headers = new Headers(card.headers);
  headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
  return new Response(card.body, { status: card.status, headers });
}
