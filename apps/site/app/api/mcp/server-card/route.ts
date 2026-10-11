// GET /api/mcp/server-card — this server's MCP Server Card (SEP-2127, Final).
// The location the spec reserves: the streamable-HTTP URL plus /server-card.
// Clients read it before connecting; /.well-known/ai-catalog.json points here.
// The body comes from app/lib/mcp-server-card.ts, as the legacy copy's does.

import { MCP_SERVER_VERSION } from '../../../lib/mcp-version';
import { SERVER_CARD_MEDIA_TYPE, buildServerCard, discoveryHeaders } from '../../../lib/mcp-server-card';

export const dynamic = 'force-static';

export function GET() {
  return new Response(JSON.stringify(buildServerCard(MCP_SERVER_VERSION), null, 2), {
    headers: discoveryHeaders(SERVER_CARD_MEDIA_TYPE, 'server-card.json'),
  });
}
