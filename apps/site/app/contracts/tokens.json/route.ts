import { tokensContract } from '../../lib/tokens-contract';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(tokensContract, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-tokens-v0.1.0.json"',
    },
  });
}