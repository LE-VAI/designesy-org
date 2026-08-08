import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy MCP server — 17 tools over Streamable HTTP';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'MCP',
    title: 'Design intelligence over MCP',
    lede: 'Seventeen tools + one MCP App. Stateless 2026-07-28 spec. Connect Claude Desktop, Cursor, or ZCode.',
    path: 'designesy.org/docs/mcp',
    kind: 'default',
  });
}