import { a11yContract } from '../../lib/a11y-contract';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(a11yContract, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-a11y-v0.1.0.json"',
    },
  });
}