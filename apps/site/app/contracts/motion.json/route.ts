import { motionContract } from '../../lib/motion-contract';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(motionContract, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-motion-v0.1.0.json"',
    },
  });
}