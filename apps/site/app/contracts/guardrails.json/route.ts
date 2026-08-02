import { guardrailsContract } from '../../lib/guardrails-contract';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(guardrailsContract, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-guardrails-v0.1.0.json"',
    },
  });
}