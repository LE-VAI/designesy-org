import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'MCP server',
  description:
    'Designesy design intelligence over MCP — Streamable HTTP at https://www.designesy.org/api/mcp. Seventeen tools + one MCP App (interactive report dashboard). Stateless 2026-07-28 spec. Connect Claude Desktop, Cursor, or ZCode.',
  path: '/docs/mcp',
  ogTitle: 'MCP server · Designesy',
  ogDescription:
    'Streamable HTTP endpoint with 17 design-intelligence tools + an MCP App (interactive report dashboard). Stateless 2026-07-28 spec. Copy-paste client configs for Claude Desktop, Cursor, and ZCode.',
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
    desc: 'The design-system contract v0.4.0 — tokens, motion, acoustic, takt, cadence, typography, components, verification, open tensions. Optional section filter.',
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
    desc: 'The 40-check verification engine. Fetches the page HTML, extracts all CSS, parses :root custom properties, and runs 40 automated checks with provenance back to contract tokens. Returns overall score, letter grade, and per-check breakdown. Browser-only checks (Core Web Vitals, viewport overflow, sound toggle) return MANUAL — run the full audit (/api/score/audit) to resolve them. Checks that are not applicable to the site (no tokens, no buttons, no DESIGN.md) return SKIP (N/A).',
    args: 'url?: string (defaults to designesy.org)',
    source: '/api/score',
  },
  {
    name: 'designesy_tokens_score',
    kind: 'Executable',
    desc: 'Validate a design token file against W3C DTCG 2025.10 format. Fetches from a URL or accepts raw JSON. Runs 10 conformance checks (t01-t10): $schema, token groups, $type, $value, structured color format, standard types, custom extensions, dimension units, naming hierarchy, deprecated patterns. Returns score, grade, and per-check breakdown.',
    args: 'url?: string, dtcg_file?: string',
    source: '/contracts/tokens.json',
  },
  {
    name: 'designesy_a11y_score',
    kind: 'Framework',
    desc: 'Accessibility verification framework for WCAG 2.2 AA via axe-core 4.12.1. Returns 11 conformance checks (a01-a11) + a Playwright script template (axe-core needs a real DOM, cannot run server-side). The agent runs the script locally with @axe-core/playwright. Optional config JSON enables brand customization via axe.configure().',
    args: 'url: string, ruleset?: string, config?: string',
    source: '/contracts/a11y.json',
  },
  {
    name: 'designesy_motion_score',
    kind: 'Executable',
    desc: 'Validate a Lottie animation file against Lottie spec v1.0.1 and Designesy section 16 Ten Non-Negotiable Motion Standards. Fetches from a URL or accepts raw JSON. Runs 10 checks (m01-m10): required fields, version, frame rate, dimensions, layers, in/out points, markers for reduced-motion, deprecated layers, section 16 standards, JSON Schema conformance.',
    args: 'url?: string, lottie_file?: string',
    source: '/contracts/motion.json',
  },
  {
    name: 'designesy_drift_score',
    kind: 'Executable',
    desc: 'Score a live URL for AI-generated UI drift — 12 checks detect the four documented 2026 drift failure modes: token fabrication (var() to undeclared custom properties), within-session drift (spacing/color/radius value variance), between-session amnesia (inconsistent font stacks, shadows, transitions), and silent breaking changes (z-index chaos, dangling alias chains). Fetches the URL, extracts all CSS, parses :root tokens and var() references.',
    args: 'url?: string (defaults to designesy.org)',
    source: '/api/drift',
  },
  {
    name: 'designesy_readiness_score',
    kind: 'Executable',
    desc: 'Score a URL for design-system AI readiness — the 6th maturity axis (zeroheight 2026). 10 checks probe the target origin for machine-readable artifacts: DTCG token files, llms.txt, agent.json, MCP endpoint (tools/list), DESIGN.md, token $description, component schemas, sitemap.xml, robots.txt, and Open Graph/Twitter meta.',
    args: 'url?: string (defaults to designesy.org)',
    source: '/api/readiness',
  },
  {
    name: 'designesy_guardrails',
    kind: 'Executable',
    desc: 'Generate a frozen build-contract bundle for AI coding agents from any design system URL — the product layer. Ingests a site, extracts its :root tokens, and emits 6 outputs: DTCG-format token file, Stylelint config, AGENTS.md rules, component contract, anti-pattern documentation, and DESIGN.md (Google open spec). 6 emission checks verify bundle completeness.',
    args: 'url?: string (defaults to designesy.org)',
    source: '/api/guardrails',
  },
  {
    name: 'designesy_monitor_score',
    kind: 'Executable',
    desc: 'Score a URL for continuous design-drift governance — the temporal layer over the drift radar. Re-runs the 12 drift checks and computes 10 monitor checks: schedule registered, last run fresh, drift delta vs baseline, trend slope, new violations, resolved since last run, score degradation threshold, token-set mutation, contract version drift, and alert delivered. When alerts fire and an email is provided, sends an HTML drift-alert email via Resend. Pass a history array of prior snapshots to compute deltas.',
    args: 'url?: string, email?: string (for drift alerts), history?: Snapshot[] (omit for first-run baseline)',
    source: '/api/monitor',
  },
  {
    name: 'designesy_compare',
    kind: 'Executable',
    desc: 'Diff two design systems from live URLs — the only URL-scoped design-token diff engine. Fetches both URLs in parallel, extracts their :root custom properties, and produces a structured diff across 8 dimensions: tokens added, removed, renamed (Levenshtein ≤ 2), value-changed, scale-stop-changed, contrast-drift-per-pair (WCAG ratio), structure-delta (token count + category distribution), and score-delta (runs /score on both URLs). Use this to answer "what actually changed between two design systems" or "how does our design system differ from a reference".',
    args: 'urlA: string (first URL), urlB: string (second URL)',
    source: '/api/compare',
  },
  {
    name: 'designesy_report',
    kind: 'Executable · MCP App',
    desc: 'Generate a unified design-intelligence report for a single URL — the synthesis capstone. Fires /score (40-check audit), /drift (12-check drift radar), and /readiness (10-check AI readiness) in parallel, then computes a weighted composite: score × 0.5 + drift × 0.3 + readiness × 0.2. One input, one output, one composite grade. Use this when you need a single holistic assessment instead of three separate scans, or when sharing a design-intelligence verdict. MCP App: hosts that support io.modelcontextprotocol/ui (Claude Desktop, Cursor v2.6+, VS Code, Goose) render an interactive dashboard inline — composite dial, sub-engine cards, tabbed check breakdown. Legacy clients get the JSON payload plus an appUrl link to the standalone dashboard.',
    args: 'url: string',
    source: '/api/report + /api/report/app',
  },
];

const CLIENT_CONFIGS = [
  {
    client: 'Claude Code (CLI)',
    file: '~/.claude.json or ~/.claude/settings.json',
    config: `{
  "mcpServers": {
    "designesy": {
      "type": "http",
      "url": "${ENDPOINT}"
    }
  }
}`,
    note: 'Claude Code (the CLI agent) supports Streamable HTTP natively via type: "http". This is separate from Claude Desktop (below).',
  },
  {
    client: 'Cursor',
    file: '.cursor/mcp.json (project) or ~/.cursor/mcp.json (global)',
    config: `{
  "mcpServers": {
    "designesy": {
      "url": "${ENDPOINT}"
    }
  }
}`,
    note: 'Cursor supports Streamable HTTP directly — just provide url. It auto-detects HTTP vs SSE. No type field needed.',
  },
  {
    client: 'ZCode',
    file: '.zcode MCP config (User or Workspace scope)',
    config: `{
  "mcpServers": {
    "designesy": {
      "url": "${ENDPOINT}"
    }
  }
}`,
    note: 'ZCode supports HTTP, SSE, and stdio. Add via Settings → MCP Servers (type: HTTP), or paste this JSON in full config mode.',
  },
  {
    client: 'VS Code + Copilot',
    file: '.vscode/mcp.json',
    config: `{
  "servers": {
    "designesy": {
      "type": "http",
      "url": "${ENDPOINT}"
    }
  }
}`,
    note: 'VS Code with GitHub Copilot supports HTTP MCP servers. Note: key is "servers", not "mcpServers". VS Code tries HTTP Stream first, falls back to SSE.',
  },
  {
    client: 'Claude Desktop (stdio-only — needs mcp-remote bridge)',
    file: '~/Library/Application Support/Claude/claude_desktop_config.json (macOS)\n%APPDATA%\\Claude\\claude_desktop_config.json (Windows)',
    config: `{
  "mcpServers": {
    "designesy": {
      "command": "npx",
      "args": ["mcp-remote@latest", "${ENDPOINT}"]
    }
  }
}`,
    note: 'Claude Desktop\'s JSON config is stdio-only — a url field silently deletes the entire mcpServers block (bug #37286). Use the mcp-remote npm package as a stdio bridge. Alternatively, add the server via Settings → Connectors → Add custom connector (no JSON editing, supports public HTTPS directly).',
  },
];

export default function McpDocsPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Integration surface</p>
          <h1 className="surface-title" data-scramble>MCP server</h1>
          <p className="surface-lede">
            Designesy design intelligence over the Model Context Protocol —
            seventeen tools, one endpoint, one MCP App, no wrapper.
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
              <code>io.github.LE-VAI/designesy-org</code> v1.3.1 on{' '}
              <code>registry.modelcontextprotocol.io</code>
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <div
            className="surface-card"
            style={{
              padding: '1.25rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <p className="definition-label" style={{ marginBottom: '0.25rem' }}>
                Published on the MCP Registry
              </p>
              <p className="surface-note" style={{ margin: 0 }}>
                Discoverable by any MCP-compatible client. Search{' '}
                <code>designesy</code> on the registry or connect directly.
              </p>
            </div>
            <a
              href="https://registry.modelcontextprotocol.io/v0.1/servers/io.github.LE-VAI%2Fdesignesy-org/versions/1.3.1"
              rel="noopener noreferrer"
              className="mono-link"
              style={{
                whiteSpace: 'nowrap',
                fontSize: '0.875rem',
              }}
            >
              View registry entry →
            </a>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Conformance</h2>
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div
              className="surface-card"
              style={{
                padding: '1rem 1.25rem',
                flex: '1 1 240px',
              }}
            >
              <p className="definition-label" style={{ marginBottom: '0.5rem' }}>
                WCAG 2.2 AA
              </p>
              <p
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  margin: 0,
                  color: 'var(--ink)',
                }}
              >
                0 violations
              </p>
              <p className="surface-note" style={{ marginTop: '0.25rem', marginBottom: 0 }}>
                axe-core 4.12.1 · wcag22aa · verified 2026-07-28
              </p>
            </div>
            <div
              className="surface-card"
              style={{
                padding: '1rem 1.25rem',
                flex: '1 1 240px',
              }}
            >
              <p className="definition-label" style={{ marginBottom: '0.5rem' }}>
                DTCG 2025.10
              </p>
              <p
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  margin: 0,
                  color: 'var(--ink)',
                }}
              >
                95.3% A
              </p>
              <p className="surface-note" style={{ marginTop: '0.25rem', marginBottom: 0 }}>
                /export/dtcg · 10/10 checks pass · self-verified
              </p>
            </div>
            <div
              className="surface-card"
              style={{
                padding: '1rem 1.25rem',
                flex: '1 1 240px',
              }}
            >
              <p className="definition-label" style={{ marginBottom: '0.5rem' }}>
                Contract score
              </p>
              <p
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  margin: 0,
                  color: 'var(--ink)',
                }}
              >
                95.3% A
              </p>
              <p className="surface-note" style={{ marginTop: '0.25rem', marginBottom: 0 }}>
                40-check engine · 33 PASS / 0 FAIL / 3 WARN / 1 SKIP / 3 MANUAL
              </p>
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Tools</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Seven read-only tools fetch public machine exports from
            designesy.org. Nine executable tools run live verification — the
            40-check score engine, DTCG token validation, Lottie motion
            validation, drift scoring, AI-readiness scoring, guardrails
            generation, monitor scoring, design-system comparison, and the
            composite report. One accessibility framework provides the WCAG
            2.2 Playwright + axe-core script template. All tools return JSON.
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
                      <strong>args:</strong> {tool.args}
                    </span>
                    <span>
                      <strong>source:</strong>{' '}
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
              Vercel Node.js serverless · mcp-handler 2.x (Vercel&apos;s official
              MCP adapter) · @modelcontextprotocol/server (SDK v2) · Zod 4 ·
              stateless 2026-07-28 spec native · 300-second max duration (Pro Plan)
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
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</pre>
          <p className="surface-note" style={{ marginTop: '1rem' }}>
            The response is a JSON-RPC 2.0 message listing all seventeen tools
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
              data-cuelume-hover="bloom"
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
              data-cuelume-hover="bloom"
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
              data-cuelume-hover="bloom"
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
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Design system contract</span>
                <span className="row-meta">
                  v0.4.0 — the contract behind designesy_contract
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