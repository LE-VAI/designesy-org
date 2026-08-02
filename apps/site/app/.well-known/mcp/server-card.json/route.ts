// /.well-known/mcp/server-card.json — MCP Server Card (SEP-1649)
// A static discovery document that MCP clients (Claude Desktop, Cursor, etc.)
// probe at /.well-known/mcp/server-card.json before connecting to a server URL.
// Neither SEP-1649 nor SEP-1960 is merged into the MCP core spec yet, but
// Claude Desktop already probes this endpoint, so shipping it is a near-zero
// discovery hedge. The server card describes the server's identity, transport,
// and capabilities without requiring the client to open a session first.
//
// Provenance: SEP-1649 (server-card.json), alatirok.com MCP server discovery
// report 2026-07. The official registry listing at io.github.LE-VAI/designesy-org
// remains the canonical registration; this card is the per-origin discovery layer.

export const dynamic = 'force-static';

const SERVER_URL = 'https://www.designesy.org/api/mcp';
const HOMEPAGE = 'https://www.designesy.org';
const MCP_REGISTRY_ID = 'io.github.LE-VAI/designesy-org';

// The 16 tool names exposed by the MCP server (apps/site/app/api/mcp/route.ts).
// Kept in sync manually; the server.tool() registrations are the source of truth.
const TOOLS = [
  'designesy_catalog',
  'designesy_contract',
  'designesy_design_review',
  'designesy_skill_md',
  'designesy_agent_json',
  'designesy_llms_txt',
  'designesy_llms_full_txt',
  'designesy_score',
  'designesy_tokens_score',
  'designesy_a11y_score',
  'designesy_motion_score',
  'designesy_drift_score',
  'designesy_readiness_score',
  'designesy_guardrails',
  'designesy_monitor_score',
  'designesy_compare',
];

export function GET() {
  const body = {
    $schema: 'https://raw.githubusercontent.com/modelcontextprotocol/spec/refs/heads/main/schema/server-card.json',
    'server-card-version': '0.1',
    server: {
      name: 'designesy',
      version: '1.4.1',
      description:
        'Design-system contract verification, scoring, and review tools for AI agents.',
      icon: `${HOMEPAGE}/badge.svg`,
      homepage: HOMEPAGE,
      repository: 'https://github.com/LE-VAI/designesy-org',
      registry_ids: [MCP_REGISTRY_ID],
      transport: {
        type: 'streamable-http',
        url: SERVER_URL,
      },
      tools: TOOLS.map((name) => ({ name })),
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
    updated: '2026-07-29',
  };

  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="server-card.json"',
    },
  });
}