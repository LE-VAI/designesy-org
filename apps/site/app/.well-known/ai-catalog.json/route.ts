// /.well-known/ai-catalog.json — the domain's AI Catalog, the discovery entry
// point SEP-2127 names: one entry, pointing at the MCP Server Card at
// /api/mcp/server-card. Built in app/lib/mcp-server-card.ts.

import { AI_CATALOG_MEDIA_TYPE, buildAiCatalog, discoveryHeaders } from '../../lib/mcp-server-card';

export const dynamic = 'force-static';

export function GET() {
  return new Response(JSON.stringify(buildAiCatalog(), null, 2), {
    headers: discoveryHeaders(AI_CATALOG_MEDIA_TYPE, 'ai-catalog.json'),
  });
}
