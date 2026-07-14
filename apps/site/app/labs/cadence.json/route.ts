import { labs } from '../../lib/labs';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(labs.cadence, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-lab-cadence-v0.1.json"',
    },
  });
}