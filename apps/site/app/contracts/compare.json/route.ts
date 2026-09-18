import { compareContract } from '../../lib/compare-contract';

import { negotiatedResponse } from '../../lib/content-negotiation';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return negotiatedResponse(compareContract, {
    accept: request.headers.get('accept'),
    title: 'Designesy Compare',
    jsonHeaders: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-compare-v0.1.0.json"',
    },
  });
}