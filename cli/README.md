# designesy-score

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="https://www.designesy.org/hero-score-gate.png">
  <img src="https://www.designesy.org/hero-score-gate.gif" alt="Designesy Score Gate — a URL flows in, the 40-check contract grid fires, the score counts up to 99.2% grade A, and the gate passes" width="960">
</picture>

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

## Verify a DESIGN.md

Check whether a site serves a valid `/DESIGN.md` at its origin root —
runs Google's `@google/design.md` linter (11 spec-layer rules) via the
designesy scoring engine.

```bash
npx designesy-score verify designesy.org
npx designesy-score verify linear.app --json
```

| Result | Meaning | Exit |
|---|---|---|
| **PASS** | `/DESIGN.md` served, linted clean (0 errors, 0 warnings) | `0` |
| **WARN** | `/DESIGN.md` served, lint warnings (0 errors) | `0` |
| **FAIL** | `/DESIGN.md` served, lint errors | `1` |
| **SKIP** | `/DESIGN.md` not served (no public convention requires it) | `0` |

This checks the **spec layer** (file format). For the full 40-check
design-system contract score, use `designesy-score <url>`.

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