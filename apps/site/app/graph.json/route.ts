import { graph } from '../lib/graph';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(graph, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-graph-v0.1.json"',
    },
  });
}