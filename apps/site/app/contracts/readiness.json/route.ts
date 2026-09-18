import { readinessContract } from '../../lib/readiness-contract';

import { negotiatedResponse } from '../../lib/content-negotiation';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return negotiatedResponse(readinessContract, {
    accept: request.headers.get('accept'),
    title: 'Designesy Readiness',
    jsonHeaders: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-readiness-v0.1.0.json"',
    },
  });
}