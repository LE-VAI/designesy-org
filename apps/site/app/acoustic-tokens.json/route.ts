import { acousticTokens } from '../lib/acoustic-tokens';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(acousticTokens, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition':
        'inline; filename="designesy-acoustic-tokens-v0.1.1.json"',
    },
  });
}