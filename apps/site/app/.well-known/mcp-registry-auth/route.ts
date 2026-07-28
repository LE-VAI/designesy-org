import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

// MCP Registry auth endpoint.
// Format: v=MCPv1; k=ed25519; p=<base32-pubkey>
// Required by `mcp-publisher login http` to verify ownership of designesy.org
// before publishing to the official MCP Registry at registry.modelcontextprotocol.io.
// See: D:\1ATLAS\outputs\design\designesy-org-audit\artifacts\mcp-registry\SUBMISSION_GUIDE.md
const MCP_REGISTRY_PUBKEY =
  'KTjVMMx28qGje7bzJZgTDNxfKFvscMhA0Rh96qLPrHE=';

export function GET() {
  return new NextResponse(`v=MCPv1; k=ed25519; p=${MCP_REGISTRY_PUBKEY}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}