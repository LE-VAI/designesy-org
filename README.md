# Designesy

[designesy.org](https://www.designesy.org) — design-system contract verification, scoring, and review tools for AI agents.

Designesy turns sources into principles, principles into contracts, and contracts into tools, systems, and artifacts that improve quality of life. The MCP server exposes 11 tools for scoring live URLs against a 34-check design contract, validating design tokens, auditing accessibility, and fetching the contract itself.

## Install

```bash
# Add to Claude Desktop, Cursor, or any MCP-compatible client:
claude mcp add designesy --transport http https://www.designesy.org/api/mcp
```

No authentication required — all 11 tools are read-only. The server runs on Vercel as a stateless Streamable HTTP endpoint.

## Tools

- `designesy_score` — Score a live URL against the 34-check design contract. Returns score, grade (A–F), and per-check breakdown.
- `designesy_tokens_score` — Validate a DTCG design-token file. 10 conformance checks against W3C DTCG 2025.10.
- `designesy_a11y_score` — Get the WCAG 2.2 AA accessibility framework and Playwright/axe-core script template.
- `designesy_motion_score` — Validate a Lottie animation file. 10 checks against Lottie spec v1.0.1 and §16 motion standards.
- `designesy_contract` — Get the design-system contract (tokens, motion, takt, cadence, typography, verification).
- `designesy_catalog` — List the 12 published Designesy packages with versions and URLs.
- `designesy_design_review` — Get the 8-dimension qualitative design review rubric.
- `designesy_skill_md` — Get the contract as an agent-skill-format SKILL.md for Cursor, Claude Code, or Replit.
- `designesy_agent_json` — Get the /.well-known/agent.json discovery document.
- `designesy_llms_txt` — Get the short /llms.txt agent brief.
- `designesy_llms_full_txt` — Get the full /llms-full.txt agent brief with paste-ready prompt.

### Tool reference table

| Tool | Description |
|---|---|
| `designesy_score` | Score a live URL against the 34-check design contract — returns score, grade (A–F), per-check breakdown |
| `designesy_tokens_score` | Validate a DTCG design-token file (10 conformance checks, W3C DTCG 2025.10) |
| `designesy_a11y_score` | Get the WCAG 2.2 AA accessibility framework + Playwright/axe-core script template |
| `designesy_motion_score` | Validate a Lottie animation file (10 checks, Lottie spec v1.0.1 + §16 motion standards) |
| `designesy_contract` | Get the design-system contract (tokens, motion, takt, cadence, typography, verification) |
| `designesy_catalog` | List the 12 published Designesy packages with versions and URLs |
| `designesy_design_review` | Get the 8-dimension qualitative design review rubric |
| `designesy_skill_md` | Get the contract as an agent-skill-format SKILL.md (for Cursor/Claude Code/Replit) |
| `designesy_agent_json` | Get the /.well-known/agent.json discovery document |
| `designesy_llms_txt` | Get the short /llms.txt agent brief |
| `designesy_llms_full_txt` | Get the full /llms-full.txt agent brief with paste-ready prompt |

## Live

- **Site:** [designesy.org](https://www.designesy.org)
- **MCP endpoint:** [designesy.org/api/mcp](https://www.designesy.org/api/mcp) (Streamable HTTP, no auth)
- **Score a site:** [designesy.org/score](https://www.designesy.org/score)
- **Leaderboard:** [designesy.org/leaderboard](https://www.designesy.org/leaderboard) — 30 sites scored
- **Methodology:** [designesy.org/methodology](https://www.designesy.org/methodology) — full 34-check scoring methodology
- **Contract:** [designesy.org/contracts/design-system](https://www.designesy.org/contracts/design-system)
- **Machine export:** [designesy.org/contracts/design-system.json](https://www.designesy.org/contracts/design-system.json)

## Contract verification

![Designesy Score](https://img.shields.io/badge/contract%20score-99.1%25-A%20grade-brightgreen)

The live site is verified against the design system contract — 34 deterministic checks with provenance back to tokens. Current score: **99.1% (Grade A)** — 30 passed, 0 failed, 1 warn, 3 skipped (browser-only checks). See the [methodology page](https://www.designesy.org/methodology) for how the score is computed.

## Contract v0.3.0

- **34 verification checks** across 11 weighted categories — tokens, motion, accessibility, cadence, takt, poise, identity, interaction, performance, responsive, semantic
- **10 Non-Negotiable Motion Standards** — deliberate easing, explicit properties, opacity entrances, keyboard stillness, no layout animation, touch gating, bounded duration, reduced-motion paths, asymmetric press, no ease-in
- **10 acoustic cues** — custom `$type: sound` (net-new vs W3C DTCG 2025.10), Cuelume v0.1.0 engine, interaction-only
- **9 open tensions** — documented, not hidden
- **Spring physics** — default + momentum tokens via custom `$type: spring`
- **Machine-readable** — W3C DTCG 2025.10 format + custom extensions

See the [contract page](https://www.designesy.org/contracts/design-system) for the full adoption history.

## GitHub Action

Gate your CI on design-contract compliance:

```yaml
- uses: LE-VAI/designesy-org/action@main
  with:
    url: https://your-app.vercel.app
    min-score: 70
    min-grade: C
```

Scores a URL via the live `/api/score` engine and fails the workflow if the score or grade drops below your threshold. See [`action/README.md`](action/README.md) for full usage.

## Repository

This is the controlled public root for Designesy — a Next.js 15 App Router site (React 19, Turbopack, Vercel deploy).

```
apps/site          Next.js application
action/            designesy/contract-check GitHub Action
docs/designesy     context, architecture, logs, registries
DESIGN.md          the design contract (human-readable)
AGENTS.md          agent operating rules
```

## What Designesy is not

Designesy is not a template gallery. Designesy is not a generic AI design tool. Designesy is not a moodboard.

Designesy is a system.

## FAQ

**Does it need an API key?**
No — all 11 tools are read-only. The MCP endpoint is stateless Streamable HTTP with no authentication.

**Is it deterministic?**
Yes. There is no LLM in the scoring loop — every check is deterministic and reproducible. The same URL will always produce the same score.

**What does it score against?**
The Designesy v0.3.0 design-system contract — 34 checks across 11 weighted categories (tokens, motion, accessibility, cadence, takt, poise, identity, interaction, performance, responsive, semantic).

**Can I use it in CI?**
Yes. The [GitHub Action](#github-action) gates your workflow on contract compliance — fail the build if the score drops below your threshold.

**Where is the contract published?**
At [designesy.org/contracts/design-system](https://www.designesy.org/contracts/design-system) (human-readable) and [designesy.org/contracts/design-system.json](https://www.designesy.org/contracts/design-system.json) (machine-readable, W3C DTCG 2025.10).

## License

All rights reserved. The contract is public; the code is not open-source. See [designesy.org](https://www.designesy.org) for usage terms.