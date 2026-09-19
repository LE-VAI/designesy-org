import { reportContract } from '../../lib/report-contract';

import { negotiatedResponse } from '../../lib/content-negotiation';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return negotiatedResponse(reportContract, {
    accept: request.headers.get('accept'),
    title: 'Designesy Report',
    jsonHeaders: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-report-v0.1.0.json"',
    },
  });
}