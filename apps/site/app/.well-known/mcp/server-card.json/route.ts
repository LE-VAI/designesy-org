// /.well-known/mcp/server-card.json — the pre-Final location of the MCP Server
// Card. SEP-2127 (Final) moved the card to /api/mcp/server-card and advises
// against .well-known for it, but Smithery still reads this path when a live
// scan fails, so it serves the same card, from the same builder.
//
// Until 2026-10-11 this route kept its own list of 17 tool names, a description
// the registry no longer used, a prompts capability the server does not have,
// and a date frozen at 2026-08-02. scripts/check-mcp-tool-parity.js now fails
// if it names a tool or stops calling buildServerCard().

import { MCP_SERVER_VERSION } from '../../../lib/mcp-version';
import { buildServerCard, discoveryHeaders } from '../../../lib/mcp-server-card';

export const dynamic = 'force-static';

export function GET() {
  return new Response(JSON.stringify(buildServerCard(MCP_SERVER_VERSION), null, 2), {
    headers: discoveryHeaders('application/json', 'server-card.json'),
  });
}
