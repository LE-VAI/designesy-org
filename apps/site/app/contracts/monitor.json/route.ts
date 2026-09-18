import { monitorContract } from '../../lib/monitor-contract';

import { negotiatedResponse } from '../../lib/content-negotiation';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return negotiatedResponse(monitorContract, {
    accept: request.headers.get('accept'),
    title: 'Designesy Monitor',
    jsonHeaders: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-monitor-v0.1.0.json"',
    },
  });
}