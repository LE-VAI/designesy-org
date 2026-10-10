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

A **stdio MCP server** exposing [designesy.org](https://www.designesy.org)'s design-intelligence infrastructure as native agent tools. Every tool is read-only except `designesy_monitor_score`, which can send a drift-alert email (see [Safety](#safety)).

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

## Tools (17)

The server exposes 17 tools, all fetched live from `https://www.designesy.org/`:

### Read-only discovery
| Tool | What it does |
|---|---|
| `designesy_catalog` | Get the package catalog (versions, URLs, statuses) from `/open.json` |
| `designesy_contract` | Get the full design-system contract (tokens, motion, acoustic, takt, cadence, typography, components, verification, open tensions), or pass `sections` (a list of top-level keys) to get only those parts plus `id` and `version`. The full contract is on the order of 100 KB. An unknown key returns the list of valid keys. The version travels in the response, so none is pinned here |
| `designesy_design_review` | Get the Design Review rubric (8 dimensions, output format, verification checklist) as reference data. The kit's copy-ready prompt stays on the kit page, linked from the result |
| `designesy_skill_md` | Get the agent-skill-format export (SKILL.md) with behavioral rules, tokens, anti-patterns, as reference data with the markdown in `content` |
| `designesy_agent_json` | Get the agent discovery document (`.well-known/agent.json`) as reference data: identity, authority, discovery endpoints, packages. Its ingest steps stay in the published file |
| `designesy_llms_txt` | Get the short brief (`/llms.txt`) as reference data. Its ingest steps stay in the published file |
| `designesy_llms_full_txt` | Get the full brief (`/llms-full.txt`) as reference data: authority, all packages, standing rules. Its ingest protocol and paste-ready agent prompt stay in the published file |

### Executable verification
| Tool | What it does |
|---|---|
| `designesy_score` | Run the 44-check contract verification against a live URL through the engine at `https://www.designesy.org/api/score`. Returns an overall score, a letter grade, and the check results (PASS/FAIL/WARN/SKIP/MANUAL). `format` selects the output: `designesy` (default) returns this tool's JSON (`url`, `contract_version`, `summary`, `tokens_extracted`, `checks`, `note`); `canonical` (review-findings.json schema) and `google` (@google/design.md JSON) return the engine's JSON unchanged; `review` returns the engine's markdown report unchanged (coverage by category, a findings table of the FAIL and WARN checks, and a verdict). `scope` (`contract` or `universal`) sets the scoring scope; omit it and the engine picks `contract` for designesy.org and `universal` for every other site. If the engine is unreachable, `designesy` falls back to the offline engine: 27 of the 44 checks run locally, each mirroring the live engine's verdict on the same page and scope, and the result adds `engine` (kind `offline`, the engine version it mirrors, the checks it did not run) and `scope`. The other three formats return an error. |
| `designesy_tokens_score` | Validate a design token file against the W3C Design Tokens Community Group (DTCG) 2025.10 format. 10 checks (t01–t10). |
| `designesy_a11y_score` | Get the WCAG 2.2 AA accessibility verification framework (11 checks, a01–a11) + a Playwright/axe-core script template for local execution. |
| `designesy_motion_score` | Validate a Lottie animation file against the motion contract's 10 checks (m01–m10), drawn from Lottie spec v1.0.1 and the Designesy 10 Non-Negotiable Motion Standards, each verdict under its own check's name. Checks a file cannot settle (full schema validation, layout-property and keyboard-initiated motion) return SKIP with the reason. |

### Executable engines (new in v1.10.0)
| Tool | What it does |
|---|---|
| `designesy_drift_score` | 12-check AI-drift radar — detects token fabrication, within-session drift, between-session amnesia, and silent breaking changes. |
| `designesy_readiness_score` | 10-check AI readiness probe — tests for DTCG tokens, llms.txt, agent.json, MCP endpoint, DESIGN.md, sitemap, robots, OG meta. |
| `designesy_guardrails` | Generate a frozen build-contract bundle: DTCG tokens, Stylelint config, AGENTS.md rules, component contract, anti-patterns, DESIGN.md. The full bundle runs from about 10 KB to about 500 KB of JSON; `parts` (for example `["designMd"]`) returns only the files named. |
| `designesy_monitor_score` | Continuous drift governance — 10 monitor checks with history deltas, trend slope, and email alerts via Resend. |
| `designesy_compare` | Diff two design systems from live URLs — 8-dimension structured diff (added, removed, renamed, value-changed, scale, contrast, structure, score). |
| `designesy_report` | Composite synthesis — fires score + drift + readiness in parallel, computes weighted composite grade. The most shareable surface. The full result runs to about 75 to 100 KB of JSON; `detail: "summary"` keeps the composite, each engine's score and grade, the totals and only the checks that did not PASS. |

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

## The 44-check verification engine

`designesy_score` runs 44 deterministic checks across 14 weighted categories:

| Category | Weight | What it measures |
|---|---|---|
| cadence | 18 | Typography rhythm — line-height, font-synthesis, text-underline-position, skip-ink |
| accessibility | 15 | WCAG 2.2 primitives — reduced-motion, forced-colors, AI disclosure, focus-visible, status colors used as text in every theme |
| semantic | 12 | Token architecture — `:root` custom properties, no raw hex, semantic naming |
| motion | 10 | Motion hygiene — duration tokens, easing tokens, reduced-motion blocks, content that stays visible when motion is paused |
| tokens | 9 | DTCG 2025.10 conformance — `$type`, `$value`, `$description`, colorSpace |
| takt | 8 | Timing discipline — transition bands, animation hierarchy |
| copywriting | 8 | UX copy — button verb phrases, no trailing periods, descriptive link text, no ALL CAPS |
| poise | 7 | Composure — viewport overflow, scroll behavior, print styles |
| identity | 6 | Brand coherence — title, meta description, favicon, og tags |
| interaction | 6 | Interaction primitives — hover states, press feedback, disabled states |
| performance | 6 | Core Web Vitals readiness — preload, font-display, render-blocking |
| responsive | 3 | Responsive primitives — viewport meta, container queries |
| security | 5 | Security headers — CSP, X-Content-Type-Options, referrer policy |
| spec | 4 | Spec conformance — `lang` attr, `charset`, doctype |

No LLM. No roast. The same engine scores [designesy.org](https://www.designesy.org) itself, in public: its current score is on the [leaderboard](https://www.designesy.org/leaderboard).

## Standards positioning

### DTCG 2025.10 — the spec went stable

The W3C Design Tokens Community Group published the spec's **first stable version** on Oct 28, 2025 — the [Final Community Group Report](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/), classified as a Candidate Recommendation and considered stable. 24+ organizations back it (Adobe, Google, Meta, Figma, Amazon, Microsoft, Shopify, Sketch, Framer). 84% of teams now use design tokens (zeroheight Design Systems Report 2025, up from 56% in 2024).

`designesy_tokens_score` validates against this stable spec. Every team adopting DTCG 2025.10 needs a validator — designesy is it.

### Motion tokens — the spec's blind spot

The DTCG 2025.10 spec leaves motion tokens as a **second-class citizen** — there is no standard for motion token structure, reduced-motion markers, or animation accessibility. The [2026 State of Design Systems field report](https://www.thestackstories.com/blog/state-of-design-systems-2026-field-report) confirms this is the remaining friction point.

`designesy_motion_score` fills this gap. It validates Lottie files against the Lottie spec v1.0.1 AND the Designesy §16 Ten Non-Negotiable Motion Standards — the only validator that checks both structural well-formedness and accessibility (reduced-motion markers, no deprecated versions). It is the verification layer for the spec's known blind spot.

### Contract vs. opinion

No competitor does contract-based deterministic scoring. Lighthouse is weighted heuristics. axe-core is rule violations. securityheaders.com is a single dimension. Designesy's 44-check contract-bound 0-100 score across 7 dimensions (tokens, motion, accessibility, cadence, takt, typography, copywriting) has no direct analog.

## Caching

All responses are cached with a 5-minute TTL. The server only fetches public, machine-readable exports from `designesy.org` via HTTPS. It does not read local files, credentials, or source roots.

## Safety

**Read-only, with one exception.** `designesy_monitor_score` can send email: when you pass an `email` address and a drift alert fires, designesy.org sends an HTML drift-alert email to that address through Resend, if the server has a Resend key configured. A repeated call can send another email. The other 16 tools only read. The server writes no local files and reads no credentials.

Every tool declares a `title` and the MCP annotation hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), matching the hosted endpoint at `https://www.designesy.org/api/mcp`. `designesy_monitor_score` is the one tool marked `readOnlyHint: false`.

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