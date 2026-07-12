import { openIndex } from '../lib/open-index';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(openIndex, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-open-v0.1.json"',
    },
  });
}
