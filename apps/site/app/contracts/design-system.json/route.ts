import { designSystemContract } from '../../lib/design-system-contract';

import { negotiatedResponse } from '../../lib/content-negotiation';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return negotiatedResponse(designSystemContract, {
    accept: request.headers.get('accept'),
    title: 'Designesy Design System',
    jsonHeaders: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition':
      'inline; filename="designesy-design-system-v0.4.0.json"',
    },
  });
}
