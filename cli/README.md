# designesy-score

Score any URL against the **Designesy design-system contract** — 40 deterministic checks, one grade, no vibe-tax. Zero dependencies.

```bash
npx designesy-score designesy.org
```

## Install

```bash
# One-off (no install):
npx designesy-score <url>

# Global:
npm install -g designesy-score
designesy-score <url>
```

## Usage

```bash
# Score a site (default format, formatted report):
designesy-score designesy.org

# Gate on score + grade (exit 1 on failure — for CI / pre-commit):
designesy-score linear.app --min-score 70 --min-grade B

# JSON output for piping:
designesy-score vercel.com --format canonical --json

# Use a custom scoring engine:
designesy-score localhost:3000 --api http://localhost:3109

# Quiet mode (only output on failure — for CI noise reduction):
designesy-score my-app.vercel.app --min-score 90 --quiet
```

## Options

| Flag | Default | Description |
|---|---|---|
| `--format <f>` | `designesy` | Emission format: `designesy` (native), `canonical` (review-findings.json), `review` (markdown), `google` (design.md-compatible) |
| `--api <url>` | `https://www.designesy.org` | Scoring engine base URL (`/api/score` appended). Also reads `SCORE_API` env var. |
| `--min-score <n>` | `0` | Exit 1 if score < n. `0` disables the score floor. |
| `--min-grade <g>` | `""` | Exit 1 if grade is worse than g (`A`/`B`/`C`/`D`/`F`). Empty disables. |
| `--json` | off | Output raw JSON (no formatted report). |
| `--quiet` | off | Only output on failure. |
| `--help`, `-h` | — | Show help. |

## Exit codes

- `0` — score meets all gates (or no gates set)
- `1` — score below `--min-score` or grade worse than `--min-grade`, or engine unreachable
- `2` — invalid arguments

## What it scores

The Designesy v0.4.0 design-system contract — 40 deterministic checks across 14 weighted categories: tokens, motion, accessibility, cadence, takt, poise, identity, interaction, performance, responsive, semantic, security, spec, copywriting. No LLM, no heuristics — every check is reproducible and grounded in the published contract.

See the [full methodology](https://www.designesy.org/methodology).

## Zero dependencies

Node built-ins only (`fetch`, `process`, `fs`). No install step, no postinstall, no transitive deps. Matches the GitHub Action's `dist/index.js` convention.

## Related

- [GitHub Action](https://github.com/LE-VAI/designesy-org/tree/main/action) — same engine as a CI quality gate
- [MCP server](https://www.designesy.org/api/mcp) — 11 tools for AI agents
- [Contract](https://www.designesy.org/contracts/design-system) — the design-system contract
- [designesy.org](https://www.designesy.org)