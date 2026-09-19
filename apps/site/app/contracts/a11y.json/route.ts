import { a11yContract } from '../../lib/a11y-contract';

import { negotiatedResponse } from '../../lib/content-negotiation';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return negotiatedResponse(a11yContract, {
    accept: request.headers.get('accept'),
    title: 'Designesy A11Y',
    jsonHeaders: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-a11y-v0.1.0.json"',
    },
  });
}