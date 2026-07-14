import { labs } from '../../lib/labs';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(labs.poise, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-lab-poise-v0.1.json"',
    },
  });
}