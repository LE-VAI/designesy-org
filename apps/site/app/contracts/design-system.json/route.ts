import { designSystemContract } from '../../lib/design-system-contract';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(designSystemContract, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition':
        'inline; filename="designesy-design-system-v0.3.0.json"',
    },
  });
}
