/**
 * Designesy AI Readiness Contract v0.1.0 — machine-readable form.
 * Sibling contract governing design-system AI-readiness scoring.
 * Source: zeroheight 2026 Design System Maturity Model (AI Readiness axis),
 *          DLS Lead "how to make a design system AI-ready",
 *          Designesy research 2026-08-01.
 *
 * The 6th maturity axis: is your design system the default context AI tools
 * build from, or is AI silently working around it?
 *
 * This is the machine export. The human page is at /contracts/readiness.
 */

export const readinessContract = {
  id: 'designesy.readiness',
  version: '0.1.0',
  status: 'provisional',
  name: 'Designesy AI Readiness Contract',
  kind: 'contract' as const,
  public_url: 'https://www.designesy.org/contracts/readiness',
  machine_url: 'https://www.designesy.org/contracts/readiness.json',
  updated: '2026-08-01',
  purpose:
    'AI readiness is the 6th maturity axis (zeroheight 2026). A design system is AI-ready when it exposes machine-readable context that AI coding agents can consume — tokens, rules, discovery endpoints, and verification. This contract defines the checks that score it.',
  source_authority: {
    primary: 'zeroheight 2026 Design System Maturity Model — AI Readiness axis',
    ai_ready_definition: 'Whether your design system is the default context that AI tools build from, or whether AI is silently working around it',
    how_to: 'DLS Lead — "I made my design system LLM-readable. Here\'s exactly how."',
    internal: 'Designesy ships its own AI-readiness stack: llms.txt, agent.json, MCP server, DTCG tokens, SKILL.md',
  },
  conformance: {
    six_maturity_axes: [
      { axis: 'Foundations', description: 'Are tokens, components, and patterns defined?' },
      { axis: 'Documentation', description: 'Is the system documented for humans AND machines?' },
      { axis: 'Governance', description: 'Who owns and maintains the system?' },
      { axis: 'Adoption', description: 'Is the system actually used?' },
      { axis: 'Measurement', description: 'Is the system measured and improved?' },
      { axis: 'AI Readiness', description: 'Is the system the default context AI tools build from?' },
    ],
    ai_readiness_signals: [
      'Machine-readable token file (DTCG/JSON) exposed at a discoverable URL',
      'llms.txt brief present at /.well-known or /llms.txt',
      'agent.json discovery document at /.well-known/agent.json',
      'MCP endpoint exposing tools/list for AI agents',
      'DESIGN.md present (the @google/design.md standard)',
      'Token documentation — tokens carry $description for agent context',
      'Component contract — machine-readable component schema',
      'Sitemap.xml present for crawlability',
      'robots.txt permissive for agent crawlers',
      'Open Graph + Twitter meta for social/share context',
    ],
    scoring_method:
      'Fetch the URL. Probe for each machine-readable artifact via HEAD/GET. Score 10 checks. Each artifact found = PASS, missing = FAIL, partial = WARN.',
  },
  verification: {
    checks: [
      { id: 'r01', item: 'Machine-readable token file exposed (DTCG/JSON)', pass: 'Token file found at a discoverable URL', fail: 'No machine-readable token file detected', warn: 'Token file found but not in DTCG format' },
      { id: 'r02', item: 'llms.txt present', pass: '/llms.txt returns agent-facing brief', fail: 'No /llms.txt found — agents have no orientation brief' },
      { id: 'r03', item: 'agent.json present', pass: '/.well-known/agent.json returns discovery document', fail: 'No /.well-known/agent.json — agents have no discovery endpoint' },
      { id: 'r04', item: 'MCP endpoint responds to tools/list', pass: 'MCP endpoint found and responds with tool list', fail: 'No MCP endpoint detected — agents cannot call tools', warn: 'Endpoint exists but did not respond to tools/list' },
      { id: 'r05', item: 'DESIGN.md present (Google design.md standard)', pass: '/DESIGN.md found — follows the @google/design.md standard', fail: 'No /DESIGN.md — missing the machine-readable design brief' },
      { id: 'r06', item: 'Token documentation — tokens carry $description', pass: 'Tokens found with $description metadata', fail: 'Tokens found but no $description — agents lack context', warn: 'Some tokens have $description, others do not' },
      { id: 'r07', item: 'Component contract (machine-readable schema)', pass: 'Machine-readable component schema detected', fail: 'No machine-readable component contract', warn: 'Component documentation found but not machine-readable' },
      { id: 'r08', item: 'Sitemap.xml present', pass: '/sitemap.xml found — site is crawlable', fail: 'No /sitemap.xml — agents cannot discover pages' },
      { id: 'r09', item: 'robots.txt permissive for agents', pass: '/robots.txt found and allows agent crawling', fail: 'No /robots.txt — crawling rules undefined', warn: 'robots.txt found but restricts some agents' },
      { id: 'r10', item: 'Open Graph + Twitter card meta tags', pass: 'OG and Twitter card meta tags present', fail: 'No social meta tags — missing share context', warn: 'Partial social meta (OG or Twitter, not both)' },
    ],
    scoring: '10 checks. PASS=1, WARN=0.5, FAIL=0. Score = (points/10) × 100. A≥90, B≥80, C≥70, D≥60, F<60.',
    validation_tools: {
      primary: 'Designesy readiness engine — HTTP probing of machine-readable artifacts',
      method: 'HEAD/GET requests against the target origin for each known artifact path',
      browser_only: 'None — all 10 checks are HTTP probes, no browser needed',
    },
  },
  relationship_to_core: {
    '§6 Systems Enable Freedom': 'A machine-readable system is the freedom boundary for AI agents',
    '§6 Economy Is Intelligence': 'Fewer, well-documented artifacts = more agent-ready than many undocumented ones',
    'designesy.org itself': 'Designesy scores itself — it ships llms.txt, agent.json, MCP, DTCG tokens, SKILL.md',
  },
  open_questions: [
    'r01 (token file) probes common paths (/tokens.json, /design-tokens.json) — custom paths may be missed',
    'r07 (component contract) is heuristic — no universal standard for machine-readable component schemas exists yet',
    'r04 (MCP endpoint) probes /api/mcp — custom MCP paths may be missed',
    'The score does not measure token quality — only presence. A badly structured token file still scores PASS on r01',
  ],
} as const;