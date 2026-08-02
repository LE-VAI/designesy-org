import { monitorContract } from '../../lib/monitor-contract';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(monitorContract, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-monitor-v0.1.0.json"',
    },
  });
}