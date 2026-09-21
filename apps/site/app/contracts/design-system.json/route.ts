import { designSystemContract, CONTRACT_VERSION } from '../../lib/design-system-contract';

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
      // Derived, so the downloaded filename always names the contract it contains.
      // A stale filename here is worse than a stale caption: a user keeps the file.
      `inline; filename="designesy-design-system-${CONTRACT_VERSION}.json"`,
    },
  });
}
