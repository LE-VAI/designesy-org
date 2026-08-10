# designesy-mcp

<!-- mcp-name: io.github.LE-VAI/designesy-org -->

[![PyPI version](https://img.shields.io/pypi/v/designesy-mcp.svg)](https://pypi.org/project/designesy-mcp/)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-2025.06.18-purple.svg)](https://modelcontextprotocol.io)

**One-click install:**

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=designesy&config=%7B%22designesy%22%3A%7B%22command%22%3A%22uvx%22%2C%22args%22%3A%5B%22designesy-mcp%22%5D%7D%7D)
[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=designesy&config=%7B%22designesy%22%3A%7B%22command%22%3A%22uvx%22%2C%22args%22%3A%5B%22designesy-mcp%22%5D%7D%7D&quality=insiders)
[![Install in Cursor](https://img.shields.io/badge/Cursor-Install-000000?style=flat-square&logo=cursor&logoColor=white)](cursor://anysphere.cursor-deeplink/mcp/install?name=designesy&config=%7B%22designesy%22%3A%7B%22command%22%3A%22uvx%22%2C%22args%22%3A%5B%22designesy-mcp%22%5D%7D%7D)
[![Install Remote (HTTP)](https://img.shields.io/badge/Remote-Streamable_HTTP-FF6B35?style=flat-square&logo=vercel&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=designesy&config=%7B%22designesy%22%3A%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fwww.designesy.org%2Fapi%2Fmcp%22%7D%7D)

A **read-only stdio MCP server** exposing [designesy.org](https://www.designesy.org)'s design-intelligence infrastructure as native agent tools.

Zero external dependencies. Pure Python stdlib. Implements the [Model Context Protocol](https://modelcontextprotocol.io) JSON-RPC 2.0 over stdio.

---

## Quick start (one command)

```bash
uvx designesy-mcp
```

That's it. [`uvx`](https://docs.astral.sh/uv/) fetches the package from PyPI, creates an ephemeral environment, and launches the stdio MCP server. No virtualenv, no `pip install`, no git clone. The server is ready to speak JSON-RPC 2.0 on stdin/stdout immediately.

> Don't have `uv`? Install it once: `curl -LsSf https://astral.sh/uv/install.sh | sh` (macOS/Linux) or `powershell -c "irm https://astral.sh/uv/install.ps1 | iex"` (Windows). Or use `pipx run designesy-mcp` as an equivalent one-liner.

## MCP client config

### uvx (recommended — no install step)

```json
{
  "mcpServers": {
    "designesy": {
      "command": "uvx",
      "args": ["designesy-mcp"]
    }
  }
}
```

### pip install (traditional)

```bash
pip install designesy-mcp
```

```json
{
  "mcpServers": {
    "designesy": {
      "command": "designesy-mcp"
    }
  }
}
```

### python -m (module form)

```json
{
  "mcpServers": {
    "designesy": {
      "command": "python",
      "args": ["-m", "designesy_mcp_server"]
    }
  }
}
```

No arguments needed. The server speaks JSON-RPC 2.0 over stdin/stdout.

## Tools (11)

The server exposes 11 tools, all fetched live from `https://www.designesy.org/`:

### Read-only discovery
| Tool | What it does |
|---|---|
| `designesy_catalog` | Get the 12-package catalog (versions, URLs, statuses) from `/open.json` |
| `designesy_contract` | Get the full design-system contract v0.3.0 (tokens, motion, acoustic, takt, cadence, typography, components, verification, open tensions) — or a filtered section |
| `designesy_design_review` | Get the Design Review kit (8 dimensions, agent prompt, output format, verification checklist) |
| `designesy_skill_md` | Get the agent-skill-format export (SKILL.md) with behavioral rules, tokens, anti-patterns |
| `designesy_agent_json` | Get the agent discovery document (`.well-known/agent.json`) — identity, authority, ingest protocol |
| `designesy_llms_txt` | Get the short agent brief (`/llms.txt`) |
| `designesy_llms_full_txt` | Get the full agent brief (`/llms-full.txt`) with ingest protocol, all packages, paste-ready prompt |

### Executable verification
| Tool | What it does |
|---|---|
| `designesy_score` | Run the 40-check contract verification against a live URL. Fetches HTML + CSS, parses `:root` custom properties, returns PASS/FAIL/WARN/SKIP per check with an overall score, letter grade, and per-category breakdown. Supports 4 emission formats: `designesy` (default), `canonical` (review-findings.json schema), `review` (jakubkrehel markdown), `google` (@google/design.md JSON). |
| `designesy_tokens_score` | Validate a design token file against the W3C Design Tokens Community Group (DTCG) 2025.10 format. 10 checks (t01–t10). |
| `designesy_a11y_score` | Get the WCAG 2.2 AA accessibility verification framework (11 checks, a01–a11) + a Playwright/axe-core script template for local execution. |
| `designesy_motion_score` | Validate a Lottie animation file against Lottie spec v1.0.1 + the Designesy 10 Non-Negotiable Motion Standards. 10 checks (m01–m10). |

## Resources (7)

The server also exposes 7 MCP resources (read-only URIs):

| URI | Content |
|---|---|
| `designesy://open` | Package catalog (JSON) |
| `designesy://contract` | Full design-system contract (JSON) |
| `designesy://kit/design-review` | Design Review kit (JSON) |
| `designesy://skill` | SKILL.md agent-skill export (Markdown) |
| `designesy://agent` | Agent discovery document (JSON) |
| `designesy://llms` | Short agent brief (text) |
| `designesy://llms-full` | Full agent brief (text) |

## The 40-check verification engine

`designesy_score` runs 40 deterministic checks across 13 weighted categories:

| Category | Weight | What it measures |
|---|---|---|
| cadence | 18 | Typography rhythm — line-height, font-synthesis, text-underline-position, skip-ink |
| accessibility | 15 | WCAG 2.2 primitives — reduced-motion, forced-colors, AI disclosure, focus-visible |
| semantic | 12 | Token architecture — `:root` custom properties, no raw hex, semantic naming |
| motion | 10 | Motion hygiene — duration tokens, easing tokens, reduced-motion blocks |
| tokens | 9 | DTCG 2025.10 conformance — `$type`, `$value`, `$description`, colorSpace |
| takt | 8 | Timing discipline — transition bands, animation hierarchy |
| poise | 7 | Composure — viewport overflow, scroll behavior, print styles |
| identity | 6 | Brand coherence — title, meta description, favicon, og tags |
| interaction | 6 | Interaction primitives — hover states, press feedback, disabled states |
| performance | 6 | Core Web Vitals readiness — preload, font-display, render-blocking |
| responsive | 3 | Responsive primitives — viewport meta, container queries |
| security | 5 | Security headers — CSP, X-Content-Type-Options, referrer policy |
| spec | 4 | Spec conformance — `lang` attr, `charset`, doctype |

No LLM. No roast. The same engine scores [designesy.org](https://www.designesy.org) itself — in public, at 99.2% A.

## Standards positioning

### DTCG 2025.10 — the spec went stable

The W3C Design Tokens Community Group published the spec's **first stable version** on Oct 28, 2025 — the [Final Community Group Report](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/), classified as a Candidate Recommendation and considered stable. 24+ organizations back it (Adobe, Google, Meta, Figma, Amazon, Microsoft, Shopify, Sketch, Framer). 84% of teams now use design tokens (2026, up from 56% YoY).

`designesy_tokens_score` validates against this stable spec. Every team adopting DTCG 2025.10 needs a validator — designesy is it.

### Motion tokens — the spec's blind spot

The DTCG 2025.10 spec leaves motion tokens as a **second-class citizen** — there is no standard for motion token structure, reduced-motion markers, or animation accessibility. The [2026 State of Design Systems field report](https://www.thestackstories.com/blog/state-of-design-systems-2026-field-report) confirms this is the remaining friction point.

`designesy_motion_score` fills this gap. It validates Lottie files against the Lottie spec v1.0.1 AND the Designesy §16 Ten Non-Negotiable Motion Standards — the only validator that checks both structural well-formedness and accessibility (reduced-motion markers, no deprecated versions). It is the verification layer for the spec's known blind spot.

### Contract vs. opinion

No competitor does contract-based deterministic scoring. Lighthouse is weighted heuristics. axe-core is rule violations. securityheaders.com is a single dimension. Designesy's 40-check contract-bound 0-100 score across 7 dimensions (tokens, motion, accessibility, cadence, takt, typography, copywriting) has no direct analog.

## Caching

All responses are cached with a 5-minute TTL. The server only fetches public, machine-readable exports from `designesy.org` via HTTPS. It does not read local files, credentials, or source roots.

## Safety

**Read-only.** This server never writes anywhere. It does not execute code, mutate files, or access credentials.

## Provenance

All data is fetched live from:
- `https://www.designesy.org/open.json`
- `https://www.designesy.org/contracts/design-system.json`
- `https://www.designesy.org/kits/design-review.json`
- `https://www.designesy.org/contracts/skill`
- `https://www.designesy.org/.well-known/agent.json`
- `https://www.designesy.org/llms.txt`
- `https://www.designesy.org/llms-full.txt`

## License

MIT

## Links

- [Homepage](https://www.designesy.org)
- [Agent Install](https://pypi.org/project/designesy-mcp/#quick-start-one-command) — one-command `uvx designesy-mcp`
- [Repository](https://github.com/LE-VAI/designesy-org)
- [MCP Registry entry](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.LE-VAI%2Fdesignesy-org)
- [Changelog](https://github.com/LE-VAI/designesy-org/releases)
- [Design-system contract](https://www.designesy.org/contracts/design-system.json)
- [Leaderboard](https://www.designesy.org/leaderboard) — 30-site public cohort, A–F histogram, weekly re-score
- [Score badge](https://www.designesy.org/badge) — embeddable SVG badge for A/B-graded sites
- [Live score API](https://www.designesy.org/api/score?url=designesy.org) — JSON, no key, no login
- [Methodology](https://www.designesy.org/methodology)