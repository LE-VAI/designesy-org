import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'MCP server',
  description:
    'Designesy design intelligence over MCP — Streamable HTTP at https://www.designesy.org/api/mcp. Eight tools: catalog, contract, review kit, SKILL.md, agent.json, llms.txt, llms-full.txt, and the live score engine. Connect Claude Desktop, Cursor, or ZCode.',
  path: '/docs/mcp',
  ogTitle: 'MCP server · Designesy',
  ogDescription:
    'Streamable HTTP endpoint with 8 design-intelligence tools. Copy-paste client configs for Claude Desktop, Cursor, and ZCode.',
  twitterDescription: 'Designesy MCP server — designesy.org/docs/mcp',
});

const ENDPOINT = 'https://www.designesy.org/api/mcp';

const TOOLS = [
  {
    name: 'designesy_catalog',
    kind: 'Read-only',
    desc: 'The full package catalog — 12 published packages (contracts, kits, labs, reviews) with versions, URLs, statuses, standing rules, and machine exports.',
    args: 'none',
    source: '/open.json',
  },
  {
    name: 'designesy_contract',
    kind: 'Read-only',
    desc: 'The design-system contract v0.3.0 — tokens, motion, acoustic, takt, cadence, typography, components, verification, open tensions. Optional section filter.',
    args: 'section?: string',
    source: '/contracts/design-system.json',
  },
  {
    name: 'designesy_design_review',
    kind: 'Read-only',
    desc: 'The Design Review kit — 8 dimensions, agent prompt, output format, verification checklist. Optionally pre-fills the prompt with artifact, purpose, context, rules.',
    args: 'artifact?, purpose?, context?, rules?',
    source: '/kits/design-review.json',
  },
  {
    name: 'designesy_skill_md',
    kind: 'Read-only',
    desc: 'The SKILL.md agent-skill export of the contract — behavioral rules, tokens, anti-patterns, and verification in paste-ready markdown.',
    args: 'none',
    source: '/contracts/skill',
  },
  {
    name: 'designesy_agent_json',
    kind: 'Read-only',
    desc: 'The /.well-known/agent.json discovery document — identity, authority, ingest protocol, packages, machine exports, permission policy, cite templates.',
    args: 'none',
    source: '/.well-known/agent.json',
  },
  {
    name: 'designesy_llms_txt',
    kind: 'Read-only',
    desc: 'The short agent-facing brief — canonical reference, topics, ingest steps, package list, contact. Returns text/plain.',
    args: 'none',
    source: '/llms.txt',
  },
  {
    name: 'designesy_llms_full_txt',
    kind: 'Read-only',
    desc: 'The full agent-facing brief — ingest protocol, discovery endpoints, all packages, standing rules, anti-patterns, and the complete paste-ready agent prompt. Returns text/plain.',
    args: 'none',
    source: '/llms-full.txt',
  },
  {
    name: 'designesy_score',
    kind: 'Executable',
    desc: 'The 34-check verification engine. Fetches the page HTML, extracts all CSS, parses :root custom properties, and runs 23+ automated checks with provenance back to contract tokens. Returns overall score, letter grade, and per-check breakdown. Browser-only checks (Core Web Vitals, viewport overflow, sound toggle) return SKIP.',
    args: 'url?: string (defaults to designesy.org)',
    source: '/api/score',
  },
];

const CLIENT_CONFIGS = [
  {
    client: 'Claude Desktop',
    file: '~/Library/Application Support/Claude/claude_desktop_config.json (macOS)\n%APPDATA%\\Claude\\claude_desktop_config.json (Windows)',
    config: `{
  "mcpServers": {
    "designesy": {
      "url": "${ENDPOINT}"
    }
  }
}`,
    note: 'Claude Desktop supports Streamable HTTP natively. No mcp-remote wrapper needed.',
  },
  {
    client: 'Cursor',
    file: '.cursor/mcp.json',
    config: `{
  "mcpServers": {
    "designesy": {
      "url": "${ENDPOINT}"
    }
  }
}`,
    note: 'Cursor supports Streamable HTTP servers in recent versions. If your version needs stdio, use the mcp-remote bridge below.',
  },
  {
    client: 'ZCode',
    file: '.zcode/mcp.json or workspace settings',
    config: `{
  "mcpServers": {
    "designesy": {
      "url": "${ENDPOINT}"
    }
  }
}`,
    note: 'ZCode supports Streamable HTTP MCP servers. This is the same server that powers the designesy-mcp tools in this project.',
  },
  {
    client: 'Any stdio-only client (mcp-remote bridge)',
    file: 'npx mcp-remote ${ENDPOINT}',
    config: `{
  "mcpServers": {
    "designesy": {
      "command": "npx",
      "args": ["mcp-remote", "${ENDPOINT}"]
    }
  }
}`,
    note: 'For clients that only speak stdio (older Claude Desktop builds, some IDEs). The mcp-remote npm package wraps a Streamable HTTP endpoint as a local stdio server.',
  },
];

export default function McpDocsPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Integration surface</p>
          <h1 className="surface-title" data-scramble>MCP server</h1>
          <p className="surface-lede">
            Designesy design intelligence over the Model Context Protocol —
            eight tools, one endpoint, no wrapper.
          </p>
          <p className="surface-note">
            The Designesy MCP server runs natively on the same Vercel project
            as this site. It speaks the 2026-07-28 Streamable HTTP spec —
            stateless, no sessions, no handshake. Any MCP-compatible client
            can connect.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <div className="definition">
            <p className="definition-label">Endpoint</p>
            <p>
              <code>{ENDPOINT}</code>
            </p>
          </div>
          <div className="definition">
            <p className="definition-label">Transport</p>
            <p>
              Streamable HTTP · POST · JSON or SSE response · stateless
            </p>
          </div>
          <div className="definition">
            <p className="definition-label">Registry</p>
            <p>
              <code>org.designesy.www/designesy</code> v1.2.0 on{' '}
              <a
                href="https://registry.modelcontextprotocol.io"
                rel="noopener noreferrer"
              >
                registry.modelcontextprotocol.io
              </a>
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Tools</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Seven read-only tools fetch public machine exports from
            designesy.org with a 5-minute in-memory cache. One executable
            tool runs the 34-check verification engine against any live URL.
            All tools return JSON.
          </p>
          <div className="row-stack" role="list">
            {TOOLS.map((tool, i) => (
              <div
                key={tool.name}
                className="row"
                role="listitem"
                style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}
              >
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body" style={{ width: '100%' }}>
                  <span className="row-title">
                    {tool.name}{' '}
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: tool.kind === 'Executable' ? 'var(--accent)' : 'var(--muted)',
                        marginLeft: '0.5rem',
                      }}
                    >
                      {tool.kind}
                    </span>
                  </span>
                  <span className="row-meta">{tool.desc}</span>
                  <span
                    style={{
                      display: 'flex',
                      gap: '1.5rem',
                      flexWrap: 'wrap',
                      marginTop: '0.5rem',
                      fontSize: '0.8rem',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    <span>
                      <strong style={{ opacity: 0.6 }}>args:</strong>{' '}
                      {tool.args}
                    </span>
                    <span>
                      <strong style={{ opacity: 0.6 }}>source:</strong>{' '}
                      <a href={tool.source}>{tool.source}</a>
                    </span>
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Client configuration</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Copy-paste the config for your client. Most modern clients support
            Streamable HTTP natively — just point them at the endpoint. For
            stdio-only clients, use the mcp-remote bridge.
          </p>
          <div className="doctrine-cols" style={{ flexDirection: 'column', gap: '2rem' }}>
            {CLIENT_CONFIGS.map((cfg) => (
              <div key={cfg.client}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.5rem' }}>
                  {cfg.client}
                </h3>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--muted)',
                    fontFamily: 'var(--font-mono, monospace)',
                    marginBottom: '0.75rem',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {cfg.file}
                </p>
                <pre
                  style={{
                    background: 'var(--surface, #0a0a0c)',
                    border: '1px solid var(--border, rgba(255,255,255,0.08))',
                    borderRadius: '0.5rem',
                    padding: '1rem 1.25rem',
                    overflowX: 'auto',
                    fontSize: '0.82rem',
                    fontFamily: 'var(--font-mono, monospace)',
                    lineHeight: 1.6,
                    color: 'var(--ink, #f5f5f7)',
                  }}
                >
                  {cfg.config}
                </pre>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--muted)',
                    marginTop: '0.5rem',
                  }}
                >
                  {cfg.note}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">How it works</h2>
          <div className="definition">
            <p className="definition-label">Runtime</p>
            <p>
              Vercel Node.js serverless · mcp-handler (Vercel&apos;s official
              MCP adapter) · @modelcontextprotocol/sdk · Zod schemas ·
              300-second max duration (Pro Plan)
            </p>
          </div>
          <div className="definition">
            <p className="definition-label">Caching</p>
            <p>
              5-minute in-memory cache on read-only tools. Vercel Fluid
              Compute reuses warm instances, so cache hits are common. The
              executable tool (designesy_score) is never cached — every
              score request hits the live engine.
            </p>
          </div>
          <div className="definition">
            <p className="definition-label">No Python</p>
            <p>
              The server is native TypeScript. It runs in the same Vercel
              runtime as this site — no child processes, no mcp-proxy bridge,
              no external dependencies beyond the MCP SDK.
            </p>
          </div>
          <p className="surface-note">
            The seven read-only tools fetch the same public machine exports
            that any HTTP client can fetch directly. The MCP server adds
            structured tool schemas, Zod validation, and a single
            authenticated endpoint — useful for agents that prefer the MCP
            protocol over raw HTTP.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Quick test</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Verify the endpoint is live with a single curl:
          </p>
          <pre
            style={{
              background: 'var(--surface, #0a0a0c)',
              border: '1px solid var(--border, rgba(255,255,255,0.08))',
              borderRadius: '0.5rem',
              padding: '1rem 1.25rem',
              overflowX: 'auto',
              fontSize: '0.82rem',
              fontFamily: 'var(--font-mono, monospace)',
              lineHeight: 1.6,
              color: 'var(--ink, #f5f5f7)',
            }}
          >{`curl -X POST ${ENDPOINT} \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}`}</pre>
          <p className="surface-note" style={{ marginTop: '1rem' }}>
            The response is a JSON-RPC 2.0 message listing all eight tools
            with their schemas.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Related</h2>
          <div className="row-stack" role="list">
            <Link
              href="/docs"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Docs · orientation</span>
                <span className="row-meta">
                  Mission, principles, architecture, public voice
                </span>
              </span>
            </Link>
            <Link
              href="/open"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Open design intelligence</span>
                <span className="row-meta">
                  Human index and machine feed of portable packages
                </span>
              </span>
            </Link>
            <Link
              href="/open.json"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">open.json</span>
                <span className="row-meta">
                  Machine catalog — the same data the MCP server serves
                </span>
              </span>
            </Link>
            <Link
              href="/contracts/design-system"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Design system contract</span>
                <span className="row-meta">
                  v0.3.0 — the contract behind designesy_contract
                </span>
              </span>
            </Link>
          </div>
        </section>

        <div className="status-note">
          The MCP server is a native integration surface — no wrapper, no
          proxy, no Python. It is the same design intelligence, available to
          any agent that speaks the protocol.
        </div>
      </main>

      <Footer />
    </>
  );
}